# State Management & Hooks Audit Report

**Auditor**: Agent 3 — Senior Frontend Engineer (State Management Specialist)
**Scope**: All 11 Zustand stores, 12 React hooks, 7 core library utilities
**Overall Assessment**: Solid architecture with critical memory leaks and race conditions

---

## Executive Summary

The state layer demonstrates solid architectural patterns with proper isolation and action completeness. However, there are **6 CRITICAL issues** (memory leaks, race conditions, error masking), **9 HIGH issues** (missing cleanup, circular dependencies, stale closures), and numerous medium-severity quality gaps that need attention.

---

## Zustand Stores

### conversation.ts — Complex but Necessary
| Severity | Finding | Location |
|----------|---------|----------|
| CRITICAL | JSON parse error returns `{}` instead of logging — masks tool input corruption | Lines 173-176 |
| HIGH | Circular dependency with usage store via `useUsageStore.getState()` | Lines 292, 441, 476 |
| HIGH | IPC failure handling missing — malformed session_id/cwd silently accepted | handleSystemInit line 282 |
| MEDIUM | Race condition: `message_stop` reads state then modifies in separate call | Lines 380-388 |

### editor.ts — Well-Structured
| Severity | Finding | Location |
|----------|---------|----------|
| CRITICAL | Set collections never cleaned up on session end | Lines 135-136 |
| HIGH | No selector functions — components subscribing to `tabs` rerender on any tab content change | Line 42 |
| MEDIUM | Orphaned popout window tabs never cleaned up on crash | popoutTabs Set |
| MEDIUM | Ambiguous no-tabs state in closeTab | Lines 186-192 |

### agents.ts — Excellent Normalization
| Severity | Finding | Location |
|----------|---------|----------|
| HIGH | Color cycling collision when agents > 10 (10 colors, modulo wraps) | Line 254 |
| MEDIUM | createChildAgent returns null if parent isn't coordinator — callers don't check | Line 312 |
| MEDIUM | hasFileConflict is O(n^2) for 100 agents x 50 files | Line 536 |
| MEDIUM | No rollback on cascade removal if child has active session | Lines 315-357 |

### agentConversations.ts — Simple but Leaky
| Severity | Finding | Location |
|----------|---------|----------|
| MEDIUM | getConversation auto-creates on read (side effect in getter) | Lines 73-82 |
| MEDIUM | No cleanup on agent deletion — orphaned conversations accumulate | Missing integration |

### mergeQueue.ts — Clear Structure
| Severity | Finding | Location |
|----------|---------|----------|
| HIGH | Position desync on concurrent reorder + remove operations | Lines 128-141 |
| MEDIUM | No duplicate prevention in gate results | Lines 144-156 |
| MEDIUM | Missing validation — empty agentId/branchName accepted | Lines 92-102 |

### settings.ts, layout.ts, commandPalette.ts, quickQuestion.ts, usage.ts, verification.ts
- Generally well-implemented with minor issues
- Settings: Missing NaN/Infinity validation on setters
- Usage: getSessionDurationFormatted not memoized
- Verification: computeOverall doesn't handle "skipped" status

---

## React Hooks

### useClaude.ts — CRITICAL Race Conditions
| Severity | Finding | Location |
|----------|---------|----------|
| CRITICAL | Race condition: startSession + sendMessage can create competing sessions | Lines 508-577 |
| HIGH | No error recovery in streaming pipeline — stale events update store after session kill | Lines 268-440 |
| HIGH | Event listener cleanup issues on session change — stale closures | Lines 263-496 |
| HIGH | IPC errors not propagated to UI — user sees no actionable message | Lines 513, 546, 568, etc. |
| MEDIUM | Hardcoded fallback cwd: `"C:/CursorProjects/Vantage"` | Line 542 |
| MEDIUM | startAgentSession doesn't await system_init before sending message | Lines 633-649 |

### useGitStatus.ts — CRITICAL Memory Leak
| Severity | Finding | Location |
|----------|---------|----------|
| CRITICAL | Interval never cleared on rootPath change — accumulates indefinitely | Line 66 |
| HIGH | IPC calls not cancelled on unmount — promises continue in background | Lines 31-60 |
| HIGH | File change event listener accumulates on re-mount | Lines 73-80 |
| MEDIUM | Path normalization fails for UNC paths (`\\server\share`) | Lines 48-52 |

### useFloatingWindow.ts — Race Conditions
| Severity | Finding | Location |
|----------|---------|----------|
| CRITICAL | Race condition in popout initialization — 500ms arbitrary delay | Lines 89-113 |
| HIGH | Popout close doesn't close parent tab — tab stays open but marked returned | Lines 116-119 |
| MEDIUM | Content sync race — multiple events queue out-of-order | Lines 139-147 |

### useFileTree.ts — Watcher Leaks
| Severity | Finding | Location |
|----------|---------|----------|
| HIGH | Race condition: rapid setRootPath leaves old file watcher running | Lines 74-89 |
| HIGH | File watcher from initial load never stopped on path change | Lines 60-71 |
| MEDIUM | toggleExpand captures entire tree in closure — memory fragmentation | Line 116 |

### useKeybindings.ts — Dependency Array Bug
| Severity | Finding | Location |
|----------|---------|----------|
| HIGH | keybindings array recreated every render — event listener thrashes | Line 239 |
| MEDIUM | No check for input field focus — keybindings fire while typing in modals | Missing |
| MEDIUM | DOM query hack for search input focus (`[data-search-input]` + 50ms delay) | Lines 148-154 |

### useTerminal.ts — Async Spawn Gap
| Severity | Finding | Location |
|----------|---------|----------|
| HIGH | Component unmount during async PTY spawn leaves orphaned process | Lines 94-147 |
| MEDIUM | WebGL context loss unhandled — silent fallback to DOM | Lines 74-76 |

### Other Hooks
- **useVimMode.ts**: MEDIUM — `vim-mode-change` listener never cleaned up on toggle
- **useAgentNotifications.ts**: HIGH — stall timers leak on subscribe error; MEDIUM — no debounce on rapid status changes
- **useAutoUpdate.ts**: MEDIUM — no retry on failed update check
- **useResizable.ts**: MEDIUM — no touch event support

---

## Library Utilities

### pluginRegistry.ts
| Severity | Finding | Location |
|----------|---------|----------|
| HIGH | Network request to npmjs.org has no timeout — hangs indefinitely | Lines 52-84 |
| MEDIUM | No rate limiting on search calls | Missing |

### agentsmd.ts
| Severity | Finding | Location |
|----------|---------|----------|
| MEDIUM | Regex won't match keys with underscores | Line 116 |
| MEDIUM | CSV parsing doesn't handle escaped quotes | Lines 54-58 |
| MEDIUM | No duplicate role name detection | Missing |

### bmadSharding.ts
| Severity | Finding | Location |
|----------|---------|----------|
| MEDIUM | Heading detection only levels 2-4; should support up to 6 | Line 62 |
| MEDIUM | Token estimation (`words * 1.3`) is very rough — consider js-tiktoken | Lines 44-45 |

### themeCustomization.ts
| Severity | Finding | Location |
|----------|---------|----------|
| MEDIUM | No validation of CSS color values — invalid values silently ignored | Lines 48-51 |

---

## Cross-Store Communication Issues

### Circular Dependencies
1. **conversation.ts <-> usage.ts** (HIGH): conversation calls `useUsageStore.getState()` — if usage ever imports conversation, this breaks
2. **agents.ts <-> agentConversations.ts** (MEDIUM): Agent removal doesn't clean up conversations

### Race Conditions
1. **useFileTree + useGitStatus** (HIGH): Both start file watchers independently; concurrent Rust commands with inconsistent state
2. **useClaude + useAgentConversations** (HIGH): No lock on concurrent event routing — two stream events can update same agent conversation simultaneously

---

## Memory Leaks Summary

| Hook/Store | Severity | Issue |
|------------|----------|-------|
| useGitStatus.ts | CRITICAL | setInterval accumulates on rootPath change |
| useKeybindings.ts | HIGH | Event listener re-registered every keystroke |
| useAgentNotifications.ts | HIGH | Stall timers leak on subscribe error |
| useFileTree.ts | MEDIUM | File watcher never stopped on path change |
| useVimMode.ts | MEDIUM | vim-mode-change listener not removed |
| useClaude.ts | MEDIUM | Old event listeners not cleaned up on session change |

---

## Architectural Recommendations

1. **Central error boundary** for IPC errors surfaced to user
2. **Session state machine** (idle -> starting -> ready -> streaming) to prevent race conditions
3. **AbortController** for all Tauri invoke calls to support cancellation
4. **Timer registry** to track and clean up all setTimeout/setInterval calls
5. **Memoize all selectors** to prevent unnecessary re-renders
6. **Integration tests** for cross-store communication
7. **Document store contracts** for safe access outside React components
