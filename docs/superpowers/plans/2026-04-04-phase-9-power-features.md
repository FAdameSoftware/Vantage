# Vantage Phase 9: Claude Code Power Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface hidden Claude Code CLI capabilities as first-class UI elements so users never need to memorize flags, environment variables, or slash-command syntax. Every feature in this phase wraps an existing CLI mechanism with a visual control.

**Architecture:** Most features are thin UI wrappers. The effort level and permission mode flags require extending the Rust `ClaudeProcess::spawn` to accept an options struct. The `/btw` overlay and `/compact` input field are purely frontend. The writer/reviewer workflow and subagent investigation reuse the existing multi-agent infrastructure from Phase 7.

**Tech Stack:** Existing Tauri IPC (tauri-specta), Zustand stores, shadcn/ui components, Claude Code CLI flags (`--permission-mode`, `--from-pr`, `CLAUDE_CODE_EFFORT_LEVEL` env var)

---

## Dependency Map

```
Task 1 (Settings store + Rust spawn options)
  |
  +-- Task 2 (Effort level UI in settings)
  +-- Task 3 (Ultrathink toggle on ChatInput) -- depends on Task 1
  +-- Task 5 (Plan mode toggle) -- depends on Task 1
  +-- Task 8 (--from-pr resume) -- depends on Task 1
  |
Task 4 (/btw overlay) -- independent
Task 6 (Targeted compact) -- independent
Task 7 (Writer/Reviewer workflow) -- independent (reuses agents store)
Task 9 (Subagent investigation) -- independent (reuses agents store)
Task 10 (.worktreeinclude + Interview mode) -- independent
```

Tasks 4, 6, 7, 9, 10 can run in parallel with each other and with Task 1. Tasks 2, 3, 5, 8 depend on Task 1.

---

### Task 1: Extend Spawn Options and Settings Store for CLI Flags

**Files:**
- Modify: `src/stores/settings.ts`
- Modify: `src-tauri/src/claude/process.rs`
- Modify: `src-tauri/src/claude/session.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/hooks/useClaude.ts`
- Modify: `src/lib/tauriMock.ts`

This task is the foundation. It adds new session-level settings to the Zustand settings store and extends the Rust process spawner to accept those settings as CLI flags and environment variables.

Currently `ClaudeProcess::spawn` (in `src-tauri/src/claude/process.rs`, lines 28-91) takes `cwd`, `session_id`, `resume_session_id`, and `resume` as parameters. The CLI command is built with hardcoded flags (`-p ""`, `--output-format stream-json`, etc.). We need to extend this to accept an options struct that controls effort level and permission mode.

The settings store (`src/stores/settings.ts`, 85 lines) uses Zustand `persist` middleware. It currently stores editor/terminal preferences but no Claude-specific session options.

The `SessionManager::start_session` (`src-tauri/src/claude/session.rs`, lines 41-61) and the Tauri command `claude_start_session` (`src-tauri/src/lib.rs`, lines 118-129) are the entry points that need to thread the new options through.

The frontend `useClaude` hook (`src/hooks/useClaude.ts`, lines 507-527) calls `invoke("start_claude_session", ...)` and needs to pass the options from the settings store.

- [ ] **Step 1: Add Claude session settings to the settings store**

In `src/stores/settings.ts`, add the following fields to `SettingsState` interface (after line 19, the `showBuddy` field):

```typescript
/** Claude Code effort level: controls reasoning depth */
effortLevel: "low" | "medium" | "high";
/** Whether to start sessions in plan mode (--permission-mode plan) */
planMode: boolean;
```

Add the corresponding setters to the interface:

```typescript
setEffortLevel: (level: "low" | "medium" | "high") => void;
setPlanMode: (value: boolean) => void;
```

Add defaults in the store creator (after `showBuddy: true` on line 51):

```typescript
effortLevel: "high",
planMode: false,
```

Add the setter implementations:

```typescript
setEffortLevel: (level) => set({ effortLevel: level }),
setPlanMode: (value) => set({ planMode: value }),
```

Add both fields to the `partialize` function (after `showBuddy` on line 81):

```typescript
effortLevel: state.effortLevel,
planMode: state.planMode,
```

- [ ] **Step 2: Create a SpawnOptions struct in Rust**

In `src-tauri/src/claude/process.rs`, add a new struct before the `ClaudeProcess` struct (before line 15):

```rust
/// Options that control how a Claude Code CLI session is spawned.
#[derive(Debug, Clone, Default, Serialize)]
pub struct SpawnOptions {
    /// Effort level: "low", "medium", or "high".
    /// Sets CLAUDE_CODE_EFFORT_LEVEL env var.
    pub effort_level: Option<String>,
    /// If true, pass --permission-mode plan to the CLI.
    pub plan_mode: bool,
    /// If set, pass --from-pr <number> to the CLI.
    pub from_pr: Option<u32>,
}
```

- [ ] **Step 3: Update ClaudeProcess::spawn to accept SpawnOptions**

Modify the `spawn` method signature to add `options: &SpawnOptions` as the last parameter (after `resume: bool`).

After the session/resume flags block (after line 67), add:

```rust
// Effort level via environment variable
if let Some(ref level) = options.effort_level {
    cmd.env("CLAUDE_CODE_EFFORT_LEVEL", level);
}

// Plan mode
if options.plan_mode {
    cmd.arg("--permission-mode").arg("plan");
}

// Resume from PR
if let Some(pr_number) = options.from_pr {
    cmd.arg("--from-pr").arg(pr_number.to_string());
}
```

- [ ] **Step 4: Thread SpawnOptions through SessionManager and Tauri command**

Update `SessionManager::start_session` in `src-tauri/src/claude/session.rs` to accept `options: SpawnOptions` and pass it through to `ClaudeProcess::spawn`:

```rust
pub async fn start_session(
    &self,
    cwd: &str,
    resume_session_id: Option<&str>,
    resume: bool,
    options: SpawnOptions,
) -> Result<String, String> {
    // ... existing code ...
    let process = ClaudeProcess::spawn(
        &self.app_handle,
        cwd,
        &internal_id,
        resume_session_id,
        resume,
        &options,
    )?;
    // ... rest unchanged ...
}
```

Update `claude_start_session` in `src-tauri/src/lib.rs` to accept option parameters:

```rust
#[tauri::command]
#[specta::specta]
async fn claude_start_session(
    app_handle: tauri::AppHandle,
    cwd: String,
    session_id: Option<String>,
    resume: bool,
    effort_level: Option<String>,
    plan_mode: bool,
    from_pr: Option<u32>,
) -> Result<String, String> {
    let options = SpawnOptions {
        effort_level,
        plan_mode,
        from_pr,
    };
    let state = app_handle.state::<TokioMutex<SessionManager>>();
    let manager = state.lock().await;
    manager
        .start_session(&cwd, session_id.as_deref(), resume, options)
        .await
}
```

- [ ] **Step 5: Update the frontend to pass spawn options**

In `src/hooks/useClaude.ts`, update both `invoke("start_claude_session", ...)` calls (lines 511 and 540) and `invoke("claude_start_session", ...)` (line 629) to read from the settings store and pass the new parameters:

```typescript
const settings = useSettingsStore.getState();
const id = await invoke<string>("start_claude_session", {
  cwd: sessionCwd,
  resumeSessionId: resumeSessionId ?? null,
  effortLevel: settings.effortLevel,
  planMode: settings.planMode,
  fromPr: null,
});
```

For the multi-agent `claude_start_session` call, pass defaults (agents inherit the global effort level, not plan mode):

```typescript
const sessionId = await invoke<string>("claude_start_session", {
  cwd,
  sessionId: null,
  resume: false,
  effortLevel: useSettingsStore.getState().effortLevel,
  planMode: false,
  fromPr: null,
});
```

Update the mock layer in `src/lib/tauriMock.ts` so both mock commands accept and ignore the new parameters.

- [ ] **Step 6: Add unit test for new settings fields**

Add a test in `src/stores/__tests__/settings.test.ts` (create if it does not exist) that verifies:
- Default `effortLevel` is `"high"`
- Default `planMode` is `false`
- `setEffortLevel("low")` updates the store
- `setPlanMode(true)` updates the store

---

### Task 2: Effort Level Dropdown in Settings and Status Bar

**Files:**
- Create: `src/components/shared/EffortLevelSelector.tsx`
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/components/settings/SettingsPanel.tsx`

This task adds a visual effort level selector. The primary placement is in the status bar (always visible, one-click change). A secondary placement goes in the Settings panel for discoverability.

The status bar (`src/components/layout/StatusBar.tsx`, 287 lines) has a left section (git branch, errors, buddy, index status) and a right section (vim mode, cursor position, language, Claude status, usage, model). The effort level indicator fits in the right section between the Claude status indicator and the usage section.

The settings panel currently has four tabs. Rather than adding a fifth tab for a single dropdown, the effort level selector will be a reusable component that can be placed anywhere.

- [ ] **Step 1: Create the EffortLevelSelector component**

Create `src/components/shared/EffortLevelSelector.tsx`. This is a small dropdown that reads from and writes to `useSettingsStore`:

```typescript
import { useSettingsStore } from "@/stores/settings";
import { Gauge } from "lucide-react";
```

The component renders a button showing the current level with a colored icon. Clicking cycles through the three levels (low -> medium -> high -> low). The display:
- **low**: dimmed text, single bar icon metaphor
- **medium**: normal text, two bars
- **high**: bright text, three bars (uses `--color-green`)

Implementation: a `<button>` with `onClick` that calls `setEffortLevel` with the next value in the cycle. Display the current level as text like "Low", "Med", "High". Use the `Gauge` icon from lucide-react at size 12.

The component should accept an optional `compact` prop (boolean). When compact, it shows only the icon and a single letter (L/M/H) for status bar use. When not compact, it shows the full word and a brief explanation.

- [ ] **Step 2: Add EffortLevelSelector to the StatusBar**

In `src/components/layout/StatusBar.tsx`, import `EffortLevelSelector` and add it in the right section, between the Claude session status indicator (line 183-189) and the usage button (line 193). Place it as:

```tsx
{/* Effort level */}
<EffortLevelSelector compact />
```

This gives users a persistent, always-visible control. The effort level changes take effect on the next session start (the status bar should show a tooltip explaining this).

- [ ] **Step 3: Add effort level explanation to SettingsPanel**

In the SettingsPanel, add a "Claude" tab that contains the `EffortLevelSelector` (non-compact) along with the plan mode toggle (from Task 5). Update the `SettingsTab` type to include `"claude"`, add the tab entry with a `Brain` icon, and render:

```tsx
{activeTab === "claude" && <ClaudeSettingsTab />}
```

Create `src/components/settings/ClaudeSettingsTab.tsx` as a simple panel with:
- EffortLevelSelector (non-compact)
- PlanModeToggle (placeholder for Task 5)
- A brief description of what effort levels do

---

### Task 3: Ultrathink Toggle on Chat Input

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`

This task adds a "Deep Think" toggle button to the chat input bar. When enabled, the word "ultrathink" is prepended to the user's message before sending. This uses Claude Code's documented feature where including "ultrathink" anywhere in the prompt allocates maximum reasoning budget.

The ChatInput component (`src/components/chat/ChatInput.tsx`, 212 lines) has a container div with a textarea and a send/stop button. The toggle button goes between the textarea and the send button, inside the `flex items-end gap-1.5` div (line 157).

This is purely a frontend transformation -- no Rust changes needed. The ultrathink keyword is injected into the message text before it reaches `onSend`.

- [ ] **Step 1: Add ultrathink state and toggle button to ChatInput**

In `src/components/chat/ChatInput.tsx`:

Add state: `const [ultrathink, setUltrathink] = useState(false);`

Import `Brain` from lucide-react (add to the existing import on line 2).

In the `handleSend` callback, modify the message before sending:

```typescript
const handleSend = useCallback(() => {
  const trimmed = text.trim();
  if (!trimmed || isStreaming || disabled) return;
  // Prepend ultrathink keyword when Deep Think is enabled
  const message = ultrathink ? `ultrathink ${trimmed}` : trimmed;
  onSend(message);
  setText("");
  setShowSlash(false);
  setSlashQuery("");
  if (textareaRef.current) {
    textareaRef.current.style.height = "auto";
  }
}, [text, isStreaming, disabled, onSend, ultrathink]);
```

Add the toggle button in the input bar, before the send/stop button (before line 178):

```tsx
<button
  type="button"
  className="p-1 rounded transition-colors hover:bg-[var(--color-surface-1)]"
  style={{
    color: ultrathink ? "var(--color-mauve)" : "var(--color-overlay-0)",
  }}
  onClick={() => setUltrathink((u) => !u)}
  aria-label={ultrathink ? "Disable Deep Think" : "Enable Deep Think"}
  title={ultrathink ? "Deep Think ON — max reasoning" : "Deep Think OFF"}
>
  <Brain size={14} />
</button>
```

- [ ] **Step 2: Add visual indicator when ultrathink is active**

When `ultrathink` is true, add a subtle indicator below the input bar. Replace the hint text line (line 207) with a conditional:

```tsx
<p
  className="text-center mt-1 text-[10px]"
  style={{ color: ultrathink ? "var(--color-mauve)" : "var(--color-overlay-0)" }}
>
  {ultrathink ? "Deep Think enabled — maximum reasoning budget" : hintText}
</p>
```

This gives immediate visual feedback that the mode is active without cluttering the input area.

---

### Task 4: /btw Side Questions — Quick Question Overlay

**Files:**
- Create: `src/components/chat/QuickQuestionOverlay.tsx`
- Create: `src/stores/quickQuestion.ts`
- Modify: `src/components/chat/ChatInput.tsx`
- Modify: `src/components/chat/ChatPanel.tsx`
- Modify: `src/components/layout/IDELayout.tsx` (keyboard shortcut registration)
- Modify: `src/lib/slashCommands.ts`

This task implements the `/btw` feature as a floating overlay. In Claude Code, `/btw <question>` answers a question without adding it to the conversation history -- it is zero-context-cost. Vantage surfaces this as a separate overlay panel that opens via keyboard shortcut (Ctrl+Shift+Q) or by typing `/btw` in the chat input.

The overlay appears above the chat panel, shows the question and response, and can be dismissed. It does not pollute the main conversation store. It uses its own tiny Zustand store.

- [ ] **Step 1: Create the quickQuestion store**

Create `src/stores/quickQuestion.ts`:

```typescript
import { create } from "zustand";

export interface QuickQuestionState {
  /** Whether the overlay is visible */
  isOpen: boolean;
  /** The question being asked */
  question: string;
  /** The response text (streamed in) */
  response: string;
  /** Whether a response is currently streaming */
  isLoading: boolean;
  /** Error message if the request failed */
  error: string | null;

  open: () => void;
  close: () => void;
  ask: (question: string) => void;
  appendResponse: (text: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useQuickQuestionStore = create<QuickQuestionState>()((set) => ({
  isOpen: false,
  question: "",
  response: "",
  isLoading: false,
  error: null,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  ask: (question) => set({ question, response: "", isLoading: true, error: null, isOpen: true }),
  appendResponse: (text) => set((s) => ({ response: s.response + text })),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
  reset: () => set({ isOpen: false, question: "", response: "", isLoading: false, error: null }),
}));
```

- [ ] **Step 2: Create the QuickQuestionOverlay component**

Create `src/components/chat/QuickQuestionOverlay.tsx`. This renders as a floating panel positioned above the chat input area.

Structure:
- Outer container: `position: absolute`, anchored to the bottom of the chat panel, full width, with a max-height of 300px and overflow-y-auto.
- Header bar: "Quick Question" title + close button (X icon).
- Question display: the user's question in a muted style.
- Response area: the AI response, rendered with basic markdown (reuse the same rendering from `MessageBubble` or just `whitespace-pre-wrap`).
- Input field at the bottom: a text input for typing the question + send button. Auto-focused on open.

The overlay sends the message through the main Claude session by prepending `/btw ` to the message text. The key difference from a normal message is that the response is captured in the quickQuestion store instead of the conversation store. To achieve this without modifying the Rust backend:

**Approach:** Send `/btw <question>` as a normal message via `useClaude.sendMessage`. The CLI handles `/btw` natively -- it processes the question and returns a result without adding to conversation history. The response comes back through the normal `claude_message` event stream. On the frontend, detect when the most recent user message started with `/btw` and route the next assistant response to the quickQuestion store instead of displaying it in the main chat.

In `ChatPanel.tsx`, intercept the send:
```typescript
const handleSend = useCallback((content: string) => {
  if (content.startsWith("/btw ")) {
    useQuickQuestionStore.getState().ask(content.slice(5));
  }
  autoScrollRef.current = true;
  const cwd = session?.cwd ?? "C:/CursorProjects/Vantage";
  sendMessage(content, cwd);
}, [sendMessage, session?.cwd]);
```

- [ ] **Step 3: Add keyboard shortcut and /btw slash command integration**

In `src/components/layout/IDELayout.tsx`, register a global keyboard handler for `Ctrl+Shift+Q` that opens the overlay:

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === "Q") {
      e.preventDefault();
      useQuickQuestionStore.getState().open();
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);
```

In `src/lib/slashCommands.ts`, add `/btw` to `BUILTIN_COMMANDS`:

```typescript
{ name: "btw", description: "Ask a quick question (zero context cost)", source: "built-in", isSkill: false },
```

In `ChatInput.tsx`, detect when the user selects or types `/btw ` and auto-open the overlay instead of keeping it in the main input:

```typescript
// In handleChange, after the existing slash detection:
if (val.startsWith("/btw ") && val.length > 5) {
  useQuickQuestionStore.getState().ask(val.slice(5));
  setText("");
  setShowSlash(false);
  return;
}
```

- [ ] **Step 4: Render the overlay in ChatPanel**

In `src/components/chat/ChatPanel.tsx`, import and render the overlay:

```tsx
import { QuickQuestionOverlay } from "./QuickQuestionOverlay";

// Inside the return, after the ChatInput and before the closing div:
<QuickQuestionOverlay />
```

The overlay uses `useQuickQuestionStore` to determine visibility and content. It renders conditionally when `isOpen` is true, positioned absolutely over the chat area.

---

### Task 5: Plan Mode Toggle

**Files:**
- Create: `src/components/shared/PlanModeToggle.tsx`
- Modify: `src/components/settings/ClaudeSettingsTab.tsx` (created in Task 2)
- Modify: `src/components/chat/ChatPanel.tsx`

This task adds a "Plan Mode" toggle. When enabled, Claude creates execution plans without modifying files. The toggle sets `--permission-mode plan` on the CLI via the spawn options from Task 1.

Plan mode is a session-level setting -- changing it requires restarting the session. The UI should make this clear.

- [ ] **Step 1: Create the PlanModeToggle component**

Create `src/components/shared/PlanModeToggle.tsx`:

```typescript
import { useSettingsStore } from "@/stores/settings";
import { ClipboardList } from "lucide-react";
```

The component renders a toggle switch (styled button) with the `ClipboardList` icon. When plan mode is on, the button shows "Plan Mode" in the accent color (`--color-peach`). When off, it is dimmed.

Clicking calls `useSettingsStore.getState().setPlanMode(!current)`.

Include a tooltip: "When enabled, Claude creates plans without modifying files. Takes effect on next session."

- [ ] **Step 2: Add PlanModeToggle to the ChatPanel header**

In `src/components/chat/ChatPanel.tsx`, add the toggle in the header bar (lines 146-183), next to the model display and the new session button:

```tsx
<PlanModeToggle />
```

This gives users a visible, always-accessible toggle right where they interact with Claude.

- [ ] **Step 3: Show plan mode indicator in the chat header**

When `planMode` is true in the settings store, show a small badge in the chat header:

```tsx
{planMode && (
  <span
    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
    style={{
      backgroundColor: "var(--color-peach)",
      color: "var(--color-base)",
    }}
  >
    PLAN
  </span>
)}
```

Also add a system-style message at the top of a plan-mode conversation explaining that Claude will create plans without executing them.

- [ ] **Step 4: Add PlanModeToggle to ClaudeSettingsTab**

In the ClaudeSettingsTab created in Task 2, add the PlanModeToggle below the EffortLevelSelector with a description:

> "Plan Mode starts sessions with `--permission-mode plan`. Claude will analyze your request and produce a step-by-step plan without making any file changes. You can review and edit the plan before executing it."

---

### Task 6: Targeted Compact — /compact with Preservation Input

**Files:**
- Create: `src/components/chat/CompactDialog.tsx`
- Modify: `src/components/chat/ChatPanel.tsx`

This task adds a "Compact" button in the chat panel header with an input field for specifying what to preserve. In Claude Code, `/compact Focus on the API changes` summarizes the conversation while keeping the specified topic in full detail. The default `/compact` without arguments loses everything equally. The UI makes the "what to preserve" input prominent and easy to use.

- [ ] **Step 1: Create the CompactDialog component**

Create `src/components/chat/CompactDialog.tsx`. This is a small popover/dialog that opens when the user clicks the "Compact" button.

Structure:
- A button with the `Minimize2` icon (from lucide-react) labeled "Compact" that opens the dialog.
- When open, a small popover appears below the button containing:
  - A text input with placeholder "What to preserve? (e.g., API changes, auth logic)"
  - Two buttons: "Compact" (sends `/compact <text>`) and "Compact All" (sends `/compact` with no args)
- The popover closes after sending.

The component accepts an `onSend: (message: string) => void` prop. When the user clicks "Compact", it calls `onSend("/compact " + inputText)`. When they click "Compact All", it calls `onSend("/compact")`.

```typescript
import { useState, useRef, useEffect } from "react";
import { Minimize2 } from "lucide-react";
```

Implementation details:
- Use a `<div>` with absolute positioning as the popover (keep it simple, no library needed).
- The input field auto-focuses when the popover opens.
- Pressing Enter in the input field triggers "Compact" with the current text.
- Escape closes the popover.
- Clicking outside closes the popover (use a click-outside handler).

- [ ] **Step 2: Add CompactDialog to the ChatPanel header**

In `src/components/chat/ChatPanel.tsx`, import `CompactDialog` and add it in the header bar, next to the SessionSelector:

```tsx
<CompactDialog onSend={handleSend} />
```

The CompactDialog only shows when there is an active session with messages (no point compacting an empty conversation):

```tsx
{messages.length > 0 && session && <CompactDialog onSend={handleSend} />}
```

---

### Task 7: Writer/Reviewer Workflow

**Files:**
- Create: `src/components/agents/WriterReviewerLauncher.tsx`
- Modify: `src/components/chat/ChatPanel.tsx`
- Modify: `src/hooks/useClaude.ts`

This task adds a "Build & Review" workflow button. Clicking it spawns two agents: a builder (writer) that implements the task, and a reviewer that evaluates the builder's output with fresh context. This maps directly onto the existing coordinator/specialist/verifier agent hierarchy from Phase 7.

The existing agents store (`src/stores/agents.ts`) already supports roles (`coordinator`, `specialist`, `verifier`, `builder`), parent-child relationships, and the auto-trigger mechanism where a verifier starts working when a specialist completes (lines 372-389).

The `useClaude` hook already has `startAgentSession` and `sendAgentMessage` for multi-agent workflows.

- [ ] **Step 1: Create the WriterReviewerLauncher component**

Create `src/components/agents/WriterReviewerLauncher.tsx`. This is a button + dialog workflow:

1. User clicks "Build & Review" button (icon: `GitPullRequestDraft` from lucide-react).
2. A dialog opens with:
   - A text area for the task description (required).
   - A checkbox: "Auto-start review when build completes" (default: checked).
   - A "Launch" button.
3. On launch:
   - Create a coordinator agent via `useAgentsStore.getState().createAgent({ name: "Build & Review Coordinator", taskDescription, role: "coordinator" })`.
   - Create a builder child: `createChildAgent(coordinatorId, { name: "Builder", taskDescription, role: "specialist" })`.
   - Create a reviewer child: `createChildAgent(coordinatorId, { name: "Reviewer", taskDescription: "Review the builder's output for correctness, edge cases, and code quality", role: "verifier" })`.
   - Start the builder agent's session via `startAgentSession`.
   - Send the task description to the builder.
   - The existing `updateAgentStatus` auto-trigger (agents store lines 372-389) will start the reviewer when the builder completes.

The component accepts `startAgentSession` and `sendAgentMessage` as props (or gets them from a context/hook).

- [ ] **Step 2: Add the launcher to the ChatPanel**

In `src/components/chat/ChatPanel.tsx`, add the launcher button in the header:

```tsx
<WriterReviewerLauncher
  onLaunch={(taskDescription) => {
    // Create the agent trio and start the workflow
    // (implementation in the component itself)
  }}
/>
```

Alternatively, place this in the agents panel header (if the agents panel is visible). The exact placement depends on discoverability -- the chat panel header is more visible to users who have not yet discovered the agents panel.

- [ ] **Step 3: Show workflow progress inline**

When a Build & Review workflow is active, show a small status indicator in the chat panel:

```tsx
{activeWorkflows.length > 0 && (
  <div className="px-4 py-1.5 text-xs" style={{ borderBottom: "1px solid var(--color-surface-0)" }}>
    <span style={{ color: "var(--color-peach)" }}>Build & Review:</span>{" "}
    <span style={{ color: "var(--color-subtext-0)" }}>{workflowStatus}</span>
  </div>
)}
```

The status shows "Builder working...", "Review in progress...", or "Review complete" based on the child agent statuses.

---

### Task 8: --from-pr Resume in Git Panel

**Files:**
- Create: `src/components/shared/ResumeFromPR.tsx`
- Modify: `src/hooks/useClaude.ts`
- Modify: `src/components/chat/ChatPanel.tsx` (or a dedicated Git sidebar section)

This task adds a "Resume from PR" feature. The Claude Code CLI supports `--from-pr <number>` which loads the session that created a specific pull request, giving full context of the original development.

The spawn options from Task 1 already include `from_pr: Option<u32>`. This task adds the UI to trigger it.

- [ ] **Step 1: Create the ResumeFromPR component**

Create `src/components/shared/ResumeFromPR.tsx`. This is a small form:

1. A button labeled "Resume from PR" with a `GitPullRequest` icon.
2. Clicking opens a popover with:
   - A number input for the PR number.
   - A "Resume" button.
3. On submit, it starts a new session with the `fromPr` option set.

```typescript
import { useState } from "react";
import { GitPullRequest } from "lucide-react";
```

The component accepts an `onResume: (prNumber: number) => void` prop.

- [ ] **Step 2: Wire up the resume action in useClaude**

In `src/hooks/useClaude.ts`, add a new action:

```typescript
const resumeFromPR = useCallback(
  async (prNumber: number, cwd?: string) => {
    // Stop any existing session
    if (sessionIdRef.current) {
      await stopSession();
    }

    const sessionCwd = cwd ?? useConversationStore.getState().session?.cwd ?? "C:/CursorProjects/Vantage";
    setConnectionStatus("starting");
    try {
      const settings = useSettingsStore.getState();
      const id = await invoke<string>("start_claude_session", {
        cwd: sessionCwd,
        resumeSessionId: null,
        effortLevel: settings.effortLevel,
        planMode: false,
        fromPr: prNumber,
      });
      sessionIdRef.current = id;
      const session: SessionMetadata = { sessionId: id, cwd: sessionCwd };
      setSession(session);
    } catch (err) {
      setConnectionStatus("error", String(err));
    }
  },
  [setConnectionStatus, setSession, stopSession],
);
```

Add `resumeFromPR` to the return value of the hook.

- [ ] **Step 3: Place ResumeFromPR in the ChatPanel**

Add the component in the chat panel header area, visible when there is no active session or as part of the session selector dropdown. When the user clicks "Resume from PR" and enters a number, it calls `resumeFromPR(prNumber)`.

In the ChatPanel:

```tsx
const { sendMessage, interruptSession, stopSession, resumeFromPR } = useClaude();

// In the header:
<ResumeFromPR onResume={(pr) => resumeFromPR(pr, session?.cwd)} />
```

---

### Task 9: Subagent Investigation from File Explorer

**Files:**
- Modify: `src/components/files/FileExplorer.tsx`
- Modify: `src/hooks/useClaude.ts`

This task adds an "Investigate with Claude" context menu action to the file explorer. When triggered on a file or folder, it spawns a subagent that explores the selected path and reports a summary back to the main conversation.

The file explorer (`src/components/files/FileExplorer.tsx`, 318 lines) already has a context menu with items for New File, New Folder, Rename, Delete, and Copy Path (lines 270-314). The "Investigate" action is added to this menu.

The existing multi-agent infrastructure (agents store + `useClaude.startAgentSession` + `sendAgentMessage`) handles the subagent lifecycle.

- [ ] **Step 1: Add "Investigate with Claude" to the file explorer context menu**

In `src/components/files/FileExplorer.tsx`, add a new context menu item after "Copy Path" (after line 312):

```tsx
<ContextMenuSeparator />
<ContextMenuItem
  onClick={handleInvestigate}
  className="text-xs"
  style={{ color: "var(--color-blue)" }}
>
  Investigate with Claude
</ContextMenuItem>
```

Import `useAgentsStore` and get `createAgent` from it. Import the `Search` icon from lucide-react for the menu item.

- [ ] **Step 2: Implement the handleInvestigate callback**

In the same file, add:

```typescript
const handleInvestigate = useCallback(async () => {
  if (!contextNode) return;

  const isDir = !contextNode.is_file;
  const targetDesc = isDir
    ? `the directory ${contextNode.path}`
    : `the file ${contextNode.path}`;

  const taskDescription = `Investigate ${targetDesc}. Analyze its structure, purpose, key patterns, and report a concise summary. Do not modify any files.`;

  // Create a subagent
  const agentId = useAgentsStore.getState().createAgent({
    name: `Investigate: ${contextNode.name}`,
    taskDescription,
    role: "specialist",
  });

  // Start the agent session and send the investigation prompt
  // The agent will use the project root as cwd
  if (rootPath) {
    // Dispatch a custom event that the agents panel can pick up
    window.dispatchEvent(
      new CustomEvent("vantage:investigate", {
        detail: { agentId, taskDescription, cwd: rootPath },
      })
    );
  }
}, [contextNode, rootPath]);
```

The actual session start happens in the agents panel or a hook that listens for the `vantage:investigate` event and calls `startAgentSession` + `sendAgentMessage`. This keeps the file explorer decoupled from session management.

- [ ] **Step 3: Add investigation event handler in useClaude or the agents panel**

In `src/hooks/useClaude.ts`, add an effect that listens for investigation events:

```typescript
useEffect(() => {
  const handler = async (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      agentId: string;
      taskDescription: string;
      cwd: string;
    };
    await startAgentSession(detail.agentId, detail.cwd);
    // Small delay to let session initialize
    setTimeout(() => {
      void sendAgentMessage(detail.agentId, detail.taskDescription);
    }, 1000);
  };
  window.addEventListener("vantage:investigate", handler);
  return () => window.removeEventListener("vantage:investigate", handler);
}, [startAgentSession, sendAgentMessage]);
```

The investigation results appear in the agents panel timeline, accessible from the agents activity bar icon.

---

### Task 10: Interview Mode Template and .worktreeinclude Support

**Files:**
- Modify: `src/lib/slashCommands.ts`
- Modify: `src/components/chat/ChatInput.tsx`
- Modify: `src-tauri/src/worktree.rs`

This task bundles two smaller P2 features that are quick to implement.

**Interview Mode Template:** A quick-action template that prompts Claude to interview the user before building. This is a pre-written prompt injected as a system instruction.

**.worktreeinclude Support:** When creating agent worktrees, read a `.worktreeinclude` file from the project root and copy the listed files into new worktrees.

- [ ] **Step 1: Add Interview Mode as a slash command template**

In `src/lib/slashCommands.ts`, add to `BUILTIN_COMMANDS`:

```typescript
{
  name: "interview",
  description: "Claude interviews you to gather requirements before building",
  source: "built-in",
  isSkill: false,
},
```

In `src/components/chat/ChatInput.tsx`, detect when the user selects `/interview` from autocomplete and replace the text with a pre-written prompt template:

In the `handleSlashSelect` callback, add special handling:

```typescript
const handleSlashSelect = useCallback((cmd: SlashCommand) => {
  if (cmd.name === "interview") {
    // Inject the interview prompt template
    const template =
      "Before building anything, interview me to understand the requirements. " +
      "Ask me questions one at a time about: the problem I'm solving, " +
      "who the users are, what constraints exist, what the acceptance criteria are, " +
      "and any technical preferences. Only start building after I say 'go ahead'.";
    setText(template);
  } else {
    setText("/" + cmd.name + " ");
  }
  setShowSlash(false);
  setSlashQuery("");
  textareaRef.current?.focus();
}, []);
```

- [ ] **Step 2: Implement .worktreeinclude file support**

In `src-tauri/src/worktree.rs`, add a function that reads `.worktreeinclude` and copies files:

```rust
/// Read .worktreeinclude from the project root and copy listed files
/// into the given worktree directory.
pub fn apply_worktree_includes(project_root: &str, worktree_path: &str) -> Result<Vec<String>, String> {
    let include_path = Path::new(project_root).join(".worktreeinclude");
    if !include_path.exists() {
        return Ok(vec![]);
    }

    let contents = fs::read_to_string(&include_path)
        .map_err(|e| format!("Failed to read .worktreeinclude: {e}"))?;

    let mut copied = Vec::new();
    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let src = Path::new(project_root).join(line);
        let dest = Path::new(worktree_path).join(line);

        if src.exists() {
            // Create parent directories in the worktree
            if let Some(parent) = dest.parent() {
                let _ = fs::create_dir_all(parent);
            }
            fs::copy(&src, &dest)
                .map_err(|e| format!("Failed to copy {line}: {e}"))?;
            copied.push(line.to_string());
        }
    }

    Ok(copied)
}
```

Then call this function in the existing `create_worktree` function, right after the worktree is created. Find the `create_worktree` function and add at the end, before returning:

```rust
// Apply .worktreeinclude
let _ = apply_worktree_includes(root_path, &worktree_path);
```

- [ ] **Step 3: Add .worktreeinclude to settings UI**

In the ClaudeSettingsTab (created in Task 2), add a read-only display of the current `.worktreeinclude` contents with a button to open it in the editor. This is informational -- users edit the file directly.

```tsx
{/* .worktreeinclude */}
<div>
  <h3 className="text-xs font-semibold mb-1" style={{ color: "var(--color-text)" }}>
    Worktree Includes
  </h3>
  <p className="text-[10px] mb-2" style={{ color: "var(--color-overlay-1)" }}>
    Files listed in .worktreeinclude are auto-copied to new agent worktrees.
  </p>
  <button onClick={openWorktreeInclude} className="text-xs underline" style={{ color: "var(--color-blue)" }}>
    Edit .worktreeinclude
  </button>
</div>
```

---

## Testing Checklist

After all tasks are complete, verify:

- [ ] Effort level persists across app restarts (Zustand persist)
- [ ] Changing effort level shows updated indicator in status bar
- [ ] Ultrathink toggle visually activates/deactivates and prepends "ultrathink" to sent messages
- [ ] `/btw` questions open the overlay and do not appear in the main conversation history
- [ ] Ctrl+Shift+Q opens the quick question overlay
- [ ] Plan mode badge appears in chat header when enabled
- [ ] Compact dialog accepts preservation text and sends the correct `/compact` command
- [ ] Build & Review creates coordinator + builder + reviewer agents
- [ ] "Resume from PR" accepts a PR number and starts a session with `--from-pr`
- [ ] Right-click "Investigate with Claude" creates a subagent and sends the investigation prompt
- [ ] `/interview` slash command injects the interview template
- [ ] `.worktreeinclude` files are copied when creating new worktrees
- [ ] All existing unit tests still pass (`npx vitest run`)
- [ ] All existing E2E tests still pass (`npx playwright test`)
- [ ] Mock layer handles all new Tauri command parameters
