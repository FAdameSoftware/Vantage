# Audit 3: Remaining Issues Verification

**Auditor**: Agent 1 — Issue Tracker
**Scope**: 17 carried-over items from Audit 2
**Result**: 10 FIXED, 2 PARTIALLY_FIXED, 1 NOT_FIXED, 4 deferred items not checked

---

## Priority 1-2 ("Should Fix Soon") — 5 items

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | pluginRegistry.ts fetch timeout | **FIXED** | AbortController + 10s timeout (lines 53, 64-76), download counts too (115-128) |
| 2 | tauriMock.ts error simulation | **FIXED** | MockErrorSimulator class (lines 160-196), checked in invoke handler (590-593) |
| 3 | React.memo on MessageBubble/AgentCard | **FIXED** | MessageBubble:274, AgentCard:92 both wrapped |
| 4 | Error boundaries (Search, FileExplorer, DiffViewer) | **PARTIALLY** | DiffViewer wrapped (EditorArea:288-294); SearchPanel still unprotected |
| 5 | Unsafe libc::kill() in process.rs | **FIXED** | Uses safe `child.start_kill()` (line 309), comment explains why (line 307) |

## Audit-2 New Issues — 7 items

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 6 | worktree.rs .unwrap() | **FIXED** | .expect() with descriptive guards (lines 57-59) |
| 7 | capturePendingDiffs timeout tracking | **FIXED** | pendingDiffTimeouts Map + cancelAllDiffTimeouts() (lines 261-270, 591-592) |
| 8 | Agent auto-start timeout cleanup | **FIXED** | Timer tracked in variable, cleared on cleanup (lines 872-891) |
| 9 | capturePendingDiffs accumulation | **FIXED** | Per-file debounce: cancel existing timer before setting new (lines 293-297) |
| 10 | DiffViewer ErrorBoundary | **FIXED** | Wrapped in ErrorBoundary (EditorArea:288-294) |
| 11 | SearchPanel aria-expanded | **NOT_FIXED** | Lines 392-402 still missing aria-expanded attribute |
| 12 | plugins.rs name validation | **PARTIALLY** | Checks ;|& but missing backticks, quotes, $, newlines (lines 420-424) |

## Still Outstanding

1. **SearchPanel.tsx:395** — Add `aria-expanded={isExpanded}` to file header toggle
2. **SearchPanel** — Wrap in ErrorBoundary
3. **plugins.rs:422** — Expand character validation (backticks, $, quotes)
