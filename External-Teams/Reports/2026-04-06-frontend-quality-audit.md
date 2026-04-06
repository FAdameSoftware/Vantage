# Vantage Frontend Quality Audit

**Date:** 2026-04-06  
**Scope:** React 19 + TypeScript frontend (`src/`)  
**Methodology:** Static analysis of 108 components, 18 hooks, ~61,500 lines  
**Overall Grade:** B-

---

## Executive Summary

The design system foundation is strong — three complete themes (Catppuccin Mocha/Latte/High Contrast), OKLCH color tokens, professional typography (Geist + JetBrains Mono), cohesive motion design (unified 150ms/cubic-bezier easing), and a consistent Lucide icon system. The implementation layer, however, has significant gaps in performance, accessibility, error handling, and component architecture that will become increasingly painful as the codebase grows.

---

## Critical Shortcomings

### 1. Monolithic Components

Eight files exceed 600 lines. None use `React.memo`, so every state change re-renders the entire monolith.

| File | Lines | Core Issue |
|------|-------|------------|
| `components/layout/StatusBar.tsx` | 1,136 | Handles git, usage, vim, buddy, settings — should be 6-8 components |
| `components/shared/CommandPalette.tsx` | 1,070 | Combines command defs, file tree flattening, search, keyboard, rendering |
| `hooks/useClaude.ts` | 935 | Single hook for ALL Claude interaction — streams, agents, permissions, connection |
| `components/chat/ChatPanel.tsx` | 890 | Session mgmt, messages, input, timeline, execution map, feature toggles |
| `components/layout/MenuBar.tsx` | 828 | Menu definitions + submenus + keyboard handlers |
| `components/search/SearchPanel.tsx` | 761 | Search, file tree, results, recent searches, replace mode |
| `components/chat/ToolCallCard.tsx` | 717 | Tool rendering for 26+ tool types |
| `components/editor/EditorTabs.tsx` | 684 | DnD + tabs + unsaved dialogs + split groups |

### 2. No List Virtualization

- **SearchPanel.tsx** renders up to 1,000 results without virtualization (`maxResults: 1000`, line 188)
- **FileExplorer.tsx** renders the full file tree recursively — thousands of nodes on large projects
- Chat message history is fully rendered with no windowing
- Expect visible jank on any non-trivial project

### 3. Missing React.memo & Inline Object Churn

Only **4 of 108** components use `React.memo` (`AgentCard`, `ExecutionMapNode`, `MessageBubble`, `CommandSuggestion`).

**1,260 inline `style={{}}` objects** create new references every render, defeating shallow comparison even if `memo` were added. High-frequency store updates (cursor position, streaming tokens) cascade unnecessarily through the tree.

### 4. Error Handling is Console-Only

| Location | Behavior |
|----------|----------|
| `SearchPanel.tsx` line 198 | Search failures → `console.error`, no UI feedback |
| `FileExplorer.tsx` lines 264, 288 | File open failures → silently logged |
| `SearchPanel.tsx` lines 336-338 | Replace failures → `console.error` only |
| `ErrorBoundary.tsx` | Generic "Something went wrong" — no categorization, recovery guidance, or backend logging |

There is no global toast/notification system for surfacing errors to users.

### 5. Accessibility Gaps

Strong foundation (171+ aria attributes, axe-core e2e tests, `prefers-reduced-motion` respected), but key interactive elements are incomplete:

| Location | Issue |
|----------|-------|
| `SearchPanel.tsx` lines 358-364 | Toggle buttons (Case, Regex, Filter) have `title` but no `aria-label` |
| `PanelArea.tsx` lines 70-94 | Terminal/Browser/Verification tabs lack `aria-label` |
| `SettingsPanel.tsx` lines 50-75 | Settings tabs use `title` only |
| `MessageBubble.tsx` lines 358-379 | "Thought process" toggle missing `aria-expanded` |
| `SearchPanel.tsx` lines 670-678 | File tree expansion toggles missing `aria-expanded` |
| `FileExplorer.tsx` lines 670-737 | Tree nodes lack arrow key navigation (up/down/left/right, Home/End) |
| `KanbanBoard.tsx` lines 47-93 | Droppable areas have no `aria-label` |

---

## Medium Shortcomings

### 6. Inconsistent UI Patterns

The same concept is implemented differently across the app:

- **Toggle buttons**: 3+ implementations — `SearchPanel` custom component, `PanelArea` plain button, `SettingsPanel` conditional styling. No shared `<ToggleButton>`.
- **Dropdowns**: `MenuBar` custom dropdown vs `SearchPanel` inline dropdown vs `MentionAutocomplete` separate impl. No shared `<Dropdown>`.
- **Inline dialogs**: `EditorTabs` and `FileExplorer` each implement their own prompt/confirm dialog.
- **Disabled states**: Some use `opacity-50`, others `opacity-30`. None use semantic color tokens.
- **Empty states**: `FileExplorer` has a proper empty state (icon + text + action). `SearchPanel` shows nothing on zero results. `SlashAutocomplete` returns null.

### 7. Form UX Deficiencies

- **SearchPanel**: No regex syntax validation — invalid regex fails silently. No replace preview before "Replace All". Glob filter has no validation or help text.
- **FileExplorer**: Inline rename doesn't auto-select filename. No validation for invalid path characters. Accepts on blur — easy accidental confirms.
- **SettingsPanel**: No unsaved-changes warning when switching tabs. No feedback that auto-save occurred. No form validation.
- **ChatInput**: `maxLength=100000` with no UI feedback approaching limit. Image paste errors show tiny, easily-missed text.

### 8. State Management Race Conditions

- `conversation.ts` lines 419-427: `content_block_delta` handler has defensive check for out-of-order events but only `console.warn`s with no recovery.
- No optimistic updates: search-replace waits for server, file creation waits for confirmation, message send doesn't appear immediately.
- `useProjectUsage` hook is disabled in `App.tsx` ("causes hooks crash") — unresolved blocker.

### 9. Inline Styles as Architectural Limitation

28% of all styling is inline (1,260 `style={{}}` vs 1,750 `className` instances). The Catppuccin CSS variable theme (`var(--color-*)`) can't be expressed in Tailwind utility classes, forcing this pattern. Consequences:

- Performance overhead (new object references every render)
- Harder to search/audit styling
- Mixing concerns in JSX

A Tailwind plugin mapping `--color-*` variables to utilities (e.g., `bg-surface-0`, `text-subtext-1`) would eliminate most inline styles.

### 10. Hardcoded Dimensions

- `ChatInput.tsx` line 472: `maxHeight: "240px"` — breaks on small/large screens
- Icon sizes hardcoded throughout (`size={12}`, `size={14}`, `size={22}`) with no display-density scaling
- `SettingsPanel.tsx` tab bar uses `scrollbar-hide` — tabs may be inaccessible on overflow
- Text truncation (`SearchPanel` line 444, `FileExplorer` lines 502-505) without hover tooltips

---

## Minor Issues

- **DevPanel** and **CheckpointControls** use hardcoded hex colors instead of CSS variables
- **3 `any` types** in Recharts formatters (analytics charts) — should be `number`
- **6 `as any` casts** in `bindings.ts` and `tauriMock.ts` — justified but could use `unknown`
- No Storybook or component documentation system
- `useCallback` in `ChatInput.tsx` line 292 has empty dependency array but references `text` and `showSlash` — potential stale closure

---

## Design System Strengths (for reference)

These areas are well-executed and should be preserved:

- **Color system**: 40+ OKLCH-based CSS tokens, three complete themes including WCAG AAA high-contrast
- **Typography**: Geist (UI) + JetBrains Mono (code) with defined scale (`--text-xs` through `--text-lg`)
- **Motion**: Unified 150ms duration, consistent `cubic-bezier(0.4, 0, 0.2, 1)` easing, `prefers-reduced-motion` support
- **Icons**: Single source (Lucide), consistent sizing hierarchy, semantic coloring
- **Theme customization**: User overrides via `~/.vantage/theme.json`
- **Layout**: react-resizable-panels with persistent state, no rigid fixed widths

---

## Prioritized Remediation Plan

### Week 1 — Safety & Correctness
1. Add missing `aria-label` and `aria-expanded` attributes across all toggle/tab/disclosure elements
2. Implement a global toast/notification system for error surfacing (replace `console.error`-only patterns)
3. Fix `useCallback` dependency arrays (`ChatInput` stale closures)

### Week 2 — Performance
4. Add virtualization to SearchPanel results and FileExplorer tree (`@tanstack/react-virtual` or `react-window`)
5. Create Tailwind plugin for CSS variable utilities — eliminate inline style objects
6. Add `React.memo` to StatusBar, CommandPalette, ChatPanel, MenuBar; use `useShallow()` for store selectors

### Week 3 — Architecture
7. Split StatusBar into child components (UsageWidget, GitInfoWidget, VimModeWidget, BuddyWidget, etc.)
8. Split `useClaude.ts` into `useClaudeStream`, `useAgentRouting`, `useClaudePermissions`, `useClaudeConnection`
9. Extract shared `<ToggleButton>`, `<PromptDialog>`, `<PanelWrapper>` components

### Week 4 — Polish
10. Add form validation (regex syntax, filenames, settings)
11. Add empty states to SearchPanel and SlashAutocomplete
12. Investigate and fix the `useProjectUsage` hooks crash
13. Add replace preview modal to SearchPanel
14. Add tooltips to all truncated text

---

*Report generated by automated static analysis of 108 component files, 18 custom hooks, and 61,542 lines of frontend code.*
