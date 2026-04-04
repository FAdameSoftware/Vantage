# Vantage Phase 7: P3 Future Vision Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the P3 future vision features -- hierarchical agent orchestration, merge queues, verification dashboards, embedded browser preview, and floating windows -- completing Vantage's full feature roadmap.

**Architecture:** Agent hierarchy extends the existing agents store with parent-child relationships and role-based routing. Merge queue automates git operations with quality gates. Verification dashboard aggregates CI results. Embedded browser uses Tauri's secondary webview. Floating windows use Tauri's multi-window API.

**Tech Stack:** Existing agent infrastructure, git merge automation, Tauri multi-window, Tauri secondary webview

---

### Task 1: Agent Hierarchy -- Coordinator/Specialist/Verifier Roles

**Files:**
- Modify: `src/stores/agents.ts`
- Modify: `src/components/agents/CreateAgentDialog.tsx`
- Modify: `src/components/agents/AgentCard.tsx`

This task extends the existing agent data model with hierarchical roles. The current `Agent` interface has flat fields (`id`, `name`, `status`, `sessionId`, etc.) with no concept of parent-child relationships or specialized roles. We add three new fields to `Agent`: a `role` discriminator, an optional `parentId`, and a `childIds` array. The `createAgent` action gains a `role` and optional `parentId` parameter. A coordinator agent can spawn specialist and verifier children. The verifier role is designed to run after a specialist completes -- the store enforces this ordering through status transitions.

The current agents store is at `src/stores/agents.ts` (444 lines). The `Agent` interface is at lines 57-98. The `AgentsState` interface is at lines 102-191. The `createAgent` action at line 205 currently accepts `{ name, taskDescription, model }`. The `CreateAgentDialog` at `src/components/agents/CreateAgentDialog.tsx` has a form with name, task description, and model fields. The `AgentCard` at `src/components/agents/AgentCard.tsx` shows a status icon, agent name, and task summary.

- [ ] **Step 1: Add AgentRole type and hierarchy fields to Agent interface**

In `src/stores/agents.ts`, add a new type after the `KanbanColumn` type:

```typescript
export type AgentRole = "coordinator" | "specialist" | "verifier" | "builder";
```

Then extend the `Agent` interface with three new fields, placed after the `model` field at line 87:

```typescript
/** Role in the agent hierarchy */
role: AgentRole;
/** Parent agent ID (null for top-level agents) */
parentId: string | null;
/** Child agent IDs (for coordinators) */
childIds: string[];
```

- [ ] **Step 2: Update createAgent to accept role and parentId**

Modify the `createAgent` params type in the `AgentsState` interface to include `role` and `parentId`:

```typescript
createAgent: (params: {
  name: string;
  taskDescription: string;
  model?: string;
  role?: AgentRole;
  parentId?: string | null;
}) => string;
```

In the `createAgent` implementation (line 205), set defaults: `role` defaults to `"builder"`, `parentId` defaults to `null`, `childIds` starts as `[]`. If a `parentId` is provided, also update the parent agent's `childIds` array to include the new agent's `id`:

```typescript
createAgent({ name, taskDescription, model, role = "builder", parentId = null }) {
  const id = crypto.randomUUID();
  // ... existing color/timestamp logic ...

  const agent: Agent = {
    // ... existing fields ...
    role,
    parentId,
    childIds: [],
  };

  set((state) => {
    const next = new Map(state.agents);
    next.set(id, agent);

    // If this agent has a parent, add it to parent's childIds
    if (parentId) {
      const parent = next.get(parentId);
      if (parent) {
        next.set(parentId, {
          ...parent,
          childIds: [...parent.childIds, id],
        });
      }
    }

    return {
      agents: next,
      columnOrder: {
        ...state.columnOrder,
        backlog: [...state.columnOrder.backlog, id],
      },
    };
  });

  return id;
},
```

- [ ] **Step 3: Add createChildAgent convenience action**

Add a new action to `AgentsState`:

```typescript
/** Create a child agent under a coordinator */
createChildAgent: (
  parentId: string,
  params: { name: string; taskDescription: string; role: AgentRole; model?: string }
) => string | null;
```

Implementation: validate that the parent exists and has role `"coordinator"`. If not, return `null`. Otherwise, call `createAgent` with the given params and `parentId`. This enforces that only coordinators can have children.

- [ ] **Step 4: Add getChildAgents and getRootAgents queries**

Add two new query methods to `AgentsState`:

```typescript
/** Get all children of an agent */
getChildAgents: (parentId: string) => Agent[];
/** Get all top-level agents (no parent) */
getRootAgents: () => Agent[];
```

`getChildAgents` filters agents by `parentId`. `getRootAgents` filters agents where `parentId === null`.

- [ ] **Step 5: Add auto-trigger for verifier after specialist completes**

Add logic in `updateAgentStatus`: when a specialist agent transitions to `"completed"`, check if it has a sibling verifier agent (same parent, role `"verifier"`, status `"idle"`). If found, automatically transition the verifier to `"working"` status. This creates the sequential coordinator -> specialist -> verifier pipeline.

In the `updateAgentStatus` implementation, after setting the new status, add:

```typescript
// Auto-trigger verifier when specialist completes
if (status === "completed" && agent.role === "specialist" && agent.parentId) {
  const siblings = [...next.values()].filter(
    (a) => a.parentId === agent.parentId && a.role === "verifier" && a.status === "idle"
  );
  for (const verifier of siblings) {
    next.set(verifier.id, { ...verifier, status: "working", lastActivityAt: Date.now() });
  }
}
```

- [ ] **Step 6: Update removeAgent to handle children**

Modify `removeAgent` to also remove all child agents when a parent is removed. When removing an agent with `childIds`, recursively remove each child. When removing an agent with a `parentId`, update the parent's `childIds` to exclude the removed agent.

- [ ] **Step 7: Add role selector to CreateAgentDialog**

In `src/components/agents/CreateAgentDialog.tsx`, add a role selector after the model select. Import the `AgentRole` type. Add a new state variable `const [role, setRole] = useState<AgentRole>("builder")`. Render a row of four radio-style buttons showing the role options with descriptions:

| Role | Icon | Description |
|------|------|-------------|
| Builder | Hammer | General-purpose coding agent |
| Coordinator | Network | Creates and manages child agents |
| Specialist | Target | Focused on a specific subtask |
| Verifier | ShieldCheck | Validates work after specialists finish |

Pass `role` to `createAgent` in `handleSubmit`. When creating under a parent, also pass `parentId`. Add an optional `parentId` prop to the dialog for when it's opened from a coordinator's context menu.

- [ ] **Step 8: Show role badge on AgentCard**

In `src/components/agents/AgentCard.tsx`, add a role badge next to the agent name. Use a small colored pill:

| Role | Color | Abbreviation |
|------|-------|-------------|
| coordinator | `var(--color-mauve)` | COORD |
| specialist | `var(--color-blue)` | SPEC |
| verifier | `var(--color-green)` | VER |
| builder | `var(--color-subtext-0)` | BUILD |

Also show a child count badge for coordinators: e.g., "(3 agents)" in muted text. Add a "Create Child Agent" button on coordinator cards that opens the `CreateAgentDialog` with `parentId` pre-filled.

**Verification:** Create a coordinator agent, then create two specialist children and one verifier child from the coordinator's context. Confirm child IDs appear on the parent. Confirm marking a specialist as "completed" auto-triggers the verifier to "working". Confirm removing the coordinator removes all children.

---

### Task 2: Agent Tree View

**Files:**
- Create: `src/components/agents/AgentTreeView.tsx`
- Modify: `src/components/agents/KanbanBoard.tsx` (add toggle)
- Modify: `src/stores/layout.ts` (add view mode state)

This task creates an alternative visualization for the agents panel -- a hierarchical tree view showing parent-child relationships, as opposed to the flat kanban board. The tree is useful when using the coordinator/specialist/verifier hierarchy from Task 1. The kanban board at `src/components/agents/KanbanBoard.tsx` currently renders four columns using dnd-kit. The tree view will sit alongside it, toggled by a button in the agents panel header.

The existing `KanbanBoard.tsx` (line 1) uses `DndContext`, `DragOverlay`, and `SortableContext` from dnd-kit. The `AgentCard` component is the card rendered in each column. The layout store (`src/stores/layout.ts`) manages sidebar visibility and active views.

- [ ] **Step 1: Add agentsViewMode to layout store**

In `src/stores/layout.ts`, add a new field and setter:

```typescript
agentsViewMode: "kanban" | "tree";
setAgentsViewMode: (mode: "kanban" | "tree") => void;
```

Default to `"kanban"`. Add it to the `partialize` list for persistence. Implementation is a simple `set({ agentsViewMode: mode })`.

- [ ] **Step 2: Create AgentTreeNode component**

Create `src/components/agents/AgentTreeView.tsx`. Start with an internal `AgentTreeNode` component that renders a single agent as a tree node:

```typescript
interface AgentTreeNodeProps {
  agent: Agent;
  depth: number;
  allAgents: Map<string, Agent>;
}
```

The node renders:
- An indent based on `depth` (16px per level, using `paddingLeft: depth * 16`)
- A chevron icon (`ChevronRight` from lucide-react) that rotates 90 degrees when expanded. Only visible if `agent.childIds.length > 0`
- The status icon (reuse the `StatusIcon` pattern from `AgentCard.tsx` -- extract it to a shared location or duplicate it)
- The role badge pill (same as Task 1 Step 8)
- The agent name in medium weight text
- The task description truncated to one line in muted text
- Cost display on the right: `$X.XX`

Clicking the chevron toggles expansion. Clicking the row selects the agent (opening the `AgentDetailPanel` in the secondary sidebar).

Children are rendered recursively: if expanded, map over `agent.childIds`, look up each child from `allAgents`, and render another `AgentTreeNode` with `depth + 1`.

- [ ] **Step 3: Create AgentTreeView container**

The `AgentTreeView` export is the container component. It:
1. Gets `getRootAgents()` from the agents store (top-level agents with no parent)
2. Gets the full `agents` Map from the store
3. Manages a `Set<string>` of expanded node IDs in local state (default: all expanded)
4. Renders a scrollable list of `AgentTreeNode` components for each root agent
5. Shows an "empty state" message if no agents exist

The container has a small toolbar at the top with:
- "Expand All" button (sets all agent IDs into the expanded set)
- "Collapse All" button (clears the expanded set)
- Agent count: "N agents (M active)"

- [ ] **Step 4: Add status propagation indicators**

Add visual indicators that propagate child status upward. On each `AgentTreeNode` that has children:
- If any child has status `"error"`, show a small red dot next to the expand chevron
- If any child has status `"waiting_permission"`, show a small yellow dot
- If all children have status `"completed"`, show a small green dot

This helps coordinators see at a glance whether their children need attention, without expanding the tree.

Compute this by iterating `agent.childIds`, looking up each child's status, and determining the "worst" status: error > waiting_permission > working > idle > completed.

- [ ] **Step 5: Add view mode toggle to agents panel**

In the component that renders the agents panel header (the parent of `KanbanBoard`), add a toggle group with two buttons:

- Kanban icon (`LayoutGrid` from lucide-react) for kanban view
- Tree icon (`GitBranch` from lucide-react) for tree view

Read `agentsViewMode` from the layout store. Conditionally render either `<KanbanBoard />` or `<AgentTreeView />` based on the mode. Style the active button with the accent color.

This toggle should be in the agents panel header area. Find where `KanbanBoard` is rendered in the parent component (likely `PrimarySidebar.tsx` or a similar wrapper) and wrap it with the conditional.

- [ ] **Step 6: Add drag-and-drop reordering in tree view**

Using dnd-kit's sortable list within the tree view, allow agents at the same level (same parent) to be reordered via drag and drop. This changes the ordering of `childIds` on the parent (or the root-level agent ordering in the column order). Use `SortableContext` with `verticalListSortingStrategy` for each level of the tree.

Keep this simple -- only allow reordering within the same parent, not reparenting agents via drag.

**Verification:** Create a coordinator with 2 specialists and 1 verifier. Switch to tree view. Confirm the hierarchy renders correctly with proper indentation. Expand/collapse works. Status propagation shows the correct dot color. Toggle back to kanban -- both views show all agents.

---

### Task 3: Sequential Merge Queue with Quality Gates

**Files:**
- Create: `src/stores/mergeQueue.ts`
- Create: `src/components/agents/MergeQueuePanel.tsx`
- Modify: `src-tauri/src/lib.rs` (register new commands)
- Create: `src-tauri/src/merge_queue.rs`

This task implements an ordered merge queue for agent branches. When agents work in isolated git worktrees (established in Phase 5), each produces a branch with changes. The merge queue provides a structured way to merge those branches back into the main branch with automated quality gates (tests, linting) running before each merge. The existing `src-tauri/src/worktree.rs` manages worktree creation/removal and `src-tauri/src/git.rs` has git operations. The agents store tracks `branchName` and `worktreePath` per agent.

- [ ] **Step 1: Create merge queue Rust backend**

Create `src-tauri/src/merge_queue.rs`. This module provides three Tauri commands:

**`run_quality_gate`**: Runs a shell command in a given working directory and captures stdout + stderr + exit code.

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct QualityGateResult {
    pub gate_name: String,
    pub command: String,
    pub passed: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub duration_ms: u64,
}

pub fn run_quality_gate(
    cwd: &str,
    gate_name: &str,
    command: &str,
) -> Result<QualityGateResult, String>
```

Implementation: use `std::process::Command` with `cmd /C <command>` on Windows. Capture output. Measure duration with `std::time::Instant`. A gate passes if exit code is 0.

**`merge_branch`**: Merges a branch into the current branch in the given repo.

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct MergeResult {
    pub success: bool,
    pub merge_commit: Option<String>,
    pub conflict_files: Vec<String>,
    pub output: String,
}

pub fn merge_branch(
    repo_path: &str,
    branch_name: &str,
    no_ff: bool,
) -> Result<MergeResult, String>
```

Implementation: run `git merge --no-ff <branch>` (or `git merge <branch>` if `no_ff` is false). If merge fails, parse conflict markers from `git diff --name-only --diff-filter=U`. If it succeeds, capture the merge commit hash from `git rev-parse HEAD`.

**`rebase_branch`**: Rebases a branch onto a target.

```rust
pub fn rebase_branch(
    worktree_path: &str,
    onto_branch: &str,
) -> Result<bool, String>
```

Run `git rebase <onto_branch>` in the worktree path. Return true if successful, error string if conflicts occur (then run `git rebase --abort` to clean up).

- [ ] **Step 2: Register merge queue commands in lib.rs**

In `src-tauri/src/lib.rs`, add `mod merge_queue;` to the imports. Create three Tauri command wrappers:

```rust
#[tauri::command]
#[specta::specta]
fn run_quality_gate(cwd: String, gate_name: String, command: String) -> Result<merge_queue::QualityGateResult, String> {
    merge_queue::run_quality_gate(&cwd, &gate_name, &command)
}

#[tauri::command]
#[specta::specta]
fn merge_branch(repo_path: String, branch_name: String, no_ff: bool) -> Result<merge_queue::MergeResult, String> {
    merge_queue::merge_branch(&repo_path, &branch_name, no_ff)
}

#[tauri::command]
#[specta::specta]
fn rebase_branch(worktree_path: String, onto_branch: String) -> Result<bool, String> {
    merge_queue::rebase_branch(&worktree_path, &onto_branch)
}
```

Add all three to the `tauri_specta::collect_commands!` macro call.

- [ ] **Step 3: Create merge queue Zustand store**

Create `src/stores/mergeQueue.ts`. The store manages an ordered queue of merge entries:

```typescript
import { create } from "zustand";

export type GateStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export interface QualityGateResult {
  gateName: string;
  command: string;
  status: GateStatus;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
}

export interface MergeQueueEntry {
  id: string;
  agentId: string;
  agentName: string;
  branchName: string;
  worktreePath: string;
  /** Ordered list of quality gate results */
  gates: QualityGateResult[];
  /** Overall status */
  status: "queued" | "checking" | "ready" | "merging" | "merged" | "failed" | "conflict";
  /** Position in queue (0 = next to merge) */
  position: number;
  addedAt: number;
  mergedAt?: number;
}

export interface MergeQueueState {
  entries: MergeQueueEntry[];
  /** Default quality gates to run (from project's package.json) */
  defaultGates: { name: string; command: string }[];

  addToQueue: (agentId: string, agentName: string, branchName: string, worktreePath: string) => void;
  removeFromQueue: (id: string) => void;
  reorderQueue: (orderedIds: string[]) => void;
  updateGateResult: (entryId: string, gateName: string, result: Partial<QualityGateResult>) => void;
  updateEntryStatus: (entryId: string, status: MergeQueueEntry["status"]) => void;
  markMerged: (entryId: string) => void;
  setDefaultGates: (gates: { name: string; command: string }[]) => void;
  getNextReady: () => MergeQueueEntry | undefined;
}
```

`addToQueue` creates a new entry with `status: "queued"`, assigns position based on current queue length, and initializes `gates` from `defaultGates` with all statuses set to `"pending"`.

`getNextReady` returns the first entry with `status: "ready"` (all gates passed).

- [ ] **Step 4: Auto-detect quality gates from package.json**

Create a utility function (in the merge queue store file or a separate helper) that reads the project's `package.json` and detects available quality gate commands:

```typescript
async function detectQualityGates(projectRoot: string): Promise<{ name: string; command: string }[]> {
  // Use the read_file Tauri command to read package.json
  // Parse it, look at the "scripts" field
  // Map known script names to gates:
  const gateMap: Record<string, string> = {
    test: "npm test",
    lint: "npm run lint",
    "type-check": "npm run type-check",
    typecheck: "npm run typecheck",
    build: "npm run build",
  };
  // Return gates for scripts that exist
}
```

Call this when the merge queue panel first mounts (or when the project root changes) and store the result via `setDefaultGates`.

- [ ] **Step 5: Create MergeQueuePanel component**

Create `src/components/agents/MergeQueuePanel.tsx`. This panel renders as a section within the agents panel area (below the kanban/tree view, or as a separate tab).

Layout:
```
+------------------------------------------------------+
| Merge Queue                         [Detect Gates]   |
+------------------------------------------------------+
| 1. agent/backend-api-xyz                             |
|    [x] lint  [x] test  [ ] build        [Merge]     |
|    Status: Ready                                      |
+------------------------------------------------------+
| 2. agent/frontend-ui-abc                             |
|    [~] lint  [ ] test  [ ] build        [Run Gates]  |
|    Status: Checking...                                |
+------------------------------------------------------+
| 3. agent/docs-update-def                             |
|    [ ] lint  [ ] test  [ ] build                     |
|    Status: Queued                                     |
+------------------------------------------------------+
```

Each entry shows:
- Position number and branch name
- Gate status pills: green check for passed, red X for failed, spinner for running, gray circle for pending
- Action button: "Run Gates" (when queued), "Merge" (when ready), "Retry" (when failed)
- Status label with color coding

The entries are sortable via dnd-kit (drag to reorder priority).

- [ ] **Step 6: Implement gate execution flow**

When the user clicks "Run Gates" on an entry:

1. Set entry status to `"checking"`
2. For each gate in order, invoke the `run_quality_gate` Tauri command with the entry's `worktreePath` as `cwd`
3. Update each gate result as it completes
4. If any gate fails, set entry status to `"failed"` and stop (don't run remaining gates)
5. If all gates pass, set entry status to `"ready"`

Use `async`/`await` to run gates sequentially. Show a progress indicator on the entry being checked.

- [ ] **Step 7: Implement merge execution flow**

When the user clicks "Merge" on a ready entry:

1. Set entry status to `"merging"`
2. Invoke `merge_branch` with the project's main repo path, the entry's branch name, and `no_ff: true`
3. If merge succeeds:
   - Set entry status to `"merged"` with `mergedAt` timestamp
   - Remove the entry from the active queue after a brief delay (or move to a "merged" section)
   - For all remaining queued entries, invoke `rebase_branch` on their worktree paths onto the updated main branch
   - If any rebase fails, mark that entry as `"conflict"`
4. If merge fails (conflicts):
   - Set entry status to `"conflict"`
   - Show the list of conflicting files from the `MergeResult`

- [ ] **Step 8: Add "Add to Merge Queue" button on completed agents**

In `src/components/agents/AgentCard.tsx`, when an agent has status `"completed"` and has a `branchName`, show an "Add to Queue" button. Clicking it calls `addToQueue` with the agent's details. Disable the button if the agent is already in the queue.

Also add a queue indicator badge on the kanban board header showing the number of entries in the merge queue.

**Verification:** Create two agents with worktrees. Complete their work. Add both to the merge queue. Run gates on the first (should detect package.json scripts). If gates pass, merge. Confirm the second entry gets rebased. Confirm merged branches appear in git log.

---

### Task 4: Role-Based Agent Routing via AGENTS.md

**Files:**
- Create: `src/lib/agentsmd.ts`
- Modify: `src/components/agents/CreateAgentDialog.tsx`
- Create: `src/components/settings/AgentsMdEditor.tsx`

This task parses an `AGENTS.md` file from the project root to extract role definitions and routing rules. AGENTS.md is an emerging convention (like CLAUDE.md but for multi-agent coordination) that defines what types of agents should handle what types of tasks, what model to use for each role, and what files/directories each role is responsible for. The `CreateAgentDialog` will auto-suggest roles and models based on the task description matching AGENTS.md rules.

- [ ] **Step 1: Define AGENTS.md schema**

Create `src/lib/agentsmd.ts`. This module parses a markdown file with a specific structure. The expected AGENTS.md format:

```markdown
# Agent Roles

## coordinator
- Model: claude-opus-4-5
- Description: Orchestrates work across specialists
- Triggers: "plan", "architect", "design", "coordinate"

## backend-specialist
- Model: claude-sonnet-4-5
- Description: Backend API and database work
- Triggers: "api", "endpoint", "database", "migration", "server"
- Files: src/api/**, src/db/**, src/models/**

## frontend-specialist
- Model: claude-sonnet-4-5
- Description: UI components and styling
- Triggers: "component", "ui", "css", "layout", "page", "form"
- Files: src/components/**, src/styles/**

## test-specialist
- Model: claude-sonnet-4-5
- Description: Writing and fixing tests
- Triggers: "test", "spec", "coverage", "fixture"
- Files: src/__tests__/**, tests/**

## verifier
- Model: claude-sonnet-4-5
- Description: Reviews and validates completed work
- Triggers: "review", "verify", "check", "validate"
```

Define the parsed structure:

```typescript
export interface AgentRoleDefinition {
  /** Role name (heading text, kebab-case) */
  name: string;
  /** Model to use for this role */
  model: string;
  /** Human-readable description */
  description: string;
  /** Keywords that trigger this role suggestion */
  triggers: string[];
  /** Glob patterns for files this role owns */
  filePatterns: string[];
  /** Maps to the AgentRole type (coordinator/specialist/verifier/builder) */
  agentRole: AgentRole;
}

export interface AgentsMdConfig {
  roles: AgentRoleDefinition[];
  raw: string;
}
```

- [ ] **Step 2: Implement AGENTS.md parser**

In `src/lib/agentsmd.ts`, implement the parser:

```typescript
export function parseAgentsMd(content: string): AgentsMdConfig {
  // Split on ## headings
  // For each section:
  //   - Extract heading as role name
  //   - Parse "- Model: ..." line
  //   - Parse "- Description: ..." line
  //   - Parse "- Triggers: ..." line (comma-separated keywords)
  //   - Parse "- Files: ..." line (comma-separated globs)
  //   - Infer agentRole from name:
  //     - Contains "coordinator" or "lead" -> "coordinator"
  //     - Contains "verifier" or "reviewer" -> "verifier"
  //     - Contains "specialist" -> "specialist"
  //     - Otherwise -> "builder"
}
```

The parser should be lenient -- missing fields get defaults (model defaults to `"claude-sonnet-4-5"`, triggers defaults to `[]`, etc.). Lines that don't match the expected pattern are ignored.

- [ ] **Step 3: Implement role suggestion from task description**

Add a function that matches a task description against the defined roles:

```typescript
export function suggestRole(
  taskDescription: string,
  config: AgentsMdConfig
): AgentRoleDefinition | null {
  const lower = taskDescription.toLowerCase();
  let bestMatch: AgentRoleDefinition | null = null;
  let bestScore = 0;

  for (const role of config.roles) {
    let score = 0;
    for (const trigger of role.triggers) {
      if (lower.includes(trigger.toLowerCase())) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = role;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}
```

- [ ] **Step 4: Load AGENTS.md on project open**

Create a hook or utility that loads `AGENTS.md` from the project root when the project opens. Use the existing `read_file` Tauri command to read `{projectRoot}/AGENTS.md`. If it doesn't exist, the feature is simply inactive (no role suggestions). Store the parsed config in a lightweight Zustand store or as a ref in the component that needs it.

Add a small Zustand store or extend the agents store:

```typescript
// In agents store or separate file
agentsMdConfig: AgentsMdConfig | null;
setAgentsMdConfig: (config: AgentsMdConfig | null) => void;
```

- [ ] **Step 5: Add role suggestion to CreateAgentDialog**

In `src/components/agents/CreateAgentDialog.tsx`, when the user types a task description, debounce (300ms) and run `suggestRole()` against the loaded AGENTS.md config. If a match is found, show a suggestion banner below the task description field:

```
Suggested role: backend-specialist (claude-sonnet-4-5)
"Backend API and database work"
[Apply Suggestion]
```

Clicking "Apply Suggestion" sets the role selector to the suggested `agentRole`, the model selector to the suggested model, and optionally updates the agent name to include the role name.

If no AGENTS.md is loaded, the suggestion banner is hidden. The user can always override the suggestion manually.

- [ ] **Step 6: Create AGENTS.md editor**

Create `src/components/settings/AgentsMdEditor.tsx`. This is a simple editor panel (reachable from the settings sidebar, similar to the existing `ClaudeMdEditor`):

- Opens `AGENTS.md` from the project root in a Monaco editor instance
- Shows a split view: raw markdown on the left, parsed role table on the right
- The parsed role table shows: role name, model, trigger count, file pattern count, and the inferred `agentRole` mapping
- "Save" button writes back to disk via `write_file`
- "Create Default" button generates a starter AGENTS.md template if none exists

Keep the editor simple -- no fancy validation, just the split view for feedback.

**Verification:** Create an `AGENTS.md` in the project root with 3-4 role definitions. Open the Create Agent dialog. Type "build a new API endpoint" as the task description. Confirm the backend-specialist role is suggested. Apply the suggestion and confirm role/model are set. Edit AGENTS.md in the editor and confirm the parsed table updates.

---

### Task 5: Verification Dashboard

**Files:**
- Create: `src/components/agents/VerificationDashboard.tsx`
- Create: `src/stores/verification.ts`
- Modify: `src/components/layout/PanelArea.tsx` (add dashboard tab)

This task creates a verification dashboard that shows per-agent quality status -- test results, lint results, and build status -- in an aggregate view. It reuses the `run_quality_gate` Tauri command from Task 3 to execute checks against each agent's worktree. The dashboard is the human-facing answer to the verification bottleneck problem described in the research: instead of manually checking each agent's output, the dashboard provides a single view of all quality signals.

- [ ] **Step 1: Create verification store**

Create `src/stores/verification.ts`:

```typescript
import { create } from "zustand";

export type CheckStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export interface VerificationCheck {
  name: string;
  command: string;
  status: CheckStatus;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  lastRunAt?: number;
}

export interface AgentVerification {
  agentId: string;
  agentName: string;
  worktreePath: string;
  checks: VerificationCheck[];
  overallStatus: CheckStatus;
  lastRunAt?: number;
}

export interface VerificationState {
  agents: Map<string, AgentVerification>;
  isRunningAll: boolean;

  initAgent: (agentId: string, agentName: string, worktreePath: string, checks: { name: string; command: string }[]) => void;
  updateCheck: (agentId: string, checkName: string, update: Partial<VerificationCheck>) => void;
  setOverallStatus: (agentId: string, status: CheckStatus) => void;
  setRunningAll: (running: boolean) => void;
  removeAgent: (agentId: string) => void;

  getPassCount: () => number;
  getFailCount: () => number;
  getTotalCount: () => number;
}
```

The `overallStatus` of an agent is computed from its checks: `"failed"` if any check failed, `"passed"` if all passed, `"running"` if any is running, `"pending"` otherwise.

- [ ] **Step 2: Create VerificationDashboard component**

Create `src/components/agents/VerificationDashboard.tsx`. Layout:

```
+--------------------------------------------------------------+
| Verification Dashboard          [Run All Checks] [Refresh]   |
+--------------------------------------------------------------+
| Summary: 3 passed / 1 failed / 1 pending  (5 agents)        |
+--------------------------------------------------------------+
|                                                               |
| Agent: Backend API Agent         Overall: PASSED              |
| +--------+--------+--------+                                  |
| | lint   | test   | build  |                                  |
| |   OK   |  OK    |  OK    |                                  |
| | 1.2s   | 4.3s   | 8.1s   |                                  |
| +--------+--------+--------+                                  |
|                                                               |
| Agent: Frontend UI Agent         Overall: FAILED              |
| +--------+--------+--------+                                  |
| | lint   | test   | build  |                                  |
| |  FAIL  |  OK    | SKIP   |                                  |
| | 0.8s   | 2.1s   |  --    |                                  |
| +--------+--------+--------+                                  |
|  > Error: 3 lint warnings treated as errors                  |
|                                                               |
+--------------------------------------------------------------+
```

Each agent row shows:
- Agent name and overall status badge (green/red/yellow/gray)
- A row of check cards, one per quality gate
- Each check card shows: name, status icon, duration
- If a check failed, an expandable section shows stderr/stdout (collapsed by default, click to expand)

The summary bar at top shows aggregate counts.

- [ ] **Step 3: Implement "Run All Checks" flow**

The "Run All Checks" button iterates all agents that have worktree paths:

1. Set `isRunningAll` to `true`
2. For each agent, look up its worktree path from the agents store
3. Initialize the agent in the verification store with the default gates (from package.json detection, same as Task 3 Step 4)
4. For each agent, run all checks sequentially using the `run_quality_gate` Tauri command
5. Update each check result in the store as it completes
6. After all agents complete, set `isRunningAll` to `false`

Run agents in parallel (use `Promise.all` with per-agent sequential gates). This means multiple agents can be checked simultaneously but each agent's gates run in order.

- [ ] **Step 4: Implement per-agent "Run Checks" button**

Each agent row has a small "Run" button that triggers checks for just that agent. This is useful for re-running after fixing issues. The flow is the same as Step 3 but for a single agent.

- [ ] **Step 5: Add expandable log viewer for failed checks**

When a check fails, the row expands to show:
- The full command that was run
- stdout in a scrollable `<pre>` block (max-height 200px)
- stderr in a scrollable `<pre>` block with red text

Add a "Copy Output" button that copies the combined stdout+stderr to clipboard.

- [ ] **Step 6: Add dashboard tab to panel area**

In `src/components/layout/PanelArea.tsx`, add a "Verification" tab alongside the existing terminal tab(s). The tab shows a shield icon (`ShieldCheck` from lucide-react) and a badge count showing failed checks (red) or a green check if all pass.

Conditionally render `<VerificationDashboard />` when the verification tab is active. The dashboard auto-initializes agents from the agents store when the tab first becomes active.

**Verification:** Create 2-3 agents with worktrees. Navigate to the Verification tab. Click "Run All Checks". Confirm checks run for each agent with real-time status updates. Introduce a lint error in one worktree and re-run -- confirm the failure shows with stderr output. Confirm the summary counts update correctly.

---

### Task 6: Embedded Browser Preview

**Files:**
- Create: `src/components/preview/BrowserPreview.tsx`
- Modify: `src/components/layout/PanelArea.tsx` (add preview tab)
- Modify: `src/stores/layout.ts` (add preview URL state)

This task adds an embedded browser preview panel that renders a URL (typically a local dev server) inside the Vantage window. Tauri 2 supports creating webview instances via the `@tauri-apps/api/webview` module. The preview panel sits as a tab in the bottom panel area alongside the terminal and verification dashboard. The key capability is auto-detecting a dev server's port from terminal output and offering a one-click preview.

- [ ] **Step 1: Add preview state to layout store**

In `src/stores/layout.ts`, add:

```typescript
/** URL currently shown in the browser preview (null = no preview) */
previewUrl: string | null;
/** Whether the preview panel is actively showing a webview */
previewActive: boolean;
setPreviewUrl: (url: string | null) => void;
setPreviewActive: (active: boolean) => void;
```

Default `previewUrl` to `null` and `previewActive` to `false`. Add both to `partialize`.

- [ ] **Step 2: Create BrowserPreview component**

Create `src/components/preview/BrowserPreview.tsx`. This component manages an embedded webview using an `<iframe>` as the simplest approach that works within Tauri's WebView2:

```typescript
export function BrowserPreview() {
  const previewUrl = useLayoutStore((s) => s.previewUrl);
  const setPreviewUrl = useLayoutStore((s) => s.setPreviewUrl);
  const setPreviewActive = useLayoutStore((s) => s.setPreviewActive);
  const [urlInput, setUrlInput] = useState(previewUrl ?? "http://localhost:3000");

  // ... component body
}
```

Layout:
```
+--------------------------------------------------------------+
| [<] [>] [Refresh]  [ http://localhost:3000________ ] [Go] [X]|
+--------------------------------------------------------------+
|                                                               |
|                    (iframe content)                            |
|                                                               |
+--------------------------------------------------------------+
```

The toolbar contains:
- Back button (`ArrowLeft`): calls `history.back()` on the iframe via `contentWindow`
- Forward button (`ArrowRight`): calls `history.forward()` on the iframe via `contentWindow`
- Refresh button (`RefreshCw`): reloads the iframe by toggling the `src` attribute
- URL input field: editable text input showing the current URL
- Go button: navigates the iframe to the entered URL
- Close button (`X`): sets `previewActive` to `false`

The iframe itself:
```tsx
<iframe
  src={previewUrl ?? "about:blank"}
  className="w-full flex-1 border-0 bg-white"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
  title="Browser Preview"
/>
```

Note: The iframe approach works for localhost URLs but has limitations with cross-origin content. For a more robust solution, a future enhancement could use Tauri's `WebviewWindow` API to create a separate webview, but the iframe approach is sufficient for local dev server previews.

- [ ] **Step 3: Add dev server port detection**

Create a utility that scans terminal output for common dev server URLs:

```typescript
const DEV_SERVER_PATTERNS = [
  /Local:\s+(https?:\/\/localhost:\d+)/,
  /listening on\s+(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+)/i,
  /ready on\s+(https?:\/\/localhost:\d+)/i,
  /Server running at\s+(https?:\/\/localhost:\d+)/i,
  /started server on\s+.+,\s+url:\s+(https?:\/\/localhost:\d+)/i,
  /http:\/\/localhost:(\d+)/,
];

export function detectDevServerUrl(terminalOutput: string): string | null {
  for (const pattern of DEV_SERVER_PATTERNS) {
    const match = terminalOutput.match(pattern);
    if (match) {
      return match[1].startsWith("http") ? match[1] : `http://localhost:${match[1]}`;
    }
  }
  return null;
}
```

This function is called whenever the terminal receives new output. If a URL is detected and no preview is active, show a toast notification: "Dev server detected at localhost:3000. [Preview]". Clicking "Preview" sets the URL and activates the preview panel.

- [ ] **Step 4: Add preview tab to panel area**

In `src/components/layout/PanelArea.tsx`, add a "Preview" tab. The tab shows a globe icon (`Globe` from lucide-react). When clicked, it activates the preview panel and renders `<BrowserPreview />`.

If `previewUrl` is null and the tab is selected, show an empty state: "No preview active. Enter a URL or start a dev server to see a live preview." with a URL input field.

- [ ] **Step 5: Add "Preview" button to terminal panel**

In the terminal panel header (near the terminal tabs), add a small "Preview" button (`ExternalLink` icon) that appears when a dev server URL has been detected. Clicking it opens the preview tab with the detected URL. This provides a quick shortcut from the terminal where the dev server is running to the preview.

**Verification:** Start a dev server in the terminal (e.g., `npm run dev` in a project that serves on localhost). Confirm the dev server URL is auto-detected. Click the preview button or toast notification. Confirm the preview panel shows the running application. Type a different URL in the toolbar and confirm navigation works. Close and reopen -- confirm the URL persists.

---

### Task 7: Floating Windows / Popout Tabs

**Files:**
- Modify: `src/components/editor/EditorTabs.tsx`
- Create: `src/components/editor/PopoutEditor.tsx`
- Modify: `src/stores/editor.ts`
- Modify: `src-tauri/tauri.conf.json` (window permissions for multi-window)
- Modify: `src-tauri/capabilities/default.json` (add webview permissions)

This task adds the ability to "pop out" an editor tab into a separate Tauri window. The user right-clicks a tab and selects "Pop Out to Window", creating a new OS-level window with just the editor for that file. Edits in the popout window sync back to the main window's state (via the shared Zustand store, since all Tauri windows share the same JavaScript runtime when using the same webview context). Closing the popout returns the tab to the main window.

- [ ] **Step 1: Add popout tracking to editor store**

In `src/stores/editor.ts`, add:

```typescript
/** Set of tab IDs that are currently popped out to separate windows */
popoutTabs: Set<string>;
/** Pop out a tab to a separate window */
popoutTab: (tabId: string) => void;
/** Return a popped-out tab to the main window */
returnPopoutTab: (tabId: string) => void;
/** Check if a tab is popped out */
isPopout: (tabId: string) => boolean;
```

`popoutTab` adds the tab ID to `popoutTabs`. `returnPopoutTab` removes it. Initialize `popoutTabs` as an empty `Set<string>()`.

- [ ] **Step 2: Create popout window via Tauri API**

The actual window creation uses Tauri's `WebviewWindow` API. In a helper module or inline in the editor store:

```typescript
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

async function createPopoutWindow(tabId: string, fileName: string): Promise<void> {
  const label = `popout-${tabId.replace(/[^a-zA-Z0-9]/g, "-")}`;

  const popout = new WebviewWindow(label, {
    title: `${fileName} - Vantage`,
    width: 800,
    height: 600,
    minWidth: 400,
    minHeight: 300,
    center: true,
    decorations: true, // OS-level decorations for popout windows
    url: `/popout?tabId=${encodeURIComponent(tabId)}`,
  });

  // Listen for the window close event to return the tab
  popout.onCloseRequested(async () => {
    useEditorStore.getState().returnPopoutTab(tabId);
  });
}
```

This creates a new Tauri window that loads a `/popout` route with the tab ID as a query parameter.

- [ ] **Step 3: Create PopoutEditor route**

Create `src/components/editor/PopoutEditor.tsx`. This is a standalone page rendered in the popout window:

```typescript
export function PopoutEditor() {
  // Read tabId from URL query params
  const params = new URLSearchParams(window.location.search);
  const tabId = params.get("tabId");

  // Get tab data from the shared editor store
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === tabId));

  if (!tab) {
    return <div>Tab not found</div>;
  }

  // Render a minimal Monaco editor with the tab's content
  return (
    <div className="h-screen w-screen flex flex-col" style={{ background: "var(--color-base)" }}>
      <div className="h-8 flex items-center px-3 border-b"
           style={{ borderColor: "var(--color-surface-0)", color: "var(--color-text)" }}>
        <span className="text-sm font-medium">{tab.name}</span>
        {tab.isDirty && <span className="ml-1 text-xs" style={{ color: "var(--color-yellow)" }}>*</span>}
      </div>
      <div className="flex-1">
        <MonacoEditor
          path={tab.path}
          language={tab.language}
          value={tab.content}
          onChange={(value) => useEditorStore.getState().updateContent(tab.id, value ?? "")}
        />
      </div>
    </div>
  );
}
```

Note on state sharing: In Tauri, each window has its own webview context with its own JavaScript runtime. This means the Zustand store is NOT automatically shared between windows. To synchronize state, use Tauri's inter-window event system:

- When the popout editor's content changes, emit a Tauri event: `emit("editor-content-changed", { tabId, content })`
- The main window listens for this event and calls `updateContent` on its store
- When the main window's tab content changes (e.g., from a Claude edit), emit an event that the popout window listens for

This bidirectional sync is critical. Use `@tauri-apps/api/event` for `emit` and `listen`.

- [ ] **Step 4: Add popout route to the application router**

In the main application entry point (likely `src/App.tsx` or `src/main.tsx`), add routing logic:

```typescript
// Check if this is a popout window
const isPopout = window.location.pathname === "/popout" ||
                 window.location.search.includes("tabId=");

if (isPopout) {
  return <PopoutEditor />;
}

// Otherwise render the main IDE layout
return <IDELayout />;
```

This is a simple URL-based routing -- no need for a full router library.

- [ ] **Step 5: Add "Pop Out" option to editor tab context menu**

In `src/components/editor/EditorTabs.tsx`, add a "Pop Out to Window" option to the tab's right-click context menu. The existing tab context menu likely has "Close", "Close Others", "Close All" -- add "Pop Out to Window" with a `ExternalLink` icon.

When clicked:
1. Call `popoutTab(tabId)` on the editor store
2. Call `createPopoutWindow(tabId, tab.name)`

In the tab bar, popped-out tabs should show a visual indicator -- for example, the tab appears grayed out with a small "external window" icon overlay, indicating it's open elsewhere. Clicking the grayed-out tab in the main window brings the popout window to focus (via `popout.setFocus()`).

- [ ] **Step 6: Handle save from popout window**

The popout editor needs to support Ctrl+S to save. Add a keyboard event listener in `PopoutEditor` that calls `write_file` via the Tauri command and then `markSaved` on the editor store. Emit the save event to the main window so the dirty indicator updates there too.

- [ ] **Step 7: Update Tauri config for multi-window**

In `src-tauri/capabilities/default.json`, the current `windows` array only lists `["main"]`. Update it to allow all windows:

```json
"windows": ["main", "popout-*"]
```

Or use a wildcard pattern if Tauri supports it. If not, use `"windows": ["*"]` to allow capabilities for any window label. This ensures popout windows have the same permission set as the main window (file read/write, etc.).

**Verification:** Open a file in the editor. Right-click the tab and select "Pop Out to Window". Confirm a new OS window appears with the same file content. Edit text in the popout -- confirm it syncs to the main window's tab. Edit in the main window (e.g., via Claude) -- confirm it syncs to the popout. Press Ctrl+S in the popout -- confirm the file saves. Close the popout window -- confirm the tab returns to normal in the main window.

---

### Task 8: BMAD Document Sharding (Simplified)

**Files:**
- Create: `src/lib/bmadSharding.ts`
- Create: `src/components/settings/SpecViewer.tsx`
- Modify: `src/components/layout/PrimarySidebar.tsx` (add spec viewer section)

This task implements a simplified version of the BMAD methodology's document sharding. Large markdown specification documents (PRDs, architecture docs, design specs) are split into sections based on `##` headings. A "Spec Viewer" provides a table of contents for navigating these sections, and agents can be assigned specific sections to work on -- reducing the context window usage by focusing on relevant chunks rather than loading entire documents.

The BMAD research (research file 04, section 6.2) describes three load strategies: FULL_LOAD, INDEX_GUIDED, and SELECTIVE_LOAD. We implement INDEX_GUIDED: show the table of contents, let the user pick sections to view or assign.

- [ ] **Step 1: Create sharding parser**

Create `src/lib/bmadSharding.ts`:

```typescript
export interface DocumentSection {
  /** Section ID (index in the document) */
  id: number;
  /** Heading level (2 for ##, 3 for ###, etc.) */
  level: number;
  /** The heading text (without # prefix) */
  title: string;
  /** Start line number in the original document */
  startLine: number;
  /** End line number (exclusive) -- start of next section or EOF */
  endLine: number;
  /** The raw content of this section (including the heading) */
  content: string;
  /** Approximate token count (words * 1.3) */
  estimatedTokens: number;
  /** Child section IDs (### under ##) */
  childIds: number[];
  /** Parent section ID (null for top-level ##) */
  parentId: number | null;
}

export interface ShardedDocument {
  /** Original file path */
  filePath: string;
  /** Document title (first # heading or filename) */
  title: string;
  /** All sections */
  sections: DocumentSection[];
  /** Total estimated tokens for the full document */
  totalTokens: number;
  /** Full raw content */
  rawContent: string;
}
```

- [ ] **Step 2: Implement the sharding algorithm**

```typescript
export function shardDocument(filePath: string, content: string): ShardedDocument {
  const lines = content.split("\n");
  const sections: DocumentSection[] = [];

  // First pass: find all ## and ### headings and their line numbers
  // Second pass: compute content ranges (each section ends where the next same-or-higher level begins)
  // Third pass: establish parent-child relationships (### belongs to preceding ##)
  // Compute estimated tokens per section: Math.ceil(wordCount * 1.3)

  // Extract document title from first # heading
  const titleMatch = content.match(/^# (.+)$/m);
  const title = titleMatch ? titleMatch[1] : filePath.split("/").pop() ?? "Untitled";

  return {
    filePath,
    title,
    sections,
    totalTokens: sections.reduce((sum, s) => sum + s.estimatedTokens, 0),
    rawContent: content,
  };
}
```

The algorithm:
1. Scan each line. When a line matches `/^(#{2,4}) (.+)$/`, record a heading with its level and line number.
2. For each heading, its content extends from its line to the line before the next heading of equal or lesser depth (or EOF).
3. Extract the content substring for each section.
4. Build parent-child: iterate sections in order. A `###` section's parent is the most recent `##` section. A `####` section's parent is the most recent `###` section.
5. Estimate tokens: split section content on whitespace, count words, multiply by 1.3.

- [ ] **Step 3: Create SpecViewer component**

Create `src/components/settings/SpecViewer.tsx`. This component provides a two-panel view for navigating sharded documents.

```
+----------------------------------+-----------------------------------+
| Table of Contents                | Section Content                   |
+----------------------------------+-----------------------------------+
| design-spec.md (45,230 tokens)   |                                   |
|                                  | ## 5. UI Layout and Components    |
| [v] 1. Overview (1,200 t)       |                                   |
| [v] 2. Architecture (3,400 t)   | ### 5.1 Main Window Structure     |
| [v] 3. Tech Stack (2,100 t)     |                                   |
| [ ] 4. Claude Code (5,600 t)    | The main window uses a three-     |
| [>] 5. UI Layout (8,900 t)      | column layout with resizable      |
|     5.1 Main Window (2,100 t)   | panels...                         |
|     5.2 Activity Bar (1,200 t)  |                                   |
|     5.3 Editor Area (3,400 t)   |                                   |
| [ ] 6. Keybindings (2,300 t)    |                                   |
| [ ] 7. Theme System (1,800 t)   |                                   |
+----------------------------------+-----------------------------------+
```

Left panel: Tree-structured table of contents. Each node shows:
- Expand/collapse chevron (if has children)
- Section title
- Estimated token count in muted text
- Checkbox for "include in agent context" (see Step 5)

Right panel: Rendered markdown content of the selected section, using the existing `react-markdown` + `remark-gfm` setup from the chat panel.

Clicking a section in the ToC shows its content in the right panel.

- [ ] **Step 4: Add file selection to SpecViewer**

The SpecViewer needs a file picker at the top. Add a dropdown that:
1. Lists all `.md` files in the project root and `docs/` directory
2. Shows the file name and total token count
3. Selecting a file loads it via `read_file`, runs `shardDocument`, and populates the ToC

Use the existing `read_file` and `get_file_tree` Tauri commands to discover markdown files.

- [ ] **Step 5: Add "Assign to Agent" context for sections**

Each section in the ToC has a checkbox. Selected sections can be assigned to an agent as context. Add a dropdown at the bottom of the left panel:

```
Selected: 3 sections (~7,200 tokens)
[Assign to Agent v] [Copy Selected Content]
```

"Assign to Agent" opens a dropdown of current agents. Selecting an agent appends the selected sections' content to the agent's task description (or stores it as supplementary context on the agent -- add a `contextSections` field to the Agent interface if needed).

"Copy Selected Content" concatenates the selected sections' content and copies to clipboard -- useful for pasting into a Claude prompt.

- [ ] **Step 6: Add spec viewer access point**

In `src/components/layout/PrimarySidebar.tsx`, when the activity bar item is `"settings"` or via a command palette command "Open Spec Viewer", show the SpecViewer. Alternatively, add it as a new activity bar item with a `BookOpen` icon from lucide-react. Choose the approach that fits best with the current sidebar structure -- if the settings area is getting crowded, a separate activity bar item is cleaner.

**Verification:** Open a large markdown file (e.g., the Vantage design spec at `docs/superpowers/specs/2026-04-04-vantage-design.md`). Confirm it shards into sections with correct headings, levels, and token estimates. Navigate sections in the ToC. Select 2-3 sections and assign to an agent. Confirm the content is accessible from the agent's context.

---

### Task 9: Integration Testing and Final Polish

**Files:**
- Modify: various files for bug fixes
- Create: `CLAUDE.md` at project root

This is the final task of the entire Vantage project. It covers integration testing across all phases, production build verification, final polish, and project documentation.

- [ ] **Step 1: Full feature walkthrough -- Phase 1-4 (core IDE)**

Open Vantage. Verify each core feature works:
- File explorer: opens project, lazy loads, shows git status indicators
- Monaco editor: opens files, syntax highlighting, find/replace, split view, tab management
- Terminal: PowerShell and Git Bash tabs, resize, copy/paste, search
- Chat panel: send a message to Claude, see streaming response, tool calls render, permission dialog works
- Command palette: Ctrl+Shift+P opens, fuzzy search works, file mode and command mode
- Diff viewer: inline diff shows for Claude edits, accept/reject works
- Session management: list sessions, resume, fork
- Theme: dark theme applied, all colors correct

Log any issues found as inline TODOs with file paths.

- [ ] **Step 2: Full feature walkthrough -- Phase 5 (P1 multi-agent)**

Test multi-agent features:
- Create 3 agents with different tasks
- Kanban board: drag agents between columns, reorder works
- Worktree isolation: each agent gets its own branch and worktree
- Conflict detection: assign overlapping files to two agents, confirm warning appears
- Agent timeline: timeline shows events for each agent
- Agent detail panel: shows agent info, cost, timeline
- System notifications: confirm toast/OS notifications fire on agent status changes

- [ ] **Step 3: Full feature walkthrough -- Phase 6 (P2 polish)**

Test polish features:
- Light theme: switch to Catppuccin Latte, all surfaces and text update correctly
- High contrast theme: switch to high contrast, verify readability
- Vim mode: enable in settings, confirm NORMAL/INSERT/VISUAL modes work in editor
- Session search: search across past sessions, results navigate correctly
- Git log/blame: view git log, click commit to see diff, view blame on a file
- Auto-update: check for updates (may show "no update available" which is fine)
- Usage analytics: open dashboard, confirm charts render with data from sessions
- Checkpoint/restore: create checkpoint, make changes, restore to checkpoint
- Custom theme: edit `~/.vantage/theme.json`, confirm overrides apply

- [ ] **Step 4: Full feature walkthrough -- Phase 7 (P3 vision)**

Test all Phase 7 features:
- Agent hierarchy: create coordinator, add specialist and verifier children, verify auto-trigger
- Agent tree view: switch to tree view, verify hierarchy renders, status propagation works
- Merge queue: add completed agents to queue, run gates, merge first passing branch
- Role-based routing: create AGENTS.md, verify role suggestions in create dialog
- Verification dashboard: run all checks, verify per-agent results, expand failed check logs
- Embedded browser: start dev server, verify auto-detection, open preview, navigate
- Floating windows: pop out a tab, edit in both windows, verify sync, close popout
- Spec viewer: open a large markdown file, navigate sections, assign to agent

- [ ] **Step 5: Production build**

Run the production build and verify:

```bash
npm run build
cd src-tauri && cargo build --release
```

Verify:
- TypeScript compiles without errors (`tsc --noEmit`)
- Vite build produces optimized output in `dist/`
- Tauri build completes and produces an installer/executable
- The built application launches and all features work

Fix any build errors encountered.

- [ ] **Step 6: Create CLAUDE.md**

Create `CLAUDE.md` at the project root. This file provides context for Claude Code when working on the Vantage codebase. Contents should include:

```markdown
# Vantage

A desktop IDE built around Claude Code CLI, targeting Windows 11.

## Architecture

- **Desktop framework**: Tauri v2 (Rust backend + WebView2 frontend)
- **Frontend**: React 19 + TypeScript 5 + Vite 7
- **UI**: shadcn/ui v4 + Tailwind CSS v4 + Catppuccin themes
- **State**: Zustand v5 stores (agents, editor, layout, settings, conversation, mergeQueue, verification)
- **Editor**: Monaco Editor with vim mode support
- **Terminal**: xterm.js with WebGL rendering
- **Claude integration**: Claude Agent SDK via Node.js sidecar (stdin/stdout IPC)

## Key Directories

- `src/` -- React frontend
- `src/stores/` -- Zustand state stores
- `src/components/` -- React components organized by feature
- `src/lib/` -- Utility libraries (agentsmd parser, bmad sharding)
- `src-tauri/src/` -- Rust backend (Tauri commands)
- `docs/` -- Specifications and implementation plans

## Commands

- `npm run dev` -- Start Vite dev server (frontend only)
- `npm run build` -- Build frontend for production
- `npm run tauri dev` -- Start Tauri development (full app)
- `npm run tauri build` -- Build production installer

## Conventions

- All file paths use forward slashes internally (normalized at the Tauri IPC boundary)
- Zustand stores use immutable update patterns (create new Map/Set instances)
- Tauri commands use specta for auto-generated TypeScript bindings (src/bindings.ts)
- CSS uses Catppuccin color variables (var(--color-*))
- Agent hierarchy: coordinator > specialist > verifier > builder
- All phases: P0 (core), P1 (multi-agent), P2 (polish), P3 (vision)
```

Adjust content based on what actually exists in the codebase at this point.

- [ ] **Step 7: Tag phase-7-complete**

Create a git tag marking the completion of Phase 7:

```bash
git add -A
git commit -m "feat: complete Phase 7 -- P3 future vision features"
git tag phase-7-complete
```

This marks the completion of the entire Vantage implementation plan across all 7 phases.

**Verification:** The production build succeeds. All features from all phases work in the built application. CLAUDE.md is present and accurate. The git tag `phase-7-complete` exists.

---

## Explicitly Deferred (Not in This Phase)

| Feature | Reason |
|---------|--------|
| **Design mode (43)** | Point-and-prompt for UI requires visual element selection, screenshot analysis, and targeted code generation -- a separate project-scale effort |
| **Background cloud agents (44)** | Requires server infrastructure, authentication, remote execution environment -- contradicts Vantage's local-only architecture |
| **LSP integration (31)** | Monaco's built-in TypeScript/JavaScript intelligence is sufficient; a full LSP bridge adds complexity without proportional benefit for an IDE that delegates heavy editing to Claude |

## Architecture Notes

### Agent Hierarchy Data Flow

```
Coordinator (Opus model)
  |-- creates --> Specialist A (Sonnet model) -- worktree branch A
  |-- creates --> Specialist B (Sonnet model) -- worktree branch B
  |-- creates --> Verifier (Sonnet model) -- runs after specialists complete
  |
  v
Merge Queue: [branch-A, branch-B]
  |-- run gates --> lint, test, build per branch
  |-- merge passing branches --> main
  |-- rebase remaining branches
```

### State Store Dependencies

```
agents.ts (hierarchy, roles, childIds)
  |
  +-- mergeQueue.ts (references agentId, branchName, worktreePath)
  |
  +-- verification.ts (references agentId, worktreePath for checks)
  |
  +-- agentsMdConfig (loaded from AGENTS.md, used by CreateAgentDialog)

editor.ts (popoutTabs tracking)
  |
  +-- Tauri events (bidirectional sync between windows)

layout.ts (agentsViewMode, previewUrl, previewActive)
```

### File Ownership Summary

| Store | New in Phase 7 |
|-------|---------------|
| `agents.ts` | `AgentRole`, `parentId`, `childIds`, `createChildAgent`, `getChildAgents`, `getRootAgents` |
| `mergeQueue.ts` | New store -- queue entries, gate results, merge/rebase operations |
| `verification.ts` | New store -- per-agent check status, aggregate counts |
| `layout.ts` | `agentsViewMode`, `previewUrl`, `previewActive` |
| `editor.ts` | `popoutTabs`, `popoutTab`, `returnPopoutTab`, `isPopout` |

### Rust Backend Additions

| Module | Commands |
|--------|----------|
| `merge_queue.rs` | `run_quality_gate`, `merge_branch`, `rebase_branch` |
