# Follow-Up Audit: Memory Leaks & Race Conditions Verification

**Auditor**: Verification Agent 3
**Scope**: 14 original memory leaks, race conditions, and state issues
**Result**: 12 FIXED, 1 PARTIALLY_FIXED, 1 NOT_FIXED, 3 NEW ISSUES

---

## Verification Results

### Memory Leaks

| # | Original Finding | Status | Notes |
|---|-----------------|--------|-------|
| 1 | useGitStatus.ts setInterval accumulation | FIXED | Dual cleanup: early clear + return cleanup, null assignment |
| 2 | useKeybindings.ts array recreation | FIXED | useMemo with proper dependency array |
| 3 | useAgentNotifications.ts stall timer leak | FIXED | Try-catch wrapper, clear-before-create, cleanup on unmount |
| 4 | useFileTree.ts watcher never stopped | FIXED | stop_file_watcher called before starting new one |
| 5 | useVimMode.ts listener not removed | FIXED | disposed flag pattern prevents async race conditions |
| 6 | useClaude.ts old listeners not cleaned | FIXED | Unlistener array with proper cleanup function |

### Race Conditions

| # | Original Finding | Status | Notes |
|---|-----------------|--------|-------|
| 7 | useClaude.ts competing sessions | FIXED | sessionStartPromiseRef prevents duplicate starts |
| 8 | useFloatingWindow.ts 500ms delay | FIXED | Event-driven with listen("popout-ready") + 5s fallback |
| 9 | useFileTree.ts rapid setRootPath | PARTIALLY_FIXED | Low-risk: async timing could still cause race on very rapid switches |
| 10 | useTerminal.ts PTY spawn orphan | FIXED | mounted flag prevents wiring handlers to dead PTY |

### Other State Issues

| # | Original Finding | Status | Notes |
|---|-----------------|--------|-------|
| 11 | conversation.ts JSON parse → {} | FIXED | Now logs warning with truncated raw JSON, sets isError flag |
| 12 | conversation.ts circular dep | NOT_APPLICABLE | One-way import only; original finding was incorrect |
| 13 | editor.ts Set cleanup | FIXED | Explicit delete from Sets on closeTab, closeAll, closeOthers |
| 14 | pluginRegistry.ts no timeout | NOT_FIXED | fetch() still has no AbortController timeout |

---

## New Issues Introduced

| # | Finding | Severity | Location |
|---|---------|----------|----------|
| NEW-1 | capturePendingDiffs setTimeout (500ms) not tracked or cleaned up | MEDIUM | useClaude.ts:284 |
| NEW-2 | vantage:agent-auto-start handler has 1000ms setTimeout without cleanup | MEDIUM | useClaude.ts:859,882 |
| NEW-3 | capturePendingDiffs called inside message listener (accumulates on rapid messages) | MEDIUM | useClaude.ts:443 |

---

## Fix Quality Highlights

### Best Fix: useFloatingWindow.ts (Finding 8)
Replaced fragile 500ms delay with event-driven `listen("popout-ready")` pattern plus a 5-second safety fallback. Clean unlisten on event fire. This is the gold standard for async coordination.

### Best Pattern: useVimMode.ts (Finding 5)
Uses a `disposed` flag that prevents the dynamic import callback from attaching handlers after cleanup has started. Clean pattern for async-import-in-useEffect scenarios.

### Best Fix: useClaude.ts session race (Finding 7)
`sessionStartPromiseRef` holds the pending start promise. Both startSession and sendMessage check and await it before proceeding. Prevents the duplicate session scenario completely.

---

## Remaining Risk

1. **pluginRegistry.ts**: No timeout on npmjs.org fetch — can hang indefinitely if registry is down. Add AbortController with 5-10s timeout.
2. **useClaude.ts timeouts**: 3 new untracked setTimeout calls could fire after hook cleanup. Track in refs and clear on unmount.
3. **useFileTree.ts**: Low-risk race on very rapid project switching. Could add generation counter for bulletproof fix.
