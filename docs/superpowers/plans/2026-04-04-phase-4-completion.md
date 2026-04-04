# Vantage Phase 4: Completion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining P0 features -- command palette, inline diff viewer, first-launch checks, git integration, and markdown preview -- to reach a shippable 1.0.

**Architecture:** Frontend-heavy phase. Command palette uses shadcn Command (cmdk). Git integration uses shell-out commands to `git.exe` from Rust. Markdown preview uses react-markdown (already installed). First-launch check runs Rust commands on startup. Inline diff uses Monaco's built-in diff editor.

**Tech Stack:** cmdk (via shadcn Command), react-markdown + remark-gfm (already installed), Monaco diff editor (built in), git CLI shell-out from Rust

---

### Task 1: Command Palette

**Files:**
- Create: `src/components/shared/CommandPalette.tsx`
- Create: `src/stores/commandPalette.ts`
- Modify: `src/hooks/useKeybindings.ts`
- Modify: `src/App.tsx`

This task implements the command palette (Ctrl+Shift+P) with three modes: commands, file search, and go-to-line. It uses the existing shadcn Command component at `src/components/ui/command.tsx` which wraps cmdk. The command palette is arguably the single most important IDE UX pattern -- every user expects it.

- [ ] **Step 1: Create command palette Zustand store**

Create `src/stores/commandPalette.ts`. This store manages the open/close state and active mode of the command palette.

```typescript
import { create } from "zustand";

export type PaletteMode = "commands" | "files" | "goto";

export interface CommandPaletteState {
  isOpen: boolean;
  mode: PaletteMode;
  /** The raw search input text */
  searchText: string;
  open: (mode?: PaletteMode) => void;
  close: () => void;
  setMode: (mode: PaletteMode) => void;
  setSearchText: (text: string) => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>()((set) => ({
  isOpen: false,
  mode: "commands",
  searchText: "",

  open: (mode = "commands") =>
    set({ isOpen: true, mode, searchText: mode === "commands" ? ">" : "" }),

  close: () =>
    set({ isOpen: false, searchText: "" }),

  setMode: (mode) =>
    set({ mode }),

  setSearchText: (text) => {
    // Auto-detect mode from prefix
    if (text.startsWith(">")) {
      set({ searchText: text, mode: "commands" });
    } else if (text.startsWith(":")) {
      set({ searchText: text, mode: "goto" });
    } else {
      set({ searchText: text, mode: "files" });
    }
  },
}));
```

- [ ] **Step 2: Create the CommandPalette component**

Create `src/components/shared/CommandPalette.tsx`. This component renders differently based on the active mode. It uses `CommandDialog` from shadcn's command.tsx.

**Structure:**

```tsx
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import {
  FileCode,
  Terminal,
  PanelLeft,
  PanelRight,
  PanelBottom,
  Settings,
  Search,
  GitBranch,
  Bot,
  ArrowRightToLine,
  Hash,
} from "lucide-react";
import { useCommandPaletteStore } from "@/stores/commandPalette";
import { useLayoutStore } from "@/stores/layout";
import { useEditorStore } from "@/stores/editor";
import type { FileNode } from "@/hooks/useFileTree";
```

**Command definitions array** -- define all available commands as an array of objects:

```typescript
interface CommandDef {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  category: string;
  action: () => void;
}
```

Build the commands array inside the component body so it has access to store actions. Include these commands:
- Toggle Primary Sidebar (Ctrl+B)
- Toggle Secondary Sidebar / Chat (Ctrl+Shift+B)
- Toggle Panel / Terminal (Ctrl+J)
- Focus File Explorer (Ctrl+Shift+E)
- Focus Search (Ctrl+Shift+F)
- Focus Source Control (Ctrl+Shift+G)
- Focus Agents (Ctrl+Shift+A)
- Open Settings (Ctrl+,)
- New Terminal (Ctrl+Shift+`)
- Close Active Tab (Ctrl+W)

**Commands mode rendering** (when mode === "commands"):
- Filter the commands array by the search text (strip the leading `>` before matching)
- Group commands by category
- Each `CommandItem` shows icon, label, and `CommandShortcut` for the keybinding hint

**Files mode rendering** (when mode === "files"):
- On mode change to "files", call `invoke("get_file_tree", { path: rootPath, depth: 10 })` to get a deep tree
- Flatten the tree recursively into a flat array of `{ name, path, extension }` for files only (skip directories)
- Filter the flat list by the search text using simple substring match (cmdk handles fuzzy scoring internally)
- Each `CommandItem` shows a file icon and the relative path
- On select: call `invoke("read_file", { path })`, then `openFile(...)` from editor store, then close palette

**Go-to-line mode rendering** (when mode === "goto"):
- Parse the number after the `:` prefix
- Show a single item: "Go to Line {N}"
- On select: get the active Monaco editor instance and call `editor.revealLineInCenter(lineNumber)` and `editor.setPosition({ lineNumber, column: 1 })`
- For accessing the Monaco editor instance, use `monaco.editor.getEditors()[0]` (the global registry)

**Mode-switching behavior:**
- When the user types `>` at the start, switch to commands mode
- When the user types `:` at the start, switch to goto mode
- When the user clears the prefix or types anything else, switch to files mode
- Use `onValueChange` on the `CommandInput` to call `setSearchText`

**Component body:**

```tsx
export function CommandPalette() {
  const { isOpen, mode, searchText, close, setSearchText } =
    useCommandPaletteStore();
  const [fileList, setFileList] = useState<{ name: string; path: string; extension: string | null }[]>([]);

  // ... commands array built from store actions ...

  // Fetch files when mode switches to "files"
  useEffect(() => {
    if (!isOpen || mode !== "files") return;
    // Get rootPath from the file tree hook or a global setting
    // For now, use the conversation store's cwd or a stored rootPath
    const fetchFiles = async () => {
      try {
        const tree = await invoke<FileNode[]>("get_file_tree", { path: rootPath, depth: 10 });
        const flat = flattenTree(tree);
        setFileList(flat);
      } catch {
        setFileList([]);
      }
    };
    fetchFiles();
  }, [isOpen, mode]);

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <Command shouldFilter={mode !== "goto"}>
        <CommandInput
          placeholder={
            mode === "commands" ? "Type a command..." :
            mode === "goto" ? "Type a line number..." :
            "Search files by name..."
          }
          value={searchText}
          onValueChange={setSearchText}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {mode === "commands" && <CommandsView ... />}
          {mode === "files" && <FilesView ... />}
          {mode === "goto" && <GoToLineView ... />}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
```

**Helper function to flatten the file tree:**

```typescript
function flattenTree(
  nodes: FileNode[],
  result: { name: string; path: string; extension: string | null }[] = []
): { name: string; path: string; extension: string | null }[] {
  for (const node of nodes) {
    if (node.is_file) {
      result.push({ name: node.name, path: node.path, extension: node.extension });
    }
    if (node.children) {
      flattenTree(node.children, result);
    }
  }
  return result;
}
```

Style the command palette with Catppuccin colors by overriding the default shadcn styles via inline styles or className overrides:
- Background: `var(--color-surface-0)`
- Text: `var(--color-text)`
- Border: `var(--color-surface-1)`
- Selected item: `var(--color-surface-1)` background

Note: The `rootPath` for file search needs to come from somewhere accessible. The simplest approach is to store it in the layout store or read it from `useFileTree`. Since `useFileTree` is a hook used in `FileExplorer`, add a `rootPath` field to the layout store (see Step 3).

- [ ] **Step 3: Add rootPath to layout store**

Modify `src/stores/layout.ts` to add a `projectRootPath` field so the command palette can access it without being inside the FileExplorer component tree.

Add to the `LayoutState` interface:

```typescript
projectRootPath: string | null;
setProjectRootPath: (path: string | null) => void;
```

Add to the store implementation:

```typescript
projectRootPath: null,
setProjectRootPath: (path) => set({ projectRootPath: path }),
```

Add `projectRootPath` to the `partialize` config so it persists.

Then update `src/hooks/useFileTree.ts` -- in the `setRootPath` callback, also call `useLayoutStore.getState().setProjectRootPath(path)` so the command palette can read it.

- [ ] **Step 4: Wire CommandPalette into App.tsx**

Modify `src/App.tsx` to import and render the `CommandPalette` component:

```tsx
import { CommandPalette } from "@/components/shared/CommandPalette";

function App() {
  useKeybindings();

  return (
    <>
      <IDELayout />
      <CommandPalette />
      <PermissionDialog />
      <Toaster ... />
    </>
  );
}
```

- [ ] **Step 5: Replace keybinding placeholders with real palette openers**

Modify `src/hooks/useKeybindings.ts`:

1. Import `useCommandPaletteStore`
2. Get the `open` action: `const openPalette = useCommandPaletteStore((s) => s.open);`
3. Replace the Ctrl+Shift+P toast placeholder with:
   ```typescript
   {
     key: "p",
     ctrl: true,
     shift: true,
     action: () => openPalette("commands"),
     description: "Open Command Palette",
   },
   ```
4. Add a new Ctrl+P binding for quick file open:
   ```typescript
   {
     key: "p",
     ctrl: true,
     action: () => openPalette("files"),
     description: "Quick Open File",
   },
   ```
5. Add a Ctrl+G binding for go-to-line:
   ```typescript
   {
     key: "g",
     ctrl: true,
     action: () => openPalette("goto"),
     description: "Go to Line",
   },
   ```

**Acceptance criteria (P0 Feature 5):**
- Ctrl+Shift+P opens command palette in commands mode
- Ctrl+P opens command palette in files mode
- Ctrl+G opens command palette in go-to-line mode
- Typing `>` prefix switches to commands, `:` switches to go-to-line, anything else is file search
- Selecting a command executes it
- Selecting a file opens it in the editor
- Go-to-line jumps the cursor to the specified line in the active editor
- Escape closes the palette
- Keybinding hints are shown next to commands

---

### Task 2: Git Integration (Rust + Frontend)

**Files:**
- Create: `src-tauri/src/git.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/components/files/FileTreeNode.tsx`
- Create: `src/hooks/useGitStatus.ts`

This task adds basic git integration: showing the real branch name in the status bar and git status indicators (M/A/D/?) next to files in the explorer. It uses shell-out to `git.exe` rather than the git2 crate, because git CLI is fast for these simple operations and avoids adding a heavy dependency.

- [ ] **Step 1: Create the git Rust module**

Create `src-tauri/src/git.rs` with two Tauri commands that shell out to git:

```rust
use serde::{Deserialize, Serialize};
use specta::Type;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GitBranchInfo {
    pub branch: Option<String>,
    pub is_detached: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GitFileStatus {
    /// The relative file path (forward slashes)
    pub path: String,
    /// Status code: "M" (modified), "A" (added), "D" (deleted),
    /// "R" (renamed), "?" (untracked), "!" (ignored)
    pub status: String,
    /// Whether the file is staged
    pub is_staged: bool,
}

/// Get the current git branch name for the given working directory.
/// Returns None for branch if not in a git repo.
pub fn get_branch(cwd: &str) -> Result<GitBranchInfo, String> {
    // Try symbolic-ref first (works for normal branches)
    let output = Command::new("git")
        .args(["symbolic-ref", "--short", "HEAD"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok(GitBranchInfo {
            branch: Some(branch),
            is_detached: false,
        });
    }

    // Fallback: detached HEAD -- get short commit hash
    let output = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if output.status.success() {
        let hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok(GitBranchInfo {
            branch: Some(hash),
            is_detached: true,
        });
    }

    // Not a git repo or git not available
    Ok(GitBranchInfo {
        branch: None,
        is_detached: false,
    })
}

/// Get the git status of all changed files in the working directory.
/// Uses `git status --porcelain=v1` for machine-readable output.
pub fn get_status(cwd: &str) -> Result<Vec<GitFileStatus>, String> {
    let output = Command::new("git")
        .args(["status", "--porcelain=v1", "-uall"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        return Ok(vec![]); // Not a git repo, return empty
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut results = Vec::new();

    for line in stdout.lines() {
        if line.len() < 4 { continue; }
        let index_status = line.chars().nth(0).unwrap_or(' ');
        let worktree_status = line.chars().nth(1).unwrap_or(' ');
        let file_path = line[3..].to_string().replace('\\', "/");

        // Determine the display status and staged flag
        let (status, is_staged) = match (index_status, worktree_status) {
            ('?', '?') => ("?".to_string(), false),   // Untracked
            ('!', '!') => ("!".to_string(), false),   // Ignored
            (idx, ' ') if idx != ' ' => (idx.to_string(), true),   // Staged only
            (' ', wt) if wt != ' ' => (wt.to_string(), false),    // Unstaged only
            (idx, _wt) if idx != ' ' => (idx.to_string(), true),   // Both (show staged)
            _ => continue,
        };

        results.push(GitFileStatus {
            path: file_path,
            status,
            is_staged,
        });
    }

    Ok(results)
}
```

- [ ] **Step 2: Register git commands in lib.rs**

Modify `src-tauri/src/lib.rs`:

1. Add `mod git;` at the top (alongside `mod claude;`, `mod files;`, `mod terminal;`)
2. Add the Tauri command wrappers:

```rust
#[tauri::command]
#[specta::specta]
fn get_git_branch(cwd: String) -> Result<git::GitBranchInfo, String> {
    git::get_branch(&cwd)
}

#[tauri::command]
#[specta::specta]
fn get_git_status(cwd: String) -> Result<Vec<git::GitFileStatus>, String> {
    git::get_status(&cwd)
}
```

3. Add both commands to the `tauri_specta::collect_commands![]` macro call.

- [ ] **Step 3: Create the useGitStatus hook**

Create `src/hooks/useGitStatus.ts`. This hook polls for git status periodically and on file change events.

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface GitBranchInfo {
  branch: string | null;
  is_detached: boolean;
}

export interface GitFileStatus {
  path: string;
  status: string;
  is_staged: boolean;
}

interface UseGitStatusReturn {
  branch: GitBranchInfo | null;
  fileStatuses: Map<string, GitFileStatus>;
  isGitRepo: boolean;
  refresh: () => void;
}

export function useGitStatus(rootPath: string | null): UseGitStatusReturn {
  const [branch, setBranch] = useState<GitBranchInfo | null>(null);
  const [fileStatuses, setFileStatuses] = useState<Map<string, GitFileStatus>>(new Map());
  const [isGitRepo, setIsGitRepo] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!rootPath) return;

    try {
      const branchInfo = await invoke<GitBranchInfo>("get_git_branch", { cwd: rootPath });
      setBranch(branchInfo);
      setIsGitRepo(branchInfo.branch !== null);

      if (branchInfo.branch !== null) {
        const statuses = await invoke<GitFileStatus[]>("get_git_status", { cwd: rootPath });
        const statusMap = new Map<string, GitFileStatus>();
        for (const status of statuses) {
          // Normalize path: make it absolute by prepending rootPath
          const fullPath = status.path.startsWith("/") || status.path.includes(":")
            ? status.path
            : `${rootPath}/${status.path}`;
          statusMap.set(fullPath.replace(/\\/g, "/"), status);
        }
        setFileStatuses(statusMap);
      }
    } catch {
      setIsGitRepo(false);
      setBranch(null);
      setFileStatuses(new Map());
    }
  }, [rootPath]);

  // Initial fetch and poll every 5 seconds
  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  // Also refresh on file change events
  useEffect(() => {
    const unlisten = listen("file_changed", () => {
      refresh();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [refresh]);

  return { branch, fileStatuses, isGitRepo, refresh };
}
```

- [ ] **Step 4: Update StatusBar to show real git branch**

Modify `src/components/layout/StatusBar.tsx`:

1. Import `useGitStatus` and `useLayoutStore`
2. Get `projectRootPath` from `useLayoutStore`
3. Call `useGitStatus(projectRootPath)` to get the branch info
4. Replace the hardcoded `<span>main</span>` with the real branch name:

```tsx
const { branch, isGitRepo } = useGitStatus(projectRootPath);
```

In the JSX, replace the git branch section:

```tsx
{/* Git branch */}
{isGitRepo && branch?.branch && (
  <button
    className="flex items-center gap-1 hover:text-[var(--color-text)] transition-colors"
    aria-label={`Git branch: ${branch.branch}`}
  >
    <GitBranch size={12} />
    <span>{branch.is_detached ? `(${branch.branch})` : branch.branch}</span>
  </button>
)}
```

If `isGitRepo` is false, hide the branch indicator entirely.

- [ ] **Step 5: Add git status indicators to FileTreeNode**

Modify `src/components/files/FileTreeNode.tsx`:

1. Add a `gitStatus` optional prop to `FileTreeNodeProps`:
   ```typescript
   gitStatus?: string; // "M", "A", "D", "?", or undefined
   ```

2. After the file name `<span>`, add a git status indicator:

```tsx
{gitStatus && (
  <span
    className="ml-auto mr-2 text-[10px] font-mono font-bold shrink-0"
    style={{
      color: gitStatus === "M" ? "var(--color-yellow)" :
             gitStatus === "A" ? "var(--color-green)" :
             gitStatus === "D" ? "var(--color-red)" :
             gitStatus === "?" ? "var(--color-overlay-1)" :
             "var(--color-subtext-0)",
    }}
  >
    {gitStatus}
  </span>
)}
```

3. Modify `src/components/files/FileExplorer.tsx` to pass git status data down:
   - Import and call `useGitStatus(rootPath)` to get `fileStatuses`
   - Pass `fileStatuses` as a prop through to `FileTreeNode`
   - In `FileTreeNode`, look up the node's path in the statuses map

Update `FileExplorer.tsx` to add the hook and pass status data. Add a `gitStatuses` prop to `FileTreeNode`:

```typescript
// In FileExplorer, after the existing hooks:
const { fileStatuses } = useGitStatus(rootPath);

// In the tree rendering:
<FileTreeNode
  key={node.path}
  node={node}
  depth={0}
  expandedPaths={expandedPaths}
  onToggleExpand={toggleExpand}
  onFileClick={handleFileClick}
  onFileDoubleClick={handleFileDoubleClick}
  onContextMenu={handleContextMenu}
  gitStatuses={fileStatuses}
/>
```

In `FileTreeNode`, accept `gitStatuses: Map<string, GitFileStatus>` and look up the status:

```typescript
const normalizedPath = node.path.replace(/\\/g, "/");
const gitStatus = gitStatuses.get(normalizedPath)?.status;
```

Pass `gitStatuses` recursively to child `FileTreeNode` components.

**Acceptance criteria (P0 Feature 14):**
- Status bar shows the real git branch name (not hardcoded "main")
- Detached HEAD shows the short commit hash in parentheses
- Non-git-repo directories show no branch indicator
- File explorer shows M (yellow), A (green), D (red), ? (grey) indicators on files
- Git status updates automatically when files change (via file watcher) and every 5 seconds

---

### Task 3: Markdown Preview

**Files:**
- Create: `src/components/editor/MarkdownPreview.tsx`
- Modify: `src/components/editor/EditorTabs.tsx`
- Modify: `src/components/layout/EditorArea.tsx`
- Modify: `src/stores/editor.ts`

This task adds a live markdown preview that renders when a `.md` file is active in the editor. react-markdown and remark-gfm are already installed in the project. The preview appears in a side-by-side split with the editor.

- [ ] **Step 1: Add markdown preview state to editor store**

Modify `src/stores/editor.ts` to track which tabs have their markdown preview enabled:

Add to `EditorState`:

```typescript
/** Set of tab IDs that have markdown preview active */
markdownPreviewTabs: Set<string>;
/** Toggle markdown preview for a tab */
toggleMarkdownPreview: (tabId: string) => void;
/** Check if a tab has markdown preview active */
isMarkdownPreviewActive: (tabId: string) => boolean;
```

Add to the store implementation:

```typescript
markdownPreviewTabs: new Set(),

toggleMarkdownPreview: (tabId) => {
  set((state) => {
    const next = new Set(state.markdownPreviewTabs);
    if (next.has(tabId)) {
      next.delete(tabId);
    } else {
      next.add(tabId);
    }
    return { markdownPreviewTabs: next };
  });
},

isMarkdownPreviewActive: (tabId) => {
  return get().markdownPreviewTabs.has(tabId);
},
```

- [ ] **Step 2: Create the MarkdownPreview component**

Create `src/components/editor/MarkdownPreview.tsx`:

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div
      className="h-full overflow-y-auto p-6"
      style={{
        backgroundColor: "var(--color-base)",
        color: "var(--color-text)",
      }}
    >
      <article className="prose prose-invert max-w-none markdown-preview">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
```

Add a `<style>` block (or a CSS file imported in the component) with Catppuccin Mocha-colored markdown styles:

```css
.markdown-preview h1,
.markdown-preview h2,
.markdown-preview h3,
.markdown-preview h4,
.markdown-preview h5,
.markdown-preview h6 {
  color: var(--color-text);
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

.markdown-preview h1 { font-size: 1.75rem; border-bottom: 1px solid var(--color-surface-1); padding-bottom: 0.3em; }
.markdown-preview h2 { font-size: 1.4rem; border-bottom: 1px solid var(--color-surface-1); padding-bottom: 0.3em; }
.markdown-preview h3 { font-size: 1.15rem; }

.markdown-preview p { margin: 0.75em 0; line-height: 1.7; }

.markdown-preview a { color: var(--color-blue); text-decoration: underline; }

.markdown-preview code {
  background: var(--color-surface-0);
  color: var(--color-peach);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-size: 0.875em;
  font-family: "JetBrains Mono", "Cascadia Code", monospace;
}

.markdown-preview pre {
  background: var(--color-mantle);
  border: 1px solid var(--color-surface-0);
  border-radius: 6px;
  padding: 1em;
  overflow-x: auto;
}

.markdown-preview pre code {
  background: none;
  color: var(--color-text);
  padding: 0;
}

.markdown-preview blockquote {
  border-left: 3px solid var(--color-blue);
  padding-left: 1em;
  margin-left: 0;
  color: var(--color-subtext-0);
}

.markdown-preview table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.markdown-preview th,
.markdown-preview td {
  border: 1px solid var(--color-surface-1);
  padding: 0.5em 0.75em;
  text-align: left;
}

.markdown-preview th {
  background: var(--color-surface-0);
  font-weight: 600;
}

.markdown-preview ul,
.markdown-preview ol {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.markdown-preview li { margin: 0.25em 0; }

.markdown-preview input[type="checkbox"] {
  margin-right: 0.5em;
  accent-color: var(--color-blue);
}

.markdown-preview hr {
  border: none;
  border-top: 1px solid var(--color-surface-1);
  margin: 1.5em 0;
}

.markdown-preview img {
  max-width: 100%;
  border-radius: 6px;
}

.markdown-preview del {
  color: var(--color-overlay-1);
}
```

Put these styles in a `src/components/editor/markdownPreview.css` file and import it at the top of `MarkdownPreview.tsx`.

- [ ] **Step 3: Add preview toggle button to EditorTabs**

Modify `src/components/editor/EditorTabs.tsx`:

1. Import `Eye` and `EyeOff` icons from lucide-react
2. Import `useEditorStore` for `toggleMarkdownPreview` and `isMarkdownPreviewActive`
3. After the tab list, add a preview toggle button that only appears when the active tab is a markdown file:

```tsx
const activeTab = tabs.find((t) => t.id === activeTabId);
const isMarkdown = activeTab?.language === "markdown";
const isPreviewActive = activeTab ? useEditorStore.getState().isMarkdownPreviewActive(activeTab.id) : false;
const toggleMarkdownPreview = useEditorStore((s) => s.toggleMarkdownPreview);

// After the tabs map, add:
{isMarkdown && activeTab && (
  <button
    className="flex items-center gap-1 px-2 h-full text-xs hover:bg-[var(--color-surface-0)] transition-colors ml-auto shrink-0"
    style={{ color: isPreviewActive ? "var(--color-blue)" : "var(--color-overlay-1)" }}
    onClick={() => toggleMarkdownPreview(activeTab.id)}
    aria-label={isPreviewActive ? "Hide preview" : "Show preview"}
    title={isPreviewActive ? "Hide preview" : "Show preview"}
  >
    {isPreviewActive ? <EyeOff size={14} /> : <Eye size={14} />}
    <span>Preview</span>
  </button>
)}
```

- [ ] **Step 4: Wire preview into EditorArea**

Modify `src/components/layout/EditorArea.tsx`:

1. Import `MarkdownPreview` from `@/components/editor/MarkdownPreview`
2. Import the `markdownPreviewTabs` set from the editor store
3. Check if the active tab is a markdown file and has preview enabled
4. If preview is active, render the editor and preview side-by-side using a simple flex layout:

```tsx
const markdownPreviewTabs = useEditorStore((s) => s.markdownPreviewTabs);
const isMarkdownPreview = activeTab
  ? activeTab.language === "markdown" && markdownPreviewTabs.has(activeTab.id)
  : false;

// In the editor content area, replace the simple editor with:
{activeTab ? (
  <div className="flex-1 overflow-hidden flex">
    <div className={isMarkdownPreview ? "w-1/2" : "w-full"} style={{ overflow: "hidden" }}>
      <MonacoEditor
        key={activeTab.id}
        filePath={activeTab.path}
        language={activeTab.language}
        value={activeTab.content}
        onChange={handleContentChange}
      />
    </div>
    {isMarkdownPreview && (
      <div
        className="w-1/2 overflow-hidden"
        style={{ borderLeft: "1px solid var(--color-surface-0)" }}
      >
        <MarkdownPreview content={activeTab.content} />
      </div>
    )}
  </div>
) : (
  <WelcomeScreen />
)}
```

**Acceptance criteria (Markdown Preview):**
- Opening a `.md` file shows a "Preview" button in the tab bar
- Clicking "Preview" splits the editor pane: editor on the left, rendered markdown on the right
- Preview updates live as the user types in the editor
- GFM features work: tables, task lists, strikethrough, autolinks
- Styled with Catppuccin Mocha colors (no white/light backgrounds)
- Clicking "Preview" again hides the preview and returns to full-width editor

---

### Task 4: Inline Diff Viewer (Basic)

**Files:**
- Create: `src/components/editor/DiffViewer.tsx`
- Modify: `src/stores/editor.ts`
- Modify: `src/components/layout/EditorArea.tsx`

This task adds a basic inline diff viewer that uses Monaco's built-in diff editor. When Claude edits a file, the user can view the diff and accept or reject the changes. This is a simplified P0 version -- full per-hunk accept/reject is P2.

- [ ] **Step 1: Add diff state to editor store**

Modify `src/stores/editor.ts` to track pending diffs:

Add a new interface and state fields:

```typescript
export interface PendingDiff {
  /** Tab ID this diff belongs to */
  tabId: string;
  /** The original content before Claude's edit */
  originalContent: string;
  /** The modified content from Claude's edit */
  modifiedContent: string;
  /** Human-readable description of the change */
  description: string;
}
```

Add to `EditorState`:

```typescript
/** Pending diffs waiting for user accept/reject */
pendingDiffs: Map<string, PendingDiff>;
/** Set a pending diff for a file (called when Claude edits a file) */
setPendingDiff: (tabId: string, original: string, modified: string, description: string) => void;
/** Accept the diff: update tab content to modified version */
acceptDiff: (tabId: string) => void;
/** Reject the diff: revert tab content to original version */
rejectDiff: (tabId: string) => void;
/** Check if a tab has a pending diff */
hasPendingDiff: (tabId: string) => boolean;
```

Add the implementation:

```typescript
pendingDiffs: new Map(),

setPendingDiff: (tabId, original, modified, description) => {
  set((state) => {
    const next = new Map(state.pendingDiffs);
    next.set(tabId, { tabId, originalContent: original, modifiedContent: modified, description });
    return { pendingDiffs: next };
  });
},

acceptDiff: (tabId) => {
  const diff = get().pendingDiffs.get(tabId);
  if (!diff) return;
  // Update the tab content to the modified version and mark dirty
  set((state) => {
    const next = new Map(state.pendingDiffs);
    next.delete(tabId);
    return {
      pendingDiffs: next,
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? { ...t, content: diff.modifiedContent, isDirty: diff.modifiedContent !== t.savedContent }
          : t
      ),
    };
  });
},

rejectDiff: (tabId) => {
  const diff = get().pendingDiffs.get(tabId);
  if (!diff) return;
  // Revert content to the original
  set((state) => {
    const next = new Map(state.pendingDiffs);
    next.delete(tabId);
    return {
      pendingDiffs: next,
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? { ...t, content: diff.originalContent, isDirty: diff.originalContent !== t.savedContent }
          : t
      ),
    };
  });
},

hasPendingDiff: (tabId) => {
  return get().pendingDiffs.has(tabId);
},
```

- [ ] **Step 2: Create the DiffViewer component**

Create `src/components/editor/DiffViewer.tsx`. This uses Monaco's `DiffEditor` component from `@monaco-editor/react`:

```tsx
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { useEditorStore, type PendingDiff } from "@/stores/editor";
import { useSettingsStore } from "@/stores/settings";
import { Check, X } from "lucide-react";

loader.config({ monaco });

interface DiffViewerProps {
  diff: PendingDiff;
}

export function DiffViewer({ diff }: DiffViewerProps) {
  const acceptDiff = useEditorStore((s) => s.acceptDiff);
  const rejectDiff = useEditorStore((s) => s.rejectDiff);
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const fontSize = useSettingsStore((s) => s.fontSizeEditor);

  const handleMount: DiffOnMount = (editor) => {
    editor.focus();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Diff toolbar */}
      <div
        className="flex items-center justify-between px-3 h-8 shrink-0"
        style={{
          backgroundColor: "var(--color-mantle)",
          borderBottom: "1px solid var(--color-surface-0)",
        }}
      >
        <span className="text-xs" style={{ color: "var(--color-subtext-0)" }}>
          {diff.description || "AI Edit - Review Changes"}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => acceptDiff(diff.tabId)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
            style={{
              backgroundColor: "var(--color-green)",
              color: "var(--color-crust)",
            }}
            aria-label="Accept changes"
          >
            <Check size={12} />
            Accept
          </button>
          <button
            onClick={() => rejectDiff(diff.tabId)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
            style={{
              backgroundColor: "var(--color-red)",
              color: "var(--color-crust)",
            }}
            aria-label="Reject changes"
          >
            <X size={12} />
            Reject
          </button>
        </div>
      </div>

      {/* Monaco Diff Editor */}
      <div className="flex-1 overflow-hidden">
        <DiffEditor
          original={diff.originalContent}
          modified={diff.modifiedContent}
          language="typescript"
          theme="catppuccin-mocha"
          onMount={handleMount}
          options={{
            fontFamily,
            fontSize,
            readOnly: true,
            renderSideBySide: false, // inline diff mode
            automaticLayout: true,
            scrollBeyondLastLine: false,
            minimap: { enabled: false },
            renderOverviewRuler: false,
            padding: { top: 8 },
          }}
        />
      </div>
    </div>
  );
}
```

Note: The `language` prop on the `DiffEditor` should be set dynamically based on the active tab's language. Pass the language through the `PendingDiff` interface or derive it from the tab data.

- [ ] **Step 3: Wire DiffViewer into EditorArea**

Modify `src/components/layout/EditorArea.tsx`:

1. Import `DiffViewer` and `PendingDiff` from `@/components/editor/DiffViewer`
2. Read `pendingDiffs` from the editor store
3. When the active tab has a pending diff, show the `DiffViewer` instead of the normal editor:

```tsx
const pendingDiffs = useEditorStore((s) => s.pendingDiffs);
const activeDiff = activeTab ? pendingDiffs.get(activeTab.id) : undefined;

// In the editor content area:
{activeTab ? (
  activeDiff ? (
    <DiffViewer diff={activeDiff} />
  ) : (
    <div className="flex-1 overflow-hidden flex">
      {/* ... existing editor + markdown preview code ... */}
    </div>
  )
) : (
  <WelcomeScreen />
)}
```

- [ ] **Step 4: Hook diff creation into Claude's file edit events**

When Claude executes a file edit (via the Edit or Write tool), the frontend should capture the before/after content and set a pending diff. The conversation store already processes tool calls. Add logic to detect file edits:

The connection between Claude's tool calls and the diff viewer requires intercepting the `Edit` and `Write` tool results. In the conversation event listener (wherever `claude_message` events are handled -- likely in a hook or the ChatPanel component), add a check:

When a tool call completes with name "Edit" or "Write" and the target path matches an open tab:
1. Read the tab's current content (this is the "original" before Claude's edit)
2. Re-read the file from disk (the "modified" content after Claude wrote to it)
3. Call `setPendingDiff(tabId, original, modified, "Claude edited {filename}")`
4. Reload the tab content from disk

This wiring is best done by listening for file change events that coincide with an active Claude session. The exact implementation depends on how the tool result events flow -- inspect the `claude_message` events for tool results with `name === "Edit"` or `name === "Write"`, extract the `path` from the tool input, and trigger the diff.

A simpler approach for P0: when the file watcher detects a change on a file that has an open tab AND a Claude session is active (isStreaming), automatically create a diff by comparing the tab's content with the newly read file content.

**Acceptance criteria (P0 Feature 7):**
- When Claude edits a file, a diff viewer appears showing original vs modified content
- Accept button applies Claude's changes to the editor
- Reject button reverts to the original content
- Diff uses inline mode (not side-by-side) with green/red highlighting
- Accept/Reject toolbar is clearly visible above the diff
- After accepting or rejecting, the normal editor view returns

---

### Task 5: First-Launch Prerequisite Check

**Files:**
- Create: `src-tauri/src/prerequisites.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/components/shared/PrerequisiteCheck.tsx`
- Modify: `src/App.tsx`

This task adds a first-launch check that validates the user's system has all required prerequisites: Git, Claude Code CLI, WebView2, and long paths. It shows a checklist dialog with pass/fail results and actionable instructions for failed items.

- [ ] **Step 1: Create the prerequisites Rust module**

Create `src-tauri/src/prerequisites.rs`:

```rust
use serde::{Deserialize, Serialize};
use specta::Type;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PrerequisiteResult {
    pub name: String,
    pub passed: bool,
    pub version: Option<String>,
    pub message: String,
    pub install_hint: Option<String>,
    /// "error" = blocks launch, "warning" = can proceed
    pub severity: String,
}

/// Run all prerequisite checks and return results.
pub fn check_all() -> Vec<PrerequisiteResult> {
    vec![
        check_git(),
        check_git_bash(),
        check_claude_code(),
        check_long_paths(),
    ]
}
```

**`check_git()` function:**
- Run `where.exe git` to check if git is on PATH
- If found, run `git --version` to get the version string
- On failure: severity "error", install_hint "Run: winget install Git.Git"

**`check_git_bash()` function:**
- Check standard paths: `C:\Program Files\Git\bin\bash.exe`, `C:\Program Files (x86)\Git\bin\bash.exe`
- Also try deriving from `where.exe git` (git.exe is in `cmd\`, bash.exe is in `bin\`)
- Check `CLAUDE_CODE_GIT_BASH_PATH` env var
- On failure: severity "error", install_hint "Install Git for Windows from git-scm.com"

**`check_claude_code()` function:**
- Run `where.exe claude` to check if claude is on PATH
- If found, run `claude --version` to get version
- On failure: severity "error", install_hint "Run: npm install -g @anthropic-ai/claude-code"

**`check_long_paths()` function:**
- Read Windows registry: `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled`
- Use `Command::new("reg").args(["query", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem", "/v", "LongPathsEnabled"])`
- Parse the output for the DWORD value
- On failure (value is 0 or not found): severity "warning", install_hint "Run as admin: reg add ... /v LongPathsEnabled /t REG_DWORD /d 1 /f"

Each function returns a `PrerequisiteResult` with the appropriate fields filled.

- [ ] **Step 2: Register prerequisites command in lib.rs**

Modify `src-tauri/src/lib.rs`:

1. Add `mod prerequisites;` at the top
2. Add the Tauri command:

```rust
#[tauri::command]
#[specta::specta]
fn check_prerequisites() -> Vec<prerequisites::PrerequisiteResult> {
    prerequisites::check_all()
}
```

3. Add `check_prerequisites` to the `tauri_specta::collect_commands![]` macro.

- [ ] **Step 3: Create the PrerequisiteCheck dialog component**

Create `src/components/shared/PrerequisiteCheck.tsx`:

```tsx
import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";

interface PrerequisiteResult {
  name: string;
  passed: boolean;
  version: string | null;
  message: string;
  install_hint: string | null;
  severity: string;
}
```

**Component logic:**

1. On mount, check if the user has already passed prerequisite checks using Tauri Store:
   ```typescript
   const store = await Store.load("prerequisites.json");
   const hasPassed = await store.get<boolean>("hasPassedChecks");
   if (hasPassed) return; // Don't show the dialog
   ```

2. If not previously passed, invoke `check_prerequisites` and show results in a dialog

3. The dialog contains:
   - Title: "Welcome to Vantage"
   - Subtitle: "Checking system prerequisites..."
   - A checklist of results, each showing:
     - Green CheckCircle2 for passed, Red XCircle for failed errors, Yellow AlertTriangle for warnings
     - The prerequisite name
     - The version string (if available) or the error message
     - If failed: the install_hint in a copyable code block
   - "Check Again" button that re-runs `check_prerequisites`
   - "Continue" button:
     - If all "error" severity items pass: enabled, saves `hasPassedChecks: true` to store
     - If any "error" severity items fail: disabled, shows "Fix required items to continue"
     - "Continue anyway" text if only warnings remain

```tsx
export function PrerequisiteCheck() {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<PrerequisiteResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  const runChecks = useCallback(async () => {
    setIsChecking(true);
    try {
      const results = await invoke<PrerequisiteResult[]>("check_prerequisites");
      setResults(results);
    } catch (e) {
      console.error("Prerequisite check failed:", e);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const store = await Store.load("prerequisites.json");
        const hasPassed = await store.get<boolean>("hasPassedChecks");
        if (hasPassed) return;
      } catch {
        // Store doesn't exist yet, show dialog
      }
      setIsOpen(true);
      runChecks();
    };
    init();
  }, [runChecks]);

  const hasErrors = results.some((r) => !r.passed && r.severity === "error");

  const handleContinue = async () => {
    try {
      const store = await Store.load("prerequisites.json");
      await store.set("hasPassedChecks", true);
      await store.save();
    } catch {
      // Best effort
    }
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent
        className="max-w-md"
        style={{
          backgroundColor: "var(--color-base)",
          border: "1px solid var(--color-surface-1)",
          color: "var(--color-text)",
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: "var(--color-text)" }}>
            Welcome to Vantage
          </DialogTitle>
          <DialogDescription style={{ color: "var(--color-subtext-0)" }}>
            Checking system prerequisites...
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 my-4">
          {results.map((result) => (
            <div key={result.name} className="flex items-start gap-3">
              {result.passed ? (
                <CheckCircle2 size={18} style={{ color: "var(--color-green)" }} className="shrink-0 mt-0.5" />
              ) : result.severity === "error" ? (
                <XCircle size={18} style={{ color: "var(--color-red)" }} className="shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={18} style={{ color: "var(--color-yellow)" }} className="shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{result.name}</span>
                  {result.version && (
                    <span className="text-xs" style={{ color: "var(--color-overlay-1)" }}>
                      {result.version}
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-subtext-0)" }}>
                  {result.message}
                </p>
                {!result.passed && result.install_hint && (
                  <code
                    className="block mt-1 px-2 py-1 rounded text-xs font-mono break-all"
                    style={{
                      backgroundColor: "var(--color-surface-0)",
                      color: "var(--color-peach)",
                    }}
                  >
                    {result.install_hint}
                  </code>
                )}
              </div>
            </div>
          ))}

          {isChecking && results.length === 0 && (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={24} className="animate-spin" style={{ color: "var(--color-blue)" }} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            onClick={runChecks}
            disabled={isChecking}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs transition-colors"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-text)",
            }}
          >
            <RefreshCw size={12} className={isChecking ? "animate-spin" : ""} />
            Check Again
          </button>
          <button
            onClick={handleContinue}
            disabled={hasErrors}
            className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor: hasErrors ? "var(--color-surface-1)" : "var(--color-blue)",
              color: hasErrors ? "var(--color-overlay-1)" : "var(--color-crust)",
              cursor: hasErrors ? "not-allowed" : "pointer",
            }}
          >
            {hasErrors ? "Fix required items to continue" : "Continue"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Wire PrerequisiteCheck into App.tsx**

Modify `src/App.tsx`:

```tsx
import { PrerequisiteCheck } from "@/components/shared/PrerequisiteCheck";

function App() {
  useKeybindings();

  return (
    <>
      <IDELayout />
      <CommandPalette />
      <PermissionDialog />
      <PrerequisiteCheck />
      <Toaster ... />
    </>
  );
}
```

The `PrerequisiteCheck` self-manages its visibility based on whether checks have passed before. It checks the Tauri Store on mount and only opens if the user hasn't passed previously.

**Acceptance criteria (P0 Feature 13):**
- First launch shows a prerequisite check dialog
- Git for Windows: checks `where.exe git`, shows version, red X if missing
- Git Bash: checks standard paths, red X if missing
- Claude Code CLI: checks `where.exe claude`, shows version, red X if missing
- Long paths: checks registry, yellow warning if disabled
- "Check Again" button re-runs all checks
- "Continue" button is disabled if any error-severity items fail
- Warnings allow the user to proceed
- After passing, the dialog does not appear on subsequent launches (stored in Tauri Store)
- User can dismiss warnings and continue

---

### Task 6: Final Polish and Integration

**Files:**
- Verify: all files from Tasks 1-5
- Modify: `src/hooks/useKeybindings.ts` (if any keybindings missed)

This task is a verification and cleanup pass to ensure all P0 features have their acceptance criteria met.

- [ ] **Step 1: Verify all Tier 1 keybindings from spec section 6.1 are functional**

Cross-reference the keybindings in `src/hooks/useKeybindings.ts` against the spec's Tier 1 list:

| Shortcut | Status | Notes |
|----------|--------|-------|
| Ctrl+Shift+P | Task 1 | Command palette |
| Ctrl+P | Task 1 | Quick open file |
| Ctrl+B | Phase 1 | Already wired |
| Ctrl+Shift+B | Phase 1 | Already wired |
| Ctrl+J | Phase 1 | Already wired |
| Ctrl+` | Phase 1 | Already wired |
| Ctrl+Shift+` | Phase 2 | New terminal tab (verify) |
| Ctrl+\\ | TODO | Split editor -- verify Monaco handles this natively |
| Ctrl+W | Phase 1 | Already wired |
| Ctrl+S | Phase 2 | Already wired |
| Ctrl+Z/Ctrl+Y | Monaco | Handled by Monaco natively |
| Ctrl+F | Monaco | Handled by Monaco natively |
| Ctrl+H | Monaco | Handled by Monaco natively |
| Ctrl+Shift+F | Phase 1 | Focus search panel |
| Ctrl+G | Task 1 | Go to line |
| F12 | Monaco | Go to definition (if LSP configured) |
| Ctrl+/ | Monaco | Toggle line comment |
| Alt+Up/Down | Monaco | Move line |
| Shift+Alt+Down | Monaco | Duplicate line |
| Ctrl+D | Monaco | Select next occurrence |
| Ctrl+Shift+L | Monaco | Select all occurrences |
| Shift+Alt+F | Monaco | Format document |
| Ctrl+1/2/3 | TODO | Focus editor group -- skip for now (single editor group in P0) |
| Ctrl+Shift+E | Phase 1 | Already wired |
| Ctrl+Shift+G | Phase 1 | Already wired |
| Ctrl+Shift+A | Phase 1 | Already wired |
| Ctrl+, | Phase 1 | Already wired |
| Escape | Native | Dialog close handled by shadcn Dialog |
| Enter | Native | Chat submit handled by ChatInput |

Verify that Ctrl+Shift+` (new terminal) is wired. If not, add it to useKeybindings.ts.

Verify that Monaco-native keybindings (Ctrl+F, Ctrl+H, Ctrl+/, Alt+Up/Down, etc.) work without any custom wiring -- they should work automatically since Monaco handles them.

- [ ] **Step 2: Verify all 14 P0 features have their acceptance criteria met**

Run through each P0 feature from spec section 11:

| # | Feature | Phase | Verify |
|---|---------|-------|--------|
| 1 | Single Claude Code chat session | Phase 3 | Chat works with streaming, thinking blocks, tool calls, cost display |
| 2 | Integrated terminal | Phase 2 | Multiple tabs, PowerShell + Git Bash, resize, copy/paste |
| 3 | Monaco code editor with tabs | Phase 2 | Syntax highlighting, find/replace, minimap, splits, tabs, dirty indicator |
| 4 | File explorer with lazy tree | Phase 2 | Loads 2 levels, expand on click, .gitignore, context menu, git status (Task 2) |
| 5 | Command palette | Task 1 | Three modes, fuzzy search, keybinding hints |
| 6 | Permission/approval dialog | Phase 3 | Modal, risk colors, Y/N/S shortcuts |
| 7 | Inline diff for AI edits | Task 4 | Accept/Reject per file, inline diff mode |
| 8 | Session management | Phase 3 | List, resume, continue sessions |
| 9 | Dark theme | Phase 1 | Catppuccin Mocha throughout |
| 10 | Essential keybindings | Step 1 | All Tier 1 functional |
| 11 | Streaming output | Phase 3 | Token-by-token, auto-scroll, stop button |
| 12 | Cost/token tracking | Phase 3 | Per-session in status bar, per-message in chat |
| 13 | First-launch check | Task 5 | Git, Claude, long paths validation |
| 14 | Basic git integration | Task 2 | Branch in status bar, status on files |

For each feature, confirm it works in the running application. Fix any issues found.

- [ ] **Step 3: Production build verification**

Run a production build and verify it succeeds:

```bash
npm run build
```

Check for TypeScript errors, unused imports, and build warnings. Fix any issues.

- [ ] **Step 4: Tag phase-4-complete**

Once all features are verified:

```bash
git add -A
git commit -m "feat: complete Phase 4 - command palette, git integration, markdown preview, diff viewer, prerequisite checks"
git tag phase-4-complete
```

**Final acceptance criteria for 1.0:**
- All 14 P0 features are functional
- All Tier 1 keybindings work
- Production build succeeds without errors
- First-launch experience guides users through prerequisite setup
- Status bar shows real git branch
- File explorer shows git status indicators
- Command palette provides file search, command execution, and go-to-line
- Markdown files can be previewed with live rendering
- Claude's file edits can be reviewed and accepted/rejected via inline diff
