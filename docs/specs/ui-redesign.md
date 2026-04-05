# Vantage IDE UI Layout Redesign

**Status**: Draft -- awaiting review before implementation  
**Date**: 2026-04-04  
**Scope**: Layout shell, title bar, menu bar, panel sizing, welcome screen  

---

## 1. Problems with the Current Layout

### 1.1 Rigid Panel Sizing

The `useResizable` hook enforces hard pixel limits (`minSize: 180, maxSize: 400` for primary sidebar; `minSize: 220, maxSize: 500` for secondary sidebar). Users cannot make the chat panel wider than 500px on a 4K display, nor collapse a sidebar down to a narrow icon strip. The bottom panel uses `react-resizable-panels` percentage-based sizes (`minSize={15}`, `maxSize={70}`) which interact unpredictably with the pixel-based sidebars.

### 1.2 Text Clipping

Visible in screenshots: the settings sidebar tabs ("CLAUDE.md", "MCP Servers", "Spec View...") clip at the edge. The status bar's right section overflows on narrow windows. The chat panel header toolbar ("Build & Review", "Comp...") clips. Root causes:

- Fixed `width` via inline styles with no `text-overflow: ellipsis` fallback.
- `shrink-0` on items that should be allowed to shrink.
- No responsive hiding of lower-priority status bar items.

### 1.3 Welcome Screen as Background

The `WelcomeScreen` component renders inside `EditorArea` as the `else` branch when no tab is active. This means it fills the space between the sidebars and the bottom panel, competing with the terminal for attention. It looks like a backdrop, not an intentional starting point. Compare to VS Code where the welcome tab is an actual editor tab you can close.

### 1.4 No Menu Bar

There is no File/Edit/View menu. The title bar is a 32px strip with only the project name and window controls. Users have to know keyboard shortcuts or the command palette to access basic operations. Every desktop IDE has discoverable menus -- their absence makes Vantage feel unfinished.

### 1.5 Non-Adaptive Panel Space

When the chat panel is hidden, the editor does not reclaim the space smoothly (it snaps). When the terminal is hidden, the editor jumps. The sidebars use a custom `useResizable` hook that manages `mousemove`/`mouseup` listeners manually instead of using the same `react-resizable-panels` library used for the vertical split. This creates two incompatible resize systems.

---

## 2. Design Principles

1. **Chat is first-class.** Vantage is built around Claude Code. The chat panel should be a primary pane, not a "secondary sidebar" that maxes out at 500px.

2. **One resize system.** All resizable splits should use `react-resizable-panels` (`Group`, `Panel`, `Separator`). No custom `useResizable` hook. This gives us accessibility (keyboard resize), persistence, and consistent behavior.

3. **Overflow prevention, not overflow hiding.** Text should truncate with ellipsis. Containers should use `min-width: 0` / `min-height: 0` to allow flex children to shrink. No hardcoded pixel widths on text containers.

4. **Progressive disclosure.** Status bar items collapse into overflow menus at narrow widths. Menu bar items collapse into a hamburger below a threshold. Sidebars can fully collapse to 0px width.

5. **VS Code-inspired, not VS Code-cloned.** The overall shell follows conventions users already know (activity bar, sidebars, bottom panel, status bar), but the chat panel's prominence and the integrated menu-in-title-bar are distinctly Vantage.

---

## 3. Layout Structure

### 3.1 ASCII Diagram

```
+--------------------------------------------------------------+
| [V] File  Edit  View  Go  Terminal  Help    [project] - [] X |  <- TitleBar + MenuBar (36px)
+----+-----------------------------------------+---------------+
|    | Tab: main.ts  | App.tsx  | +            |  Chat | Agent  |  <- EditorTabs / ChatTabs
| A  | src > components > main.ts              |               |  <- Breadcrumbs
| c  +------------------------------------------+               |
| t  |                                         |               |
| i  |           Editor Area                   |   Chat Panel  |
| v  |           (Monaco / Welcome Tab)        |   (full ht.)  |
| i  |                                         |               |
| t  |                                         |               |
| y  +--------------------------+--------------+               |
|    | Terminal | Problems | Out|             |               |  <- BottomPanel tabs
| B  |                          |             |               |
| a  | $ npm run dev            |             |               |
| r  |                          |             |               |
+----+--------------------------+-------------+---------------+
| br:main  0E 0W | Ln 1 Col 1 | UTF-8 LF Spaces:2 | TS | ... |  <- StatusBar (24px)
+--------------------------------------------------------------+
```

### 3.2 Key Layout Decisions

**Chat panel spans full height.** The right panel (`Chat`) extends from the tab bar to the status bar, sitting alongside both the editor and the bottom panel. This gives Claude's conversation the vertical space it needs and lets the user see terminal output and chat simultaneously without either being squeezed.

**Bottom panel sits under the editor only, not under chat.** This is the critical difference from the current layout. Currently the bottom panel spans the full width between the sidebars. In the redesign, it only spans the editor column. The chat column is independent. Rationale: when you're chatting with Claude, you want to see both the terminal (where Claude runs commands) and the chat (where Claude explains what it did). Stacking them vertically in separate columns achieves this.

**Menu bar is integrated into the title bar row.** On Windows, the custom title bar already has drag regions and window controls. We add the menu items to the left side of this row, saving the 28px that a separate menu bar row would cost. The title bar height increases from 32px to 36px to accommodate menu items comfortably.

**Welcome screen becomes a tab.** Instead of rendering the welcome screen as the default background of `EditorArea`, it becomes a special tab with id `__vantage://welcome`. It opens automatically when no other tabs are open. Users can close it like any tab. It can be re-opened via the Help menu or command palette.

---

## 4. Component Hierarchy

```
<App>
  <ErrorBoundary>
    <IDELayout>
      <TitleBar>                              // 36px fixed height
        <MenuBar />                           //   File, Edit, View, Go, Terminal, Help
        <DragRegion />                        //   Project name, draggable
        <WindowControls />                    //   Minimize, Maximize, Close
      </TitleBar>

      <div.main-content>                      // flex row, flex-1
        <ActivityBar />                       //   48px fixed width, flex column

        <Group direction="horizontal">        // react-resizable-panels horizontal
          <Panel id="primary-sidebar">        //   collapsible, default 240px
            <PrimarySidebar />
          </Panel>
          <Separator />

          <Panel id="center-and-bottom">      //   flex-1
            <Group direction="vertical">      //   nested vertical split
              <Panel id="editor">
                <EditorArea />                //     tabs + breadcrumbs + monaco
              </Panel>
              <Separator />
              <Panel id="bottom-panel">       //     collapsible
                <PanelArea />                 //       terminal, problems, output
              </Panel>
            </Group>
          </Panel>
          <Separator />

          <Panel id="right-panel">            //   collapsible, default 360px
            <SecondarySidebar />              //     chat tabs + chat panel / agent detail
          </Panel>
        </Group>
      </div.main-content>

      <StatusBar />                           // 24px fixed height
    </IDELayout>
  </ErrorBoundary>
</App>
```

### 4.1 Why This Nesting

The outer `Group direction="horizontal"` creates three columns: left sidebar, center, right panel. The center column contains a nested `Group direction="vertical"` splitting editor from bottom panel. The right panel is a sibling of the center column at the horizontal level, so it spans the full height between the title bar and the status bar.

This is the same nesting VS Code uses, except our right panel is wider and more prominent by default (360px vs VS Code's typical 300px auxiliary bar).

---

## 5. Resizing Behavior

### 5.1 Unified Resize System

**Delete `useResizable.ts` entirely.** Replace all resize logic with `react-resizable-panels`. This library already handles:

- Mouse and keyboard resize (arrow keys when separator is focused)
- `min`/`max` constraints as percentages
- Persisting sizes via `onLayout` callback
- Collapsing panels to zero via the `collapsible` prop
- Accessibility (`role="separator"`, `aria-valuenow`)

### 5.2 Panel Constraints

| Panel | Default Size | Min Size | Collapsible | Collapse Behavior |
|-------|-------------|----------|-------------|-------------------|
| Primary Sidebar | 15% (~240px at 1600) | 10% (~160px) | Yes | Collapses to 0%; activity bar click re-opens |
| Editor + Bottom | flex remainder | 20% | No | Always visible |
| Bottom Panel | 30% of center column | 10% of center | Yes | Collapses to 0%; toggle via status bar or Ctrl+` |
| Right Panel (Chat) | 25% (~400px at 1600) | 15% (~240px) | Yes | Collapses to 0%; Ctrl+Shift+C toggles |

### 5.3 Percentage-Based with Pixel Awareness

`react-resizable-panels` works in percentages. To convert the current pixel defaults to percentages: assume a 1600px reference width. The defaults become:

- Primary sidebar: 240/1600 = 15%
- Right panel: 400/1600 = 25%
- Center: 60% (auto-calculated)

The `minSize` percentages ensure panels don't become unusable. On a 1280px screen, 10% = 128px, which is enough for a collapsed file tree. On a 3840px screen, 15% = 576px for chat, which is generous.

### 5.4 Separator Styling

All separators use the same visual treatment:

```css
/* Horizontal separator (between columns) */
.separator-horizontal {
  width: 1px;
  background: var(--color-surface-0);
  cursor: col-resize;
  transition: background-color 150ms;
}
.separator-horizontal:hover,
.separator-horizontal[data-resize-handle-active] {
  width: 3px;
  background: var(--color-blue);
}

/* Vertical separator (between editor and bottom panel) */
.separator-vertical {
  height: 1px;
  background: var(--color-surface-0);
  cursor: row-resize;
  transition: background-color 150ms;
}
.separator-vertical:hover,
.separator-vertical[data-resize-handle-active] {
  height: 3px;
  background: var(--color-blue);
}
```

---

## 6. Menu Bar

### 6.1 Integration with Title Bar

The menu bar is rendered inside `TitleBar` as a row of dropdown triggers. On Windows, where we have a custom title bar, this works naturally. The layout:

```
[Vantage logo/icon 24x24] [File] [Edit] [View] [Go] [Terminal] [Help]  ...drag region...  [project - Vantage]  [_] [M] [X]
```

The Vantage icon on the far left acts as the application menu (like the VS Code icon in the top-left). Clicking it shows the same items as File.

The drag region is the space between the last menu item and the project name. It uses `data-tauri-drag-region` for window dragging.

### 6.2 Menu Items

**File**
| Item | Shortcut | Action |
|------|----------|--------|
| New File | Ctrl+N | Creates untitled tab in editor |
| Open File... | Ctrl+O | File dialog, opens in editor |
| Open Folder... | Ctrl+Shift+O | Folder dialog, sets project root |
| Open Recent | > | Submenu of recent projects/files |
| Save | Ctrl+S | Save active file |
| Save All | Ctrl+Shift+S | Save all dirty tabs |
| Close Tab | Ctrl+W | Close active editor tab |
| Close All Tabs | Ctrl+Shift+W | Close all editor tabs |
| --- | | |
| Preferences | Ctrl+, | Opens settings panel |
| --- | | |
| Exit | Alt+F4 | Close window (with save prompt) |

**Edit**
| Item | Shortcut | Action |
|------|----------|--------|
| Undo | Ctrl+Z | Editor undo |
| Redo | Ctrl+Y | Editor redo |
| --- | | |
| Cut | Ctrl+X | Cut selection |
| Copy | Ctrl+C | Copy selection |
| Paste | Ctrl+V | Paste |
| --- | | |
| Find | Ctrl+F | Editor find |
| Replace | Ctrl+H | Editor find & replace |
| Find in Files | Ctrl+Shift+F | Opens search panel |
| --- | | |
| Toggle Comment | Ctrl+/ | Toggle line comment |
| Format Document | Shift+Alt+F | Run Prettier |

**View**
| Item | Shortcut | Action |
|------|----------|--------|
| Command Palette | Ctrl+Shift+P | Open command palette |
| Quick Open | Ctrl+P | Open file quick-open |
| --- | | |
| Explorer | Ctrl+Shift+E | Toggle explorer sidebar |
| Search | Ctrl+Shift+F | Focus search sidebar |
| Source Control | Ctrl+Shift+G | Toggle git sidebar |
| Agents | Ctrl+Shift+A | Toggle agents sidebar |
| Chat | Ctrl+Shift+C | Toggle right panel (chat) |
| --- | | |
| Terminal | Ctrl+` | Toggle bottom panel |
| Problems | Ctrl+Shift+M | Show problems tab |
| --- | | |
| Zen Mode | Ctrl+Shift+Z | Toggle zen mode |
| --- | | |
| Zoom In | Ctrl+= | Increase font size |
| Zoom Out | Ctrl+- | Decrease font size |
| Reset Zoom | Ctrl+0 | Reset font size |

**Go**
| Item | Shortcut | Action |
|------|----------|--------|
| Go to Line... | Ctrl+G | Open go-to-line dialog |
| Go to File... | Ctrl+P | Quick open |
| Go to Symbol... | Ctrl+Shift+O | Symbol search |
| --- | | |
| Back | Alt+Left | Navigate back |
| Forward | Alt+Right | Navigate forward |

**Terminal**
| Item | Shortcut | Action |
|------|----------|--------|
| New Terminal | Ctrl+Shift+` | Create new terminal tab |
| Split Terminal | | Split current terminal |
| --- | | |
| Run Task... | | Task runner (future) |

**Help**
| Item | Shortcut | Action |
|------|----------|--------|
| Welcome | | Open welcome tab |
| Keyboard Shortcuts | Ctrl+K Ctrl+S | Open keybindings editor |
| --- | | |
| Toggle Developer Tools | Ctrl+Shift+I | Open DevTools |
| --- | | |
| About Vantage | | Version dialog |

### 6.3 Menu Component Implementation

Create a new `MenuBar` component that renders dropdown menus. Each menu item is a `<button>` that opens a positioned dropdown. Menus open on click, and once one is open, hovering over adjacent menu labels switches the open menu (standard Windows menu bar behavior).

The dropdown uses `position: fixed` anchored to the bottom-left of the trigger button. It renders as a `<div role="menu">` with `<button role="menuitem">` children.

### 6.4 Menu Bar on Narrow Windows

Below 800px width, the individual menu labels collapse into a single hamburger icon. The hamburger opens a single combined menu with section headers (File, Edit, View, etc.).

---

## 7. Welcome Screen Redesign

### 7.1 Current State

The welcome screen is a `flex-1 flex flex-col items-center justify-center` div inside `EditorArea`. It shows:
- Vantage logo
- "Welcome to Vantage" heading
- "Open Folder" button
- Recent projects list (with pin/remove)
- Recent files list
- Keyboard shortcut hints

It fills the entire editor area as a background, which looks wrong when the terminal is visible below it.

### 7.2 Proposed Change

The welcome screen becomes a **special editor tab** with path `__vantage://welcome`. The tab is:
- Auto-opened on startup when no other tabs are open
- Closable by the user (clicking the X on the tab)
- Re-openable via Help > Welcome or the command palette
- NOT auto-opened when a project has persisted tabs from a previous session

The welcome content is redesigned as a centered card layout:

```
+--------------------------------------------------+
|                                                  |
|     +----- 600px max-width, centered ----------+  |
|     |                                          |  |
|     |   [Vantage icon]                         |  |
|     |   Welcome to Vantage                     |  |
|     |   Your AI-native IDE for Claude Code     |  |
|     |                                          |  |
|     |   [Open Folder]   [Clone Repository]     |  |
|     |                                          |  |
|     |   ---- Recent Projects ------------------+  |
|     |   [project cards...]                     |  |
|     |                                          |  |
|     |   ---- Quick Actions --------------------+  |
|     |   Ctrl+Shift+P  Command Palette          |  |
|     |   Ctrl+P        Quick Open               |  |
|     |   Ctrl+`        Terminal                  |  |
|     |   Ctrl+Shift+C  Open Chat                |  |
|     |                                          |  |
|     +------------------------------------------+  |
|                                                  |
+--------------------------------------------------+
```

The content scrolls if the window is short. The card has `max-width: 600px` and `margin: auto`, so it stays centered regardless of the editor area's width.

### 7.3 Empty State When Welcome Tab is Closed

When no tabs are open and the welcome tab is closed, the editor area shows a minimal empty state: the Vantage logo watermark at 10% opacity, centered. No text, no buttons -- just a subtle brand mark.

---

## 8. Responsive Behavior

### 8.1 Window Width Breakpoints

| Width | Behavior |
|-------|----------|
| >= 1400px | Full layout: all panels visible, menu labels visible |
| 1000-1399px | Chat panel starts narrower (min 240px). Status bar hides timer/tokens. |
| 800-999px | Menu bar collapses to hamburger. Chat panel collapses to icon-only toggle. |
| < 800px | Primary sidebar auto-hides. Only editor + bottom panel visible. Floating chat button. |

### 8.2 Status Bar Overflow

The status bar has many items. At narrow widths, items are prioritized:

**Always visible** (left to right priority):
1. Git branch
2. Errors/warnings count
3. Line/column
4. Language mode
5. Claude status (Ready/Streaming)

**Hidden below 1200px:**
- Git diff stat (+X -Y)
- Coding buddy (Inkwell)
- Notification bell (moves to title bar)
- Index status

**Hidden below 1000px:**
- Session timer
- Token count
- Cost display (accessible via click on Claude status)

**Hidden below 800px:**
- EOL indicator
- Encoding
- Tab size
- Word wrap
- Effort level

The hiding is implemented via CSS container queries or a `useWindowSize` hook with conditional rendering, not with `display: none` on individual items (which causes layout shift). Instead, items are grouped into priority tiers and entire tiers hide together.

### 8.3 Activity Bar Persistence

The activity bar (48px) is always visible. It is the minimum chrome needed to access all features. Even at the narrowest window, the 5 icons are always reachable.

---

## 9. CSS Approach

### 9.1 Flex Layout, Not Grid

The overall layout uses flexbox, not CSS grid. Reasons:
- `react-resizable-panels` outputs flex containers
- Flex handles the "one dimension at a time" nature of IDE layouts better (horizontal split, then vertical split within the center column)
- Grid would require rethinking the entire resize system

### 9.2 Preventing Text Clipping

Every text container that can overflow must have:

```css
.truncatable {
  min-width: 0;        /* Allow flex child to shrink below content size */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Specifically:
- **Editor tabs**: Tab labels truncate. The tab container scrolls horizontally when tabs overflow.
- **Sidebar headers**: "EXPLORER", "SEARCH", etc. -- these are short and should never clip, but the sidebar content below them must use `min-width: 0`.
- **Breadcrumbs**: Path segments truncate from the left. Show "... > components > main.ts" when the full path doesn't fit.
- **Status bar items**: Each item has `white-space: nowrap` and `overflow: hidden`. The containing flex row uses `gap` and `min-width: 0` on children.
- **Chat panel header**: The toolbar icons use `flex-shrink: 0` but any text labels truncate.

### 9.3 Container Sizing Rules

```
Rule 1: Never use fixed pixel widths on content containers.
  - Sidebar widths are controlled by react-resizable-panels percentages.
  - Content inside sidebars uses width: 100% and min-width: 0.

Rule 2: All flex children that contain text must have min-width: 0.
  - This allows them to shrink below their content size.
  - Without this, a long filename in the file explorer pushes the sidebar wider.

Rule 3: Use flex-shrink judiciously.
  - Icons: flex-shrink: 0 (never shrink icons)
  - Text: flex-shrink: 1, min-width: 0 (shrink and truncate)
  - Spacing: flex-shrink: 0 on gap-based spacing, flex-shrink: 1 on flexible spacers
```

### 9.4 Theme Variable Usage

All colors continue to use CSS custom properties (`--color-base`, `--color-surface-0`, etc.). No changes to the theme system. The redesign is layout-only.

---

## 10. Migration Plan

The migration is broken into 5 phases. Each phase is a self-contained PR that can be reviewed and tested independently. No phase breaks the existing functionality.

### Phase 1: Unified Resize System

**Goal**: Replace `useResizable` with `react-resizable-panels` for all panels.

**Changes**:
1. Modify `IDELayout.tsx`: Replace the manual `useResizable` hooks and custom `HorizontalResizeHandle` with `react-resizable-panels` `Group`/`Panel`/`Separator` for the horizontal layout.
2. Delete `src/hooks/useResizable.ts`.
3. Update `layout.ts` store: Remove `primarySidebarPixelWidth` and `secondarySidebarPixelWidth` fields. Add `panelLayout: number[]` to persist the percentage-based panel sizes via `onLayout`.
4. Update `Separator` styling to match the current handle appearance.
5. Add `collapsible` prop to sidebar panels so they can collapse to zero.

**Testing**: Verify resize works with mouse drag. Verify panels collapse/expand via activity bar. Verify sizes persist across page reloads.

### Phase 2: Layout Restructure (Chat Full Height)

**Goal**: Move the right panel (chat) outside the center column so it spans full height.

**Changes**:
1. Restructure `IDELayout.tsx` nesting: outer horizontal `Group` has 3 panels (left sidebar, center column, right panel). Center column has inner vertical `Group` (editor, bottom panel).
2. The right panel (`SecondarySidebar`) now sits at the same level as the primary sidebar, not nested inside the center column.
3. This is purely a structural change -- no visual design changes yet.

**Testing**: Verify chat panel extends from top to bottom. Verify terminal only spans the editor column width. Verify resize handles work for all 4 splits (left sidebar | editor | right panel, and editor | bottom panel within center).

### Phase 3: Menu Bar + Title Bar Merge

**Goal**: Add a menu bar integrated into the title bar.

**Changes**:
1. Create `src/components/layout/MenuBar.tsx` with dropdown menu component.
2. Modify `TitleBar.tsx` to include the `MenuBar` component between the Vantage icon and the drag region.
3. Increase title bar height from 32px to 36px.
4. Implement menu items and wire them to existing actions (command palette store, editor store, layout store, etc.).
5. Add hamburger collapse for narrow windows.

**Testing**: Verify all menu items trigger the correct actions. Verify menus open/close correctly. Verify keyboard navigation (Alt+F opens File menu, arrow keys navigate). Verify window dragging still works on the drag region.

### Phase 4: Welcome Screen as Tab

**Goal**: Convert the welcome screen from a background to a closable tab.

**Changes**:
1. Modify `EditorArea.tsx`: Remove the inline `WelcomeScreen` component from the `else` branch.
2. Create `src/components/editor/WelcomeTab.tsx` with the redesigned card layout.
3. On startup (or when all tabs are closed), auto-open a tab with `id: "__vantage://welcome"` and `path: "__vantage://welcome"`.
4. The welcome tab renders `WelcomeTab` instead of `MonacoEditor` (same pattern as the existing `__vantage://analytics` special tab).
5. Add "Welcome" to the Help menu and command palette.
6. Add minimal empty state (watermark logo) when no tabs are open and welcome is closed.

**Testing**: Verify welcome tab appears on fresh start. Verify it can be closed. Verify it can be re-opened from Help menu. Verify it does not appear when restoring a workspace with existing tabs.

### Phase 5: Overflow and Responsive Polish

**Goal**: Fix all text clipping and add responsive behavior.

**Changes**:
1. Audit every component for `min-width: 0` on flex children with text.
2. Add `text-overflow: ellipsis` to tab labels, breadcrumb segments, status bar items, sidebar items.
3. Implement status bar priority tiers with a `useWindowSize` hook.
4. Add breadcrumb left-truncation when path is too long.
5. Test at 1280x720, 1600x900, 1920x1080, and 3840x2160.

**Testing**: Resize window to various sizes. Verify no text clips. Verify status bar items hide/show in correct priority order. Verify no horizontal scrollbars appear anywhere except intentionally (editor tabs, breadcrumbs).

---

## 11. Files That Need to Change

### New Files
| File | Purpose |
|------|---------|
| `src/components/layout/MenuBar.tsx` | Menu bar with dropdown menus |
| `src/components/editor/WelcomeTab.tsx` | Redesigned welcome screen as a tab |

### Modified Files
| File | Changes |
|------|---------|
| `src/components/layout/IDELayout.tsx` | Full restructure: unified resize system, 3-column layout with nested vertical split |
| `src/components/layout/TitleBar.tsx` | Add MenuBar integration, increase height to 36px, add Vantage icon |
| `src/components/layout/StatusBar.tsx` | Add responsive priority tiers, fix overflow |
| `src/components/layout/EditorArea.tsx` | Remove inline WelcomeScreen, add `__vantage://welcome` tab handling, add empty state |
| `src/components/layout/PanelArea.tsx` | Minor: ensure it uses `min-width: 0` / `min-height: 0` |
| `src/components/layout/PrimarySidebar.tsx` | Fix text clipping in header tabs |
| `src/components/layout/SecondarySidebar.tsx` | Add chat/agent tab bar at the top (currently has no tabs UI) |
| `src/stores/layout.ts` | Remove pixel width fields, add `panelLayout` for percentage persistence, remove zen mode snapshot (use panel collapse state instead) |
| `src/components/editor/EditorTabs.tsx` | Add truncation to tab labels, horizontal scroll |
| `src/components/chat/ChatPanel.tsx` | Fix header toolbar overflow |

### Deleted Files
| File | Reason |
|------|--------|
| `src/hooks/useResizable.ts` | Replaced by `react-resizable-panels` for all resize logic |

---

## 12. Risks and Mitigations

### 12.1 Workspace State Migration

Existing workspaces store `primarySidebarPixelWidth` and `secondarySidebarPixelWidth` as pixel values. After the redesign, these fields are replaced with `panelLayout` (percentage array). 

**Mitigation**: In the layout store's initialization, detect old pixel-width fields and convert them to approximate percentages based on a 1600px reference width. Log a warning and discard the old fields.

### 12.2 react-resizable-panels API Stability

The CLAUDE.md warns: "react-resizable-panels v4.9 -- API uses Group/Separator, not PanelGroup/PanelResizeHandle. Don't use useDefaultLayout -- it corrupts stored sizes."

**Mitigation**: We already use this library for the vertical split. The redesign extends it to horizontal splits. Pin the version. Do not use `useDefaultLayout`. Use `onLayout` callback for persistence.

### 12.3 Monaco Editor Re-renders

Restructuring the component tree might cause Monaco to unmount and remount, losing cursor position and undo history.

**Mitigation**: The `EditorArea` component does not move in the tree -- it stays inside the center column. Only its parent container changes from a plain `div` to a `Panel`. Monaco should not re-render. Verify with React DevTools.

### 12.4 Keyboard Shortcut Conflicts

Adding menu bar keyboard shortcuts (Alt+F, Alt+E, etc.) may conflict with Monaco editor shortcuts or existing Vantage shortcuts.

**Mitigation**: Menu bar shortcuts only activate when no editor has focus, or use the Alt key modifier which Monaco does not intercept by default. Test all shortcuts in the keybindings editor.

---

## 13. Out of Scope

The following are explicitly NOT part of this redesign:

- **Theme changes**: Colors, fonts, and icon sets are unchanged.
- **New features**: No new panels, no new sidebar views, no new terminal features.
- **Chat panel internal layout**: The content inside ChatPanel stays the same. Only its container size/position changes.
- **Multi-window**: The layout assumes a single window. Floating/detaching panels is a future feature.
- **Keyboard shortcut rebinding**: The menu shows default shortcuts but does not change the keybinding system.
- **Mobile/tablet**: Vantage is a desktop app. Sub-800px is a stretch goal, not a requirement.

---

## 14. Success Criteria

After implementation, the following must be true:

1. All panels resize smoothly with mouse drag, with no jank or snapping.
2. No text is clipped anywhere at 1920x1080 with default panel sizes.
3. The chat panel can be resized from 240px to 60% of the window width.
4. The menu bar provides discoverable access to all major actions.
5. The welcome screen appears as a tab and can be closed/reopened.
6. Window can be resized down to 1024x768 without layout breaking.
7. All existing keyboard shortcuts continue to work.
8. Workspace state (panel sizes, visibility) persists across restarts.
9. Zero regressions in the existing 362 frontend tests.
