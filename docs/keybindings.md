# Vantage — Keyboard Shortcuts

All shortcuts use the Windows convention (Ctrl = Control key). Sources: `src/hooks/useKeybindings.ts`, `src/components/layout/IDELayout.tsx`, `src/components/editor/MonacoEditor.tsx`, `src/components/chat/ChatPanel.tsx`, `src/components/terminal/TerminalInstance.tsx`.

---

## Global (IDE-wide)

| Shortcut | Action | Source |
|----------|--------|--------|
| `Ctrl+B` | Toggle Primary Sidebar (file explorer, search, git, agents, settings) | useKeybindings |
| `Ctrl+Shift+B` | Toggle Secondary Sidebar (Chat / Claude panel) | useKeybindings |
| `Ctrl+J` | Toggle Bottom Panel (terminal / browser / verification) | useKeybindings |
| `Ctrl+`` ` `` ` | Toggle Bottom Panel (terminal shorthand) | useKeybindings |
| `Ctrl+Shift+Z` | Toggle Zen Mode (distraction-free — hides all panels) | IDELayout |
| `Ctrl+Shift+Q` | Open Quick Question overlay (`/btw` — zero-context-cost question to Claude) | IDELayout |
| `Ctrl+Shift+Alt+K` | Cycle color theme (Dark → Light → High Contrast → Dark) | useKeybindings |
| `Ctrl+,` | Open Settings | useKeybindings |

---

## Command Palette

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Open Command Palette (commands mode) |
| `Ctrl+P` | Quick Open File (files mode) |
| `Ctrl+G` | Go to Line (goto mode) |

---

## Activity Bar Focus

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+E` | Focus File Explorer |
| `Ctrl+Shift+F` | Focus Search in Files (also focuses the search input) |
| `Ctrl+Shift+G` | Focus Source Control |
| `Ctrl+Shift+A` | Focus Agents panel |

Note: clicking an already-active activity bar icon while its sidebar is open collapses the sidebar.

---

## Editor

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl+S` | Save active file (triggers format on save if enabled) | EditorArea + useKeybindings |
| `Ctrl+W` | Close active tab | useKeybindings |
| `Ctrl+Tab` | Next tab | useKeybindings |
| `Ctrl+Shift+Tab` | Previous tab | useKeybindings |
| `Ctrl+K` | Open Inline AI Edit bar (select code first, then type a prompt) | MonacoEditor |
| `Ctrl+Shift+\` | Jump to matching bracket | MonacoEditor |
| `Enter` | Accept inline AI edit diff | MonacoEditor (when diff is shown) |
| `Escape` | Reject inline AI edit diff | MonacoEditor (when diff is shown) |

---

## Terminal

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl+F` | Open find bar in focused terminal | TerminalInstance |
| `Escape` | Close terminal find bar | TerminalInstance (find bar open) |
| `Enter` | Execute command in find bar / submit | TerminalInstance |
| `Shift+Enter` | Submit multi-line in find bar | TerminalInstance |
| `Tab` | Accept AI command suggestion | CommandSuggestion |
| `Escape` | Dismiss AI command suggestion | CommandSuggestion |

---

## Chat Panel

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl+Shift+F` | Toggle conversation search bar | ChatPanel |
| `Escape` | Close Quick Question overlay | QuickQuestionOverlay |
| `Enter` | Submit Quick Question | QuickQuestionOverlay |

---

## Keybinding Customization

Keybindings can be overridden in Settings (`Ctrl+,`) → Keybindings. Overrides are stored per-binding ID in the `settings` store (`keybindingOverrides` map) and persist globally (not per-project). Reset all overrides with "Reset All Keybindings" in the settings panel.

The canonical binding definition list lives in `src/hooks/useKeybindings.ts` → `DEFAULT_KEYBINDING_DEFINITIONS`. The runtime hook merges these with any saved overrides from the settings store.
