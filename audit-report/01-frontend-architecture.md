# Frontend Architecture Audit Report

**Auditor**: Agent 1 — Senior Frontend Architect
**Scope**: Component quality, React patterns, accessibility, CSS, mock layer
**Files Reviewed**: 40+
**Overall Risk Level**: MEDIUM-HIGH

---

## Executive Summary

Vantage has generally solid architectural patterns with thoughtful component isolation and Zustand state management, but exhibits **moderate-to-significant architectural debt** from rapid development. Critical gaps exist in error handling, incomplete mock layer, and several React anti-patterns.

---

## 1. Mock Layer Quality (`src/lib/tauriMock.ts`)

**Status: MODERATE — Comprehensive but with critical gaps**

### Strengths
- Well-organized handlers for ~100+ Tauri commands
- Proper in-memory store implementation (lines 133-507)
- Covers most critical paths: file tree, git, terminal, Claude session

### Findings

| Severity | Finding | Location |
|----------|---------|----------|
| CRITICAL | All handlers return success; no error state simulation. Browser preview crashes on failure paths | Lines 163-535 |
| HIGH | Hardcoded static `MOCK_FILE_TREE`; file operations don't mutate it. Can't test file modification flows | Lines 20-104, 177-182 |
| MEDIUM | Missing plugin mocks — fixed 1280x720 viewport, no DPI scaling, empty monitor array | Lines 388-535 |
| MEDIUM | Event listeners are no-ops — `listen()` and event emission have no callback dispatch. File watcher events never fire | Lines 383-386, 607-614 |

---

## 2. Component Quality

### Layout Components

| Component | Rating | Key Issue |
|-----------|--------|-----------|
| IDELayout.tsx | GOOD | MEDIUM: Global keydown listener (line 52-61) captures Ctrl+Shift+Q even when focus is in chat input |
| PanelArea.tsx | GOOD | LOW: Uses `display: none` instead of unmounting — terminals consume resources off-screen |
| StatusBar.tsx | GOOD | MEDIUM: Line 82 connection status logic is inverted for streaming state |

### Editor Components

| Component | Rating | Key Issue |
|-----------|--------|-----------|
| MonacoEditor.tsx | MODERATE | HIGH: No error boundary; Monaco can throw during init and crash the app |
| EditorTabs.tsx | MODERATE | MEDIUM: No keyboard navigation for tab switching (arrow keys) |

### Chat Components

| Component | Rating | Key Issue |
|-----------|--------|-----------|
| ChatPanel.tsx | GOOD | MEDIUM: Line 71-73 — installed skills always set to empty array (stub) |
| ChatInput.tsx | MODERATE | HIGH: Hardcoded prompt for "/interview" (line 77-92), special case belongs in data layer |
| MessageBubble.tsx | GOOD | LOW: Missing React.memo — rerenders on every new message |

### Other Components

| Component | Rating | Key Issue |
|-----------|--------|-----------|
| KanbanBoard.tsx | GOOD | MEDIUM: Column IDs are strings, TypeScript should enforce literal union |
| SearchPanel.tsx | GOOD (Best) | LOW: Monaco lookup via global `window.monaco` is fragile |
| FileExplorer.tsx | MODERATE | HIGH: Missing try-catch on file operations; `prompt()` return null not checked |

---

## 3. React Anti-Patterns

### HIGH Severity

1. **Missing useCallback Dependencies** — `useKeybindings.ts` (lines 222-239): `keybindings` array is rebuilt every render, creating new listener each time → memory leak
2. **No Error Boundary for Monaco** — MonacoEditor.tsx: Monaco init can throw; unrecoverable crash
3. **Stale Closures Risk** — IDELayout.tsx (lines 52-61): Empty deps on keydown handler; works now via `.getState()` but pattern is fragile

### MEDIUM Severity

4. **useEffect Dependency Issues** — useFileTree.ts (lines 61-72): `loadTree` changes every render, causing file tree to reload on unrelated state changes
5. **Key Prop Misuse** — SearchPanel.tsx (line 450): Uses array index `i` in key; violates React best practice
6. **Error Cast Loses Stack** — useFileTree.ts (line 52): `setError(e as string)` loses Error stack trace

---

## 4. Accessibility (a11y) Gaps

### Strengths
- Activity bar uses `role="toolbar"` and `aria-label`
- Button aria-labels on window controls
- Status bar has `role="status"`

### Critical Gaps

| Severity | Finding | Impact |
|----------|---------|--------|
| HIGH | No keyboard navigation for file explorer, search results, or chat messages | Screen reader users cannot navigate |
| HIGH | SlashAutocomplete has no `role="listbox"`, items no `role="option"` | Invisible to assistive tech |
| HIGH | Command palette doesn't trap focus; no focus restoration after closing modals | Tab navigation escapes dialogs |
| MEDIUM | SearchPanel file result groups have `role="button"` but no `aria-expanded` | State not communicated |

---

## 5. CSS & Styling

| Severity | Finding |
|----------|---------|
| MEDIUM | ~200+ inline styles (`style={{ backgroundColor: "var(...)" }}`) bypass Tailwind; should use `bg-[var(...)]` |
| LOW | `.dark` class defined but components use CSS vars directly; theme variables may be incomplete |
| LOW | No responsive breakpoints (acceptable for desktop-only app) |

---

## 6. Architectural Debt & Rapid Development Signs

### Hardcoded Values
- Chat panel hardcoded `/btw` command (ChatInput.tsx line 98-104)
- Interview prompt template (ChatInput.tsx line 80-85)
- Default preview URL (BrowserPreview.tsx line 43)

### Stubs & Placeholders
- Skills always empty array (ChatPanel.tsx line 71)
- Error count hardcoded to "0" (StatusBar.tsx line 124)
- Permission system is skeleton (PermissionDialog.tsx)

### Incomplete Features
- Vim mode: hidden div ref but unclear if actual keybindings work
- Browser preview: basic, can't handle CORS/auth
- Verification dashboard: referenced but incomplete

---

## Summary Table

| Category | Severity | Count | Impact |
|----------|----------|-------|--------|
| Mock layer gaps (no error states) | CRITICAL | 1 | Browser preview crashes on failures |
| Missing error boundaries | HIGH | 3 | Silent crashes |
| Dependency array issues | HIGH | 2 | Memory leaks / stale closures |
| Accessibility violations | HIGH | 4 | Screen reader unusable |
| Hardcoded values (debt) | MEDIUM | 5+ | Unmaintainable |
| State management coupling | MEDIUM | 2 | Hard to test |
| Missing loading states | MEDIUM | 3+ | UX degradation |
| Inline styles | MEDIUM | 200+ | Maintainability |
| Performance: no memoization | LOW-MEDIUM | 5+ | Jank on large lists |

---

## Recommendations (Priority Order)

### Phase 1: Stability
1. Add error state mocks to `tauriMock.ts`
2. Wrap MonacoEditor, SearchPanel, FileExplorer in error boundaries
3. Fix keybindings dependency array
4. Fix tab context menu key prop

### Phase 2: Accessibility
1. Add keyboard navigation to file explorer, search results, chat
2. Add ARIA roles to SlashAutocomplete and SearchPanel lists
3. Implement focus trapping in command palette
4. Validate color contrast ratios

### Phase 3: Debt Reduction
1. Consolidate hardcoded values into config
2. Remove inline styles; migrate to Tailwind classes
3. Extract special-case logic to data layer
4. Add memoization to message bubbles and agent cards

### Phase 4: Advanced
1. Implement retry logic for transient Tauri failures
2. Add centralized error logging/reporting
3. Complete mutable file tree mocking
