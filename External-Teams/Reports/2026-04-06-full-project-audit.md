# Vantage Full Project Audit

**Date:** 2026-04-06
**Scope:** Full codebase (198 commits, 183 TS/TSX files, 47K lines TypeScript, 8K lines Rust)
**Method:** 5 parallel review agents (CLAUDE.md compliance, bug scan, Rust security, architecture, recent changes) + 8 verification agents
**Result:** 12 issues at 80+ confidence (2 critical, 7 high, 3 medium)

---

## Issues

### 1. CRITICAL: `useClaude()` called in multiple components -- PermissionDialog's `respondPermission` is a silent no-op

**Score:** 85 | **Category:** Architecture bug

`PermissionDialog` at line 337 calls `useClaude()` which creates its own `sessionIdRef = useRef(null)`. When the user clicks Allow/Deny, `respondPermission` checks `sessionIdRef.current` (line 722 of useClaude.ts) -- which is always `null` in PermissionDialog's instance. Every permission response is silently swallowed. Claude blocks waiting for a response it never receives.

**Files:**
- `src/components/permissions/PermissionDialog.tsx:337`
- `src/hooks/useClaude.ts:328,722`

**Fix:** Either pass `respondPermission` down from the single parent `useClaude()` instance via context/props, or have `respondPermission` read `sessionId` from the conversation store instead of a local ref.

---

### 2. CRITICAL: `useClaude` async `setupListeners()` called without await -- dangling Tauri event handlers

**Score:** 95 | **Category:** Memory leak / event duplication

`setupListeners()` is async (line 357) and called fire-and-forget at line 585. If React unmounts before the three `listen()` promises resolve, the cleanup function iterates an empty `unlisteners` array. Live `claude_message`, `claude_permission_request`, and `claude_status` handlers persist indefinitely, causing duplicate message processing and permission dialogs on remount.

**Files:**
- `src/hooks/useClaude.ts:355-593`

**Fix:** Add a `cancelled` flag pattern:

```ts
useEffect(() => {
  let cancelled = false;
  const unlisteners: UnlistenFn[] = [];

  async function setupListeners() {
    const ul = await listen(...);
    if (cancelled) { ul(); return; }
    unlisteners.push(ul);
    // repeat for each listener
  }

  setupListeners();

  return () => {
    cancelled = true;
    for (const ul of unlisteners) ul();
  };
}, [...]);
```

---

### 3. HIGH: `EditorTabs` closes tab unconditionally after save failure -- silent data loss

**Score:** 100 | **Category:** Data loss

In `handleUnsavedSave` (lines 454-468), `closeTab(tabId)` runs outside the try/catch block. If `write_file` fails (disk full, permissions), the tab still closes and unsaved content is lost. The user sees no error -- only a `console.error`.

**Files:**
- `src/components/editor/EditorTabs.tsx:454-468`

**Fix:** Move `closeTab(tabId)` inside the try block, after `markSaved()`. Show a user-visible error (toast) on failure.

---

### 4. HIGH: `sendMessage` auto-start omits `skipPermissions` parameter

**Score:** 90 | **Category:** Settings bug

`startSession()` (line 625) passes `skipPermissions: settings.skipPermissions ?? false`. But `sendMessage()`'s auto-start path (lines 672-679) and `startAgentSession()` (lines 804-811) omit it entirely. User's skip-permissions preference is silently ignored on auto-started sessions.

**Files:**
- `src/hooks/useClaude.ts:669-679,804-811`

**Fix:** Add `skipPermissions: settings.skipPermissions ?? false` to both `invoke("claude_start_session")` call sites.

---

### 5. HIGH: `mergeQueue` and `verification` stores never persisted despite being workspace-scoped

**Score:** 100 | **Category:** State persistence gap

CLAUDE.md lists 8 workspace-scoped stores. `collectWorkspaceState` and `applyWorkspaceState` in workspace.ts only handle 6. The `WorkspaceFile` type in workspaceTypes.ts has no `mergeQueue` or `verification` fields. Merge queue entries, quality gate results, and verification dashboard state are lost on every app restart or project switch.

**Files:**
- `src/stores/workspace.ts:177-391`
- `src/lib/workspaceTypes.ts:14-28`

**Fix:** Add `mergeQueue` and `verification` fields to `WorkspaceFile`, and add collect/apply logic to `collectWorkspaceState`/`applyWorkspaceState`.

---

### 6. HIGH: `PopoutEditor` renders outside `ErrorBoundary`

**Score:** 100 | **Category:** Crash recovery

In App.tsx lines 81-83, `isPopoutWindow()` returns `<PopoutEditor />` before reaching the `<ErrorBoundary>` at line 86. Any crash in a popout window shows a blank white screen with no recovery.

**Files:**
- `src/App.tsx:81-83`

**Fix:** Wrap the popout return in its own `<ErrorBoundary>`:

```tsx
if (isPopoutWindow()) {
  return <ErrorBoundary><PopoutEditor /></ErrorBoundary>;
}
```

---

### 7. HIGH: `useTerminal` PTY + disposables leaked on fast unmount

**Score:** 85 | **Category:** Resource leak

If the component unmounts between PTY spawn completing and `cleanupPty` being assigned (line 152), the cleanup function sees `cleanupPty` as null and skips it. The PTY process and xterm disposables are orphaned. Additionally, `options.shellArgs` is missing from the effect dependency array (line 178), so shell arg changes are silently ignored.

**Files:**
- `src/hooks/useTerminal.ts:152-166,178`

**Fix:** Use the same `cancelled` flag pattern as the useClaude fix. Add `options.shellArgs` to the dependency array.

---

### 8. HIGH: Double file watcher registration on project open

**Score:** 80 | **Category:** Race condition

`workspace.ts` line 475 starts a file watcher on `openProject`. `useFileTree` independently stops and restarts it on lines 72-77 when `rootPath` changes. No coordination between them -- causes event flooding, race conditions, and `useFileTree` unmount can tear down the workspace store's watcher.

**Files:**
- `src/stores/workspace.ts:475`
- `src/hooks/useFileTree.ts:72-77,184`

**Fix:** Centralize file watcher lifecycle in one place (either the store or the hook, not both).

---

### 9. HIGH: `useFileTree` listener cleanup race

**Score:** 85 | **Category:** Memory leak

At lines 161-179, `listen("file_changed")` is called without await. If cleanup runs before the promise resolves, `unlisten` is still null. The handler keeps calling `refresh()` on unmounted components.

**Files:**
- `src/hooks/useFileTree.ts:161-179`

**Fix:** Same `cancelled` flag pattern. Guard `refresh()` calls with a mounted check.

---

### 10. MEDIUM: `ChatPanel` search crashes on messages with no `text` field

**Score:** 80 | **Category:** Runtime crash

At line 295, `msg.text.toLowerCase()` throws if `msg.text` is `undefined` or `null` (e.g., tool-call-only messages or partially-constructed streaming messages). No null guard.

**Files:**
- `src/components/chat/ChatPanel.tsx:295`

**Fix:** Add optional chaining: `msg.text?.toLowerCase().includes(lowerQuery)`.

---

### 11. MEDIUM: `skip_permissions` flag exposed to frontend without server-side policy

**Score:** 85 | **Category:** Security (defense in depth)

`claude_start_session` in lib.rs accepts `skip_permissions: bool` directly from the webview. When true, it passes `--dangerously-skip-permissions` to Claude CLI. A compromised webview (XSS in rendered markdown/diff) could start fully permission-less sessions.

**Files:**
- `src-tauri/src/lib.rs:135`
- `src-tauri/src/claude/process.rs:101-103`

**Fix:** Add a server-side policy check -- e.g., require explicit user confirmation via a native Tauri dialog (not webview) before enabling skip-permissions.

---

### 12. MEDIUM: All tests run exclusively against mock layer -- zero real IPC coverage

**Score:** 95 | **Category:** CLAUDE.md violation

Every test (Vitest unit, component, Playwright E2E) uses the Tauri mock layer. The E2E suite explicitly documents: "all native APIs are stubbed." This directly violates CLAUDE.md: "NEVER test only against mocks -- the Tauri mock layer hides IPC mismatches."

**Files:**
- `e2e/vantage.spec.ts:9-12`
- `src/__tests__/ipc-edge-cases.test.ts`

**Fix:** Add integration tests that run against `npm run tauri dev` using the Tauri MCP bridge or WebDriver.

---

## False Positive Eliminated

- **IDELayout `onResize` API mismatch** -- Initially flagged as `{ asPercentage }` being wrong, but `react-resizable-panels` v4.9 passes `PanelSize` objects with `asPercentage` property, not plain numbers. Verified via library docs.

## Issues Below Threshold (not included above)

| Issue | Score | Reason excluded |
|-------|-------|-----------------|
| `workspace.rs` path traversal | 75 | Real gap in Rust, but frontend base64url-encodes all filenames |
| `horizontalLayout`/`verticalLayout` not in auto-save subscriber | 75 | Panel sizes silently not persisted |
| `useProjectUsage` permanently disabled | 70 | Disabled = no crash risk |
| Hardcoded hex colors in DevPanel | 70 | Dev-only code |
| `index.css` global `user-select: none` | 70 | Common in desktop apps |
| `PermissionDialog` destructive pattern regexes easily bypassed | 70 | Cosmetic UI labeling, not a security gate |
| `quickQuestion` sessionId closure race | 70 | Intermittent first-character drop |

## Recommended Priority Order

1. **Issue #1** (PermissionDialog no-op) -- Blocks all permission workflows
2. **Issue #2** (listener leak) -- Causes duplicate messages and growing memory
3. **Issue #3** (save-then-close data loss) -- Direct user impact
4. **Issue #4** (skipPermissions omission) -- Settings not respected
5. **Issues #7, #8, #9** (terminal/filetree leaks) -- Batch fix with cancelled-flag pattern
6. **Issue #6** (PopoutEditor ErrorBoundary) -- One-line fix
7. **Issue #5** (store persistence gap) -- Requires schema addition
8. **Issue #10** (search crash) -- One-line fix
9. **Issue #11** (skip_permissions policy) -- Security hardening
10. **Issue #12** (mock-only testing) -- Systemic, requires test infrastructure work
