# Wire the Gap Sprint -- Implementation Plan

**Date:** 2026-04-04
**Sprint goal:** Close the gap between scaffolded features and working features. No new feature scaffolds -- only wiring, verification, and the one critical new feature (@-mentions).
**Estimated effort:** 2-3 weeks total (9 tasks, parallelizable across 3 tracks)

---

## Current State Assessment

### What Exists (Backend -- Rust)

| Module | Commands registered in `lib.rs` | Status |
|--------|-------------------------------|--------|
| `git.rs` | `get_git_branch`, `get_git_status`, `git_show_file`, `git_log`, `git_blame`, `git_diff_commit`, `get_pr_list` | Read-only. No stage/commit/push/pull/branch. Has `validate_branch_name()` (unused, dead code). |
| `checkpoint.rs` | `create_checkpoint`, `list_checkpoints`, `restore_checkpoint`, `delete_checkpoint` | Fully implemented. Uses git tags under `vantage-checkpoint/` prefix. |
| `session_search.rs` | `search_sessions`, `get_session_stats` | Fully implemented. Scans `~/.claude/projects/` JSONL files. |
| `search.rs` | `search_project` | Search-only. No replace capability. Uses ripgrep with ignore-crate fallback. |
| `plugins.rs` | `list_installed_plugins`, `list_installed_skills`, `get_plugin_config`, `toggle_plugin`, `install_plugin` | Fully implemented. |
| `merge_queue.rs` | `run_quality_gate`, `detect_quality_gates`, `merge_branch`, `rebase_branch` | Fully implemented. |

### What Exists (Frontend -- React)

| Component | Location | Status |
|-----------|----------|--------|
| `ChatInput` | `src/components/chat/ChatInput.tsx` | Working. Has slash command autocomplete. Routes `/btw` to QuickQuestionStore. No @-mention support. |
| `QuickQuestionOverlay` | `src/components/chat/QuickQuestionOverlay.tsx` | UI built. Store `ask()` sets `isLoading: true` but **nothing actually calls Claude**. Dead end. |
| `SlashAutocomplete` | `src/components/chat/SlashAutocomplete.tsx` | Working. Renders dropdown from `slashCommands.ts`. |
| `slashCommands.ts` | `src/lib/slashCommands.ts` | 17 built-in commands. Missing: `/fast`, `/diff`, `/tasks`, `/branch`, `/rewind`. |
| `SearchPanel` | `src/components/search/SearchPanel.tsx` | Working search. No replace input. No replace backend. |
| `MonacoEditor` | `src/components/editor/MonacoEditor.tsx` | Working. Uses local monaco-editor package via `loader.config({ monaco })`. TS worker status **unverified**. |
| `GitLogPanel` | `src/components/git/GitLogPanel.tsx` | Working read-only log viewer. No stage/commit/push UI. |
| `SessionSelector` | `src/components/chat/SessionSelector.tsx` | Exists but search wiring **unverified**. |
| Agent components | `src/components/agents/` | KanbanBoard, AgentTreeView, etc. scaffolded. Coordinator pipeline **unverified**. |

---

## Task 1: Verify Monaco TypeScript Intelligence

**Goal:** Confirm whether Monaco's built-in TypeScript worker is active. If so, the biggest "BLOCKER" from the feature gap report resolves for free.

**Why first:** Zero-effort potential win. If it already works, we document it and move on. If not, we know the fix (configure the TS worker).

### What to verify

1. Open `http://localhost:1420` in browser (Vite dev server with mocks)
2. Create or open a `.ts` file in the editor
3. Test each capability:
   - **Autocomplete:** Type a variable name, press `Ctrl+Space`. Does it suggest completions?
   - **Hover info:** Hover over a function call or variable. Does a tooltip show the type signature?
   - **Error squiggles:** Introduce a type error (e.g., `const x: number = "hello"`). Does a red underline appear?
   - **Go-to-definition:** `Ctrl+Click` or `F12` on an imported symbol. Does it navigate?
   - **Find/Replace:** `Ctrl+F` and `Ctrl+H`. Do the Monaco built-in dialogs appear?
   - **Multi-cursor:** `Alt+Click` to add cursors. Does it work?

### Expected outcome

Monaco's TS worker should be active by default because:
- `@monaco-editor/react` v4.7 is installed
- `loader.config({ monaco })` points to the local `monaco-editor` package (line 16 of `MonacoEditor.tsx`)
- The `Editor` component receives `language="typescript"` when opening `.ts` files

### If it does NOT work

The fix is to configure the TypeScript worker explicitly:

```typescript
// In MonacoEditor.tsx, after loader.config({ monaco })
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: false,
  noSyntaxValidation: false,
});
monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.languages.typescript.ScriptTarget.ESNext,
  module: monaco.languages.typescript.ModuleKind.ESNext,
  allowNonTsExtensions: true,
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
  strict: true,
});
```

For cross-file go-to-definition, Monaco needs type declarations loaded via `addExtraLib()`. This is a deeper task (requires reading `tsconfig.json` and feeding `.d.ts` files to Monaco). That can be deferred to the LSP sprint. Single-file intelligence is the target here.

### Files to modify

- `src/components/editor/MonacoEditor.tsx` -- add TS worker configuration if needed

### Acceptance criteria

- [ ] Autocomplete works for TypeScript/JavaScript files
- [ ] Hover info shows type signatures
- [ ] Syntax errors produce red underlines
- [ ] Find/Replace dialog works (Ctrl+F, Ctrl+H)
- [ ] Multi-cursor works (Alt+Click)
- [ ] Results documented in this plan or a separate verification report

### Estimated effort: 0.5 days (verify) + 0.5 days (fix if needed)

---

## Task 2: Wire Disconnected Backends

**Goal:** Connect 6 features that have both backend and frontend code but are currently disconnected.

### 2a: Quick Question (`/btw`) -- Wire to Claude

**Current state:** `ChatInput.handleChange` detects `/btw <text>` and calls `useQuickQuestionStore.getState().ask(text)`. The store sets `isLoading: true` and opens the overlay. But **nothing sends the question to Claude**. The overlay just spins forever.

**Fix:** The `QuickQuestionOverlay` (or a hook) needs to detect when `isLoading` becomes true with a non-empty `question` and actually invoke Claude. Two approaches:

**Option A (Simpler -- use existing session):**
```typescript
// In a useEffect in QuickQuestionOverlay or a new useQuickQuestion hook:
// When isLoading && question:
//   1. Send the question to the active Claude session via claude_send_message
//   2. Listen for claude_output events and route to appendResponse()
//   3. On result event, setLoading(false)
```

**Option B (Isolated -- spawn a new session):**
```typescript
// Spawn a temporary Claude session with --btw flag (if CLI supports it)
// or just spawn a normal session, send the question, collect the response, kill session
```

Option A is preferred -- it reuses the active session and matches how `/btw` works in the real CLI (uses the current conversation context).

**Files to modify:**
- `src/hooks/useQuickQuestion.ts` (new hook, or add to `useClaude.ts`)
- `src/components/chat/QuickQuestionOverlay.tsx` -- integrate the hook
- `src/stores/quickQuestion.ts` -- may need a `sessionId` field

**Acceptance criteria:**
- [ ] Type `/btw what is this file?` in chat input
- [ ] Overlay appears, shows "Thinking..."
- [ ] Response streams in from Claude
- [ ] Overlay can be dismissed, response is preserved

### 2b: Checkpoint UI -- Wire Restore/Delete Buttons

**Current state:** Backend is complete (`checkpoint.rs`). The Tauri commands `list_checkpoints`, `restore_checkpoint`, `delete_checkpoint` are registered. Need to verify if a checkpoint list UI exists, and if the restore/delete buttons invoke the commands.

**Investigation needed:**
```bash
grep -r "checkpoint" src/components/ --include="*.tsx" -l
grep -r "list_checkpoints\|restore_checkpoint\|delete_checkpoint" src/ --include="*.ts" --include="*.tsx" -l
```

**If UI does not exist, create:**
- `src/components/agents/CheckpointList.tsx` -- renders checkpoints with restore/delete buttons
- Wire to the agent detail panel or a dedicated sidebar section
- Each checkpoint row: tag name, commit hash (short), relative time, restore button, delete button
- Restore button calls `invoke("restore_checkpoint", { cwd, tagName })`
- Delete button calls `invoke("delete_checkpoint", { cwd, tagName })` with confirmation dialog

**Files to modify:**
- `src/components/agents/CheckpointList.tsx` (new or existing)
- Parent component that mounts the list

**Acceptance criteria:**
- [ ] Checkpoint list loads from backend
- [ ] Restore button resets working tree to that checkpoint
- [ ] Delete button removes the checkpoint tag
- [ ] Confirmation dialog before destructive actions

### 2c: Session Search -- Wire to SessionSelector

**Current state:** `search_sessions` and `get_session_stats` Tauri commands are registered. The `SessionSelector` component exists. Need to verify if the search input in SessionSelector invokes `search_sessions`.

**Investigation needed:**
```bash
grep -r "search_sessions" src/ --include="*.ts" --include="*.tsx"
```

**If not wired:**
- Add a search input to `SessionSelector`
- On input change (debounced 300ms), call `invoke("search_sessions", { query, cwd })`
- Display results with session_id, snippet, message_count, modified_at, total_cost_usd
- Click on a result resumes that session via `claude_start_session` with `resume: true`

**Files to modify:**
- `src/components/chat/SessionSelector.tsx`

**Acceptance criteria:**
- [ ] Search input filters sessions by content
- [ ] Results show session snippet and metadata
- [ ] Click resumes the selected session

### 2d: Agent Detail Panel Click

**Current state:** Was reported as fixed in Batch 8. Needs verification.

**Verification:**
1. Open the agents view (Kanban or Tree)
2. Click on an agent card
3. Verify a detail panel opens showing agent status, conversation, and controls

**If broken:** Trace the click handler from the agent component to the store action and fix the disconnect.

### 2e: Coordinator Pipeline

**Current state:** Was scaffolded in Phase 8. Needs verification that auto-spawn actually creates specialist agents.

**Verification:**
1. Start a coordinator agent
2. Give it a task that should spawn specialists (e.g., "implement feature X with tests")
3. Verify specialist agents appear in the Kanban board

**If broken:** Trace the coordinator logic in `useClaude.ts` and `stores/agents.ts`.

### 2f: Tool Result Display

**Current state:** Was reported as fixed in Batch 3. Needs verification.

**Verification:**
1. Send a message that triggers tool use (e.g., "read the README.md file")
2. Verify the tool call card appears in the chat
3. Verify the tool result (file contents) appears below the tool call

**If broken:** Check the `ToolCallCard` component and the `useClaude` event handler for `tool_result` messages.

### Estimated effort: 3-4 days total across all 6 items

---

## Task 3: Build @-Mentions for Chat Context

**Goal:** When user types `@` in the chat input, show an autocomplete dropdown with context attachment options. This is the #1 most-requested feature gap.

### Design

**Trigger:** User types `@` character in the chat textarea.

**Autocomplete categories:**

| Trigger | Label | What it attaches |
|---------|-------|-----------------|
| `@file` | File | Opens a file picker; attaches file contents as context |
| `@folder` | Folder | Opens a folder picker; attaches folder tree listing |
| `@selection` | Selection | Attaches the current Monaco editor selection text |
| `@terminal` | Terminal | Attaches the last N lines of terminal output |
| `@git` | Git Diff | Attaches the current `git diff` output |
| `@git:staged` | Staged Diff | Attaches `git diff --staged` output |

After selecting a mention type and resolving the value (e.g., picking a file), the mention appears as a visual chip/tag in the input area, and the resolved content is prepended to the message when sent.

### Architecture

```
ChatInput.tsx
  ├── detects "@" in textarea
  ├── shows MentionAutocomplete dropdown
  │    ├── @file → opens mini file tree picker
  │    ├── @selection → resolves immediately from editor store
  │    ├── @terminal → resolves from terminal store/buffer
  │    └── @git → invokes git diff via Rust command
  └── stores resolved mentions in local state
       └── on send: prepends resolved content to message
```

### New files

1. **`src/components/chat/MentionAutocomplete.tsx`**
   - Dropdown component, positioned above the textarea (like `SlashAutocomplete`)
   - Shows category buttons (@file, @selection, @terminal, @git)
   - For `@file`: renders a compact file tree (reuse `FileTreeNode` or a simplified version)
   - For `@selection`: immediately resolves from `useEditorStore.getState()`
   - For `@terminal`: grabs last 50 lines from terminal buffer
   - For `@git`: calls a new Tauri command `git_diff_working(cwd)` or shells out to `git diff`

2. **`src/components/chat/MentionChip.tsx`**
   - Visual pill/tag showing the mention type and name (e.g., `@file:src/main.ts`)
   - Rendered inline in the input area (above the textarea, like email To: chips)
   - Has an X button to remove

3. **`src/lib/mentionResolver.ts`**
   - `resolveMention(type, value) → Promise<string>` -- resolves mention to text content
   - Handles file reading, selection extraction, terminal buffer, git diff

### Changes to existing files

- **`src/components/chat/ChatInput.tsx`:**
  - Add state: `mentions: MentionItem[]`
  - Detect `@` character in `handleChange` (similar to `/` detection for slash commands)
  - Show `MentionAutocomplete` when `@` is detected
  - Render `MentionChip` components above the textarea
  - In `handleSend`: prepend resolved mention content to the message text

- **`src-tauri/src/git.rs`:** Add `git_diff_working(cwd)` command:
  ```rust
  pub fn git_diff_working(cwd: &str) -> Result<String, String> {
      let output = run_git_with_timeout(
          Command::new("git")
              .args(["diff", "--no-color"])
              .current_dir(cwd),
      )?;
      Ok(String::from_utf8_lossy(&output.stdout).to_string())
  }

  pub fn git_diff_staged(cwd: &str) -> Result<String, String> {
      let output = run_git_with_timeout(
          Command::new("git")
              .args(["diff", "--staged", "--no-color"])
              .current_dir(cwd),
      )?;
      Ok(String::from_utf8_lossy(&output.stdout).to_string())
  }
  ```

- **`src-tauri/src/lib.rs`:** Register `git_diff_working` and `git_diff_staged` commands.

### Message format

When the user sends a message with mentions, the actual string sent to Claude CLI is:

```
<context>
@file:src/main.ts
```ts
[file contents here]
```

@selection
```ts
[selected text here]
```
</context>

[user's actual message here]
```

This format gives Claude clear context boundaries. The Claude CLI processes this as a normal user message with inline context.

### Acceptance criteria

- [ ] Typing `@` in chat input shows the mention autocomplete
- [ ] `@file` opens a file picker and attaches file contents
- [ ] `@selection` attaches the current editor selection
- [ ] `@terminal` attaches recent terminal output
- [ ] `@git` attaches the working tree diff
- [ ] Mentions appear as visual chips that can be removed
- [ ] Resolved content is prepended to the message on send
- [ ] Arrow keys navigate the mention dropdown; Enter selects; Escape closes

### Estimated effort: 4-5 days

---

## Task 4: Add Missing Slash Commands

**Goal:** Route commonly needed commands to the Claude CLI session.

### Current commands (17 in `slashCommands.ts`)

`btw`, `bug`, `clear`, `compact`, `config`, `cost`, `doctor`, `help`, `init`, `interview`, `login`, `logout`, `memory`, `model`, `permissions`, `review`, `status`, `vim`

### Commands to add

| Command | Handler | Notes |
|---------|---------|-------|
| `/fast` | Send `fast` toggle to CLI session | Toggles between fast/normal model. Route as a message to session. |
| `/diff` | Open git diff in editor | Call `git_diff_working`, open result in Monaco as a new readonly tab with language "diff". |
| `/tasks` | Switch to agents panel | Call `useLayoutStore.getState().setActiveView("agents")`. No CLI roundtrip. |
| `/branch` | Show branch info | Call `get_git_branch`, display in chat or status bar. |
| `/usage` | Switch to analytics panel | Call `useLayoutStore.getState().setActiveView("analytics")`. |
| `/clear` | Clear conversation | Already listed but verify it actually calls `useConversationStore.getState().clearMessages()`. |
| `/export` | Export conversation | Serialize `useConversationStore` messages to markdown and trigger a file save dialog. |
| `/context` | Show context window usage | Route to Claude CLI session. |
| `/rewind` | Restore last checkpoint | Call `list_checkpoints` and restore the most recent one. |
| `/plan` | Toggle plan mode | Toggle `useConversationStore.getState().planMode`. |

### Implementation

**`src/lib/slashCommands.ts`:**
- Add the new entries to `BUILTIN_COMMANDS` array
- Add a `handler` field to `SlashCommand` type: `handler?: "cli" | "local"`
  - `"cli"` = forward the command text to the Claude session as a message
  - `"local"` = handled entirely in the frontend (e.g., `/tasks`, `/diff`, `/usage`)

**`src/components/chat/ChatInput.tsx`:**
- In `handleSlashSelect`, check the command's handler type:
  - If `"local"`: execute the handler directly (switch view, open diff, etc.)
  - If `"cli"` or default: inject the command text into the chat input and send

**New handler module -- `src/lib/slashHandlers.ts`:**
```typescript
import { invoke } from "@tauri-apps/api/core";
import { useLayoutStore } from "@/stores/layout";
import { useEditorStore } from "@/stores/editor";
import { useConversationStore } from "@/stores/conversation";

export async function handleLocalSlashCommand(name: string): Promise<boolean> {
  switch (name) {
    case "diff": {
      const cwd = useLayoutStore.getState().projectRootPath;
      if (!cwd) return false;
      const diff = await invoke<string>("git_diff_working", { cwd });
      useEditorStore.getState().openFile(
        "git://diff", "Working Changes", "diff", diff, true
      );
      return true;
    }
    case "tasks":
      useLayoutStore.getState().setActiveView("agents");
      return true;
    case "usage":
      useLayoutStore.getState().setActiveView("analytics");
      return true;
    case "export": {
      // Serialize messages to markdown
      const messages = useConversationStore.getState().messages;
      const md = messages.map(m => `**${m.role}:**\n${m.text}`).join("\n\n---\n\n");
      // Open as new editor tab
      useEditorStore.getState().openFile(
        "export://conversation", "Conversation Export", "markdown", md, true
      );
      return true;
    }
    case "rewind": {
      const cwd = useLayoutStore.getState().projectRootPath;
      if (!cwd) return false;
      const checkpoints = await invoke<Array<{tag_name: string}>>(
        "list_checkpoints", { cwd, agentId: null }
      );
      if (checkpoints.length > 0) {
        await invoke("restore_checkpoint", { cwd, tagName: checkpoints[0].tag_name });
      }
      return true;
    }
    default:
      return false; // Not a local command
  }
}
```

### Files to modify

- `src/lib/slashCommands.ts` -- add ~10 new command entries
- `src/lib/slashHandlers.ts` -- new file, local command handlers
- `src/components/chat/ChatInput.tsx` -- integrate local handler dispatch
- `src-tauri/src/git.rs` -- add `git_diff_working` and `git_diff_staged` (shared with Task 3)
- `src-tauri/src/lib.rs` -- register new commands

### Acceptance criteria

- [ ] All 10 new commands appear in slash autocomplete
- [ ] `/diff` opens working tree diff in editor
- [ ] `/tasks` switches to agent view
- [ ] `/usage` switches to analytics view
- [ ] `/fast`, `/branch`, `/context` route to Claude CLI
- [ ] `/rewind` restores the most recent checkpoint
- [ ] `/export` opens conversation as markdown in editor

### Estimated effort: 2 days

---

## Task 5: Git Write Operations

**Goal:** Add stage, unstage, commit, push, pull, and branch creation commands to the Rust backend. Add a basic source control UI to the primary sidebar.

### Backend -- `src-tauri/src/git.rs`

Add the following functions. Note: `validate_branch_name()` already exists (currently `#[allow(dead_code)]`). `validate_git_file_path()` already exists.

```rust
/// Stage files for commit.
pub fn git_stage(cwd: &str, paths: &[String]) -> Result<(), String> {
    for path in paths {
        validate_git_file_path(path)?;
    }
    let mut args = vec!["add", "--"];
    let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    args.extend(path_refs);
    let output = run_git_with_timeout(
        Command::new("git").args(&args).current_dir(cwd),
    )?;
    if !output.status.success() {
        return Err(format!("git add failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

/// Unstage files (restore --staged).
pub fn git_unstage(cwd: &str, paths: &[String]) -> Result<(), String> {
    for path in paths {
        validate_git_file_path(path)?;
    }
    let mut args = vec!["restore", "--staged", "--"];
    let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    args.extend(path_refs);
    let output = run_git_with_timeout(
        Command::new("git").args(&args).current_dir(cwd),
    )?;
    if !output.status.success() {
        return Err(format!("git restore --staged failed: {}",
            String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

/// Commit staged changes.
pub fn git_commit(cwd: &str, message: &str) -> Result<String, String> {
    if message.is_empty() {
        return Err("Commit message must not be empty".to_string());
    }
    // Validate message doesn't contain shell injection
    if message.contains('\0') {
        return Err("Commit message contains null byte".to_string());
    }
    let output = run_git_with_timeout(
        Command::new("git").args(["commit", "-m", message]).current_dir(cwd),
    )?;
    if !output.status.success() {
        return Err(format!("git commit failed: {}",
            String::from_utf8_lossy(&output.stderr)));
    }
    // Return the new commit hash
    let hash_output = run_git_with_timeout(
        Command::new("git").args(["rev-parse", "--short", "HEAD"]).current_dir(cwd),
    )?;
    Ok(String::from_utf8_lossy(&hash_output.stdout).trim().to_string())
}

/// Push to remote.
pub fn git_push(cwd: &str) -> Result<String, String> {
    let output = run_git_with_timeout(
        Command::new("git").args(["push"]).current_dir(cwd),
    )?;
    if !output.status.success() {
        return Err(format!("git push failed: {}",
            String::from_utf8_lossy(&output.stderr)));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string()
        + &String::from_utf8_lossy(&output.stderr).to_string())
}

/// Pull from remote.
pub fn git_pull(cwd: &str) -> Result<String, String> {
    let output = run_git_with_timeout(
        Command::new("git").args(["pull"]).current_dir(cwd),
    )?;
    if !output.status.success() {
        return Err(format!("git pull failed: {}",
            String::from_utf8_lossy(&output.stderr)));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Create and switch to a new branch.
pub fn git_create_branch(cwd: &str, name: &str) -> Result<(), String> {
    validate_branch_name(name)?;
    let output = run_git_with_timeout(
        Command::new("git").args(["checkout", "-b", name]).current_dir(cwd),
    )?;
    if !output.status.success() {
        return Err(format!("git checkout -b failed: {}",
            String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

/// Get the working tree diff.
pub fn git_diff_working(cwd: &str) -> Result<String, String> {
    let output = run_git_with_timeout(
        Command::new("git").args(["diff", "--no-color"]).current_dir(cwd),
    )?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Get the staged diff.
pub fn git_diff_staged(cwd: &str) -> Result<String, String> {
    let output = run_git_with_timeout(
        Command::new("git").args(["diff", "--staged", "--no-color"]).current_dir(cwd),
    )?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
```

### Backend -- `src-tauri/src/lib.rs`

Register new commands:

```rust
#[tauri::command]
#[specta::specta]
fn git_stage(cwd: String, paths: Vec<String>) -> Result<(), String> {
    git::git_stage(&cwd, &paths)
}

#[tauri::command]
#[specta::specta]
fn git_unstage(cwd: String, paths: Vec<String>) -> Result<(), String> {
    git::git_unstage(&cwd, &paths)
}

#[tauri::command]
#[specta::specta]
fn git_commit(cwd: String, message: String) -> Result<String, String> {
    git::git_commit(&cwd, &message)
}

#[tauri::command]
#[specta::specta]
fn git_push(cwd: String) -> Result<String, String> {
    git::git_push(&cwd)
}

#[tauri::command]
#[specta::specta]
fn git_pull(cwd: String) -> Result<String, String> {
    git::git_pull(&cwd)
}

#[tauri::command]
#[specta::specta]
fn git_create_branch(cwd: String, name: String) -> Result<(), String> {
    git::git_create_branch(&cwd, &name)
}

#[tauri::command]
#[specta::specta]
fn git_diff_working(cwd: String) -> Result<String, String> {
    git::git_diff_working(&cwd)
}

#[tauri::command]
#[specta::specta]
fn git_diff_staged(cwd: String) -> Result<String, String> {
    git::git_diff_staged(&cwd)
}
```

Add all 8 to the `tauri_specta::collect_commands![]` macro.

### Frontend -- Source Control UI

Create a new component `src/components/git/SourceControlPanel.tsx` that appears as a view in the primary sidebar (alongside the existing `GitLogPanel`):

**Layout:**
```
┌─────────────────────────────────┐
│ Source Control                   │
├─────────────────────────────────┤
│ [Commit message input........]  │
│ [Commit ✓] [Push ↑] [Pull ↓]   │
├─────────────────────────────────┤
│ ▼ Staged Changes (3)            │
│   M src/main.ts          [−]   │  ← click [−] to unstage
│   A src/new.ts            [−]   │
│   M package.json          [−]   │
├─────────────────────────────────┤
│ ▼ Changes (5)                   │
│   M src/app.tsx           [+]   │  ← click [+] to stage
│   M src/utils.ts          [+]   │
│   ? new-file.txt          [+]   │
│   D old-file.ts           [+]   │
│   M README.md             [+]   │
└─────────────────────────────────┘
```

**Behavior:**
- On mount: call `get_git_status(cwd)` to populate staged/unstaged file lists
- Stage button: calls `git_stage(cwd, [path])`
- Unstage button: calls `git_unstage(cwd, [path])`
- Commit button: calls `git_commit(cwd, message)`, clears input, refreshes status
- Push button: calls `git_push(cwd)`, shows result toast
- Pull button: calls `git_pull(cwd)`, shows result toast
- "Stage All" / "Unstage All" buttons for batch operations
- File click: opens diff view (existing `DiffViewer` component or Monaco inline diff)
- Auto-refresh: listen for `file-changed` Tauri events to re-fetch status

**Wire into sidebar:**
- Add "Source Control" icon to `ActivityBar`
- Route to `SourceControlPanel` in `PrimarySidebar`

### Files to modify

- `src-tauri/src/git.rs` -- add 8 new functions
- `src-tauri/src/lib.rs` -- register 8 new commands
- `src/components/git/SourceControlPanel.tsx` -- new component
- `src/components/layout/ActivityBar.tsx` -- add source control icon
- `src/components/layout/PrimarySidebar.tsx` -- route to SourceControlPanel
- `src/stores/layout.ts` -- add `"source-control"` to view types (if not already present)
- `src/lib/tauriMock.ts` -- add mock implementations for new commands

### Acceptance criteria

- [ ] `git_stage`, `git_unstage`, `git_commit`, `git_push`, `git_pull`, `git_create_branch` work from Rust
- [ ] `git_diff_working`, `git_diff_staged` return diff text
- [ ] Source Control panel shows staged and unstaged changes
- [ ] Stage/Unstage individual files with +/- buttons
- [ ] Commit with message, push, pull buttons work
- [ ] Status refreshes after operations
- [ ] All new commands have mock implementations for browser testing

### Estimated effort: 4-5 days (2 days backend, 2-3 days frontend)

---

## Task 6: Format on Save

**Goal:** Run a code formatter (Prettier, Biome, or dprint) when a file is saved, if one is available in the project.

### Approach

The simplest approach: after `write_file` succeeds, check if a formatter is available and run it on the saved file.

### Backend -- `src-tauri/src/files/operations.rs`

Add a new command that detects and runs a formatter:

```rust
/// Detect which formatter is available in the project.
pub fn detect_formatter(cwd: &str) -> Option<String> {
    let checks = [
        ("prettier", &["node_modules/.bin/prettier"]),
        ("biome", &["node_modules/.bin/biome"]),
        ("dprint", &["node_modules/.bin/dprint"]),
    ];
    for (name, paths) in &checks {
        for path in *paths {
            let full_path = std::path::Path::new(cwd).join(path);
            if full_path.exists() {
                return Some(name.to_string());
            }
        }
    }
    // Also check global prettier
    if Command::new("prettier").arg("--version").output().is_ok() {
        return Some("prettier-global".to_string());
    }
    None
}

/// Format a file using the detected formatter.
pub fn format_file(cwd: &str, file_path: &str) -> Result<(), String> {
    let formatter = detect_formatter(cwd);
    match formatter.as_deref() {
        Some("prettier") => {
            let bin = std::path::Path::new(cwd).join("node_modules/.bin/prettier");
            let output = Command::new(bin)
                .args(["--write", file_path])
                .current_dir(cwd)
                .output()
                .map_err(|e| format!("prettier failed: {}", e))?;
            if !output.status.success() {
                // Silently ignore formatting failures (file might not be supported)
                return Ok(());
            }
        }
        Some("biome") => {
            let bin = std::path::Path::new(cwd).join("node_modules/.bin/biome");
            let output = Command::new(bin)
                .args(["format", "--write", file_path])
                .current_dir(cwd)
                .output()
                .map_err(|e| format!("biome failed: {}", e))?;
            if !output.status.success() {
                return Ok(());
            }
        }
        _ => return Ok(()), // No formatter available
    }
    Ok(())
}
```

### Frontend -- Editor Save Handler

In `MonacoEditor.tsx` or the save handler in the editor store:

```typescript
// After write_file succeeds:
if (settings.formatOnSave) {
  try {
    await invoke("format_file", { cwd: projectRootPath, filePath });
    // Re-read the formatted file and update the editor
    const result = await invoke<FileContent>("read_file", { path: filePath });
    // Update editor content without marking as dirty
    editorRef.current?.setValue(result.content);
  } catch {
    // Silently ignore format failures
  }
}
```

### Settings

Add to `src/stores/settings.ts`:
```typescript
formatOnSave: boolean; // default: true
```

Add to `SettingsPanel` UI: a toggle for "Format on Save".

### Files to modify

- `src-tauri/src/files/operations.rs` -- add `detect_formatter`, `format_file`
- `src-tauri/src/lib.rs` -- register `format_file` command
- `src/stores/settings.ts` -- add `formatOnSave` setting
- `src/stores/editor.ts` or save handler -- call `format_file` after save
- `src/components/settings/SettingsPanel.tsx` -- add toggle
- `src/lib/tauriMock.ts` -- mock `format_file`

### Acceptance criteria

- [ ] Format on save works with Prettier (if present in node_modules)
- [ ] Format on save works with Biome (if present in node_modules)
- [ ] Setting can be toggled off in settings panel
- [ ] Formatting failures are silent (do not block save)
- [ ] Editor content refreshes after formatting

### Estimated effort: 1.5 days

---

## Task 7: Editor Split Groups

**Goal:** Allow users to split the editor into multiple groups (side-by-side or stacked), each with its own tab bar and Monaco instance.

### Approach

Use `react-resizable-panels` (already installed) to create split editor groups.

### Data Model -- `src/stores/editor.ts`

Extend the editor store:

```typescript
interface EditorGroup {
  id: string;
  tabs: EditorTab[];          // Tabs in this group
  activeTabId: string | null; // Currently focused tab in this group
}

interface EditorStoreState {
  groups: EditorGroup[];       // Array of groups (1 = no split, 2+ = split)
  activeGroupId: string;       // Which group is focused
  splitDirection: "horizontal" | "vertical" | null; // null = no split
  
  // Actions
  splitRight: () => void;      // Split horizontally (side by side)
  splitDown: () => void;       // Split vertically (stacked)
  closeSplit: (groupId: string) => void;
  moveTabToGroup: (tabId: string, fromGroupId: string, toGroupId: string) => void;
}
```

### UI Layout

```
┌──────────────────┬──────────────────┐
│ [tab1] [tab2]    │ [tab3] [tab4]    │   ← Each group has its own tab bar
│                  │                  │
│  Monaco Editor   │  Monaco Editor   │   ← Each group has its own Monaco instance
│  (Group 1)       │  (Group 2)       │
│                  │                  │
└──────────────────┴──────────────────┘
```

### Implementation

1. **`src/components/editor/EditorArea.tsx`** (modify existing):
   - Wrap the editor area in `PanelGroup` from `react-resizable-panels`
   - Render one `Panel` per editor group
   - Each panel contains its own `EditorTabs` + `MonacoEditor`

2. **`src/components/editor/EditorTabs.tsx`** (modify existing):
   - Accept a `groupId` prop to know which group's tabs to render
   - Tab context menu: add "Split Right" and "Split Down" options

3. **`src/stores/editor.ts`** (modify):
   - Refactor tab state from flat to grouped
   - Migration: existing `tabs[]` becomes `groups[0].tabs`
   - Keep backward-compatible selectors for components that don't need groups

### Context menu additions

Right-click on a tab:
- **Split Right** -- moves the tab to a new group on the right
- **Split Down** -- moves the tab to a new group below
- Close, Close Others, Close All (existing)

### Files to modify

- `src/stores/editor.ts` -- add group-based state management
- `src/components/editor/EditorArea.tsx` -- render split groups with `PanelGroup`
- `src/components/editor/EditorTabs.tsx` -- add `groupId` prop, context menu options
- `src/components/editor/MonacoEditor.tsx` -- no changes (already takes props)

### Acceptance criteria

- [ ] Right-click tab > "Split Right" creates a side-by-side split
- [ ] Right-click tab > "Split Down" creates a vertical split
- [ ] Each group has independent tabs and active file
- [ ] Closing all tabs in a group removes the split
- [ ] Resize handle between groups works (react-resizable-panels)
- [ ] Opening a file opens in the active (focused) group

### Estimated effort: 3 days

---

## Task 8: Replace in Files (Project-wide)

**Goal:** Extend the existing SearchPanel with a replace input and add a Rust backend for project-wide string replacement.

### Backend -- `src-tauri/src/search.rs`

Add a replace function:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ReplaceResult {
    /// Number of files modified
    pub files_modified: u32,
    /// Number of replacements made
    pub replacements: u32,
    /// Files that were modified (paths)
    pub modified_files: Vec<String>,
}

/// Replace all occurrences of a search pattern in files under `root`.
pub fn replace_in_files(
    root: &str,
    search: &str,
    replace: &str,
    is_regex: bool,
    case_sensitive: bool,
    glob_filter: Option<&str>,
) -> Result<ReplaceResult, String> {
    use ignore::WalkBuilder;

    if search.is_empty() {
        return Err("Search string must not be empty".to_string());
    }

    let compiled_regex = if is_regex {
        if case_sensitive {
            regex::Regex::new(search)
        } else {
            regex::RegexBuilder::new(search).case_insensitive(true).build()
        }
        .map_err(|e| format!("Invalid regex: {}", e))?
    } else {
        let escaped = regex::escape(search);
        if case_sensitive {
            regex::Regex::new(&escaped)
        } else {
            regex::RegexBuilder::new(&escaped).case_insensitive(true).build()
        }
        .map_err(|e| format!("Failed to build search pattern: {}", e))?
    };

    let mut builder = WalkBuilder::new(root);
    builder.hidden(true).git_ignore(true).git_global(true);

    if let Some(glob) = glob_filter {
        let mut types_builder = ignore::types::TypesBuilder::new();
        for g in glob.split(',') {
            let g = g.trim();
            if !g.is_empty() {
                types_builder.add("custom", g)
                    .map_err(|e| format!("Invalid glob: {}", e))?;
            }
        }
        types_builder.select("custom");
        let types = types_builder.build()
            .map_err(|e| format!("Failed to build glob: {}", e))?;
        builder.types(types);
    }

    let mut files_modified: u32 = 0;
    let mut replacements: u32 = 0;
    let mut modified_files = Vec::new();

    for entry in builder.build().flatten() {
        let path = entry.path();
        if !path.is_file() { continue; }

        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let count = compiled_regex.find_iter(&content).count() as u32;
        if count == 0 { continue; }

        let new_content = compiled_regex.replace_all(&content, replace).to_string();
        if new_content != content {
            std::fs::write(path, &new_content)
                .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
            files_modified += 1;
            replacements += count;
            modified_files.push(path.to_string_lossy().replace('\\', "/"));
        }
    }

    Ok(ReplaceResult {
        files_modified,
        replacements,
        modified_files,
    })
}
```

### Frontend -- `src/components/search/SearchPanel.tsx`

Extend the existing panel:

1. Add a second input row below the search input: "Replace" input
2. Add a "Replace All" button (with confirmation dialog)
3. Show a preview: for each match, show the line with the replacement highlighted in green
4. "Replace All" calls `invoke("replace_in_files", { ... })` and shows a result toast

**New state:**
```typescript
const [replaceText, setReplaceText] = useState("");
const [showReplace, setShowReplace] = useState(false);
```

**New UI elements:**
- Toggle button to show/hide replace row (like VS Code's `>` chevron)
- Replace input with same styling as search input
- "Replace All" button
- Per-file "Replace in File" button
- Inline replace preview (show old text struck through + new text highlighted)

### Files to modify

- `src-tauri/src/search.rs` -- add `replace_in_files` function and `ReplaceResult` type
- `src-tauri/src/lib.rs` -- register `replace_in_files` command
- `src/components/search/SearchPanel.tsx` -- add replace input, preview, and button
- `src/lib/tauriMock.ts` -- mock `replace_in_files`

### Acceptance criteria

- [ ] Replace input appears below search input
- [ ] Replace preview shows what will change
- [ ] "Replace All" modifies files and reports count
- [ ] Glob filter applies to replace operations
- [ ] Regex and case-sensitive options apply to replace
- [ ] File watcher picks up changes and updates editor tabs

### Estimated effort: 2-3 days

---

## Task 9: Hardening Pass

**Goal:** Run the full application in Tauri mode, exercise every feature wired in this sprint, and fix integration issues.

### Testing protocol

#### 9a: Browser Mock Testing (Pre-Tauri)

1. `npm run dev` -- start Vite dev server
2. Open `http://localhost:1420`
3. Walk through each feature with mocks:
   - [ ] Create a `.ts` file, verify TypeScript intelligence (Task 1)
   - [ ] Type `/btw test` in chat, verify overlay (Task 2a)
   - [ ] Open session selector, search for sessions (Task 2c)
   - [ ] Type `@` in chat, verify mention autocomplete (Task 3)
   - [ ] Type `/diff` in chat, verify diff opens in editor (Task 4)
   - [ ] Type `/tasks` in chat, verify agents panel opens (Task 4)
   - [ ] Open source control panel, verify file status (Task 5)
   - [ ] Stage/unstage files in source control (Task 5)
   - [ ] Split editor right, verify two groups (Task 7)
   - [ ] Search for text, expand replace, type replacement (Task 8)

#### 9b: Tauri Integration Testing

1. `npm run tauri dev` -- start full Tauri app
2. Open a real project directory
3. Exercise each feature with real backends:
   - [ ] TypeScript intelligence with real `.ts` file
   - [ ] `/btw` sends to real Claude session
   - [ ] Checkpoint list shows real git tags
   - [ ] Session search finds real sessions in `~/.claude/projects/`
   - [ ] `@file:src/main.ts` attaches real file contents
   - [ ] `git stage`, `git commit` work on real repo
   - [ ] Format on save runs real Prettier
   - [ ] Replace in files modifies real files
   - [ ] Editor splits work with real file content

#### 9c: Automated Test Suite

```bash
npx vitest run          # Unit tests (expect 111+ to still pass)
npx playwright test     # E2E tests (needs Vite server running)
```

Add new test coverage for sprint features:

- **`src/stores/__tests__/editor.test.ts`** -- test split group operations
- **`src/lib/__tests__/slashCommands.test.ts`** -- test new commands in filter results
- **`src/lib/__tests__/mentionResolver.test.ts`** -- test mention resolution
- **`e2e/source-control.spec.ts`** -- E2E test for source control panel
- **`e2e/mentions.spec.ts`** -- E2E test for @-mention flow

#### 9d: Security Scan

```bash
npx semgrep scan --config auto src/ src-tauri/src/
```

Focus areas:
- Git command injection in new `git_stage`, `git_commit`, etc.
- Path traversal in `replace_in_files`
- XSS in mention content rendering

#### 9e: Regression Checks

- [ ] Existing E2E tests still pass
- [ ] Existing unit tests still pass
- [ ] File tree, terminal, chat still work
- [ ] Agent orchestration still works
- [ ] Theme switching still works
- [ ] Vim mode still works
- [ ] Command palette still works

### Files to modify/create

- `src/stores/__tests__/editor.test.ts` -- new split group tests
- `src/lib/__tests__/slashCommands.test.ts` -- update for new commands
- `src/lib/__tests__/mentionResolver.test.ts` -- new tests
- `e2e/source-control.spec.ts` -- new E2E
- `e2e/mentions.spec.ts` -- new E2E

### Acceptance criteria

- [ ] All browser mock tests pass manually
- [ ] All Tauri integration tests pass manually
- [ ] `npx vitest run` passes with no regressions
- [ ] `npx playwright test` passes with no regressions
- [ ] Semgrep scan shows no critical findings in new code
- [ ] No console errors during feature walkthrough

### Estimated effort: 2-3 days

---

## Execution Schedule

### Track 1: Verify & Quick Wins (Days 1-3)
- **Day 1:** Task 1 (Monaco TS verification) + Task 2d/2e/2f (verification of previously-fixed features)
- **Day 2:** Task 4 (slash commands) -- backend and frontend
- **Day 3:** Task 2a (Quick Question wiring) + Task 2b (Checkpoint UI) + Task 2c (Session search)

### Track 2: New Feature Build (Days 3-10)
- **Days 3-5:** Task 5 (Git write operations -- backend)
- **Days 5-7:** Task 5 (Git write operations -- Source Control UI)
- **Days 7-10:** Task 3 (@-mentions) -- runs in parallel with Track 1 Day 3 onward

### Track 3: Editor & Search Enhancement (Days 8-13)
- **Days 8-10:** Task 7 (Editor split groups)
- **Days 10-12:** Task 8 (Replace in files)
- **Day 12:** Task 6 (Format on save)

### Track 4: Hardening (Days 13-15)
- **Days 13-14:** Task 9 (Full testing pass)
- **Day 15:** Bug fixes from testing

### Dependency Graph

```
Task 1 (Monaco) ─────────────────────┐
Task 2 (Wiring) ─────────────────────┤
Task 4 (Slash cmds) ────────┐        │
                             ├───> Task 9 (Hardening)
Task 3 (@-mentions) ────────┤        │
Task 5 (Git write ops) ─────┤        │
Task 6 (Format on save) ────┤        │
Task 7 (Editor splits) ─────┤        │
Task 8 (Replace in files) ──┘        │
                                     │
```

Tasks 1-8 are largely independent. Tasks 3 and 4 share the `git_diff_working` backend command. Task 9 depends on all others.

---

## Files Summary

### New files (estimate 8-10)

| File | Task | Purpose |
|------|------|---------|
| `src/components/chat/MentionAutocomplete.tsx` | 3 | @-mention dropdown UI |
| `src/components/chat/MentionChip.tsx` | 3 | Visual mention tag in input |
| `src/lib/mentionResolver.ts` | 3 | Resolves mentions to text content |
| `src/lib/slashHandlers.ts` | 4 | Local slash command handlers |
| `src/components/git/SourceControlPanel.tsx` | 5 | Stage/commit/push UI |
| `src/components/agents/CheckpointList.tsx` | 2b | Checkpoint list with restore/delete |
| `src/lib/__tests__/mentionResolver.test.ts` | 9 | Unit tests for mention resolution |
| `e2e/source-control.spec.ts` | 9 | E2E for source control |
| `e2e/mentions.spec.ts` | 9 | E2E for @-mentions |

### Modified files (estimate 15-18)

| File | Tasks | Changes |
|------|-------|---------|
| `src-tauri/src/git.rs` | 3, 4, 5 | Add 8 new functions (stage, unstage, commit, push, pull, create_branch, diff_working, diff_staged) |
| `src-tauri/src/lib.rs` | 3, 4, 5, 6, 8 | Register ~10 new Tauri commands |
| `src-tauri/src/search.rs` | 8 | Add `replace_in_files` function |
| `src-tauri/src/files/operations.rs` | 6 | Add `detect_formatter`, `format_file` |
| `src/components/chat/ChatInput.tsx` | 3, 4 | @-mention detection, local slash handler dispatch |
| `src/components/chat/QuickQuestionOverlay.tsx` | 2a | Wire to Claude session |
| `src/components/chat/SessionSelector.tsx` | 2c | Wire search input to `search_sessions` |
| `src/components/search/SearchPanel.tsx` | 8 | Add replace input, preview, Replace All button |
| `src/components/editor/MonacoEditor.tsx` | 1 | TS worker config if needed |
| `src/components/editor/EditorArea.tsx` | 7 | Split group rendering with PanelGroup |
| `src/components/editor/EditorTabs.tsx` | 7 | Group-aware tabs, context menu |
| `src/stores/editor.ts` | 7 | Group-based state management |
| `src/stores/settings.ts` | 6 | Add `formatOnSave` setting |
| `src/lib/slashCommands.ts` | 4 | Add ~10 new command entries |
| `src/lib/tauriMock.ts` | all | Mock implementations for new commands |
| `src/components/layout/ActivityBar.tsx` | 5 | Add Source Control icon |
| `src/components/layout/PrimarySidebar.tsx` | 5 | Route to SourceControlPanel |
| `src/components/settings/SettingsPanel.tsx` | 6 | Format on save toggle |

---

## Sprint Exit Criteria

| Criterion | Measurement |
|-----------|-------------|
| Monaco TS intelligence verified | Autocomplete, hover, squiggles work in `.ts` files |
| 6 disconnected backends wired | Quick question, checkpoints, session search, agent detail, coordinator, tool results all functional |
| @-mentions working | `@file`, `@selection`, `@terminal`, `@git` attach context to messages |
| 10+ slash commands added | Appear in autocomplete, route correctly |
| Git write operations | Stage, unstage, commit, push, pull from Source Control panel |
| Format on save | Prettier/Biome runs on save when available |
| Editor split groups | Split right/down from tab context menu |
| Replace in files | Search panel has replace with preview |
| All tests passing | Vitest + Playwright green, Semgrep clean |

### Expected parity improvement

Based on the Feature Gap SYNTHESIS scoring:
- **Before sprint:** ~22% combined parity
- **After sprint:** ~33-38% combined parity
- Key jumps: Code intelligence (0% to partial), Claude CLI commands (25% to ~45%), Git operations (partial to most daily ops)

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Monaco TS worker not active | Day 1 verification. Fix is well-documented (compiler options config). |
| @-mentions complexity creep | Scope to 4 mention types only. No file tree picker in v1 -- use simple filename autocomplete from project index. |
| Editor split groups break existing tab behavior | Implement behind the existing store API. Groups[0] is backward-compatible with single-group mode. |
| Git write operations on Windows | All commands use `Command::new("git")` which works on Windows if git is on PATH. ConPTY not needed. |
| Replace in files data loss | Confirmation dialog with file count. Respect `.gitignore`. Checkpoint before large replacements. |
| Sprint takes longer than 3 weeks | Tasks are independent. Ship what is done at 2 weeks; remaining tasks roll to next sprint. |
