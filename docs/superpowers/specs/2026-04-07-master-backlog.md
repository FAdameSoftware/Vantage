# Vantage Master Backlog

**Date:** 2026-04-07
**Source:** 8 audit reports, 3-wave verification pipeline (8 extraction agents, 3 review agents, 1 consolidation pass)
**Final reviewer:** Claude (this document)

---

## P0 — Critical Bugs (Must Fix)

### BUG-001: Model selector UI is non-functional
**Source:** V-001 (simplify+comparative reviewer, fresh finding)
**Description:** Four model selector UIs exist (ChatHeader, SessionInfo, CreateAgentDialog, WriterReviewerLauncher) but NONE wire through to the Rust backend. `claude_start_session` has no `model` parameter. `SpawnOptions` has no model field. Selecting a different model has zero effect on which model Claude uses.
**Files:** `src-tauri/src/claude/process.rs` (add model to SpawnOptions + CLI arg), `src-tauri/src/lib.rs` (add model param to command), `src/hooks/useClaude.ts` (pass model from settings)
**Impact:** Users think they're switching models but nothing changes.

### BUG-002: quickQuestion store missing skipPermissions — crashes in Tauri
**Source:** V-003 (simplify+comparative reviewer, fresh finding)
**Description:** `src/stores/quickQuestion.ts:164-171` calls `claude_start_session` without `skipPermissions` parameter. Rust declares it as `skip_permissions: bool` (required). Serde will fail at runtime. Mock-masked because tauriMock ignores all args.
**Files:** `src/stores/quickQuestion.ts:164-171`
**Impact:** /btw quick question feature crashes in real Tauri app.

### SEC-001: `unsafe-eval` in Content Security Policy
**Source:** SEC-C1 (security audit), confirmed by all 3 reviewers
**Description:** CSP allows `'unsafe-eval'` in `script-src`. In an app rendering AI responses, user code, and markdown, this is an escalation vector. Monaco Editor may require it — needs investigation of nonce-based or Web Worker alternatives.
**Files:** `src-tauri/tauri.conf.json:28`
**Impact:** XSS escalation vector if any content injection occurs.

---

## P1 — High Priority

### BUG-003: Model lists inconsistent across 4 components
**Source:** V-002, SFU-Q6, CMP (multiple reports)
**Description:** SessionInfo says "Haiku 3.5", ChatHeader says "Haiku 4.5", agent dialogs say "Opus 4.5/Sonnet 4.5" while chat says "Opus 4.6/Sonnet 4.6". Users see different models in different selectors.
**Files:** Create `src/lib/models.ts` with single AVAILABLE_MODELS, import in all 4 components
**Impact:** User confusion, incorrect model display.

### BUG-004: Haiku pricing falls back to Sonnet prices
**Source:** V-011 (simplify+comparative reviewer)
**Description:** UI uses model ID "claude-haiku-4-5" but pricing.ts only has "claude-3-5-haiku". Prefix match fails. Haiku usage silently shows Sonnet 4 pricing ($3/$15 instead of $0.80/$4).
**Files:** `src/lib/pricing.ts` (add haiku-4-5 entry)
**Impact:** Incorrect cost calculations for Haiku users.

### BUG-005: Workspace layout save mismatch
**Source:** V-004 (simplify+comparative reviewer)
**Description:** Initial layout snapshot includes horizontalLayout/verticalLayout but comparison snapshot does not. First change always triggers spurious save; subsequent layout-only changes never save.
**Files:** `src/stores/workspace.ts` (align snapshot fields)
**Impact:** Panel layout changes can be silently lost.

### SEC-002: Workspace filename path traversal
**Source:** SEC-M2, upgraded to P1 by security reviewer
**Description:** `workspace.rs` joins user-provided `file_name` to `~/.vantage/workspaces/` without rejecting `../` patterns. `PathBuf::join("../../../etc/passwd")` traverses outside the directory.
**Files:** `src-tauri/src/workspace.rs:20-47`
**Impact:** Write arbitrary files relative to workspaces directory.

### SEC-003: MCP config command hygiene
**Source:** SEC-C2, downgraded from Critical to P1 by reviewer
**Description:** `.mcp.json` in a cloned repo can specify arbitrary commands. Vantage reads/writes this config (doesn't execute directly — Claude CLI does), but should warn users and block dangerous env vars.
**Files:** `src-tauri/src/mcp.rs`
**Impact:** Malicious project configs could influence MCP server spawning.

### SEC-004: skip-permissions needs UI confirmation
**Source:** SEC-H4, FPA-11 (multiple reports)
**Description:** `--dangerously-skip-permissions` enabled with only stderr log. No UI dialog, no persistent audit trail.
**Files:** `src-tauri/src/claude/process.rs:100-104`
**Impact:** No user-visible confirmation for a dangerous setting.

### SEC-005: npm dependencies with known CVEs (Vite)
**Source:** SEC-H1, corrected by reviewer (only Vite is direct dep)
**Description:** Vite has 2 CVEs (path traversal, WebSocket file read). DOMPurify/Hono are transitive and lower risk.
**Files:** `package.json` — run `npm audit fix`
**Impact:** Dev-time vulnerabilities in Vite.

### IMPROVE-001: useClaude.ts is 1,017-line monolith
**Source:** FFU-1, SFU-Q12, FQA-1, SIM-Q12 (all reports)
**Description:** Single hook handles streaming, agent routing, permissions, connection, view integration, diff capture. Growing (+82 lines during sprint). Contains duplicate session-start logic (V-008).
**Files:** Split into `useClaudeStream`, `useClaudeSession`, `useAgentRouting`
**Impact:** Maintainability, testing difficulty.

### IMPROVE-002: SearchPanel lacks virtualization (1,000 items)
**Source:** FFU-3, FQA-2, F2 (multiple reports)
**Description:** Renders up to 1,000 search results via `.map()` without windowing. Real jank on large projects.
**Files:** `src/components/search/SearchPanel.tsx` — add `@tanstack/react-virtual`
**Impact:** Performance degradation on large codebases.

### IMPROVE-003: Test coverage gaps for critical components
**Source:** FQ-007 (frontend reviewer, fresh finding)
**Description:** No tests for SearchPanel (789 LOC), FileExplorer (695), MessageBubble (635), useClaude (1,017), TerminalInstance, or ChatPanel. All test coverage is on stores and smaller components.
**Files:** Create test files for the 6 largest untested components
**Impact:** Regressions go undetected.

### IMPROVE-004: Mock-only testing violates CLAUDE.md
**Source:** FPA-12 (full project audit)
**Description:** Every test uses the Tauri mock layer. Zero real IPC coverage. This directly violates CLAUDE.md: "NEVER test only against mocks." Mock-masked bugs (V-001, V-003) prove the risk.
**Files:** Add integration tests using Tauri MCP bridge against `npm run tauri dev`
**Impact:** Mock-masked bugs reach production.

---

## P2 — Medium Priority

### SEC-006: Vite dev server fs.allow too broad
**Source:** SEC-M5
**Files:** `vite.config.ts:24` — narrow to `["./src", "./public"]`

### SEC-007: session_stats accepts arbitrary file paths
**Source:** NEW-3 (security reviewer, fresh finding)
**Files:** `src-tauri/src/session_search.rs` — validate path within `~/.claude/projects/`

### SEC-008: MCP Bridge in debug builds (informational)
**Source:** SEC-H3, downgraded to P2 by reviewer
**Action:** Document; consider env-var opt-in

### SEC-009: unsafe-inline in CSS CSP
**Source:** SEC-H2, downgraded to P2 by reviewer
**Action:** Migrate inline styles to Tailwind/external; remove unsafe-inline

### IMPROVE-005: paths.ts created but 0 consumers migrated
**Source:** SFU-R1, NEXT2 (38+ inline `.replace(/\\/g, "/")` remain)
**Files:** Migrate 40+ files to use `normalizePath()`, `basename()`, `relativePath()`

### IMPROVE-006: animations.ts has 1 consumer (9 hardcoded easing curves remain)
**Source:** SFU-ANI1, SR1-5
**Files:** Replace 9+ `[0.4, 0, 0.2, 1]` with `EASE_SMOOTH` import

### IMPROVE-007: useClickOutside has 3 consumers (8 inline handlers remain)
**Source:** SFU-CLICK1
**Files:** Migrate 8 remaining mousedown handlers

### IMPROVE-008: React.memo coverage at 3% (4 of 134)
**Source:** FFU-6, FQA-3
**Action:** Wrap split sub-components + FileTreeNode + CodeBlock with memo

### IMPROVE-009: Conversation messages unbounded in-memory
**Source:** SFU-E17, FQ-005
**Action:** Cap messages array or implement archival for long sessions

### IMPROVE-010: Duplicate session-start logic in useClaude
**Source:** V-008
**Files:** Extract shared helper within `useClaude.ts` (lines 690-715 and 744-769)

### IMPROVE-011: Specta bindings.ts generated but never imported (495 dead LOC)
**Source:** V-005
**Action:** Either use type-safe bindings or remove generation step

### IMPROVE-012: SearchPanel unmount doesn't cancel in-flight search
**Source:** FQ-012 (frontend reviewer)
**Files:** Add AbortController to SearchPanel search IPC calls

### IMPROVE-013: extension-to-language mapping duplicated in 3 files
**Source:** SIM-R8
**Action:** Create `src/lib/languages.ts` with unified lookup table

### IMPROVE-014: Agents store copies entire Map on every mutation
**Source:** SIM-E5
**Action:** Use version counter pattern (like conversation.ts activeBlocks fix)

---

## P3 — Low Priority / Polish

### SEC-010: Auto-updater disabled (pre-release acceptable)
**Source:** SEC-C3, downgraded by reviewer — becomes P0 at first distribution

### SEC-011: File tree depth unbounded | SEC-012: Claude stdout limit not enforced | SEC-013: Search max_results no ceiling | SEC-014: MCP unpinned versions | SEC-015: MCP config silent error drop | SEC-016: Windows path case edge case
**Source:** SEC-L1 through SEC-L7 (excluding rejected L6)
**Action:** Minor hardening tasks, batch together

### IMPROVE-015: generateId() duplicated in 3 files
**Source:** V-006, SIM-R4 — Extract to `src/lib/id.ts`

### IMPROVE-016: formatRelativeTime duplicate in ActivityTrail.tsx
**Source:** V-007 — Replace with shared import

### IMPROVE-017: formatFileSize local to FileTreeNode
**Source:** V-018 — Move to `src/lib/formatters.ts`

### IMPROVE-018: Loader2+animate-spin pattern (22 occurrences)
**Source:** SIM-R13 — Create shared Spinner component

### IMPROVE-019: saveFile() IPC pattern duplicated 8+ times
**Source:** SIM-R16 — Create `src/lib/ipc.ts` helper

### IMPROVE-020: Inline style objects at 1,349 instances
**Source:** FFU-7, FQA-16 — Create Tailwind plugin for CSS variables

### IMPROVE-021: Shared ToggleButton / PromptDialog not extracted
**Source:** FFU-8, FFU-9, FQA-8 — Extract to `src/components/ui/`

### IMPROVE-022: Hardcoded dimensions (ChatInput maxHeight, icon sizes)
**Source:** FFU-15, FQA-17-18 — Extract to theme tokens

### IMPROVE-023: MenuBar 828 lines unsplit
**Source:** FFU-2, SIM-Q13 — Extract menu definitions

### IMPROVE-024: Recharts `any` types in formatters
**Source:** FQA-22 — Change to `number`

### IMPROVE-025: StrictMode disabled (re-enable after PTY cleanup)
**Source:** SR1-3 — Re-enable once useTerminal cleanup is verified

---

## Rejected Findings (with justification)

| Finding | Reason |
|---------|--------|
| SEC-M8 (source maps in prod) | Vite defaults to sourcemap:false in production. No action needed. |
| SEC-L6 (frame-ancestors) | Not applicable to desktop app — not embedded in iframes. |
| FileExplorer "lacks validation" as security | Rust backend has comprehensive validate_path() with traversal protection. Frontend validation is UX, not security. |
| Event listener leaks | All 35+ addEventListener calls verified to have matching cleanup. useClaude has cancelled flag + unlisteners array. |
| ErrorBoundary "missing" | App-level + per-panel wrapping in PrimarySidebar confirmed adequate. |
| Chat "not virtualized" | VirtualMessageList.tsx using @tanstack/react-virtual confirmed working. |
| dangerouslySetInnerHTML XSS | Zero instances in codebase. Positive finding. |
| V-010 (pricing prefix match) | Corrected to V-011 — prefix match works for opus/sonnet but not haiku-4-5. |
| V-014 (skipPermissions not persisted) | Intentional security design — dangerous settings should not persist. |
| CMP-009 (web mode fallback) | Strategic direction, not a defect. Vantage is a desktop app. |
| CMP-010 (stop building commodity features) | Strategic advice, not actionable as a backlog item. |
| CMP-012 (prompt queue) | Feature request, not a defect. Opcode comparison item. |

---

## Summary

| Priority | Bugs | Security | Improvements | Total |
|----------|------|----------|-------------|-------|
| P0 | 2 | 1 | 0 | **3** |
| P1 | 3 | 3 | 4 | **10** |
| P2 | 0 | 4 | 10 | **14** |
| P3 | 0 | 7 | 11 | **18** |
| **Total** | **5** | **15** | **25** | **45** |

**3 items require immediate attention (P0).**
**10 items should be addressed in the next sprint (P1).**
**32 items are tracked improvements (P2-P3).**
**12 findings rejected with documented justification.**
