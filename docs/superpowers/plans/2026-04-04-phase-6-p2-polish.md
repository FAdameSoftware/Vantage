# Vantage Phase 6: P2 Polish Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add polish features -- additional themes, vim keybindings, session search, git history, auto-update, and usage analytics -- to elevate Vantage from functional to refined.

**Architecture:** Mostly frontend work. Themes are CSS variable swaps. Vim mode uses Monaco's built-in vim extension. Auto-update uses Tauri's updater plugin. Git history shells out to git log/blame. Usage analytics aggregates data from the conversation store.

**Tech Stack:** Catppuccin Latte palette, monaco-vim, tauri-plugin-updater, recharts (for analytics charts)

---

### Task 1: Catppuccin Latte Light Theme + High Contrast Theme

**Files:**
- Modify: `src/index.css`
- Create: `src/components/editor/monacoThemeLatte.ts`
- Create: `src/components/editor/monacoThemeHighContrast.ts`
- Modify: `src/components/editor/monacoTheme.ts`
- Modify: `src/components/editor/MonacoEditor.tsx`
- Modify: `src/stores/settings.ts`
- Modify: `src/hooks/useKeybindings.ts` (register theme cycle command)
- Modify: `src/App.tsx` (apply theme class on mount)

This task adds two new themes to Vantage: Catppuccin Latte (a warm light theme from the same Catppuccin family as the existing Mocha dark theme) and a high contrast theme meeting WCAG AAA (7:1+ contrast ratios). The current architecture already uses CSS custom properties for all surface, text, and accent colors in `src/index.css`, and a separate `monacoTheme.ts` for editor token colors. Adding themes means defining alternate sets of these variables and switching them based on a `data-theme` attribute or CSS class on the root element. The settings store currently has `theme: "vantage-dark"` as a union type -- this needs to expand to include the new options.

- [ ] **Step 1: Expand the ThemeName type and settings store**

Modify `src/stores/settings.ts`. Change the `ThemeName` type from `"vantage-dark"` to a union of three values: `"vantage-dark" | "vantage-light" | "vantage-high-contrast"`. The default stays `"vantage-dark"`. No other store changes needed -- the existing `setTheme` action already accepts any `ThemeName`.

```typescript
export type ThemeName = "vantage-dark" | "vantage-light" | "vantage-high-contrast";
```

- [ ] **Step 2: Define Catppuccin Latte CSS variables**

Add a `.theme-light` class block in `src/index.css`, placed after the existing `:root` Catppuccin Mocha variables. This block overrides every `--color-*` variable with the Catppuccin Latte palette. The Latte palette is the official light variant of Catppuccin:

| Variable | Mocha (current) | Latte (new) |
|----------|----------------|-------------|
| `--color-base` | `#1e1e2e` | `#eff1f5` |
| `--color-mantle` | `#181825` | `#e6e9ef` |
| `--color-crust` | `#11111b` | `#dce0e8` |
| `--color-surface-0` | `#313244` | `#ccd0da` |
| `--color-surface-1` | `#45475a` | `#bcc0cc` |
| `--color-surface-2` | `#585b70` | `#acb0be` |
| `--color-overlay-0` | `#6c7086` | `#9ca0b0` |
| `--color-overlay-1` | `#7f849c` | `#8c8fa1` |
| `--color-overlay-2` | `#9399b2` | `#7c7f93` |
| `--color-text` | `#cdd6f4` | `#4c4f69` |
| `--color-subtext-1` | `#bac2de` | `#5c5f77` |
| `--color-subtext-0` | `#a6adc8` | `#6c6f85` |
| `--color-blue` | `#89b4fa` | `#1e66f5` |
| `--color-green` | `#a6e3a1` | `#40a02b` |
| `--color-red` | `#f38ba8` | `#d20f39` |
| `--color-peach` | `#fab387` | `#fe640b` |
| `--color-mauve` | `#cba6f7` | `#8839ef` |
| `--color-yellow` | `#f9e2af` | `#df8e1d` |
| `--color-teal` | `#94e2d5` | `#179299` |
| `--color-sky` | `#89dceb` | `#04a5e5` |
| `--color-lavender` | `#b4befe` | `#7287fd` |
| `--color-rosewater` | `#f5e0dc` | `#dc8a78` |
| `--color-flamingo` | `#f2cdcd` | `#dd7878` |
| `--color-pink` | `#f5c2e7` | `#ea76cb` |
| `--color-maroon` | `#eba0ac` | `#e64553` |
| `--color-sapphire` | `#74c7ec` | `#209fb5` |

Also override the shadcn CSS variables inside `.theme-light` to match a light mode -- use the existing `:root` (light) shadcn values that are already in the file. The scrollbar and focus ring colors should also update.

- [ ] **Step 3: Define high contrast CSS variables**

Add a `.theme-high-contrast` class block in `src/index.css`. This theme uses a pure white background (`#ffffff`) with pure black text (`#000000`) and saturated accent colors. Every foreground-to-background pair must meet WCAG AAA (7:1+). The design is intentionally plain -- no subtle grays, no transparency.

Key high contrast values:
| Variable | Value | Contrast vs bg |
|----------|-------|----------------|
| `--color-base` | `#ffffff` | N/A (background) |
| `--color-mantle` | `#f0f0f0` | N/A (surface) |
| `--color-crust` | `#e0e0e0` | N/A (surface) |
| `--color-text` | `#000000` | 21:1 vs white |
| `--color-subtext-1` | `#1a1a1a` | 17.4:1 |
| `--color-subtext-0` | `#333333` | 12.6:1 |
| `--color-blue` | `#0040a0` | 8.5:1 |
| `--color-green` | `#006b00` | 7.9:1 |
| `--color-red` | `#b00020` | 7.1:1 |
| `--color-surface-0` | `#d0d0d0` | N/A (surface) |
| `--color-surface-1` | `#b0b0b0` | N/A |
| `--color-surface-2` | `#808080` | N/A |

Borders should be 2px solid `#000000` for maximum visibility. Focus rings should be 2px solid `#0040a0`.

- [ ] **Step 4: Create Catppuccin Latte Monaco theme**

Create `src/components/editor/monacoThemeLatte.ts`. This is a `vs`-based theme (light) that mirrors the structure of `monacoTheme.ts` but uses Latte palette colors. The `base` field must be `"vs"` (not `"vs-dark"`). Token colors follow the same Catppuccin mapping but with the Latte variants (e.g., keywords are `#8839ef` instead of `#cba6f7`). Editor colors match: background `#eff1f5`, foreground `#4c4f69`, selection background `#acb0be80`, etc.

Export it as `catppuccinLatteTheme`.

- [ ] **Step 5: Create high contrast Monaco theme**

Create `src/components/editor/monacoThemeHighContrast.ts`. Base is `"hc-light"` (Monaco's built-in high contrast light base). Use pure white background, pure black foreground, and the high-saturation accent colors. All token colors must be visible against white. Export as `highContrastTheme`.

- [ ] **Step 6: Register all Monaco themes at startup**

Modify `src/components/editor/MonacoEditor.tsx`. The current code registers only `catppuccin-mocha` at module level. Add registration for `catppuccin-latte` and `high-contrast` themes. Import both new theme objects. The `ensureThemeRegistered` function should register all three themes.

Then make the `theme` prop on `<Editor>` dynamic -- read the current theme from the settings store and map it:
- `"vantage-dark"` -> `"catppuccin-mocha"`
- `"vantage-light"` -> `"catppuccin-latte"`
- `"vantage-high-contrast"` -> `"high-contrast"`

- [ ] **Step 7: Apply theme class to document root**

Modify `src/App.tsx`. Subscribe to `useSettingsStore((s) => s.theme)` and update `document.documentElement.className` accordingly:
- `"vantage-dark"` -> no extra class (uses `:root` defaults) + `"dark"` class for shadcn
- `"vantage-light"` -> `"theme-light"` class (no `"dark"` class)
- `"vantage-high-contrast"` -> `"theme-high-contrast"` class (no `"dark"` class)

Use a `useEffect` that runs when `theme` changes. Also update the xterm terminal theme -- the terminal component should read colors from CSS variables or maintain a theme map similar to Monaco.

- [ ] **Step 8: Add theme switcher to settings UI**

If a settings dialog/panel exists, add a dropdown (or radio group) for theme selection: Dark, Light, High Contrast. If no settings UI exists yet, add a command palette command "Change Theme" that cycles through the three options or opens a quick-pick. Register this in `useKeybindings.ts` or the command palette store.

**Verification:** Switch between all three themes. Confirm: (a) CSS variables update across the entire UI, (b) Monaco editor re-themes with correct token colors, (c) terminal colors update, (d) scrollbars and focus rings match, (e) high contrast theme passes WCAG AAA when checked with a contrast tool.

---

### Task 2: Vim Keybinding Mode

**Files:**
- Create: `src/hooks/useVimMode.ts`
- Modify: `src/stores/settings.ts`
- Modify: `src/components/editor/MonacoEditor.tsx`
- Modify: `src/components/layout/StatusBar.tsx` (vim mode indicator)

This task adds an optional vim keybinding mode to the Monaco editor. The `monaco-vim` package provides a well-tested vim emulation layer for Monaco, including normal/insert/visual modes, common motions (hjkl, w, b, e, gg, G), operators (d, c, y, p), ex commands (:w, :q, :wq), and a status bar showing the current mode. The feature is toggled via a setting and the mode indicator appears in the status bar when active.

- [ ] **Step 1: Install monaco-vim**

Run `npm install monaco-vim`. This package exports an `initVimMode` function that attaches to a Monaco editor instance and a status bar DOM element.

- [ ] **Step 2: Add vimMode setting to the store**

Modify `src/stores/settings.ts`. Add a `vimMode: boolean` field (default `false`) and a `setVimMode` action. Include it in the `partialize` list so it persists.

```typescript
// Add to SettingsState interface:
vimMode: boolean;
setVimMode: (enabled: boolean) => void;

// Add to store defaults:
vimMode: false,
setVimMode: (enabled) => set({ vimMode: enabled }),

// Add to partialize:
vimMode: state.vimMode,
```

- [ ] **Step 3: Create the useVimMode hook**

Create `src/hooks/useVimMode.ts`. This hook takes a Monaco editor instance ref and a status bar container ref, and manages the vim mode lifecycle.

```typescript
import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/stores/settings";

/**
 * Attaches/detaches vim mode on a Monaco editor instance.
 * 
 * @param editorRef - Ref to the Monaco IStandaloneCodeEditor instance
 * @param statusBarRef - Ref to a DOM element where vim status (-- INSERT --, etc.) is shown
 */
export function useVimMode(
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor | null>,
  statusBarRef: React.RefObject<HTMLDivElement | null>
) {
  const vimMode = useSettingsStore((s) => s.vimMode);
  const vimModeRef = useRef<ReturnType<typeof import("monaco-vim").initVimMode> | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    const statusBar = statusBarRef.current;

    if (vimMode && editor && statusBar) {
      // Dynamically import to avoid bundling when not used
      import("monaco-vim").then(({ initVimMode }) => {
        vimModeRef.current = initVimMode(editor, statusBar);
      });
    }

    return () => {
      if (vimModeRef.current) {
        vimModeRef.current.dispose();
        vimModeRef.current = null;
      }
    };
  }, [vimMode, editorRef, statusBarRef]);
}
```

Key points:
- Dynamic import so the ~50KB vim module is not loaded when vim mode is off.
- Dispose on unmount or when vim mode is toggled off.
- The `initVimMode` call returns a disposable object with a `.dispose()` method.

- [ ] **Step 4: Integrate vim mode into MonacoEditor**

Modify `src/components/editor/MonacoEditor.tsx`:

1. Add a `ref` for the vim status bar container (a small `<div>` rendered below the editor).
2. Call `useVimMode(editorRef, statusBarRef)` in the component body.
3. The vim status bar div should be conditionally rendered when `vimMode` is true, styled to match the editor theme (monospace font, small text, the same background as the editor).

```tsx
// Inside the component:
const vimStatusRef = useRef<HTMLDivElement>(null);
const vimMode = useSettingsStore((s) => s.vimMode);

// After the existing useCallback hooks:
useVimMode(editorRef, vimStatusRef);

// In the JSX, wrap the Editor in a flex column:
<div className="w-full h-full flex flex-col" data-allow-select="true">
  <div className="flex-1 min-h-0">
    <Editor ... />
  </div>
  {vimMode && (
    <div
      ref={vimStatusRef}
      className="h-6 px-2 flex items-center font-mono text-xs"
      style={{
        backgroundColor: "var(--color-mantle)",
        color: "var(--color-text)",
      }}
    />
  )}
</div>
```

- [ ] **Step 5: Add vim mode indicator to the status bar**

Modify `src/components/layout/StatusBar.tsx`. When `vimMode` is true, show a small badge or text segment in the status bar that reads "VIM". This is a static indicator that vim mode is active -- the actual mode display (-- INSERT --, -- NORMAL --, -- VISUAL --) appears in the vim status bar inside the editor (Step 4). The status bar badge is just a quick visual cue.

- [ ] **Step 6: Add toggle command**

Register a command palette entry "Toggle Vim Mode" that calls `useSettingsStore.getState().setVimMode(!current)`. If a settings UI panel exists, add a checkbox there as well.

**Verification:** Enable vim mode. Confirm: (a) pressing `i` enters insert mode, `Esc` returns to normal mode, (b) `hjkl` navigation works, (c) `:w` triggers save, (d) the status bar inside the editor shows the current mode, (e) toggling off restores standard Monaco keybindings, (f) the setting persists across restarts.

---

### Task 3: Session Search and Filtering

**Files:**
- Create: `src/components/sessions/SessionSearch.tsx`
- Create: `src-tauri/src/session_search.rs`
- Modify: `src-tauri/src/lib.rs` (register new commands)
- Modify: `src/components/sessions/SessionSelector.tsx` (or wherever the session list lives)
- Modify: `src/stores/conversation.ts` (add search/filter state)

This task adds the ability to search and filter past Claude Code sessions. Currently session management shows a list of sessions but without any search or filtering capability. Claude Code stores session data as JSONL files in `~/.claude/projects/`. The search implementation has two layers: a Rust backend command that reads and parses JSONL files for full-text search, and a React frontend that provides search input, filter controls, and sort options.

- [ ] **Step 1: Create the Rust session search command**

Create `src-tauri/src/session_search.rs`. This module provides two Tauri commands:

1. `search_sessions(query: String, cwd: Option<String>) -> Vec<SessionSearchResult>` -- Searches through JSONL session files in `~/.claude/projects/`. For each session file, reads lines and checks if any `assistant` or `user` message text contains the query string (case-insensitive). Returns matching sessions with metadata (session ID, path, first match snippet, date, message count).

2. `get_session_stats(session_path: String) -> SessionStats` -- Reads a single JSONL file and returns: total messages, total cost (sum of `result` message costs), models used, date range, duration.

```rust
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SessionSearchResult {
    pub session_id: String,
    pub file_path: String,
    pub snippet: String,        // First 200 chars of matching message
    pub message_count: u32,
    pub modified_at: String,    // ISO 8601 date
    pub total_cost_usd: f64,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SessionStats {
    pub message_count: u32,
    pub total_cost_usd: f64,
    pub models: Vec<String>,
    pub first_message_at: Option<String>,
    pub last_message_at: Option<String>,
    pub duration_ms: Option<u64>,
}
```

The search reads `~/.claude/projects/` recursively. Each project subfolder contains JSONL files. Parse each line as a JSON object, check the `type` field to identify message types, and search the `message.content` field for the query string. Cap results at 50 to avoid flooding the UI.

- [ ] **Step 2: Register session search commands**

Modify `src-tauri/src/lib.rs`. Add `mod session_search;` and register `search_sessions` and `get_session_stats` as Tauri commands in the builder's `invoke_handler`.

- [ ] **Step 3: Create the SessionSearch component**

Create `src/components/sessions/SessionSearch.tsx`. This component renders:

1. A search input field with a magnifying glass icon and debounced input (300ms).
2. Filter controls:
   - Date range: "Today", "This Week", "This Month", "All Time" buttons.
   - Model filter: dropdown with models seen in results.
3. Sort options: "Newest First" (default), "Most Expensive", "Most Messages".
4. Results list: each result shows session date, snippet, cost, message count. Click to open/resume that session.

The component calls the Rust `search_sessions` command via `invoke` and displays results. Use the existing shadcn Input, Button, Select components for controls.

```tsx
// Rough structure:
function SessionSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SessionSearchResult[]>([]);
  const [sortBy, setSortBy] = useState<"date" | "cost" | "messages">("date");
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "all">("all");

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length >= 2) {
        const results = await invoke<SessionSearchResult[]>("search_sessions", { query });
        setResults(results);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Client-side filtering and sorting on `results`
  const filtered = useMemo(() => {
    let list = [...results];
    // Apply date filter
    // Apply sort
    return list;
  }, [results, sortBy, dateFilter]);
}
```

- [ ] **Step 4: Integrate into the session selector**

Modify the existing session list component to embed `SessionSearch` at the top. When the search input is empty, show the normal session list (recent sessions). When the user types, show search results instead. The transition should be seamless -- the search results list uses the same visual style as the normal session list.

**Verification:** Create several test sessions with distinct content. Search for a keyword that appears in one session. Confirm: (a) the search returns the correct session, (b) the snippet preview shows the matching text, (c) date and cost filters work, (d) clicking a result opens/resumes that session, (e) clearing the search restores the normal session list.

---

### Task 4: Git Log / Blame UI

**Files:**
- Modify: `src-tauri/src/git.rs` (add git_log, git_blame, git_diff_commit commands)
- Modify: `src-tauri/src/lib.rs` (register new commands)
- Create: `src/components/git/GitLogPanel.tsx`
- Create: `src/components/git/GitBlame.tsx`
- Modify: `src/components/layout/PrimarySidebar.tsx` (wire Git panel)

This task implements a visual git log viewer and inline blame annotations. The existing `src-tauri/src/git.rs` already has `get_branch`, `get_status`, and `show_file` functions. We need to add `git_log`, `git_blame`, and `git_diff_commit` commands that shell out to the git CLI. The frontend renders a scrollable commit history list and inline blame decorations in the editor.

- [ ] **Step 1: Add git_log command**

Add to `src-tauri/src/git.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GitLogEntry {
    pub hash: String,          // Short hash (7 chars)
    pub hash_full: String,     // Full SHA
    pub message: String,       // First line of commit message
    pub author: String,
    pub author_email: String,
    pub date: String,          // ISO 8601
    pub refs: Vec<String>,     // Branch/tag refs
}

/// Get git log for the given working directory.
/// Returns up to `limit` entries (default 100).
pub fn git_log(cwd: &str, limit: u32) -> Result<Vec<GitLogEntry>, String> {
    let output = Command::new("git")
        .args([
            "log",
            &format!("--max-count={}", limit),
            "--format=%H%n%h%n%s%n%an%n%ae%n%aI%n%D",
            "--no-color",
        ])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git log: {}", e))?;

    // Parse output: each commit is 7 lines (fields) separated by the format,
    // with empty line between commits. Parse accordingly.
    // ...
}
```

The `--format` string uses newlines to separate fields. Parse every 7-line block into a `GitLogEntry`. Handle edge cases: empty repo, detached HEAD, repos with no commits.

- [ ] **Step 2: Add git_blame command**

Add to `src-tauri/src/git.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GitBlameLine {
    pub line_number: u32,
    pub hash: String,           // Short hash
    pub author: String,
    pub date: String,           // ISO 8601
    pub content: String,        // Line content
    pub is_boundary: bool,      // True if this is the initial commit for this line
}

/// Get blame annotations for a file.
pub fn git_blame(cwd: &str, file_path: &str) -> Result<Vec<GitBlameLine>, String> {
    let output = Command::new("git")
        .args(["blame", "--porcelain", file_path])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git blame: {}", e))?;

    // Parse porcelain blame output
    // ...
}
```

The `--porcelain` flag gives machine-readable output. Each section starts with a line containing the commit hash, original line number, final line number, and number of lines in the group. Subsequent lines provide author info, committer info, and the content line (prefixed with a tab).

- [ ] **Step 3: Add git_diff_commit command**

Add to `src-tauri/src/git.rs`:

```rust
/// Get the diff for a specific commit.
pub fn git_diff_commit(cwd: &str, hash: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["diff", &format!("{}~1..{}", hash, hash), "--no-color"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        // Handle first commit (no parent)
        let output = Command::new("git")
            .args(["diff", "--no-color", "4b825dc642cb6eb9a060e54bf899d69f", hash])
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("git diff fallback failed: {}", e))?;
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}
```

The fallback handles the first commit by diffing against the empty tree SHA.

- [ ] **Step 4: Register all new git commands**

Modify `src-tauri/src/lib.rs`. Add `git_log`, `git_blame`, and `git_diff_commit` as Tauri commands. Wrap the `git.rs` functions in `#[tauri::command] #[specta::specta]` handlers following the same pattern as existing commands.

- [ ] **Step 5: Create the GitLogPanel component**

Create `src/components/git/GitLogPanel.tsx`. This is a scrollable list of commits rendered in the primary sidebar's "Git" section (currently a placeholder). Each commit row shows:

- Short hash (monospace, muted color, clickable)
- Commit message (primary text, truncated to one line)
- Author name (secondary text)
- Relative date ("2 hours ago", "3 days ago")
- Branch/tag refs as colored badges

Clicking a commit expands it inline to show the full diff (call `git_diff_commit`). The diff is rendered as a simple code block with green/red line highlighting (additions/deletions), or using the existing diff viewer if available.

Load the first 50 commits on mount. Implement infinite scroll -- when the user scrolls near the bottom, load the next 50.

- [ ] **Step 6: Create the GitBlame component**

Create `src/components/git/GitBlame.tsx`. This component provides inline blame annotations in the Monaco editor using Monaco's decoration API.

When blame is toggled on:
1. Call `git_blame` for the current file.
2. For each line, create a Monaco `IModelDeltaDecoration` that shows `author · date` as a muted inline decoration to the right of the code (using `afterLineNumber` or `inlineClassName`).
3. Group consecutive lines from the same commit -- only show the annotation on the first line of each group.
4. Hovering over a blame annotation shows a tooltip with the full commit message, hash, author, and date.

Provide a toggle button in the editor tab bar or via command palette: "Toggle Git Blame".

- [ ] **Step 7: Wire GitLogPanel into the primary sidebar**

Modify `src/components/layout/PrimarySidebar.tsx`. Replace the Git panel placeholder with the `GitLogPanel` component. The panel should have two sections:
1. **Changes** -- the existing git status display (modified/added/deleted files).
2. **History** -- the new `GitLogPanel` commit list.

Use a collapsible section header for each.

**Verification:** Navigate to a git repo with history. Confirm: (a) git log shows correct commits with hashes, messages, dates, (b) clicking a commit shows its diff, (c) infinite scroll loads more commits, (d) blame annotations appear on file lines and match `git blame` output, (e) blame toggle works.

---

### Task 5: Auto-Update via GitHub Releases

**Files:**
- Modify: `src-tauri/Cargo.toml` (add tauri-plugin-updater)
- Modify: `src-tauri/tauri.conf.json` (add updater plugin config)
- Modify: `src-tauri/src/lib.rs` (register updater plugin)
- Create: `src/components/shared/UpdateNotification.tsx`
- Modify: `src/App.tsx` (check for updates on startup)

This task implements auto-update using Tauri's official updater plugin (`tauri-plugin-updater`). When a new version is published as a GitHub Release, Vantage checks for it on startup (silently), shows a non-intrusive notification if an update is available, and lets the user download and install with one click. The update is applied on next restart.

- [ ] **Step 1: Add tauri-plugin-updater dependency**

Modify `src-tauri/Cargo.toml`. Add to `[dependencies]`:

```toml
tauri-plugin-updater = "2"
```

Also install the JavaScript binding:

```bash
npm install @tauri-apps/plugin-updater
```

- [ ] **Step 2: Configure the updater in tauri.conf.json**

Modify `src-tauri/tauri.conf.json`. Add the updater plugin configuration inside the `plugins` object:

```json
{
  "plugins": {
    "store": {},
    "updater": {
      "endpoints": [
        "https://github.com/YOUR_ORG/vantage/releases/latest/download/latest.json"
      ],
      "pubkey": ""
    }
  }
}
```

The endpoint URL should point to the GitHub Releases URL where `latest.json` is uploaded as a release asset. The `pubkey` field will hold the public key for update signature verification -- generate a keypair with `tauri signer generate -w ~/.tauri/vantage.key` and put the public key here. For initial development, signature verification can be configured later.

Note: The actual GitHub org/repo name should match wherever Vantage is hosted. Use a placeholder that the developer will replace.

- [ ] **Step 3: Register the updater plugin in Rust**

Modify `src-tauri/src/lib.rs`. In the Tauri builder chain, add `.plugin(tauri_plugin_updater::Builder::new().build())` alongside the other plugins.

- [ ] **Step 4: Create the UpdateNotification component**

Create `src/components/shared/UpdateNotification.tsx`. This is a toast-style notification that appears at the bottom-right of the window when an update is available.

```tsx
import { useState, useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export function UpdateNotification() {
  const [update, setUpdate] = useState<{
    version: string;
    body: string;
  } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Check for updates 5 seconds after startup (don't block launch)
    const timer = setTimeout(async () => {
      try {
        const available = await check();
        if (available) {
          setUpdate({
            version: available.version,
            body: available.body ?? "",
          });
        }
      } catch {
        // Silent failure -- update check is non-critical
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleUpdate = async () => {
    setDownloading(true);
    try {
      const available = await check();
      if (available) {
        await available.downloadAndInstall((event) => {
          if (event.event === "Started" && event.data.contentLength) {
            // Total size known
          } else if (event.event === "Progress") {
            setProgress((prev) => prev + event.data.chunkLength);
          } else if (event.event === "Finished") {
            // Download complete
          }
        });
        await relaunch();
      }
    } catch (err) {
      console.error("Update failed:", err);
      setDownloading(false);
    }
  };

  if (!update) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 ...styles...">
      <div>Update available: v{update.version}</div>
      <p className="text-xs text-muted">{update.body}</p>
      <button onClick={handleUpdate} disabled={downloading}>
        {downloading ? `Downloading...` : "Download & Restart"}
      </button>
      <button onClick={() => setUpdate(null)}>Later</button>
    </div>
  );
}
```

Style the notification to match the Vantage theme: use `--color-surface-0` background, `--color-text` foreground, `--color-blue` accent for the download button. Use existing shadcn Button and Card components if possible.

- [ ] **Step 5: Mount UpdateNotification in App.tsx**

Modify `src/App.tsx`. Render `<UpdateNotification />` at the root level so it appears over all other content. It should only render once and manages its own state.

- [ ] **Step 6: Add "Check for Updates" command**

Register a command palette entry "Check for Updates" that manually triggers the update check and shows results in a toast (either "Up to date" or the update notification). This lets users manually check without waiting for the startup check.

**Verification:** This cannot be fully tested without a published release, but verify: (a) the plugin initializes without errors on startup, (b) the `check()` call completes (returns null when no update exists), (c) the notification component renders correctly when given mock data, (d) the "Later" button dismisses the notification.

---

### Task 6: Usage Analytics Dashboard

**Files:**
- Create: `src/components/analytics/UsageDashboard.tsx`
- Create: `src/components/analytics/CostChart.tsx`
- Create: `src/components/analytics/ModelDistribution.tsx`
- Create: `src/components/analytics/SessionsPerDay.tsx`
- Create: `src-tauri/src/analytics.rs`
- Modify: `src-tauri/src/lib.rs` (register analytics commands)
- Modify: `src/stores/commandPalette.ts` (add "Open Analytics" command)

This task creates a usage analytics dashboard that aggregates cost, token, and session data from Claude Code's session history files. The data source is the same JSONL files in `~/.claude/projects/` that the session search reads. The dashboard provides charts for: daily cost over time, token usage by model, sessions per day, and average cost per session. This gives developers visibility into their Claude Code spending.

- [ ] **Step 1: Install recharts**

Run `npm install recharts`. Recharts is a composable React charting library built on D3. It provides `BarChart`, `PieChart`, `LineChart`, `ResponsiveContainer`, and other components.

- [ ] **Step 2: Create the analytics Rust backend**

Create `src-tauri/src/analytics.rs`. This module reads JSONL session files and aggregates data.

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DailyCost {
    pub date: String,         // "2026-04-01"
    pub total_cost_usd: f64,
    pub session_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ModelUsage {
    pub model: String,
    pub total_cost_usd: f64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub session_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AnalyticsSummary {
    pub daily_costs: Vec<DailyCost>,
    pub model_usage: Vec<ModelUsage>,
    pub total_cost_usd: f64,
    pub total_sessions: u32,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub avg_cost_per_session: f64,
    pub date_range_start: Option<String>,
    pub date_range_end: Option<String>,
}

/// Aggregate analytics from all session files in ~/.claude/projects/
/// `days` limits to the last N days (0 = all time).
pub fn get_analytics(days: u32) -> Result<AnalyticsSummary, String> {
    // 1. Find ~/.claude/projects/ directory
    // 2. Walk all .jsonl files
    // 3. For each file, parse result messages to extract cost, tokens, model
    // 4. Group by date and model
    // 5. Return aggregated summary
}
```

Each JSONL session file contains `result` messages with fields like `costUSD`, `usage.input_tokens`, `usage.output_tokens`, `model`, and timestamps. Parse these to build the aggregation.

- [ ] **Step 3: Register analytics command**

Modify `src-tauri/src/lib.rs`. Add `mod analytics;` and register `get_analytics` as a Tauri command.

- [ ] **Step 4: Create the CostChart component**

Create `src/components/analytics/CostChart.tsx`. Renders a bar chart of daily cost using recharts `BarChart`. X-axis is date, Y-axis is cost in USD. Bar color uses `--color-blue`. Tooltip shows exact cost and session count for each day.

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface CostChartProps {
  data: Array<{ date: string; total_cost_usd: number; session_count: number }>;
}

export function CostChart({ data }: CostChartProps) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data}>
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => `$${v.toFixed(2)}`} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number) => [`$${value.toFixed(4)}`, "Cost"]}
          contentStyle={{ backgroundColor: "var(--color-surface-0)", border: "none" }}
        />
        <Bar dataKey="total_cost_usd" fill="var(--color-blue)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 5: Create the ModelDistribution component**

Create `src/components/analytics/ModelDistribution.tsx`. Renders a pie chart of cost by model using recharts `PieChart`. Each slice is a different model. Colors cycle through `--color-blue`, `--color-green`, `--color-peach`, `--color-mauve`, `--color-teal`. Labels show model name and percentage.

- [ ] **Step 6: Create the SessionsPerDay component**

Create `src/components/analytics/SessionsPerDay.tsx`. Renders a line chart of session count per day. Simple and clean -- X-axis dates, Y-axis integer counts. Uses recharts `LineChart` with `Line` element.

- [ ] **Step 7: Create the UsageDashboard container**

Create `src/components/analytics/UsageDashboard.tsx`. This is the main dashboard that fetches data and lays out the charts.

Layout:
```
+------------------------------------------------------+
| Usage Analytics                    [7d] [30d] [All]  |
+------------------------------------------------------+
| Total Cost: $X.XX  |  Sessions: N  |  Avg: $X.XX    |
+------------------------------------------------------+
|                                                      |
|  Daily Cost                                          |
|  [==== Bar Chart ====]                               |
|                                                      |
+------------------------------------------------------+
|                          |                           |
|  Cost by Model           |  Sessions per Day         |
|  [Pie Chart]             |  [Line Chart]             |
|                          |                           |
+------------------------------------------------------+
```

The dashboard calls `invoke("get_analytics", { days })` on mount with the selected time range. Summary stats are displayed as large numbers at the top. Charts fill the remaining space.

- [ ] **Step 8: Add "Open Analytics" to command palette**

Register a command palette entry "Open Usage Analytics" that opens the analytics dashboard. The dashboard can be rendered as: (a) a new tab in the editor area (like a special "file"), (b) a full-page overlay, or (c) a panel in the secondary sidebar. Option (a) is most consistent with IDE conventions -- treat it like a special editor tab.

**Verification:** Use Claude Code for several sessions to generate history data. Open the analytics dashboard. Confirm: (a) daily cost chart shows correct bars, (b) model pie chart shows the correct distribution, (c) session count matches reality, (d) switching time ranges (7d/30d/all) updates the data, (e) charts render correctly in both dark and light themes.

---

### Task 7: Theme Customization via JSON

**Files:**
- Create: `src/lib/themeCustomization.ts`
- Modify: `src/App.tsx` (load custom theme on startup)
- Modify: `src/stores/settings.ts` (add customThemePath setting)
- Modify: `src-tauri/src/lib.rs` (add read/write theme file commands)

This task allows users to override any CSS variable by editing a JSON file at `~/.vantage/theme.json`. This enables deep customization without modifying source code. The JSON file maps CSS variable names to values. On startup, Vantage reads the file and applies overrides on top of the active theme. An "Edit Theme" button in settings opens the file in the editor with live preview.

- [ ] **Step 1: Define the theme.json schema**

Create `src/lib/themeCustomization.ts`. Define the expected structure:

```typescript
/**
 * User theme customization file.
 * Located at ~/.vantage/theme.json
 * 
 * Any key is a CSS custom property name (without --).
 * Values are CSS color strings.
 */
export interface ThemeCustomization {
  /** Display name for this custom theme */
  name?: string;
  /** Base theme to customize on top of: "vantage-dark" | "vantage-light" | "vantage-high-contrast" */
  base?: string;
  /** CSS variable overrides */
  colors?: Record<string, string>;
}

// Example theme.json:
// {
//   "name": "My Custom Theme",
//   "base": "vantage-dark",
//   "colors": {
//     "color-base": "#1a1b26",
//     "color-blue": "#7aa2f7",
//     "color-green": "#9ece6a"
//   }
// }
```

Export functions:
- `loadCustomTheme(): Promise<ThemeCustomization | null>` -- Reads `~/.vantage/theme.json` via Tauri invoke. Returns null if file doesn't exist.
- `applyCustomTheme(customization: ThemeCustomization)` -- Sets CSS variables on `document.documentElement.style` for each entry in `colors`.
- `removeCustomTheme()` -- Removes all custom CSS variable overrides (resets to base theme).
- `getThemeFilePath(): Promise<string>` -- Returns the absolute path to `~/.vantage/theme.json`.

- [ ] **Step 2: Add Rust commands for theme file I/O**

Modify `src-tauri/src/lib.rs` (or create a small module). Add:
- `read_theme_file() -> Option<String>` -- Reads `~/.vantage/theme.json`, returns None if not found.
- `write_theme_file(content: String)` -- Writes to `~/.vantage/theme.json`, creating `~/.vantage/` directory if needed.
- `get_theme_file_path() -> String` -- Returns the absolute path.

- [ ] **Step 3: Load custom theme on startup**

Modify `src/App.tsx`. After applying the base theme (from settings store), call `loadCustomTheme()`. If a custom theme exists, apply it via `applyCustomTheme()`. This happens in a `useEffect` that runs after the initial render.

- [ ] **Step 4: Add "Edit Theme" action**

Add a command palette entry "Customize Theme" and/or a button in the settings UI that:
1. Calls `getThemeFilePath()` to get the file path.
2. If the file doesn't exist, creates it with a template (the current theme's variables as a starting point).
3. Opens the file in the editor (add as a new tab).
4. Sets up a file watcher (or uses the editor's onChange) to re-apply the theme as the user edits. This gives live preview.

- [ ] **Step 5: Live preview on edit**

When the theme.json file is open in the editor and the user makes changes, debounce-parse the JSON (500ms) and call `applyCustomTheme()` with the new values. If the JSON is invalid, do nothing (don't flash errors while typing). This creates a live preview loop: edit a color value, see it change immediately across the UI.

**Verification:** Create a `~/.vantage/theme.json` with a few color overrides (e.g., change `color-base` to a different background). Restart Vantage. Confirm: (a) the overrides apply on startup, (b) editing the file in the editor updates colors live, (c) deleting the file and restarting restores the base theme, (d) invalid JSON is handled gracefully (no crash, no error flash).

---

### Task 8: Checkpoint / Restore for Agent Changes (Simplified)

**Files:**
- Create: `src-tauri/src/checkpoint.rs`
- Modify: `src-tauri/src/lib.rs` (register checkpoint commands)
- Create: `src/components/agents/CheckpointControls.tsx`
- Modify: `src/stores/agents.ts` (add checkpoint metadata)

This task implements a simplified checkpoint/restore system that lets users revert the filesystem to its state before an agent made changes. The implementation uses git tags (not stash, which has side effects on the working tree). Before an agent starts working, Vantage creates a lightweight git tag marking the current HEAD. After the agent finishes, the user can "restore to before agent" with one click, which does a `git reset --hard` to the tagged commit. This is intentionally simple -- not a full branching model.

- [ ] **Step 1: Create the checkpoint Rust module**

Create `src-tauri/src/checkpoint.rs`.

```rust
use std::process::Command;
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Checkpoint {
    pub tag_name: String,
    pub commit_hash: String,
    pub created_at: String,     // ISO 8601
    pub agent_id: String,
    pub agent_name: String,
}

/// Create a checkpoint tag before an agent starts.
/// Tag name: vantage-checkpoint/<agent_id>/<timestamp>
pub fn create_checkpoint(cwd: &str, agent_id: &str, agent_name: &str) -> Result<Checkpoint, String> {
    // 1. Get current HEAD hash
    let hash = get_head_hash(cwd)?;
    
    // 2. Create timestamp
    let timestamp = chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string();
    // Note: use std::time instead of chrono to avoid adding a dependency.
    // Or simply shell out: git log -1 --format=%aI HEAD
    
    // 3. Create lightweight tag
    let tag_name = format!("vantage-checkpoint/{}/{}", agent_id, timestamp);
    Command::new("git")
        .args(["tag", &tag_name, &hash])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to create checkpoint tag: {}", e))?;

    Ok(Checkpoint { tag_name, commit_hash: hash, created_at: timestamp, agent_id: agent_id.to_string(), agent_name: agent_name.to_string() })
}

/// Restore to a checkpoint. This does a hard reset.
/// WARNING: This discards all uncommitted changes.
pub fn restore_checkpoint(cwd: &str, tag_name: &str) -> Result<(), String> {
    let output = Command::new("git")
        .args(["reset", "--hard", tag_name])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to restore checkpoint: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

/// List all vantage checkpoints.
pub fn list_checkpoints(cwd: &str) -> Result<Vec<Checkpoint>, String> {
    let output = Command::new("git")
        .args(["tag", "-l", "vantage-checkpoint/*"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to list checkpoints: {}", e))?;

    // Parse tag names and resolve commit hashes
    // ...
}

/// Delete a checkpoint tag.
pub fn delete_checkpoint(cwd: &str, tag_name: &str) -> Result<(), String> {
    Command::new("git")
        .args(["tag", "-d", tag_name])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to delete checkpoint: {}", e))?;
    Ok(())
}
```

Use `std::time::SystemTime` for timestamps instead of adding the `chrono` crate. Format as a simple `YYYYMMDD-HHMMSS` string by extracting the duration since UNIX epoch.

- [ ] **Step 2: Register checkpoint commands**

Modify `src-tauri/src/lib.rs`. Add `mod checkpoint;` and register `create_checkpoint`, `restore_checkpoint`, `list_checkpoints`, and `delete_checkpoint` as Tauri commands.

- [ ] **Step 3: Add checkpoint metadata to the agents store**

Modify `src/stores/agents.ts`. Add a `checkpoint` field to the `Agent` interface:

```typescript
interface Agent {
  // ... existing fields ...
  checkpoint?: {
    tagName: string;
    commitHash: string;
    createdAt: string;
  };
}
```

When an agent transitions to `"working"` status, automatically create a checkpoint (call `invoke("create_checkpoint", { cwd, agentId, agentName })`). Store the result in the agent's `checkpoint` field.

- [ ] **Step 4: Create the CheckpointControls component**

Create `src/components/agents/CheckpointControls.tsx`. This component renders in the agent detail panel (or the kanban card expanded view). It shows:

1. A "Checkpoint" badge if a checkpoint exists for this agent, showing the commit hash.
2. A "Restore" button that, when clicked:
   a. Shows a confirmation dialog: "Restore to before [agent name] started? This will discard all changes since commit [hash]. This cannot be undone."
   b. On confirm, calls `invoke("restore_checkpoint", { cwd, tagName })`.
   c. Shows a success toast.
   d. Refreshes the file tree and git status.
3. A "Delete Checkpoint" button (secondary, less prominent) to clean up old tags.

```tsx
function CheckpointControls({ agent }: { agent: Agent }) {
  if (!agent.checkpoint) return null;

  const handleRestore = async () => {
    const confirmed = await confirm(
      `Restore to before "${agent.name}" started?\n\nThis will reset to commit ${agent.checkpoint.commitHash}.\nAll uncommitted changes will be lost.`
    );
    if (!confirmed) return;

    await invoke("restore_checkpoint", {
      cwd: agent.worktreePath ?? projectRoot,
      tagName: agent.checkpoint.tagName,
    });
    // Refresh file tree, git status
    toast.success("Restored to checkpoint");
  };

  return (
    <div className="flex items-center gap-2">
      <Badge>Checkpoint: {agent.checkpoint.commitHash.slice(0, 7)}</Badge>
      <Button variant="destructive" size="sm" onClick={handleRestore}>
        Restore
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Auto-create checkpoints on agent start**

Wire the checkpoint creation into the agent lifecycle. In the agents store or in the hook that starts an agent session, add logic: when `startAgent(agentId)` is called, first call `create_checkpoint`, then start the Claude process. Update the agent's `checkpoint` field with the result. If the agent uses a git worktree, create the checkpoint in the worktree's directory.

**Verification:** Start an agent that modifies files. After it completes, click "Restore". Confirm: (a) the checkpoint tag was created before the agent started, (b) restoring resets files to the pre-agent state, (c) the confirmation dialog appears before destructive action, (d) the checkpoint tag is listed in `git tag -l "vantage-checkpoint/*"`, (e) deleting a checkpoint removes the tag.

---

### Task 9: Integration Testing and Phase Completion

**Files:**
- Modify: `src/App.tsx` (final wiring review)
- No new files

This task performs end-to-end verification of all Phase 6 features, runs a production build, and tags the completion commit. No new code is written -- this is purely verification, bug fixing, and release preparation.

- [ ] **Step 1: Theme switching integration test**

Test the full theme switching flow:
1. Start Vantage with the default dark theme.
2. Switch to light theme via settings/command palette. Verify all panels update: editor, terminal, sidebar, status bar, chat panel, file tree.
3. Switch to high contrast theme. Verify contrast ratios on primary text (should be 7:1+ against background).
4. Switch back to dark. Verify no remnant light theme styles.
5. Set a custom theme.json with one override. Verify it applies on top of the base theme.
6. Restart Vantage. Verify the selected theme persists.

- [ ] **Step 2: Vim mode integration test**

1. Enable vim mode.
2. Open a file. Verify `hjkl` navigation, `i` for insert, `Esc` for normal, `dd` to delete line, `yy`/`p` to yank/paste.
3. Verify the vim status bar shows mode changes.
4. Disable vim mode. Verify standard Monaco keybindings restore.
5. Restart. Verify vim mode preference persists.

- [ ] **Step 3: Session search integration test**

1. Ensure at least 3 sessions exist with different content.
2. Search for a keyword unique to one session. Verify it appears in results.
3. Filter by date range. Verify filtering works.
4. Sort by cost. Verify order changes.
5. Click a search result. Verify it navigates to that session.

- [ ] **Step 4: Git log/blame integration test**

1. Open a project with git history.
2. Open the git log panel. Verify commits display correctly.
3. Click a commit. Verify the diff renders.
4. Scroll down. Verify infinite scroll loads more commits.
5. Open a file. Toggle blame. Verify annotations appear.
6. Toggle blame off. Verify annotations disappear.

- [ ] **Step 5: Auto-update integration test**

1. Start Vantage. Verify no console errors from the updater plugin.
2. Run "Check for Updates" from command palette. Verify it responds (either "up to date" or shows update info).
3. Verify the UpdateNotification component renders when given mock update data (test by temporarily hardcoding).

- [ ] **Step 6: Analytics dashboard integration test**

1. Ensure session history exists.
2. Open the analytics dashboard.
3. Verify the daily cost chart renders with correct data.
4. Verify the model distribution pie chart appears.
5. Switch time ranges (7d / 30d / all). Verify data updates.
6. Verify charts render correctly in both dark and light themes.

- [ ] **Step 7: Checkpoint/restore integration test**

1. Start an agent on a clean repo.
2. Let it modify at least one file.
3. Verify a checkpoint tag was created (`git tag -l "vantage-checkpoint/*"`).
4. Click "Restore". Accept the confirmation.
5. Verify the file is restored to its pre-agent state.
6. Verify the checkpoint tag can be deleted.

- [ ] **Step 8: Production build and tagging**

1. Run `npm run build` -- verify zero TypeScript errors.
2. Run `npm run tauri build` -- verify the NSIS installer generates successfully.
3. Test the built installer on a clean Windows 11 machine (or fresh user profile).
4. Create a git tag: `git tag -a phase-6-complete -m "Phase 6: P2 polish features complete"`.

**Verification:** All sub-tests above pass. The production build succeeds. The tag is created.

---

## Deferred to P3

The following P2 features were assessed and deferred:

| Feature | Reason for Deferral |
|---------|-------------------|
| **LSP integration** (#31) | Monaco already provides built-in TypeScript/JavaScript language intelligence (completions, diagnostics, hover info) via its bundled language services. A full LSP bridge (spawning external language servers from Rust and bridging their JSON-RPC to Monaco via Tauri IPC) is architecturally complex and provides marginal value given Monaco's existing capabilities. Deferred to P3. |
| **Floating windows / popout tabs** (#28) | Requires Tauri multi-window support, cross-window state synchronization, and window management (position persistence, focus handling). This is a large surface area with many edge cases on Windows (DPI awareness across monitors, window snapping). Deferred to P3. |

## Dependency Summary

**New npm packages:**
- `monaco-vim` -- Vim keybinding layer for Monaco editor
- `recharts` -- React charting library for analytics dashboard
- `@tauri-apps/plugin-updater` -- JavaScript bindings for Tauri updater

**New Cargo dependencies:**
- `tauri-plugin-updater = "2"` -- Tauri auto-update plugin

**No other new dependencies.** All other functionality (session search, git log/blame, checkpoints, themes) is implemented using existing packages and standard library features.
