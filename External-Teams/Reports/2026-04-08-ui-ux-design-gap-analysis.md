# Vantage UI/UX Design Gap Analysis

**Date**: 2026-04-08
**Auditor**: Claude Opus 4.6 (automated visual + code audit)
**Method**: Live browser inspection (Chrome DevTools MCP + a11y tree) against Vite dev server (mock mode) + source code analysis
**Scope**: Full UI surface — both view modes, all panels, menus, status bar, settings, command palette
**Screenshots**: `audit-screenshots/audit-01` through `audit-15`
**Diff from prior audit**: Compared against `2026-04-08-comprehensive-ui-ux-audit.md` to identify what was fixed, what persists, and what's new

---

## Executive Summary

Since the last audit, Vantage underwent a significant UX restructure: modes renamed from "Claude/IDE" to "Command Center/Co-pilot/Tour", the activity bar was unified across modes (fixing the #1 P1 from the prior audit), and a rich session metrics sidebar was added to Command Center mode. Several prior recommendations were implemented — plan usage indicator now has a label, settings tab truncation was fixed, and Claude/Terminal commands were added to the command palette.

However, the restructure introduced **new contradictions and design gaps** that undermine the improved architecture. The most critical are a **model selector contradiction** (different parts of the UI show different models), **missing model selector in Command Center mode** (the primary chat experience), and **editor-specific status bar items showing when no editor is visible**. There are also information architecture problems — duplicate cost displays, inconsistent header labels, and a permanently disabled "Tour" tab.

**Severity Legend**: P0 = blocking/confusing, P1 = high-impact UX issue, P2 = medium, P3 = minor polish

---

## 1. Prior Audit Items: Status

### Fixed (7 items)
| Prior # | Issue | Status |
|---------|-------|--------|
| 8 | Activity bar icons change completely between modes | **Fixed** — Unified 7-icon bar in both modes |
| 9 | No Source Control or Search in Claude mode | **Fixed** — All panels available in both modes |
| 19 | No Claude commands in command palette | **Fixed** — 9 Claude commands added (New Chat, Resume, Compact, Plan Mode, 5 thinking modes) |
| 18 | Terminal category had only 1 command | **Fixed** — 4 Terminal commands now (New, Clear, Split, Kill) |
| 26 | Settings tab "CLAU..." truncated | **Fixed** — Now shows "CLAUDE" |
| 33 | "46%" indicator is cryptic | **Fixed** — Now shows "Plan: 46%" with gauge icon and mini progress bar |
| 1 | "All prerequisites are met" is passive | **Fixed** — Now "All systems ready — let's build something." |

### Partially Fixed (2 items)
| Prior # | Issue | Status |
|---------|-------|--------|
| 7 | Claude/IDE toggle position conflicts with menu bar | **Partially fixed** — Renamed to "Command Center/Co-pilot/Tour" with pill-style segment control, but still sits in the same position between menus and title |
| 11 | Naming inconsistency "Claude" vs "Chat" | **Partially fixed** — Mode is now "Command Center" but chat header still says "CHAT" in both modes (see issue #3 below) |

### Not Fixed (8 items)
| Prior # | Issue | Status |
|---------|-------|--------|
| 4 | Terminal menu items lack keyboard shortcuts | **Not fixed** — Still no shortcuts for New/Split/Clear/Kill |
| 5 | Help menu is sparse (3 items) | **Not fixed** — Still only Keyboard Shortcuts, Documentation, About Vantage |
| 6 | Go menu has few items, should merge | **Not fixed** — Go menu still exists |
| 22 | Usage panel overflows sidebar | **Not fixed** — `max-w-5xl mx-auto p-6` still causes overflow in narrow sidebar |
| 30-31 | Terminal broken in browser mode (PTY not mocked) | **Not fixed** — Still shows "Process exited with code null" |
| 35 | Inkwell turtle takes status bar space | **Not fixed** — Still "turtle zzz..." in status bar |
| 38 | High Contrast theme similar to Light | **Not verified** — Would need theme switch test |
| 12 | Breadcrumb `__vantage:` prefix | **Still present** in Co-pilot mode breadcrumbs |

---

## 2. New Issues Introduced by Restructure

### P0 — Blocking / Confusing

#### 2.1 Model Selector Contradiction
**Files**: `ChatHeader.tsx:24-48`, `StatusBar` component
**Observed**: In Co-pilot mode, the chat header model selector defaults to "Sonnet 4.6" (from `useSettingsStore.selectedModel`), while the status bar simultaneously shows "opus-4-6" (from `conversation.session.model` or a separate default).

**Impact**: Users cannot determine which model will actually be used for their next message. The selector and status bar show different models — a direct contradiction in the UI.

**Root cause**: Model selection lives in `useSettingsStore.selectedModel` (user preference), but the status bar reads from a different source. These stores are not synchronized.

**Recommendation**: Single source of truth for model selection. Status bar model indicator should always reflect `useSettingsStore.selectedModel` when no session is active, and `session.model` when connected. They should never show different values simultaneously.

#### 2.2 No Model Selector in Command Center Mode
**File**: `ChatHeader.tsx:180`
**Code**: `{mode === "sidebar" && <ModelSelector />}`

The `ModelSelector` component only renders in "sidebar" mode (Co-pilot). In Command Center mode (`mode === "full"`), there is no model selector anywhere in the chat UI.

**Impact**: The primary chat experience — the mode users are directed to first — provides no way to choose which Claude model to use. Users must switch to Co-pilot mode or use the command palette to change models. This is a critical feature gap in the primary interface.

**Recommendation**: Show the `ModelSelector` in both modes. In full/Command Center mode, place it in the chat header or near the thinking mode selector.

---

### P1 — High Impact

#### 2.3 "CHAT" Header Label in Command Center Mode
**File**: `ChatHeader.tsx:156-158`

The chat header displays "CHAT" as its label in both Command Center and Co-pilot modes. In Command Center mode, where chat IS the primary experience, labeling it "CHAT" is redundant — like labeling a web browser window "BROWSER". In Co-pilot mode it makes sense as a sidebar label.

**Recommendation**: Remove the "CHAT" label in Command Center mode, or replace with a dynamic label showing session status (e.g., "Session: abc123" or the project name).

#### 2.4 Status Bar Shows Editor Items When No Editor is Visible
**Observed**: In Command Center mode, the status bar displays: `Ln 1, Col 1 | LF | UTF-8 | Spaces: 2 | Wrap: Off | Plain Text`

These are all editor-specific indicators, but Command Center mode has no visible editor panel. They report on a phantom editor state.

**Impact**: Wastes status bar real estate and confuses users with irrelevant information. In Command Center mode, the status bar should prioritize Claude/session metrics.

**Recommendation**: Conditionally hide editor-specific status bar items when no editor tab is active or visible. Show them only in Co-pilot mode when an editor tab is focused. Use the reclaimed space for session-relevant info.

#### 2.5 "disconnected" Status in Session Metrics is Nearly Invisible
**Observed**: The session metrics sidebar shows "disconnected" as small gray text below the metrics grid.

**Impact**: Connection status is critical information — it tells users whether their messages will be delivered. A small, low-contrast text label fails to communicate urgency.

**Recommendation**: Use a colored status badge: green dot + "Connected", red dot + "Disconnected", yellow dot + "Connecting". Place it prominently near the top of the metrics panel.

#### 2.6 Duplicate Cost Display
**Observed**: Session cost "$0.0000" appears in both:
1. Session metrics sidebar → "Cost" row
2. Status bar → "$0.0000" button

**Impact**: Redundant information consumes space in two locations. Worse, if they ever diverge (e.g., status bar updates faster than metrics), it creates another contradiction.

**Recommendation**: Keep cost in session metrics sidebar (Command Center mode) or status bar (Co-pilot mode), not both. The status bar cost indicator should be hidden when the session metrics sidebar is visible, or vice versa.

---

### P2 — Medium Impact

#### 2.7 Permanently Disabled "Tour" Tab
**File**: `TitleBar.tsx:209`
**Code**: `{ mode: "tour", label: "Tour", icon: <Compass size={12} />, shortcut: "", disabled: true }`

A permanently disabled tab in the title bar wastes prime real estate and sets an expectation for a feature that may never ship. It's the equivalent of a "Coming Soon" sign on a storefront — acceptable temporarily but irritating if it persists.

**Recommendation**: Remove the Tour tab until the feature is ready. Add it back when it's functional. Alternatively, if Tour is important for product positioning, add it to the Help menu as "Take a Tour (coming soon)" where it won't occupy title bar space.

#### 2.8 Activity Bar Overlay Drawer Lacks Visual Affordance
**File**: `layout.ts:126-133`

In Command Center mode, clicking activity bar icons opens an "overlay drawer" (the sidebar content slides over the chat area). But there's no visual indicator that these panels are available — the activity bar icons appear inactive (no pressed state, no indicator dot). First-time users won't discover Explorer, Search, or Source Control in Command Center mode.

**Recommendation**: Add subtle indicator dots or a collapsed sidebar strip that hints at available panels. When an overlay drawer is open, show a translucent backdrop or a clear close button.

#### 2.9 Terminal Menu Items Still Lack Keyboard Shortcuts
**Observed**: Terminal menu shows 4 items (New Terminal, Split Terminal, Clear Terminal, Kill Terminal) — none have keyboard shortcut labels.

**Recommendation**: Add standard shortcuts:
- New Terminal: `Ctrl+Shift+`` ` (already exists in the toolbar button tooltip)
- Split Terminal: `Ctrl+Shift+5` (VS Code convention)
- Clear Terminal: `Ctrl+L` (shell convention)
- Kill Terminal: no standard, but could use `Ctrl+Shift+Delete`

#### 2.10 Usage Dashboard Still Overflows in Sidebar
**File**: `UsageDashboard.tsx:176`
**Code**: `<div className="max-w-5xl mx-auto p-6 space-y-6">`

The `max-w-5xl` (1024px) constraint combined with `p-6` (24px) padding is designed for a full-width panel, not a 240px sidebar. The stat cards, headers, and chart containers overflow.

**Recommendation**: Make the dashboard responsive to container width, not viewport width. Use container queries or detect the parent width. In sidebar mode, use `p-3`, single-column stat cards, and smaller chart heights.

#### 2.11 Hardcoded Color in UsageDashboard
**File**: `UsageDashboard.tsx:207`
**Code**: `color: range === value ? "#ffffff" : "var(--color-subtext-0)"`

The active date range button uses hardcoded `#ffffff` instead of a theme variable. This will be wrong in light/high-contrast themes where white text on a blue background may have insufficient contrast.

**Recommendation**: Replace `#ffffff` with `"var(--color-base)"` or `"var(--color-crust)"` for proper theme adaptation.

#### 2.12 Model Name Format Inconsistency
**Observed**: The same "model" concept is represented three different ways:
1. Chat header selector: "Sonnet 4.6" (display label)
2. Status bar: "opus-4-6" (raw model ID)
3. Session metrics: "--" (placeholder when disconnected)

**Recommendation**: Use the display label format ("Opus 4.6", "Sonnet 4.6") everywhere. The raw model ID should never be shown to users.

#### 2.13 Help Menu Still Sparse
**Observed**: Help menu has only 3 items: Keyboard Shortcuts, Documentation, About Vantage.

**Recommendation**: Add at minimum:
- "Report an Issue" → opens GitHub issues
- "What's New" → shows changelog/release notes
- "Getting Started" → links to onboarding content
- "Join Community" → Discord/forum link

#### 2.14 No Visible Session Indicator Before First Message
**Observed**: In Command Center mode, there's no indication of whether a session is active, pending, or needs to start. The "Start a conversation with Claude Code" empty state doesn't show whether prerequisites are met or if the CLI is available.

**Recommendation**: Add a subtle status line below the chat header showing: "Claude CLI ready" (green) or "Claude CLI not found" (red). This helps users understand if their messages will actually work.

---

### P3 — Polish

#### 2.15 Command Palette Claude Commands Lack Shortcuts
**File**: `commandRegistry.ts:611-687`

The 9 Claude commands (New Chat, Resume Session, Compact, Plan Mode, Thinking modes) have no keyboard shortcuts assigned. These are high-frequency actions for the primary workflow.

**Recommendation**: Add shortcuts for the most common:
- New Chat: `Ctrl+Shift+N`
- Resume Session: `Ctrl+Shift+R`
- Toggle Plan Mode: `Ctrl+Shift+M`
- Compact: no shortcut needed (low frequency)

#### 2.16 Breadcrumb `__vantage:` Prefix Still Shows
**File**: `EditorArea.tsx` breadcrumb rendering

In Co-pilot mode, the Welcome tab breadcrumb displays `__vantage: > welcome`. The `__vantage:` prefix is an internal virtual path that leaks into the UI.

**Recommendation**: Strip the `__vantage:` prefix from breadcrumb display. Show only the meaningful segment (e.g., just "Welcome").

#### 2.17 Go Menu Should Be Merged
**Observed**: The Go menu contains ~4 items (Go to Line, Go to Symbol, etc.). This doesn't justify a top-level menu.

**Recommendation**: Merge Go items into Edit or View menu. This follows the trend of modern editors (Zed merged its Go menu).

#### 2.18 Inkwell Turtle Status Bar Placement
**Observed**: "turtle zzz..." occupies ~60px in the left half of the status bar, which is prime real estate for actionable information.

**Recommendation**: Move Inkwell to the far right of the status bar, or make it hover-only. Show a small turtle icon instead of "turtle zzz..." text.

---

## 3. Architectural Contradictions

### 3.1 Dual-Mode Layout Philosophy
The Command Center / Co-pilot distinction replaces the previous Claude / IDE split, but the fundamental question remains unresolved: **are these modes different enough to justify separate layouts?**

**Current state**:
- Command Center: Chat full-width + session metrics sidebar + overlay drawers for IDE panels
- Co-pilot: Explorer sidebar + Editor + Chat sidebar + bottom panel

**The problem**: Users must choose between "AI-first with limited IDE access" or "IDE-first with limited AI visibility." There's no gradual spectrum — it's binary. A user who wants a wide chat area AND a visible file explorer must constantly toggle overlay drawers.

**Recommendation**: Consider a **continuous layout spectrum** instead of discrete modes:
- Single layout with resizable panels
- Chat panel can be left sidebar, right sidebar, or full center
- Users drag to resize, and the layout adapts
- Save layout presets (replacing discrete modes)

This is more complex to implement but eliminates the "two apps in one" problem that the previous audit identified and that this restructure partially addresses but doesn't solve.

### 3.2 Session Metrics Asymmetry
The rich session metrics sidebar (Plan %, Weekly %, Cost, Tokens, Model, Duration, Turns, Checkpoints, Activity Feed) only appears in Command Center mode. In Co-pilot mode, this information is scattered across:
- Status bar: Cost, Plan %, Model
- No access to: Checkpoint timeline, Activity feed, Weekly %, Token counts, Duration, Turns

**Impact**: Users who prefer Co-pilot mode (IDE-first) lose access to critical session observability. They can't see their checkpoint timeline or activity feed at all.

**Recommendation**: Make the session metrics available as a collapsible panel in Co-pilot mode, either as a secondary sidebar section or a slide-out panel triggered from the status bar.

### 3.3 Chat Header Feature Parity Gap
| Feature | Command Center | Co-pilot |
|---------|---------------|----------|
| Model selector | Missing | Present |
| Plan mode toggle | Present | Present |
| Search | Present | Present |
| Execution map | Present | Present |
| Build & Review | Present | Present |
| Compact | Present | Present |
| Sessions | Present | Present |
| New Session (+) | Present | Present |
| Export menu | Present | Present |

The model selector — one of the most important configuration options — is absent in the mode where users spend the most time interacting with Claude. This is a parity gap that breaks the mental model.

### 3.4 Store Fragmentation for Model State
Model-related state is spread across multiple stores:

| Store | Field | Used By |
|-------|-------|---------|
| `useSettingsStore` | `selectedModel` | Chat header ModelSelector dropdown |
| `conversation.session` | `model` | Session info badge, status bar model display |
| Status bar | computed | Reads from session or falls back to a default |

When no session is active, the ModelSelector shows `selectedModel` from settings, but the status bar shows a different default. When a session IS active, the session model may differ from the selected model (if the user changed the selector mid-session).

**Recommendation**: Consolidate model state:
1. `selectedModel` in settings = what the user WANTS for the next session
2. `session.model` = what the active session is ACTUALLY using
3. UI should clearly distinguish "next session model" vs "current session model"
4. Status bar should show `session.model` when connected, `selectedModel` when disconnected

---

## 4. Accessibility Findings

### 4.1 Good Practices (Retain)
- Activity bar buttons have `aria-label` and `aria-pressed` attributes
- Window controls have `aria-label` (Minimize, Maximize, Close)
- Menu bar uses `role="menubar"` with proper `menuitem` roles
- View mode toggle uses `role="tablist"` with `aria-selected`
- Status bar uses `role="status"` with `aria-live="polite"`
- All icon-only buttons have `title` or `aria-label`
- Notifications region has `aria-live="polite"`

### 4.2 Issues
| # | Severity | Issue |
|---|----------|-------|
| A1 | P2 | **UTF-8 in status bar is not a button** — it's a `StaticText` node with no `role` or `aria-label`. Every other status bar item is a clickable button. UTF-8 should be a button (click to change encoding) or labeled as static info |
| A2 | P2 | **Disabled Tour tab has no `aria-disabled`** — it uses `disabled` attribute on a button, but the tab role should use `aria-disabled="true"` for screen readers |
| A3 | P2 | **Model selector in chat header uses native `<select>`** — which doesn't respect the Catppuccin theme styling. The dropdown options appear in system-default styling (white background, black text) |
| A4 | P3 | **Command palette search input has no `aria-label`** — it only has placeholder text "Search for a command to run..." |
| A5 | P3 | **Session metrics sections** (SESSION METRICS, CHECKPOINT TIMELINE, ACTIVITY FEED) are buttons but lack `aria-expanded` attribute to indicate collapsible state |

---

## 5. Information Architecture Recommendations

### 5.1 Status Bar Redesign for Dual-Mode
The status bar should adapt to the active view mode:

**Command Center mode** (chat-first):
```
Left:  [0 errors] [0 warnings] [Plan: 46%▕] [Weekly: 19%]
Right: [Ready/Streaming] [$0.0045] [Opus 4.6] [Effort: High]
```

**Co-pilot mode** (editor-first):
```
Left:  [0 errors] [0 warnings] [main ↑2] [Plan: 46%▕]
Right: [Ln 5, Col 12] [LF] [UTF-8] [Spaces: 2] [TypeScript] [Ready] [$0.00] [Opus 4.6]
```

Key changes: Remove editor items from Command Center, add git branch to Co-pilot, show Weekly usage in Command Center, remove Inkwell from default.

### 5.2 Session Lifecycle Visibility
Users currently have no clear feedback on the session lifecycle:
1. **No session** → Empty state (current: good)
2. **Starting** → No indicator (gap)
3. **Connected** → "Ready" in status bar (buried)
4. **Streaming** → Typing dots (good)
5. **Error** → No visible indicator (gap)
6. **Disconnected** → Small gray "disconnected" text (insufficient)

**Recommendation**: Add a session status badge near the chat input:
- Pulsing green dot: "Connected"
- Spinning: "Starting session..."
- Red dot: "Disconnected — click to reconnect"
- Yellow: "Waiting for permission"

### 5.3 Reduce Cognitive Load of Header Toolbar
The chat header toolbar has 7-9 icon buttons in a row. Without labels or grouping, users must memorize icon meanings:

```
Current: [Plan toggle] [Model] | [Pin] [Search] [Map] [Export] | [Build&Review] [Compact] [Sessions] [New+]
```

**Recommendation**:
- Group into max 2 groups: "Session" and "View"
- Add text labels to the 3 most-used buttons (Search, Compact, Sessions)
- Move less-used buttons (Export, Execution Map) into a "..." overflow menu
- Result: `[Plan] [Model] | [Search] [Sessions] | [...]`

---

## 6. Code-Level UX Issues (from source analysis)

These issues were identified by deep source code analysis and are not visible from screenshots alone.

### 6.1 Permission Dialog Auto-Approval is Invisible (Security)
**File**: `PermissionDialog.tsx:344-346, 388`

When a tool is already allowed for the session, the permission dialog auto-approves WITHOUT showing the user any notification. The check at line 388 (`!isToolAllowedForSession(pendingPermission?.toolName)`) silently bypasses the dialog.

**Impact**: Users who clicked "Allow for Session" once have no visibility into subsequent auto-approved actions. A tool could execute dangerous commands (e.g., `git push --force`) without any visual indicator.

**Recommendation**: Show a brief toast notification for auto-approved permissions: "Auto-approved: [tool name] (allowed for session)".

### 6.2 Z-Index Chaos — No Centralized Scale
**Files**: Multiple layout components

Z-index values are scattered across the codebase with no hierarchy:
- `z-[10001]` — Submenus (MenuBar.tsx:39)
- `z-[10000]` — Main dropdowns (MenuBar.tsx:173)
- `z-[9999]` — Save dialog (TitleBar.tsx:127)
- `z-[100]` — Notification panel (NotificationCenter.tsx:169)
- `z-20, z-30, z-31` — Overlay drawer (OverlayDrawer.tsx)

**Impact**: Menus at z-10001 can overlay above save dialogs at z-9999. Notification center at z-100 may be hidden behind higher-z elements. Future additions will create layering bugs.

**Recommendation**: Create a centralized `Z_INDEX` constant map: `base: 0, overlay: 100, dropdown: 200, dialog: 300, notification: 400, menu: 500`.

### 6.3 Message Action Buttons Placed Inconsistently
**File**: `MessageBubble.tsx:135-162, 282-328`

User message action buttons (Edit, Pin) appear on the LEFT side on hover. Assistant message action buttons (Pin, Copy, Regenerate) appear on the RIGHT side. This breaks positional consistency — users must look in different places depending on who sent the message.

**Recommendation**: Place all message action buttons on the same side (right) for both user and assistant messages, matching the convention in Slack, Discord, and ChatGPT.

### 6.4 Tool Call Expand/Collapse State Conflict
**File**: `MessageBubble.tsx:485-529`

"Expand All" sets `forceExpanded=true`, but individual tool call cards can still be collapsed by clicking them. The per-card state and the global force-expanded state conflict — clicking "Expand All" then collapsing one card creates an inconsistent state where some are expanded and some aren't, but the "Expand All" button still appears active.

**Recommendation**: "Expand All" should set all individual card states to expanded, not use a separate force flag. Or: rename to "Reset All to Expanded" and toggle the force flag off when any card is manually collapsed.

### 6.5 11 Font Sizes with No Design System Scale
**Files**: Across all components

Font sizes used: 9px, 10px, 10.5px, 11px, 12px, 13px, 14px, 16px, and more. There's no standardized typographic scale.

**Recommendation**: Limit to 5-6 sizes: `xs: 10px, sm: 11px, base: 13px, md: 14px, lg: 16px, xl: 20px`. Create Tailwind custom utilities or CSS variables.

### 6.6 Responsive Breakpoints Hardcoded Inconsistently
**Files**: `StatusBar.tsx:98`, `EditorInfo.tsx:312-340`, `GitInfo.tsx:290`, `PlanUsageIndicator.tsx:286`

Four different hardcoded breakpoints:
- Plan usage hidden below 900px
- Editor info items hidden below 800px
- Index status hidden below 1200px
- Git diff stats hidden below 1200px

**Impact**: Important information disappears at arbitrary widths with no fallback presentation.

**Recommendation**: Create centralized `BREAKPOINTS` constant. Use a responsive priority system — hide lowest-priority items first as width decreases.

### 6.7 Copy Actions Fail Silently
**Files**: `MessageBubble.tsx:234`, `CodeBlock.tsx:128`, `EditorTabs.tsx:537-568`

All clipboard operations catch errors but provide no visual feedback on failure. The `navigator.clipboard.writeText()` can fail (e.g., in non-secure contexts), and users see only the check icon disappearing after 2 seconds — identical to a successful copy.

**Recommendation**: Add toast notifications for both success and failure. On failure: "Failed to copy — try selecting and using Ctrl+C".

### 6.8 Keybinding Conflicts Not Detected
**File**: `KeybindingsEditor.tsx:49-107`

When recording a new keybinding, there's no check for conflicts with existing bindings. Users can accidentally rebind Ctrl+S (Save) to a different action, breaking core functionality.

**Recommendation**: Show a live list of conflicting keybindings during recording. If a conflict exists, show: "This shortcut is already used by [action]. Replace?"

### 6.9 Tab Context Menu Can Appear Off-Screen
**File**: `EditorTabs.tsx:180-322`

Context menu position is set to `e.clientX, e.clientY` with no bounds checking. On small windows or when right-clicking near the edge, the menu appears partially or fully off-screen.

**Recommendation**: Add viewport boundary detection. If the menu would overflow right/bottom, flip its anchor point.

### 6.10 Chat Input History Not Session-Scoped
**File**: `ChatInput.tsx:53-55, 132-140`

`historyRef` accumulates up to 100 messages but doesn't differentiate between sessions. Switching sessions shows arrow-up history from the previous session, which is confusing.

**Recommendation**: Clear input history when starting a new session, or scope history by session ID.

### 6.11 Focus Not Restored After Dialog Close
**File**: `EditorTabs.tsx:77-82, 519`

After the unsaved changes dialog closes (line 519 clears dialog state), focus is not returned to the previously focused element. The user's keyboard focus lands in an undefined state.

**Recommendation**: Save `document.activeElement` before opening dialog, restore focus on close.

### 6.12 Diff Review "Accept" Semantics Reversed
**File**: `MultiFileDiffReview.tsx:338-368`

"Accept" means "keep the modified files" and "Reject" means "revert to HEAD". In standard diff review UX (GitHub, GitLab, VS Code), "Accept" typically means "accept the incoming changes." The reversed semantics can lead to data loss.

**Recommendation**: Rename buttons to "Keep Changes" and "Revert to Original" to remove ambiguity.

---

## 7. Summary of Recommendations by Priority

### P0 — Must Fix (3)
1. **Fix model selector contradiction** — synchronize status bar model display with settings store
2. **Add model selector to Command Center mode** — remove `mode === "sidebar"` guard on ModelSelector
3. **Show auto-approved permissions** — add toast for session-allowed tool auto-approvals (security)

### P1 — High Impact (7)
4. Remove redundant "CHAT" label in Command Center mode header
5. Hide editor-specific status bar items when no editor is visible
6. Improve "disconnected" status visibility with colored badge
7. Consolidate duplicate cost display between session metrics and status bar
8. Fix message action button placement inconsistency (left vs right)
9. Add keybinding conflict detection in KeybindingsEditor
10. Rename diff review buttons ("Keep Changes" / "Revert to Original")

### P2 — Medium Impact (14)
11. Remove disabled "Tour" tab (or move to Help menu)
12. Add visual affordance for activity bar overlay drawers
13. Add keyboard shortcuts to Terminal menu items
14. Fix Usage Dashboard sidebar overflow
15. Replace hardcoded `#ffffff` in UsageDashboard with theme variable
16. Normalize model name display format (always use display labels)
17. Expand Help menu with useful links
18. Add session status indicator before first message
19. Fix accessibility issues (A1-A3)
20. Centralize z-index scale (currently 20 to 10001 scattered)
21. Add viewport bounds checking for tab context menus
22. Add toast notifications for copy success/failure
23. Centralize responsive breakpoints (currently 800/900/1200 hardcoded)
24. Fix tool call expand/collapse state conflict

### P3 — Polish (7)
25. Add keyboard shortcuts to Claude command palette entries
26. Strip `__vantage:` prefix from breadcrumbs
27. Merge Go menu into Edit/View
28. Move Inkwell turtle to far-right or hover-only
29. Standardize font size scale (currently 11+ sizes)
30. Scope chat input history by session ID
31. Restore focus after dialog close

---

## 7. Testing Notes

- All visual inspection performed in browser mock mode (Vite dev server, port 1420)
- Terminal is non-functional in mock mode (PTY plugin not mocked — known issue from prior audit)
- No console errors observed during this audit session (previous TypeError was resolved)
- Theme switching was not tested in this session (would require separate verification)
- Screenshots stored in `audit-screenshots/audit-01` through `audit-15`

---

## Appendix: Screenshot Index

| # | Filename | Content |
|---|----------|---------|
| 01 | `audit-01-initial-load.png` | Welcome dialog on initial load |
| 02 | `audit-02-claude-mode-main.png` | Main Claude mode view (pre-restructure snapshot) |
| 03 | `audit-03-ide-mode.png` | IDE mode view (pre-restructure snapshot) |
| 04 | `audit-04-search-panel.png` | Search panel in sidebar |
| 05 | `audit-05-agents-panel.png` | Agents Kanban panel |
| 06 | `audit-06-usage-panel.png` | Usage Analytics in sidebar (overflow visible) |
| 07 | `audit-07-settings-panel.png` | Settings - Preferences tab |
| 08 | `audit-08-titlebar-zoom.png` | Title bar detail |
| 09 | `audit-09-command-center-mode.png` | Command Center mode (post-restructure) |
| 10 | `audit-10-copilot-mode.png` | Co-pilot mode (post-restructure) |
| 11 | `audit-11-file-menu.png` | File menu dropdown |
| 12 | `audit-12-copilot-settings.png` | Settings in Co-pilot mode |
| 13 | `audit-13-settings-copilot.png` | Full settings panel view |
| 14 | `audit-14-command-center-full.png` | Command Center with session metrics |
| 15 | `audit-15-session-metrics-zoom.png` | Session metrics sidebar detail |

---

## Appendix: Files Referenced

| File | Issue(s) |
|------|----------|
| `src/components/chat/ChatHeader.tsx` | 2.1, 2.2, 2.3, 3.3 |
| `src/components/layout/TitleBar.tsx` | 2.7 |
| `src/components/layout/ActivityBar.tsx` | 2.8 |
| `src/components/layout/EditorArea.tsx` | 2.16 |
| `src/components/analytics/UsageDashboard.tsx` | 2.10, 2.11 |
| `src/components/layout/status-bar/PlanUsageIndicator.tsx` | (good implementation) |
| `src/components/shared/palette/commandRegistry.ts` | 2.15 |
| `src/stores/layout.ts` | 2.8, 3.1 |
| `src/stores/settings.ts` | 3.4 |
| `src/stores/conversation.ts` | 3.4 |
| `src/hooks/useTerminal.ts` | (PTY null guard — prior issue) |
