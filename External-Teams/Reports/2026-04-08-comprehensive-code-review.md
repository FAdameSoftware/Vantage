# Vantage Comprehensive Code Review

**Date:** 2026-04-08
**Scope:** Full codebase — stores, components, hooks/utilities, Rust backend, tests, dependencies/build
**Purpose:** Identify improvements to enable easier feature implementation and continuous development
**Methodology:** 6 parallel review agents covering orthogonal dimensions, findings cross-referenced and deduplicated

---

## Executive Summary

The Vantage codebase has strong foundations — Zustand stores are well-structured with good test coverage, Rust input validation is disciplined, and the component library is feature-rich. However, six systemic issues stand out as the primary blockers to sustainable development velocity:

1. **Concurrency bugs** — The Rust `SessionManager` mutex serializes all IPC, git commands block Tokio threads, and multiple frontend polling loops multiply IPC traffic
2. **Dead/duplicate code from incomplete refactors** — The `useClaude.ts` monolith and `claude/` split hooks coexist with duplicate event listeners; `IDELayout.tsx` is dead code alongside `AppLayout.tsx`
3. **Missing test infrastructure** — No coverage reporting, no ESLint, 15 of 27 Rust files have zero tests, and the mock layer silently hides API drift
4. **Cross-store coupling** — Stores import each other directly instead of being orchestrated externally, breaking test isolation and creating initialization fragility
5. **Security gaps in production config** — `withGlobalTauri: true` in production exposes full Tauri API to injected JS; workspace file writes happen before path validation
6. **Build/dependency hygiene** — No chunk splitting (Monaco + Shiki in one bundle), wrong Tauri config schema, Google Fonts loaded externally despite "no SaaS" vision

The report below consolidates 60+ findings across all six dimensions, organized by priority.

---

## Table of Contents

1. [P0 — Critical Issues](#p0--critical-issues)
2. [P1 — Significant Issues](#p1--significant-issues)
3. [P2 — Improvements](#p2--improvements)
4. [Test Coverage Gap Analysis](#test-coverage-gap-analysis)
5. [Recommended Execution Order](#recommended-execution-order)

---

## P0 — Critical Issues

These issues cause data corruption, security vulnerabilities, performance degradation, or silent failures in production.

### P0-01: Rust `TokioMutex<SessionManager>` serializes ALL concurrent IPC calls
**Files:** `src-tauri/src/lib.rs` lines 147, 161, 175, 188, 199, 207, 216, 230

Every async Tauri command acquires the top-level `TokioMutex<SessionManager>` and holds it for the entire duration of the operation, including stdin I/O. If two concurrent IPC calls arrive (e.g., sending a message while polling `claude_is_session_alive`), the second blocks until the first completes. This causes observable UI hangs under concurrent load.

**Fix:** Remove the outer `TokioMutex`. Move locking to `SessionManager.processes` only, locked for the map lookup and released before I/O. The `AppHandle` on `SessionManager` does not need mutex protection.

---

### P0-02: Synchronous git commands block Tokio worker threads
**File:** `src-tauri/src/git.rs` lines 21-44

`run_git_with_timeout` calls `std::thread::sleep(Duration::from_millis(50))` inside what runs on the Tokio async runtime. This starves other async tasks. With many concurrent git commands, the Tokio worker pool can be exhausted. None of the synchronous git commands use `spawn_blocking`.

**Fix:** Wrap all synchronous git operations in `tokio::task::spawn_blocking`, or use async process APIs.

---

### P0-03: Duplicate Tauri event listeners — `useClaude.ts` and `claude/useClaudeStream.ts`
**Files:** `src/hooks/useClaude.ts` lines 421-680, `src/hooks/claude/useClaudeStream.ts` lines 45-299

Both files register identical `claude_message`, `claude_permission_request`, and `claude_status` event listeners. The old monolith (`useClaude.ts`) and the new split hooks coexist. If both code paths are reached, every Claude event is dispatched twice. The `listenerRefCount` guard in `useClaude.ts` only prevents duplicates within itself, not across the two files.

**Fix:** Complete the migration to split hooks. Delete `useClaude.ts` and update `ChatPanel.tsx`, `PermissionDialog.tsx`, and `ResumeFromPR.tsx` to use the `claude/` hooks. Or add a shared ref-count guard across both.

---

### P0-04: 5 independent git status polling loops running simultaneously
**File:** `src/hooks/useGitStatus.ts` lines 50-105

`useGitStatus(rootPath)` is called from 4-5 components (`FileExplorer`, `ActivityBar`, `WorkspaceMetadata`, `SourceControlPanel`, `GitInfo`). Each creates its own 5-second `setInterval`. In normal layout, this produces 10+ IPC round-trips every 5 seconds just for git status.

**Fix:** Lift git status into a Zustand store or singleton hook called once at the top level. All consumers subscribe to the store.

---

### P0-05: `ReactMarkdown` components object recreated every render
**File:** `src/components/chat/MessageBubble.tsx` lines 380-481

The `components` prop passed to `<ReactMarkdown>` is an inline object literal. Every render creates a new reference, causing react-markdown to discard its entire internal render tree and re-render all markdown from scratch — on every streaming tick, every cursor position update, every store subscription flush.

**Fix:** Extract the components map to a module-level constant:
```ts
const MARKDOWN_COMPONENTS = { code: MarkdownCode, a: ..., p: ... };
```

---

### P0-06: `withGlobalTauri: true` enabled in production builds
**File:** `src-tauri/tauri.conf.json` line 26

This exposes the entire Tauri API on `window.__TAURI__`, accessible to any injected JavaScript — including content from user-rendered markdown, malicious clipboard content, or XSS. The MCP bridge that required this is already gated behind `#[cfg(debug_assertions)]`.

**Fix:** Create `src-tauri/tauri.release.conf.json` with `"withGlobalTauri": false` and pass `--config tauri.release.conf.json` during production builds.

---

### P0-07: Duplicate `Ctrl+S` save handlers fire twice per save
**Files:** `src/hooks/useKeybindings.ts` lines 267-273, `src/components/layout/EditorArea.tsx` lines 423-433

Both register independent `Ctrl+S` handlers on `window`. A single keystroke fires two `save_file` IPC calls and two `markSaved` calls.

**Fix:** Remove the `Ctrl+S` binding from `useKeybindings.ts`, keeping only the EditorArea handler which has proper format-on-save logic.

---

### P0-08: `setTimeout` in prompt-queue effect has no cleanup
**File:** `src/components/chat/ChatPanel.tsx` lines 110-122

The `useEffect` that auto-sends queued prompts calls `setTimeout` with no cleanup. If ChatPanel unmounts during the 500ms delay, `sendMessage` fires on a stale closure. Rapid `isStreaming` toggles can queue multiple sends.

**Fix:** Return `() => clearTimeout(id)` from the effect.

---

### P0-09: Cross-store coupling — `conversation.ts` directly imports `useUsageStore`
**File:** `src/stores/conversation.ts` lines 11, 393, 633, 676, 773

`conversation.ts` imports and calls `useUsageStore.getState()` synchronously inside Zustand actions. This breaks test isolation (usage state leaks between test suites) and creates initialization order fragility.

**Fix:** Move `startSession`, `addTurnUsage`, and `reset` calls to the `useClaude` hook or an event bus, so both stores are driven externally.

---

### P0-10: `agents.ts` `resetToDefaults` directly mutates `agentConversations` Map
**File:** `src/stores/agents.ts` lines 670-672

```ts
useAgentConversationsStore.getState().conversations.clear(); // direct mutation!
useAgentConversationsStore.setState({ conversations: new Map() });
```

`.clear()` mutates Zustand's internal state reference before `setState` replaces it, violating immutability. Subscribers that hold a reference to the old Map see cleared state before receiving the update notification.

**Fix:** Remove the `.clear()` call. Use `useAgentConversationsStore.getState().resetToDefaults()` instead.

---

## P1 — Significant Issues

### P1-01: `write_workspace_file` writes before canonicalize check (TOCTOU)
**File:** `src-tauri/src/workspace.rs` lines 79-88

The file is written to disk before the path traversal check runs. A symlink race can redirect the write to an arbitrary path.

**Fix:** Canonicalize the directory first, build the target path from `canonical_dir.join(file_name)`, then write.

---

### P1-02: `claude_single_shot` has no stdout size limit
**File:** `src-tauri/src/claude/process.rs` lines 459-462

Uses `read_to_end` with no size cap despite a comment claiming "max 1 MB". A runaway response buffers unboundedly.

**Fix:** Use `AsyncReadExt::take(1_048_576)` before `read_to_end`.

---

### P1-03: `remove_worktree` passes path without `--` separator
**File:** `src-tauri/src/worktree.rs` lines 230-247

A path starting with `--` (e.g., `--force`) can inject git options.

**Fix:** Add `"--"` before the path: `vec!["worktree", "remove", "--", worktree_path]`.

---

### P1-04: Commit message validation omits newline characters
**File:** `src-tauri/src/git.rs` lines 756-773

The validator only forbids backtick and `$`. Newlines can inject fake commit trailers.

**Fix:** Add `\n` and `\r` to the forbidden character set.

---

### P1-05: `detect_quality_gates` reads `cwd/package.json` without validating `cwd`
**File:** `src-tauri/src/merge_queue.rs` lines 154-157

The `cwd` from IPC is used directly in a `Path::new(cwd).join("package.json")`, allowing reads from arbitrary directories.

**Fix:** Validate `cwd` with the existing `validate_path` function.

---

### P1-06: `check_session_health` double-lock TOCTOU
**File:** `src-tauri/src/claude/session.rs` lines 147-176

The `processes` mutex is acquired, released, then re-acquired for the remove operation. Another caller can race between the two locks.

**Fix:** Hold one lock for the full check-and-remove.

---

### P1-07: `useClaudeSession` omits `model` parameter from IPC call
**File:** `src/hooks/claude/useClaudeSession.ts` lines 54-62

The new refactored `createSession` sends `claude_start_session` without the `model` key. The original `useClaude.ts` includes it. User's model selection is silently ignored.

**Fix:** Add `model: useSettingsStore.getState().selectedModel ?? null` to the IPC payload.

---

### P1-08: `workspaceStorage.ts` uses `btoa()` — breaks on non-ASCII paths
**File:** `src/lib/workspaceStorage.ts` line 39

`btoa()` only accepts Latin-1 characters. Project paths with CJK, Arabic, or other non-ASCII characters throw `InvalidCharacterError`.

**Fix:** Use `btoa(unescape(encodeURIComponent(normalized)))` or a `TextEncoder`-based approach.

---

### P1-09: Module-level `saveTimer` shared across invocations
**File:** `src/stores/workspace.ts` lines 473-484

The debounce timer is module-scoped. Rapid project switches can cause saves to reference the wrong project path.

**Fix:** Move `saveTimer` inside the store state or the `startAutoSave` closure.

---

### P1-10: `openProject` not guarded against concurrent calls
**File:** `src/stores/workspace.ts` lines 504-555

Two rapid `openProject` calls race on `isLoading`, double-reset all stores, and may save the wrong workspace.

**Fix:** Early-return if `isLoading` is already `true` or if `projectPath === currentProjectPath`.

---

### P1-11: `getConversation` returns stale pre-setState reference
**File:** `src/stores/agentConversations.ts` lines 76-86

Returns a local object before the `set` completes. Concurrent callers may operate on a stale base state.

**Fix:** Make `getConversation` void (initializer only). Always read via `getState().conversations.get()`.

---

### P1-12: Duplicate usage state fields always kept identical
**File:** `src/stores/usage.ts` lines 75-82, 257-264

`cacheCreationTokens` and `totalCacheCreationTokens` are always incremented by the same amount. Double the fields, double the maintenance.

**Fix:** Remove one set of fields.

---

### P1-13: Auto-save misses agent status/column/merge queue changes
**File:** `src/stores/workspace.ts` lines 717-725

Only watches `agents.size`. Agent status changes (kanban moves, cost updates) are not persisted until another event triggers save.

**Fix:** Subscribe to `agentsVersion` instead of `agents.size`. Add subscriptions for merge queue and verification.

---

### P1-14: `setFlashPanelTab` `setTimeout` is untracked
**File:** `src/stores/layout.ts` lines 111-120

Timer leaks on project switch. Fires after `resetToDefaults()`.

**Fix:** Store the timer ID and cancel in `resetToDefaults()`.

---

### P1-15: No ESLint configuration at all
**Project root:** No `eslint.config.*` found

No guards against React hooks rules violations, accessibility issues, or floating promises. TypeScript also missing `noImplicitReturns` and `exactOptionalPropertyTypes`.

**Fix:** Add ESLint with `@typescript-eslint/recommended` + `react-hooks` + `jsx-a11y`. Add missing TypeScript compiler options.

---

### P1-16: No Vite chunk splitting — Monaco + Shiki in one bundle
**File:** `vite.config.ts` lines 32-36

Monaco (~5MB) + Shiki (~3MB) + framer-motion + recharts + xterm all land in a single chunk, increasing startup parse time.

**Fix:** Add `manualChunks` for Monaco, Shiki, charts, and motion.

---

### P1-17: `tauri.conf.json` `$schema` points to wrong project
**File:** `src-tauri/tauri.conf.json` line 2

Points to `nicegui-dev/nicegui-tauri` instead of `https://schema.tauri.app/config/2`.

**Fix:** Update to the official Tauri v2 schema URL.

---

### P1-18: `ExportMenu` popover has no click-outside-to-close
**File:** `src/components/chat/ChatHeader.tsx` lines 52-102

The popover stays open indefinitely until the trigger button is clicked again.

**Fix:** Add a `mousedown` document listener matching the `PlanUsageIndicator` pattern.

---

### P1-19: `useFileTree` `refresh` causes listener churn on expand/collapse
**File:** `src/hooks/useFileTree.ts` lines 132-158

`expandedPaths` in the `refresh` dep array causes the `file_changed` listener to tear down and re-register on every expand/collapse.

**Fix:** Use a ref for `expandedPaths` inside the callback.

---

### P1-20: `useCommandBlocks` re-registers OSC handlers mid-stream
**File:** `src/hooks/useCommandBlocks.ts` line 283

`hasShellIntegration` in the effect deps causes handler churn when it flips from false to true.

**Fix:** Use a ref instead of state for `hasShellIntegration`.

---

### P1-21: `tauri-plugin-updater` compiled but never initialized
**Files:** `src-tauri/Cargo.toml` line 39, `src-tauri/src/lib.rs` lines 784-787

Increases binary size and attack surface while providing zero functionality.

**Fix:** Remove from `Cargo.toml` until the updater is ready to ship.

---

### P1-22: `TitleBar` reads store state imperatively during render
**File:** `src/components/layout/TitleBar.tsx` lines 90-92

`useEditorStore.getState()` during render produces stale dirty tab list.

**Fix:** Use a reactive Zustand selector instead.

---

### P1-23: `useTerminal` missing `shellArgs` from effect deps
**File:** `src/hooks/useTerminal.ts` line 188

Terminal is not re-created when shell arguments change.

**Fix:** Add `options.shellArgs` to the dependency array.

---

## P2 — Improvements

| # | File | Issue |
|---|------|-------|
| 1 | `src/components/layout/IDELayout.tsx` | Dead code (344 lines). `AppLayout.tsx` is the active version. Delete. |
| 2 | `src/hooks/useClaude.ts:327`, `hooks/claude/helpers.ts:320` | `guessLanguage` duplicated 3x. Canonical version exists at `lib/languages.ts`. |
| 3 | `src/stores/editor.ts:172-200` | `selectTabList`/`selectDirtyTabIds` re-render risk documented only in comments. Export as hooks with `useShallow` built in. |
| 4 | `src/stores/quickQuestion.ts:4-6` | Imports 3 stores at module scope. Convert to `getState()` reads inside the async function. |
| 5 | `src/stores/settings.ts:172-203` | `skipPermissions` silently excluded from persist with no comment explaining why. |
| 6 | `src/components/layout/ActivityBar.tsx:67-72` | 5 individual `useLayoutStore` calls per button instance (7 buttons = 28 subscriptions). Consolidate with `useShallow`. |
| 7 | `src/components/editor/MonacoEditor.tsx:158-252` | `inlineEdit` in `handleEditorDidMount` deps causes `useCallback` churn. Use a ref. |
| 8 | `src/components/chat/MessageBubble.tsx:177` | `key={i}` on `InlineImage`. Use `img.dataUrl` hash. |
| 9 | `src/components/settings/SettingsPanel.tsx:24-36` | Custom DOM events for cross-component communication. Use Zustand store. |
| 10 | `src/components/chat/VirtualMessageList.tsx:113` | Missing `virtualizer` and `onScrollStateChange` from effect deps. |
| 11 | `src-tauri/src/git.rs`, `checkpoint.rs`, `plan_usage.rs` | Duplicate `is_leap_year`/date logic in 3 files. Use `chrono` crate or shared module. |
| 12 | `src-tauri/src/git.rs`, `merge_queue.rs`, `worktree.rs` | `validate_branch_name` duplicated 3x with subtle differences. |
| 13 | `src-tauri/src/git.rs:319` | `git_log` limit uncapped. Add a ceiling (e.g., 10,000). |
| 14 | `src-tauri/src/checkpoint.rs:258-298` | `list_checkpoints` spawns 2N git processes. Use single `git for-each-ref`. |
| 15 | `src/lib/tauriMock.ts:710-713` | Unhandled IPC commands silently resolve to `null`. Should reject or warn loudly. |
| 16 | `src/lib/tauriMock.ts:719-730` | `window._N` callback leak grows unboundedly across HMR. |
| 17 | `src/lib/protocol.ts:234-237` | `ClaudeEventPayload` missing `session_id` field. |
| 18 | `src/hooks/useClickOutside.ts:24-32` | Handler identity instability causes listener leak after delay. |
| 19 | `src/hooks/useInlineEdit.ts:110-165` | Stale closure on `state.originalText` in `submit` deps. |
| 20 | `package.json` | `shadcn` in dependencies (should be devDependency). |
| 21 | `package.json` | `@types/node` pinned to `^25.5.2` (non-LTS). Use `^22`. |
| 22 | `package.json` | No `"test"` script. `npm test` fails. |
| 23 | `src/index.css` | Google Fonts loaded via external URL. Self-host with `@fontsource`. |
| 24 | `package.json` | `monaco-editor` and `@monaco-editor/react` both listed. Risk of version divergence. |
| 25 | `src-tauri/tauri.conf.json` | `api.anthropic.com` missing from CSP `connect-src`. |

---

## Test Coverage Gap Analysis

### Current State

| Layer | Files Tested | Total Files | Coverage |
|-------|-------------|-------------|----------|
| Stores | 15/15 | 15 | Strong |
| Components | 8/~90 | ~90 | Thin |
| Hooks | 0/~20 | ~20 | None |
| Lib/utilities | 0/~15 | ~15 | None |
| Rust (with #[cfg(test)]) | 6/27 | 27 | Partial |
| E2E | Smoke only | — | Shallow |

### Infrastructure Gaps
- **No coverage reporting** — no v8/istanbul provider configured in Vitest
- **Setup mock too broad** — `invoke` returns `null` for everything; IPC-driven logic is invisible
- **E2E tests use `waitForTimeout`** — fragile timing instead of Playwright's built-in waiters
- **`ipc-edge-cases.test.ts`** tests the mock, not the production IPC contract

### Top 10 Missing Tests (by impact)

| Priority | File | What to Test |
|----------|------|-------------|
| 1 | `src/lib/workspaceStorage.ts` | `encodeWorkspacePath` Unicode handling, `loadWorkspace` version migration |
| 2 | `src/lib/pricing.ts` | `normalizeModelName` suffix stripping, `calculateCost` math |
| 3 | `src/lib/slashHandlers.ts` | All 7+ command branches, `/export` sub-paths |
| 4 | `src/lib/mentionResolver.ts` | `filterMentionSources` two-tier search, `renderTree` depth guard |
| 5 | `src/lib/formatters.ts` | Boundary cases (negative timestamps, exact thresholds) |
| 6 | `src/hooks/useClaude.ts` | `assembleMessageFromBlocks`, `extractFromAssistantMsg` (extract as pure functions) |
| 7 | `src/stores/workspace.ts` | Serialization round-trip, `migrateViewMode`, `serializeAgent` |
| 8 | `src-tauri/src/worktree.rs` | `agent_branch_name` sanitization, path construction |
| 9 | `src-tauri/src/search.rs` | `replace_in_files` traversal guard, regex validation |
| 10 | `src-tauri/src/claude/protocol.rs` | Stream-json protocol parsing |

---

## Recommended Execution Order

Grouped into phases that can be executed sequentially. Each phase is independently shippable.

### Phase 1: Security & Stability (estimated: high priority)
Fixes that prevent data loss, security vulnerabilities, and production hangs.

1. Disable `withGlobalTauri` in production builds (P0-06)
2. Fix `write_workspace_file` TOCTOU — canonicalize before write (P1-01)
3. Add `--` separator in `remove_worktree` (P1-03)
4. Validate `cwd` in `detect_quality_gates` (P1-05)
5. Cap `claude_single_shot` stdout to 1MB (P1-02)
6. Add newline to commit message forbidden chars (P1-04)
7. Fix `btoa()` for non-ASCII paths (P1-08)
8. Guard `openProject` against concurrent calls (P1-10)
9. Fix module-level `saveTimer` isolation (P1-09)

### Phase 2: Performance & Concurrency (estimated: high priority)
Fixes that eliminate UI hangs, redundant IPC, and thread starvation.

1. Refactor `SessionManager` mutex — lock only for map lookup, not I/O (P0-01)
2. Wrap synchronous git commands in `spawn_blocking` (P0-02)
3. Consolidate `useGitStatus` into singleton store (P0-04)
4. Extract `ReactMarkdown` components to module-level constant (P0-05)
5. Remove duplicate `Ctrl+S` handler (P0-07)
6. Fix prompt-queue `setTimeout` cleanup (P0-08)
7. Add Vite `manualChunks` for Monaco/Shiki (P1-16)

### Phase 3: Refactor & Cleanup (estimated: medium priority)
Eliminate dead code, duplicate logic, and coupling.

1. Complete `useClaude.ts` → `claude/` split hook migration (P0-03)
2. Decouple `conversation.ts` from `useUsageStore` (P0-09)
3. Fix `agents.ts` Map mutation (P0-10)
4. Delete `IDELayout.tsx` (P2-01)
5. Consolidate `guessLanguage` to `lib/languages.ts` (P2-02)
6. Consolidate `validate_branch_name` to shared Rust module (P2-12)
7. Consolidate date/time logic to shared Rust module or `chrono` (P2-11)
8. Remove dead `tauri-plugin-updater` dependency (P1-21)

### Phase 4: Developer Experience & Testing (estimated: medium priority)
Infrastructure improvements for sustained velocity.

1. Add ESLint with `react-hooks`, `@typescript-eslint`, `jsx-a11y` (P1-15)
2. Configure Vitest coverage reporting (v8 provider + thresholds)
3. Add `"test"` script to `package.json` (P2-22)
4. Fix Tauri config schema URL (P1-17)
5. Write tests for top-10 gap list (see table above)
6. Replace `waitForTimeout` in E2E tests with proper waiters
7. Make mock layer reject on unhandled commands (P2-15)

### Phase 5: Polish (estimated: lower priority)
UX improvements and minor fixes.

1. Fix `ExportMenu` click-outside (P1-18)
2. Consolidate `ActivityBarButton` store subscriptions (P2-06)
3. Fix `useFileTree` listener churn (P1-19)
4. Self-host Google Fonts (P2-23)
5. Move `shadcn` to devDependencies (P2-20)
6. Fix `TitleBar` imperative state read (P1-22)

---

## Metrics

| Category | P0 | P1 | P2 | Total |
|----------|----|----|----|----|
| Security | 1 | 5 | 1 | 7 |
| Performance | 4 | 1 | 1 | 6 |
| Correctness | 3 | 8 | 5 | 16 |
| Code Quality | 2 | 3 | 12 | 17 |
| Testing | — | 1 | 2 | 3 |
| Build/Config | — | 5 | 4 | 9 |
| **Total** | **10** | **23** | **25** | **58** |

---

*Report generated by 6 parallel code review agents covering: store architecture, component architecture, hooks/utilities, Rust backend, test coverage, and dependencies/build configuration.*
