# Multi-Agent Orchestration Deep Dive

## Research Document for Vantage IDE

**Date**: 2026-04-03
**Scope**: Exhaustive analysis of multi-agent coding orchestration tools, patterns, academic research, and practical lessons for building Vantage's multi-agent coordination layer.

---

## Table of Contents

1. [Claude Code Agent Teams](#1-claude-code-agent-teams)
2. [Gas Town (Steve Yegge's Orchestrator)](#2-gas-town-steve-yegges-orchestrator)
3. [Clash (Conflict Detection)](#3-clash-conflict-detection)
4. [Claude Squad (tmux-based Multi-Agent)](#4-claude-squad-tmux-based-multi-agent)
5. [Augment Code Six Coordination Patterns](#5-augment-code-six-coordination-patterns)
6. [BMAD Methodology v6](#6-bmad-methodology-v6)
7. [Vibe Kanban and Claw-Kanban](#7-vibe-kanban-and-claw-kanban)
8. [Academic Research](#8-academic-research)
9. [The Verification Bottleneck Problem](#9-the-verification-bottleneck-problem)
10. [Synthesis: Lessons for Vantage](#10-synthesis-lessons-for-vantage)

---

## 1. Claude Code Agent Teams

**Source**: Anthropic's official experimental feature, shipped with Claude Code v2.1.32+ (February 5, 2026)
**Docs**: https://code.claude.com/docs/en/agent-teams
**Enable**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings.json or environment

### 1.1 Architecture Overview

Agent Teams is a file-based, decentralized coordination system. There is no background daemon or central server. Coordination emerges from shared file access on the local filesystem.

```
Architecture Diagram:

    +------------------+
    |    HUMAN USER    |
    +--------+---------+
             |
             v
    +------------------+
    |   TEAM LEAD      |  (main Claude Code session)
    |  - TeamCreate    |
    |  - TaskCreate    |
    |  - SendMessage   |
    |  - TeamDelete    |
    +--+-----+------+--+
       |     |      |
       v     v      v
    +----+ +----+ +----+
    | T1 | | T2 | | T3 |  (teammate sessions - separate CLI processes)
    +----+ +----+ +----+
       \     |     /
        v    v    v
    +------------------+
    | SHARED FILESYSTEM|
    | ~/.claude/       |
    |  teams/          |
    |  tasks/          |
    +------------------+
```

**Components**:

| Component     | Role                                                                |
|:------------- |:------------------------------------------------------------------- |
| Team Lead     | Main session; creates team, spawns teammates, coordinates work      |
| Teammates     | Separate Claude Code CLI processes with independent context windows |
| Task List     | JSON files on disk with dependency tracking                         |
| Mailbox       | Per-agent JSON inbox files for peer-to-peer messaging               |

### 1.2 Filesystem Layout

```
~/.claude/
  teams/{team-name}/
    config.json              # Team membership registry
    inboxes/
      team-lead.json         # Lead's mailbox
      researcher.json        # Teammate mailbox
      implementer.json       # Teammate mailbox
  tasks/{team-name}/
    .lock                    # flock() mutex for task claiming
    .highwatermark           # Auto-increment counter (next task ID)
    1.json                   # Individual task file
    2.json
    3.json
```

### 1.3 Team Configuration Format

```json
{
  "members": [
    {"name": "team-lead",   "agentId": "abc-123", "agentType": "leader"},
    {"name": "researcher",  "agentId": "def-456", "agentType": "general-purpose"},
    {"name": "implementer", "agentId": "ghi-789", "agentType": "security-reviewer"}
  ]
}
```

Names serve as the primary addressing mechanism. Teammates discover each other by reading `config.json`.

### 1.4 Task JSON Schema

Each task is an individual JSON file (`{id}.json`):

```json
{
  "id": "1",
  "subject": "Implement GET /weather endpoint",
  "description": "Route: /weather. Input validation: zod schema...",
  "activeForm": "Implementing weather endpoint",
  "owner": "implementer",
  "status": "in_progress",
  "blocks": ["3"],
  "blockedBy": []
}
```

**Fields**:

| Field         | Type     | Purpose                                          |
|:------------- |:-------- |:------------------------------------------------ |
| `id`          | string   | Auto-incremented via `.highwatermark`             |
| `subject`     | string   | Imperative-form title                            |
| `description` | string   | Detailed requirements (acts as prompt)            |
| `activeForm`  | string   | Present-continuous form for UI spinners           |
| `owner`       | string   | Assigned teammate name (null if unclaimed)        |
| `status`      | string   | `pending` -> `in_progress` -> `completed`/`deleted` |
| `blocks`      | string[] | Task IDs this task blocks                        |
| `blockedBy`   | string[] | Task IDs that must complete first                |

**Task states**: pending, in_progress, completed, deleted.
**Claiming**: Lowest-ID-first ordering. Tasks with non-empty `blockedBy` arrays cannot be claimed until blocking tasks reach terminal states.

### 1.5 File Locking Mechanism

- `.lock`: A 0-byte file used for filesystem-level mutual exclusion via `flock()`.
- When a teammate attempts to claim a task, it acquires an exclusive lock on `.lock`, reads the task file, checks if unclaimed, writes ownership, then releases the lock.
- `.highwatermark`: Contains a single integer (e.g., "13") representing the next available task ID for auto-incrementing.

### 1.6 Mailbox / Peer-to-Peer Messaging Protocol

Each agent has a JSON array file at `~/.claude/teams/{team-name}/inboxes/{agent-name}.json`.

**Message format**:
```json
[
  {
    "from": "team-lead",
    "text": "{\"type\":\"task_assignment\",\"taskId\":\"1\",\"subject\":\"...\"}",
    "timestamp": "2026-02-18T02:37:16.890Z",
    "read": false
  }
]
```

Note the JSON-in-JSON encoding: the `text` field is a serialized JSON string containing the message payload.

**Message types**:

| Type                     | Direction         | Function                              |
|:------------------------ |:----------------- |:------------------------------------- |
| `task_assignment`        | lead -> teammate  | Work dispatch with full details       |
| `message`                | any -> any        | Direct single-recipient communication |
| `broadcast`              | lead -> all       | Same message to all teammates         |
| `shutdown_request`       | lead -> teammate  | Graceful termination request          |
| `shutdown_response`      | teammate -> lead  | Approval or rejection                 |
| `plan_approval_request`  | teammate -> lead  | Plan submission for review            |
| `plan_approval_response` | lead -> teammate  | Approval with optional feedback       |
| `idle_notification`      | teammate -> lead  | Auto-sent when teammate's turn ends   |

**Delivery mechanism**: Append operations for writes, polling for reads. No event bus or push notifications.

### 1.7 The Seven Primitives (Tools)

1. **TeamCreate** - Initializes team namespace, creates config.json, tasks directory
2. **TaskCreate** - Defines work items as JSON files on disk
3. **TaskUpdate** - Changes task status, ownership, dependencies
4. **TaskList** - Returns all tasks with current ownership/status (agents poll this)
5. **Task** (with `team_name` parameter) - Spawns a new teammate as a separate `claude` CLI process
6. **SendMessage** - Enables direct peer-to-peer messaging via inbox files
7. **TeamDelete** - Cleanup; removes all team config and task files

### 1.8 Quality Gates via Hooks

| Hook              | Trigger                           | Exit Code 2 Effect                |
|:----------------- |:--------------------------------- |:--------------------------------- |
| `TeammateIdle`    | Teammate about to go idle         | Prevents idling, sends feedback   |
| `TaskCreated`     | Task being created                | Prevents creation, sends feedback |
| `TaskCompleted`   | Task being marked complete        | Blocks completion, sends feedback |

Hook handlers support three types: `command` (shell script), `prompt` (single-turn LLM), and `agent` (multi-turn subagent, up to 50 turns).

### 1.9 Display Modes

- **In-process** (default): All teammates in main terminal. `Shift+Down` cycles through teammates. Works everywhere.
- **Split panes**: Each teammate gets its own tmux/iTerm2 pane. Requires tmux or iTerm2 with `it2` CLI.
- **Auto** (default setting): Uses split panes if already in tmux, otherwise in-process.

### 1.10 Context and Permissions

- Each teammate has its own context window. Does NOT inherit the lead's conversation history.
- Teammates load project context: `CLAUDE.md`, MCP servers, skills (same as any regular session).
- Teammates inherit the lead's permission settings at spawn time.
- No session resumption: `/resume` and `/rewind` do not restore in-process teammates.
- Teammates can use subagent definitions for role-specialized behavior.

### 1.11 Token Economics

Each teammate is a full Claude Code session with independent context windows:

| Configuration        | Approximate Token Cost |
|:-------------------- |:---------------------- |
| Solo Session         | ~200k tokens           |
| 3 Subagents          | ~440k tokens           |
| 3-Person Agent Team  | ~800k tokens           |
| 5-Person Agent Team  | ~1.4M tokens           |

Approximately 7x standard sessions due to full context per teammate. Cost scales linearly with agent count.

### 1.12 Best Practices (from official docs and practitioners)

- **Team size**: 3-5 teammates is the sweet spot. "Three focused teammates often outperform five scattered ones."
- **Task granularity**: 5-6 tasks per teammate keeps everyone productive.
- **Plan before parallelizing**: Review a plan before committing to a swarm (cheap ~10k tokens vs. expensive ~500k+ tokens for execution).
- **Delegate mode**: Restrict the lead to coordination only to prevent it from implementing work itself.
- **Model stratification**: Lead on Opus (planning/synthesis), teammates on Sonnet (execution).
- **File ownership**: Break work so each teammate owns different files. Avoid same-file edits.

### 1.13 Known Limitations

- No session resumption for in-process teammates
- Task status can lag (agents forget completion markers)
- One team per session; no nested teams
- Lead is fixed for the team's lifetime
- Split panes not supported in VS Code terminal, Windows Terminal, or Ghostty
- Shutdown can be slow (teammates finish current request first)

### 1.14 Relevance to Vantage

Agent Teams provides the foundational coordination protocol Vantage would wrap with a GUI. The file-based design is both a strength (simple, debuggable) and a limitation (no real-time events, polling-based). Vantage could:

- Watch the `~/.claude/teams/` and `~/.claude/tasks/` directories with `fs.watch` for real-time UI updates
- Provide a visual task board overlaying the JSON task files
- Show the mailbox messages in a chat-like interface
- Visualize task dependencies as a DAG
- Provide one-click team creation with pre-configured role templates

---

## 2. Gas Town (Steve Yegge's Orchestrator)

**Source**: https://github.com/steveyegge/gastown
**Blog**: https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04
**Philosophy**: Infrastructure thinking applied to AI development

### 2.1 The MEOW Stack (Molecular Expression of Work)

Gas Town's foundational architecture has four layers:

```
Architecture Diagram:

    +------------------------------------------+
    |               HUMAN USER                 |
    +-------------------+----------------------+
                        |
    +-------------------v----------------------+
    |              THE MAYOR                   |
    |    Primary concierge & chief-of-staff    |
    |    Accepts directives, delegates work    |
    +---+------+------+------+------+------+---+
        |      |      |      |      |      |
        v      v      v      v      v      v
    +------+ +------+ +------+ +------+ +------+
    | PC-1 | | PC-2 | | PC-3 | | PC-4 | | PC-5 |  Polecats
    | rig1 | | rig2 | | rig3 | | rig4 | | rig5 |  (ephemeral workers)
    +--+---+ +--+---+ +--+---+ +--+---+ +--+---+
       |        |        |        |        |
       v        v        v        v        v
    +------------------------------------------+
    |          GIT-BACKED STATE (BEADS)        |
    |    JSON in Git / Worktree per rig        |
    +------------------------------------------+
                        |
    +-------------------v----------------------+
    |   MONITORING LAYER                       |
    |   Witness (per-rig) -> Deacon (global)   |
    |   -> Dogs (maintenance helpers)          |
    +------------------------------------------+
                        |
    +-------------------v----------------------+
    |   REFINERY (per-rig merge queue)         |
    |   Bors-style bisecting verification      |
    +------------------------------------------+
```

### 2.2 Seven Worker Roles

| Role        | Symbol | Persistence | Function                                            |
|:----------- |:------ |:----------- |:--------------------------------------------------- |
| **Mayor**   | hat    | Long-lived  | Primary orchestrator, accepts directives, delegates  |
| **Polecats**| skunk  | Ephemeral   | Per-rig workers; spawn, produce MR, decommission     |
| **Refinery**| factory| Loop-based  | Merge queue processor; Bors-style bisecting gates    |
| **Witness** | eye    | Loop-based  | Per-rig lifecycle monitor; detects stuck agents      |
| **Deacon**  | church | Loop-based  | Global daemon; periodic patrol with exponential backoff |
| **Dogs**    | dog    | Ephemeral   | Deacon's helpers; branch cleanup, plugin execution   |
| **Crew**    | wrench | Long-lived  | Per-rig agents under direct human control            |

### 2.3 Beads: Persistent Memory System

Beads are the atomic work unit -- lightweight issue-tracker units stored as JSON in Git.

**Bead ID format**: `prefix-XXXXX` (e.g., `gt-abc12`, `hq-x7k2m`). The prefix indicates origin rig.

**Two-tier structure**:
- **Rig-level beads**: Project improvements (code changes, features, bugs)
- **Town-level beads**: Orchestration work (scheduling, monitoring, meta-tasks)

Cross-rig routing uses issue prefixes to direct commands to the appropriate database.

**Key properties**:
- Beads survive agent crashes because they persist in Git
- Agents are persistent entities backed by Git; sessions are ephemeral cattle
- Each agent maintains a "Hook" -- a pinned bead storing pending work molecules

### 2.4 The GUPP Principle (Gastown Universal Propulsion)

Solves Claude Code's fundamental problem: context window exhaustion and agent politeness.

**Rule**: "If there is work on your hook, YOU MUST RUN IT."

**Mechanism**:
1. Each agent has a persistent identity as a Bead with a Hook
2. Hook stores pending work molecules
3. Sessions are ephemeral; agents are persistent (backed by Git)
4. GUPP Nudge: ~30-60 seconds after startup, if agent hasn't begun work, system sends `gt nudge` commands
5. Nudge triggers mail and hook inspection without user input

### 2.5 Nondeterministic Idempotence (NDI)

Guarantees workflow completion through radical durability:

1. All work persists as molecules (bead chains) in Git
2. If an agent crashes mid-task, the persistent molecule survives
3. The successor agent session detects incomplete work
4. Agent self-corrects and advances to next step

Not deterministic replay (like Temporal) -- but sufficient for developer tooling.

### 2.6 Molecules and Formulas

**Molecules**: Workflow chains coordinated via beads. Templates provide predefined task sequences.
**Protomolecules**: Workflow classes that instantiate into executable molecules.
**Formulas**: TOML-based source descriptions that "cook" into protomolecules.

Two execution modes:
- **Root-only wisps**: Steps materialized at runtime (lightweight)
- **Poured wisps**: Steps materialized as sub-wisps with checkpoint recovery

### 2.7 Convoys: Batch Work Management

Convoys bundle multiple beads into trackable delivery packages:
- `gt convoy create` - Bundle work items
- `gt sling [bead-id] [rig]` - Assign to agent
- `gt convoy list` - Track progress
- "Mountain"-labeled convoys receive autonomous stall detection

### 2.8 Scaling to 20-30 Agents

**Scheduler**: Config-driven capacity governor with configurable concurrency limits (`scheduler.max_polecats`). Default is direct dispatch; scheduler enables deferred dispatch.

**Refinery**: Per-rig merge queue with Bors-style bisecting verification. Batches merge requests to prevent corruption.

**Patrol loops**: Witness, Deacon run with exponential backoff. Gradually sleep if no work; awaken via any mutating command.

### 2.9 Practical Realities

- **Cost**: "$100/hour token burn rate at peak" during DoltHub testing
- **Stability**: Auto-merging failing tests, agents deleting code unpredictably, force-push recovery needed
- **Origin**: Four complete orchestrator iterations in 2025 (75,000 lines Go, 2,000 commits in 17 days)
- **UI**: tmux-based (`C-b s` for sessions, `C-b n/p` for cycling)
- **Requirements**: Multiple Claude Code accounts (token-per-account limits), significant financial investment

### 2.10 Key Commands

```
gt mayor attach         # Connect to coordinator
gt convoy create        # Bundle work items
gt sling [bead-id] [rig] # Assign work to agent
gt convoy list          # Track progress
gt escalate             # Route blockers with severity
gt nudge                # Trigger hook inspection
gt handoff              # Clean handoff between sessions
bd cook [formula]       # Execute predefined workflows
```

### 2.11 Relevance to Vantage

Gas Town represents the most ambitious multi-agent orchestrator in the ecosystem. Key lessons:

- Git-backed persistent state is essential for crash recovery
- Hierarchical monitoring (Witness -> Deacon) catches stuck agents
- Merge queues with verification prevent corruption
- The "$100/hour" reality means Vantage needs cost monitoring and budget controls
- tmux-based UI is functional but not user-friendly -- Vantage can provide a better visual layer

---

## 3. Clash (Conflict Detection)

**Source**: https://github.com/clash-sh/clash
**Website**: https://clash.sh
**Language**: Rust (single binary, no runtime dependencies)
**License**: MIT

### 3.1 The Problem

When multiple AI agents work in separate worktrees, they're blind to each other's changes. Conflicts only surface at merge time, after significant work is wasted.

### 3.2 Three-Way Merge Simulation

Clash performs read-only three-way merges using `git merge-tree` via the `gix` library (pure-Rust Git implementation):

```
How Three-Way Merge Detection Works:

    Branch A          Merge Base          Branch B
    (worktree 1)      (common ancestor)   (worktree 2)
         \                 |                  /
          \                |                 /
           +-------+-------+-------+--------+
                   |                |
                   v                v
              Changes A         Changes B
                   |                |
                   +-------+--------+
                           |
                           v
                   Simulated Merge
                   (in-memory only)
                           |
                      +----+----+
                      |         |
                   CLEAN     CONFLICT
                   (OK)    (report it)
```

Process:
1. Discover all worktrees (main + linked)
2. Identify merge base for each worktree pair
3. Simulate merges in memory without modifying repository
4. Report conflicting files with metadata

**100% read-only** -- repository is never modified.

### 3.3 CLI Commands

**Check a specific file**:
```bash
clash check <filepath>
```
Output JSON:
```json
{
  "file": "src/main.rs",
  "current_worktree": "main",
  "current_branch": "main",
  "conflicts": [
    {
      "worktree": "clash-agent1",
      "branch": "feature/auth",
      "has_merge_conflict": true,
      "has_active_changes": false
    }
  ]
}
```

**Status matrix**:
```bash
clash status [--json]
```
```
+----------+------+---------+---------+---------+
|          | main | feat/a  | feat/b  | feat/c  |
+----------+------+---------+---------+---------+
| main     |  -   |   OK    |   OK    |   OK    |
| feat/a   |  OK  |    -    |   2     |   1     |
| feat/b   |  OK  |   2     |    -    |   OK    |
| feat/c   |  OK  |   1     |   OK    |    -    |
+----------+------+---------+---------+---------+
Numbers = count of conflicting files
```

**Watch mode** (live TUI):
```bash
clash watch
```
Uses the `notify` crate for filesystem event-driven auto-refresh.

### 3.4 Pre-Write Hook Integration

Claude Code plugin hook in `.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {"type": "command", "command": "clash check"}
        ]
      }
    ]
  }
}
```

Exit codes:
- `0` = no conflicts, proceed
- `2` = conflicts detected, prompt user
- `1` = error

Also installable as Claude Code plugin: `claude plugin install clash@clash-sh`

### 3.5 Technical Dependencies

| Crate      | Purpose                                |
|:---------- |:-------------------------------------- |
| `gix`      | Git operations without shell execution |
| `ratatui`  | Terminal UI framework for TUI          |
| `notify`   | Cross-platform filesystem watching     |
| `serde`    | JSON serialization/deserialization     |

### 3.6 Installation

```bash
# Quick install (macOS/Linux)
curl -fsSL https://clash.sh/install.sh | sh

# Homebrew
brew tap clash-sh/tap && brew install clash

# Cargo
cargo install clash-sh
```

### 3.7 Relevance to Vantage

Clash solves a critical problem for any multi-agent IDE. Vantage should either:

1. **Integrate Clash directly**: Ship it as a dependency, run `clash status --json` periodically, display the conflict matrix in the GUI
2. **Implement equivalent logic**: Use the same `git merge-tree` approach via a Node.js git library (e.g., `isomorphic-git`) to detect conflicts natively

The watch mode TUI could be replaced with a visual conflict map in Vantage's sidebar showing which agent branches conflict in real-time.

---

## 4. Claude Squad (tmux-based Multi-Agent)

**Source**: https://github.com/smtg-ai/claude-squad
**Language**: Go (89.1%)
**Stars**: High adoption in the AI coding community
**Docs**: https://smtg-ai.github.io/claude-squad/

### 4.1 Architecture

```
Architecture Diagram:

    +----------------------------------+
    |     TUI (Bubbletea MVU)          |
    |  +------+  +----------+         |
    |  | List |  | Tabbed   |         |
    |  | 30%  |  | Preview/ |         |
    |  | width|  | Diff 70% |         |
    |  +------+  +----------+         |
    |  +--------+ +---------+         |
    |  | Menu   | | ErrBox  |         |
    |  +--------+ +---------+         |
    +-----------+----------------------+
                |
    +-----------v---------+
    |   Instance Struct   |  (per agent)
    |  +-------+ +------+ |
    |  | Tmux  | | Git  | |
    |  |Session| |Work- | |
    |  |       | |tree  | |
    |  +-------+ +------+ |
    +-----------+---------+
                |
    +-----------v---------+
    |   Storage Layer     |
    |  ~/.claude-squad/   |
    |    config.json      |
    |    state.json       |
    |    instance_*.json  |
    |    worktrees/       |
    |    daemon.pid       |
    +---------------------+
```

### 4.2 Dual Isolation Architecture

**Terminal Isolation (tmux)**:
- Session naming: `claudesquad_<title>_<timestamp>`
- Each instance spawns a detached tmux session with PTY
- Enables attach/detach for interactive debugging
- Content capture: `tmuxSession.CapturePaneContent()` retrieves terminal output
- Status monitoring: SHA256 hashing detects output changes

**Filesystem Isolation (Git Worktrees)**:
- Each instance: `~/.claude-squad/worktrees/<unique-path>/`
- Branch naming: `<prefix>_<name>_<timestamp>` (default prefix: "cs")
- Diff tracking: DiffStats struct calculating additions/deletions
- SHA256 content hashing for file modification detection

### 4.3 Instance Lifecycle (State Machine)

```
State Machine:

    +-------+     start      +---------+
    | READY |  ------------> | RUNNING |
    +-------+                +----+----+
                                  |
                  pause           |           resume
              +-------------------+-------------------+
              |                                       |
              v                                       v
         +--------+                              +--------+
         | PAUSED |  <------------------------   | LOADING|
         +--------+                              +--------+
              |
              | kill
              v
         +--------+
         | KILLED |
         +--------+
```

- **Start**: Creates worktree + branch, spawns tmux session, launches AI agent
- **Pause**: Commits changes, detaches tmux, removes worktree filesystem (preserves branch)
- **Resume**: Recreates worktree from branch, reattaches tmux
- **Kill**: Terminates tmux, deletes worktree and branch

### 4.4 Polling Strategy

| Interval | Purpose                                        |
|:-------- |:---------------------------------------------- |
| 100ms    | Preview pane updates (responsive terminal output) |
| 500ms    | Metadata calculations (diff stats, status changes) |

Detection uses SHA256 content hashing to balance UI responsiveness with computational efficiency.

### 4.5 Configuration

```json
// ~/.claude-squad/config.json
{
  "default_program": "claude",
  "auto_yes": false,
  "branch_prefix": "cs",
  "daemon_poll_interval": 5000,
  "profiles": [
    {"name": "claude", "program": "claude"},
    {"name": "codex", "program": "codex"},
    {"name": "gemini", "program": "gemini"}
  ]
}
```

### 4.6 Supported Agents

- Claude Code (default)
- OpenAI Codex
- Google Gemini CLI
- Aider (local)
- Custom programs via `-p` flag (e.g., `-p "aider --model ollama_chat/gemma3:1b"`)

### 4.7 Key TUI Commands

| Key          | Action                       |
|:------------ |:---------------------------- |
| `n`          | New session (default config) |
| `N`          | New session with prompt      |
| `Enter`/`o`  | Attach to session            |
| `c`          | Pause (commit + suspend)     |
| `r`          | Resume paused session        |
| `D`          | Kill session                 |
| `Tab`        | Switch preview/diff          |
| `s`          | Commit + push to GitHub      |
| `Shift+Down` | Scroll diff                  |
| `ctrl-q`     | Detach without terminating   |

### 4.8 Daemon Mode

AutoYes mode (`-y` flag) launches a background daemon that:
1. Polls instances at configured interval
2. Automatically accepts AI prompts
3. Monitors completion status
4. Enables unattended operation

PID stored in `~/.claude-squad/daemon.pid`.

### 4.9 Relevance to Vantage

Claude Squad provides the reference implementation for "tmux + git worktrees" isolation. Key takeaways for Vantage:

- The Instance struct pattern (tmux session + git worktree per agent) is proven and reliable
- Pause/resume via branch preservation is elegant and resource-efficient
- The TUI is functional but limited -- Vantage's GUI can provide much richer interaction
- SHA256-based change detection is an efficient polling approach
- The daemon mode pattern shows how to run agents unattended

---

## 5. Augment Code Six Coordination Patterns

**Source**: https://www.augmentcode.com/guides/how-to-run-a-multi-agent-coding-workspace
**Product**: Augment Code's "Intent" workspace implements all six patterns

### 5.1 Pattern 1: Spec-Driven Task Decomposition

**Principle**: Convert large changes into small, bounded tasks with explicit file and interface boundaries.

**Evidence**: On SWE-Bench Verified, frontier models score above 70% on single-issue tasks. On SWE-Bench Pro (multi-step), best models drop below 25%. Decomposition keeps agents within reliable accuracy ranges.

**Four-phase workflow**:
1. **Specify**: Define user journeys and success criteria
2. **Plan**: Identify dependencies and integration points
3. **Tasks**: Break work into isolated, testable units
4. **Implement**: Agents generate code with human verification checkpoints

**Task specification example**:
```yaml
Role: Backend API Developer
Task: Implement GET /weather endpoint
  - Route: /weather
  - Input validation: zod schema for city parameter
  - External call: fetch to weather service
  - Error handling: ProblemDetails RFC 7807
Constraints:
  - Include X-Request-Id in all logs
  - 5-second timeout on external calls
  - Cache results for 5 minutes
Acceptance:
  - Unit tests pass with 80%+ coverage
  - Integration test with mock weather service
  - OpenAPI spec updated
```

**Failure mode**: Vague constraints cause scope creep -- agents add caching infrastructure or logging refactors outside task boundaries.

### 5.2 Pattern 2: Git Worktree Isolation

**Principle**: Each agent gets a separate working directory and index while sharing the `.git` object database.

| Component             | Status   | Implication                        |
|:--------------------- |:-------- |:---------------------------------- |
| `.git/objects/`       | Shared   | History stored once; space-efficient |
| `.git/refs/`          | Shared   | Branch names visible across worktrees |
| Working directory     | Isolated | Each agent edits independently     |
| `.git/index`          | Isolated | Each agent stages independently    |
| `.git/HEAD`           | Isolated | Each agent tracks own branch       |

**Critical risk**: "Running concurrent git commands (commit/fetch/pull) across worktrees can corrupt shared metadata; serialize git operations."

**Practical note**: Worktrees don't isolate external state (databases, Docker, caches) unless explicitly separated.

### 5.3 Pattern 3: Coordinator/Specialist/Verifier Architecture

```
Role Architecture:

    +---------------------+
    | COORDINATOR (Tier 1) |
    | - Decomposes tasks   |
    | - Orders deps        |
    | - Tracks progress    |
    | - Maintains ledger   |
    +----+-------+--------+
         |       |
    +----v--+ +--v------+
    |SPEC 1 | |SPEC 2   |  Tier 2: Specialists
    |Frontend| |Backend  |  (bounded, single-responsibility)
    +----+--+ +--+------+
         |       |
    +----v-------v--------+
    | VERIFIER (Tier 3)    |
    | - Execution evidence |
    | - Spec compliance    |
    | - Flag inconsistency |
    +---------------------+
```

**Communication patterns**:

| Pattern            | Best For                  | Risk                      |
|:------------------ |:------------------------- |:------------------------- |
| Central supervisor | Tightly coupled work      | Coordinator bottleneck    |
| Publish-subscribe  | Sharing intermediate results | Topic drift            |
| Message bus        | High parallelism          | Operational overhead      |
| Google A2A protocol| Heterogeneous agents      | Integration complexity    |

### 5.4 Pattern 4: BYOA (Bring Your Own Agent) Model Selection

Route models based on task complexity and risk:

| Task Type             | Recommended Tier     | Rationale                        |
|:--------------------- |:-------------------- |:-------------------------------- |
| Architecture decisions| High-reasoning model | Better at dependency tradeoffs   |
| Implementation        | Balanced model       | Faster feedback loops            |
| Code review/analysis  | Analytical model     | Stronger inspection behavior     |
| Large-context tasks   | Size-matched model   | Avoids missing key files         |

**Key insight**: "Critical changes (migrations, security, architecture) stay on higher-accuracy models, while routine iteration moves to faster ones."

### 5.5 Pattern 5: Verification and Quality Gates

**Multi-layer verification stack**:
1. **Automated tests**: CI runs unit/integration tests + linting + security scanning
2. **Quality gates**: Coverage and critical rule thresholds before merge
3. **AI review stages**: Code-review and bug-finding passes as separate steps
4. **Pre-commit checks**: Shift verification left for shorter feedback loops
5. **Human checkpoints**: Reserve humans for semantic correctness and architecture

**Critical gap**: "Semantic errors pass compilation, linting, and even basic tests but fail in production" (e.g., timezone handling working in UTC but failing at DST boundaries).

**Key finding** (DORA/OpenAI): "Teams with strong tests benefit most because a test suite is an executable safety net."

### 5.6 Pattern 6: Sequential Merge Strategies

**Principle**: Integrate parallel agent work one branch at a time. Each merge updates main, then remaining branches rebase onto newest main.

```bash
# Merge order matters -- sequential integration
git checkout feature/backend && git rebase main
git checkout main && git merge feature/backend

git checkout feature/frontend && git rebase main
git checkout main && git merge feature/frontend

git checkout feature/tests && git rebase main
git checkout main && git merge feature/tests
```

**Git 2.34+ strategy**:
```bash
git merge --strategy=ort -X patience feature-branch
```
The `-X patience` option reduces bad auto-merges on highly divergent branches.

**Critical rule**: "A clean textual merge can still be logically wrong while compiling." Treat merge options as diff-quality tools, not correctness proof.

### 5.7 The Practical Ceiling

"For most teams, 3-4 parallel agents is a practical ceiling when a single reviewer is integrating results, because conflict resolution and semantic review become the limiting step."

### 5.8 Relevance to Vantage

These six patterns form the theoretical framework for Vantage's multi-agent orchestration. Key implementation priorities:

1. **Built-in spec editor** with task decomposition assistance
2. **Automatic worktree creation** when spawning agents
3. **Role templates** (coordinator, specialist, verifier) as first-class UI concepts
4. **Model routing UI** letting users assign models to task types
5. **Quality gate dashboard** showing test results, lint status, review status per branch
6. **Sequential merge assistant** that guides through the rebase-merge workflow

---

## 6. BMAD Methodology v6

**Source**: https://github.com/bmad-code-org/BMAD-METHOD
**Docs**: https://docs.bmad-method.org
**Full name**: Breakthrough Method for Agile AI-Driven Development

### 6.1 Four-Phase Lifecycle

```
BMAD Workflow Map:

    Phase 1: ANALYSIS (Optional)
    +------------------------------------------+
    | brainstorming -> research -> product-brief |
    | -> PRFAQ (working-backwards)              |
    +------------------+-----------------------+
                       |
    Phase 2: PLANNING  v
    +------------------------------------------+
    | create-prd -> create-ux-design            |
    +------------------+-----------------------+
                       |
    Phase 3: SOLUTIONING v
    +------------------------------------------+
    | create-architecture -> create-epics-and-  |
    | stories -> check-implementation-readiness  |
    | (PASS / CONCERNS / FAIL gate)             |
    +------------------+-----------------------+
                       |
    Phase 4: IMPLEMENTATION v
    +------------------------------------------+
    | sprint-planning -> create-story ->        |
    | dev-story -> code-review ->               |
    | correct-course -> sprint-status ->        |
    | retrospective                             |
    +------------------------------------------+

    Parallel: QUICK-DEV (unifies phases 1-3 for small work)
```

### 6.2 Document Sharding Architecture

**Problem**: Monolithic documents consume entire context windows.

**Solution**: Split large markdown files into smaller files based on `## Heading` boundaries.

```
Sharded PRD structure:

    prd/
      index.md                   (navigation + descriptions)
      overview.md                (vision, goals)
      functional-requirements.md
      epics/
        epic-01-authentication.md
        epic-02-dashboard.md
        epic-03-export.md
```

**Load strategies**:
- **FULL_LOAD**: All files in directory
- **INDEX_GUIDED**: Load index.md, AI analyzes relevance, loads pertinent shards only
- **SELECTIVE_LOAD**: Template variables load specific files (e.g., `{{epic_num}}`)

**Dual discovery system**: First looks for whole document (`prd.md`), then checks sharded version (`prd/index.md`). Whole documents take precedence.

**Token impact**: Healthcare company achieved 82% reduction when creating stories for specific epics (45,000 tokens -> 8,000 tokens).

### 6.3 Step-File Architecture

**Problem**: Monolithic workflows load all future steps simultaneously, wasting context and enabling agents to skip steps or hallucinate completion.

```
Step-file structure:

    create-story/
      workflow.md           (orchestration metadata)
      steps/
        step-01-load-context.md    (~2,000-3,000 tokens each)
        step-02-analyze.md
        step-03-draft.md
        step-04-validate.md
```

**Five critical enforcement rules**:
1. NEVER load multiple step files simultaneously
2. ALWAYS read the entire step file before execution
3. NEVER skip steps or optimize the sequence
4. ALWAYS update frontmatter when completing steps (`stepsCompleted: [1, 2]`)
5. NEVER proceed without user consent (menu 'C' for Continue)

**Token savings**: Monolithic ~15,000 tokens upfront vs. step-file ~2,000-3,000 per step = ~80% reduction per workflow.

### 6.4 Scale-Adaptive Intelligence

Three tracks:

| Track              | Level | Target              | Output          |
|:------------------ |:----- |:------------------- |:--------------- |
| Quick Flow         | 0-1   | Bug fixes, simple   | Tech-spec, 1-2 stories |
| BMad Method        | 2-3   | New products        | Full PRD + Arch + UX + Epics |
| Enterprise Method  | 4     | Multi-tenant, compliance | + Security + DevOps + Test Strategy |

System auto-routes based on complexity analysis.

### 6.5 Agent Personas

**Six core agents**:

| Agent              | Name    | Slug               | Specialty                         |
|:------------------ |:------- |:------------------- |:--------------------------------- |
| Analyst            | Mary    | `bmad-analyst`      | Discovery, research, brief creation |
| Product Manager    | John    | `bmad-pm`           | PRD, epic/story generation        |
| Architect          | Winston | `bmad-architect`    | Technical design, ADRs            |
| Developer          | Amelia  | `bmad-agent-dev`    | Code execution, QA, code review   |
| UX Designer        | Sally   | `bmad-ux-designer`  | Interface specification           |
| Technical Writer   | Paige   | `bmad-tech-writer`  | Documentation, diagrams           |

**Three agent types** (by state management):

| Type          | State           | Example                          |
|:------------- |:--------------- |:-------------------------------- |
| Simple Agent  | Stateless       | CodeFormatter -- each run independent |
| Expert Agent  | Sidecar files   | CodeReviewer with memories.md     |
| Module Agent  | Coordinates workflows | DEV, PM, Architect agents  |

**Party Mode**: Brings multiple agent personas into one session. BMad Master coordinates 2-3 agents per message, synthesizes consensus. When agents disagree (PM wants async export but DEV notes performance concerns), BMad Master facilitates trade-off discussion.

### 6.6 Handoff Protocols and Conflict Prevention

**Menu-driven continuation**:
```
[C] Continue to [Next Step]
[R] Revise draft
[X] Exit (progress saved)
```

**Architectural safeguards against conflicts**:

1. **Separation of concerns**: Three agent types handle different state requirements
2. **Linear workflow chains**: Sequential step enforcement prevents parallel step execution
3. **Explicit handoffs**: Menu-driven continuation ensures human validation at each decision point
4. **Read-only context**: Agents cannot view future steps or sibling workflows
5. **Consensus mechanisms**: Party Mode's BMad Master coordinates multi-agent disagreements
6. **State transparency**: Frontmatter tracking (`stepsCompleted: [1, 2, 3]`) makes all decisions visible and auditable
7. **No agent self-optimization**: Agents cannot skip steps "because I already know what to do"

### 6.7 Token Optimization Results

| Scenario                  | Before   | After   | Reduction |
|:------------------------- |:-------- |:------- |:--------- |
| Healthcare workflow avg   | 31,667   | 8,333   | 74%       |
| CSV export feature PRD    | 45,000   | 8,000   | 82%       |
| Monthly cost (healthcare) | $847/mo  | $220/mo | 74%       |
| Workflow completion speed | baseline | +40-60% | -         |

### 6.8 Agent-as-Code Deployment

Agents defined as markdown or `.agent.yaml` files deploy across:
- IDE installations (Claude Code, Cursor, Windsurf)
- ChatGPT Custom GPTs (upload web bundle)
- Gemini Gems (paste instructions; free with Gmail)
- Claude Projects (upload bundle)

Web bundle compilation: `bmad bundle --agent pm --output pm-agent-bundle.txt`

### 6.9 Relevance to Vantage

BMAD's key contribution is **preventing conflicts through sequential structure** rather than detecting/resolving them after the fact. Lessons for Vantage:

- Step-file architecture prevents context bloat -- Vantage should chunk work similarly
- Menu-driven continuation gives humans natural checkpoints
- The planning-heavy approach (80% planning, 20% execution) dramatically improves agent output quality
- Agent personas with persistent memory (sidecar files) enable institutional knowledge
- Document sharding with selective loading is essential for large projects

---

## 7. Vibe Kanban and Claw-Kanban

### 7.1 Vibe Kanban

**Source**: https://github.com/BloopAI/vibe-kanban
**Website**: https://vibekanban.com
**Stack**: Rust backend (50.1%) + TypeScript/React frontend (46.2%) + PostgreSQL

```
Vibe Kanban Architecture:

    +-----------------------------------+
    |        KANBAN BOARD UI            |
    |  (React, TypeScript)             |
    |  +------+------+------+------+   |
    |  | TODO | IN   | RE-  | DONE |   |
    |  |      | PROG | VIEW |      |   |
    |  +------+------+------+------+   |
    +-----------+----------+-----------+
                |          |
    +-----------v---+  +---v-----------+
    | WORKSPACE     |  | DIFF REVIEW   |
    | (per agent)   |  | Inline comment|
    | - git worktree|  | -> feedback   |
    | - terminal    |  |    to agent   |
    | - dev server  |  +---------------+
    | - browser     |
    +---------------+
```

**Key features**:
- Kanban issues for planning with description and priority
- Per-agent workspaces with isolated git worktrees
- 10+ agent support: Claude Code, Codex, Gemini CLI, GitHub Copilot, Amp, Cursor, OpenCode, Droid, CCR, Qwen Code
- Inline diff review with comments sent directly to agent
- Built-in browser preview with devtools, inspect mode, device emulation
- PR generation with AI-generated descriptions
- Worktree cleanup management (`DISABLE_WORKTREE_CLEANUP` flag)

**Task flow**:
1. **Planning**: Create kanban issues with descriptions
2. **Initialization**: Select coding agent, create workspace
3. **Execution**: Agent gets isolated branch + terminal + dev server
4. **Review**: Developer reviews diff with inline comments
5. **Iteration**: Feedback sent back to agent without context loss
6. **Merge**: PR creation and GitHub integration

**Multi-agent experiment model**: "Review multiple attempts by different agents side by side, treating code generation as an experiment where you sample solutions from different models until hitting a good result."

### 7.2 Claw-Kanban

**Source**: https://github.com/GreenSheep01201/Claw-Kanban
**Stack**: Node.js 22+ backend, React 19 + Vite frontend, SQLite database

```
Claw-Kanban Board (6 columns):

    +-------+--------+----------+----------+------+---------+
    | INBOX | PLANNED| IN PROG  | REVIEW/  | DONE | STOPPED |
    |       |        |          | TEST     |      |         |
    +-------+--------+----------+----------+------+---------+
                         |
                    +----v----+
                    |  AGENT  |
                    | ROUTER  |
                    +----+----+
                         |
         +-------+-------+-------+
         |       |       |       |
    +----v+  +---v--+ +--v---+ +-v------+
    |Claude|  |Codex | |Gemini| |OpenCode|
    |Code  |  |CLI   | |CLI   | |        |
    +------+  +------+ +------+ +--------+
```

**Dual execution model**:

| Model       | Agents                           | How It Works                    |
|:----------- |:-------------------------------- |:------------------------------- |
| CLI Agents  | Claude Code, Codex, Gemini, OpenCode | Spawn local processes, inherit environment |
| HTTP Agents | GitHub Copilot, Google Antigravity   | Direct API calls, OAuth tokens |

**Role-based auto-assignment**:
- Uses `AGENTS.md` file with routing rules
- Maps task roles (DevOps, Backend, Frontend) to specific agents
- Maps task types (New Feature, Modify, Bugfix) to specific agents
- Multi-language orchestration (auto-detects user language)

**Task lifecycle**:
1. Card created in Inbox (UI, `/api/cards`, or webhook `/api/inbox`)
2. "Start" triggers agent launch
3. Card moves to In Progress with real-time terminal logs
4. Agent completes (exit 0) -> auto-advances to Review/Test
5. Claude auto-review triggered
6. Review passes -> Done + wake notification; fails -> stays in Review

**Integration points**:
- Webhook support (`/api/inbox`): Telegram, Slack, custom sources
- Chat-to-Card: `# task description` via Telegram/Slack creates cards
- OpenClaw Gateway: Wake notifications on status changes
- Security: AES-256-GCM encryption for OAuth tokens at rest

### 7.3 Comparison

| Feature               | Vibe Kanban          | Claw-Kanban           |
|:--------------------- |:-------------------- |:--------------------- |
| Backend language      | Rust                 | Node.js               |
| Database              | PostgreSQL           | SQLite                |
| Board columns         | 4 (customizable)     | 6 (fixed)             |
| Agent count           | 10+                  | 6                     |
| Execution model       | Workspace-based      | CLI + HTTP dual       |
| Review approach       | Inline diff comments | Claude auto-review    |
| Browser preview       | Built-in with devtools| None                 |
| Webhook integration   | No                   | Yes (Telegram, Slack) |
| Role-based routing    | No                   | Yes (AGENTS.md)       |
| Git isolation         | Worktrees            | Not specified         |

### 7.4 Relevance to Vantage

Both tools validate the kanban metaphor for agent management. Key lessons:

- **Visual task management is essential**: Developers need to see all agents and their status at a glance
- **Inline diff review** (Vibe Kanban) is more effective than separate review workflows
- **Role-based routing** (Claw-Kanban) automates the "which agent for which task" decision
- **Webhook integration** enables mobile/chat-based task creation
- **Auto-review agents** (Claw-Kanban's Claude review step) provide built-in quality gates
- Vantage should combine: inline diff review + role-based routing + webhook integration + browser preview

---

## 8. Academic Research

### 8.1 "Towards a Science of Scaling Agent Systems" (Google/MIT, December 2025)

**Paper**: https://arxiv.org/abs/2512.08296
**Key finding**: More agents is NOT reliably better.

#### The 45% Accuracy Threshold

Once single-agent baseline exceeds 45% accuracy, adding more agents typically yields diminishing or negative returns (beta = -0.408, p < 0.001).

#### Task-Dependent Performance

| Domain           | Best MAS Improvement | Best Architecture | Notes                       |
|:---------------- |:-------------------- |:----------------- |:--------------------------- |
| Finance Agent    | +80.9%               | Centralized       | Highly parallelizable       |
| BrowseComp-Plus  | +9.2%                | Decentralized     | High-entropy search         |
| Workbench        | -1.2% to +5.7%      | Marginal          | Mixed task types            |
| PlanCraft        | -39% to -70%         | All degrade       | Sequential, constraint-based |

#### Architecture Comparison

| Architecture   | Error Amplification | Overhead | Best Use Case                    |
|:-------------- |:------------------- |:-------- |:-------------------------------- |
| Single-Agent   | 1.0x (baseline)     | 0%       | Sequential reasoning; high baseline |
| Centralized    | 4.4x                | 285%     | Structured domains with verification |
| Decentralized  | 7.8x                | 263%     | Parallel exploration tasks       |
| Hybrid         | 5.1x                | 515%     | Generally underperforms          |
| Independent    | 17.2x               | 58%      | Catastrophic failure mode        |

#### Coordination Overhead Scaling

Reasoning turns follow power law: `T = 2.72 x (n + 0.5)^1.724` (super-linear growth).

Under fixed token budgets:
- Single agent: 7.2 turns
- Centralized: 27.7 turns (3.8x increase)
- Decentralized: 26.1 turns (3.6x increase)
- Hybrid: 44.3 turns (6.2x increase)

Message density saturates logarithmically: `S = 0.73 + 0.28 * ln(c)` with diminishing returns beyond 0.39 messages per turn.

#### Predictive Framework

Mixed-effects model achieving R^2 = 0.513 cross-validated:

**Decision boundaries**:
1. Stay single-agent if: P_SA > 0.45 OR task requires strict sequential reasoning
2. Choose centralized if: Task decomposable; tool count 5-8; baseline 0.25-0.40
3. Choose decentralized if: High-entropy search; tool count >12; baseline <0.35
4. Avoid independent MAS: 17.2x error amplification without verification

**Critical threshold**: Coordination overhead exceeding ~150% on tool-heavy tasks (16+ tools) produces net negative returns.

### 8.2 "Resilience of LLM-Based Multi-Agent Collaboration with Faulty Agents" (2024)

**Paper**: https://arxiv.org/abs/2408.00989

#### Topology Resilience Rankings

| Structure     | Performance Drop | Mechanism                                  |
|:------------- |:---------------- |:------------------------------------------ |
| Hierarchical  | 5.5%             | Higher-level agents filter multiple versions |
| Flat          | 10.54%           | No filtering layer; errors propagate        |
| Linear        | 23.72%           | Single chain; no redundancy                 |

Star-graph configurations (one leader + three workers) preserved 30-36% accuracy vs. 16-20% for complete graphs on math tasks.

#### Task Vulnerability

| Task Type        | Performance Drop | Explanation                         |
|:---------------- |:---------------- |:----------------------------------- |
| Code Generation  | 22.56%           | Formal/rigorous; highest vulnerability |
| Math             | 9.89%            | Objective with verifiable answers   |
| Text Evaluation  | 5.42%            | Semi-subjective standards           |
| Translation      | 4.70%            | Most resilient; looser correctness  |

#### Error Propagation Insights

- **Frequency > severity**: Increasing ratio of faulty messages (Pm) caused larger drops than increasing errors per message (Pe)
- **Semantic > syntactic**: LLMs catch syntactic errors easily but semantic errors "resemble correct code"
- **High-level agent failures cascade**: Corrupting Planner reduced accuracy from 28% to 12%; corrupting Solver only dropped to 20%

#### Counterintuitive Finding: Beneficial Errors

Under specific conditions, deliberately injected errors improved performance up to 12.1%:
- Obvious errors prompt correction cycles that also fix pre-existing bugs
- Error-introduced diversity helps systems using identical backbone LLMs

#### Defense Mechanisms

Two strategies recovering up to 96.4% of performance loss:
- **Challenger**: Verification prompts in agent profiles; agents question others' outputs
- **Inspector**: Dedicated agent intercepting and correcting inter-agent messages
- Combined deployment recovered maximum performance

### 8.3 Practical Recommendations from Research

```
Decision Tree for Agent Configuration:

    Is the task decomposable into independent subtasks?
    |
    +-- NO --> Use single agent (sequential reasoning)
    |
    +-- YES --> What is the single-agent baseline accuracy?
                |
                +-- > 45% --> Single agent likely better
                |              (diminishing returns zone)
                |
                +-- 25-45% --> How many tools required?
                |              |
                |              +-- 5-8 tools: Centralized architecture
                |              +-- 12+ tools: Decentralized architecture
                |              +-- 16+ tools: Beware overhead > 150%
                |
                +-- < 25% --> Multi-agent with verification
                              (centralized coordinator recommended)
```

### 8.4 Communication Overhead Formula

For N agents with full connectivity: `O(N^2)` message overhead.
With sparse networks (hub-and-spoke): `O(N)` message overhead.
Optimal: Progressive memory compression achieves `O(log t)` memory growth.

**Practical ceiling**: 3-4 parallel agents when a single reviewer integrates results.

---

## 9. The Verification Bottleneck Problem

### 9.1 The Core Problem

AI code generation has created an asymmetry: code is generated 10x faster, but verification cannot keep pace.

**Key statistics** (2025-2026 surveys):
- 96% of developers don't fully trust AI-generated code accuracy
- Trust actively dropped from 43% (2024) to 33% (2025)
- Teams using AI experience 91% increase in code review time
- PRs increase 98% in volume with 154% larger sizes
- Bug rates rise 9% per developer
- Teams generating 30% AI code see only 10% velocity gains

**Amdahl's Law constraint**: Coding represents only 20-30% of development work. Even with infinite speedup on coding, theoretical maximum improvement is 1.22x overall.

### 9.2 The Pipeline Problem

```
The Verification Funnel:

    GENERATION (fast, cheap)
    ========================
    |  Agent 1 produces code  |
    |  Agent 2 produces code  |
    |  Agent 3 produces code  |
    ========================
            |
            v
    AUTOMATED VERIFICATION
    ========================
    |  Static analysis        |  <- Catches ~20% of real issues
    |  Linting + formatting   |  <- Style only
    |  Unit tests             |  <- Catches regressions
    |  Integration tests      |  <- Catches interface issues
    |  Security scanning      |  <- Known vulnerability patterns
    ========================
            |
            v
    AI-ASSISTED REVIEW        <- NEW LAYER
    ========================
    |  AI code review         |  <- Catches 42-48% of runtime bugs
    |  AI bug detection       |  <- Better than traditional static
    |  Spec compliance check  |  <- Matches against requirements
    ========================
            |
            v
    HUMAN REVIEW (slow, expensive)  <- THE BOTTLENECK
    ========================
    |  Semantic correctness   |  <- Only humans can verify intent
    |  Architecture alignment |  <- System-level understanding
    |  Edge cases / UX        |  <- Domain knowledge required
    ========================
```

### 9.3 Emerging Solutions

#### Multi-Agent QA Pipeline (OpenObserve's "Council of Sub Agents")

Six specialized agents forming an autonomous testing pipeline:

| Phase | Agent      | Role                                          |
|:----- |:---------- |:---------------------------------------------- |
| 1     | Analyst    | Analyze source, extract selectors, map workflows |
| 2     | Architect  | Create prioritized test plans (P0/P1/P2)      |
| 3     | Engineer   | Write Playwright tests using Page Object Model |
| 4     | Sentinel   | Quality gate -- blocks pipeline for critical issues |
| 5     | Healer     | Run tests, diagnose failures, fix (up to 5 iterations) |
| 6     | Scribe     | Document everything in test management system |

**Results**:
- Feature analysis: 45-60 min -> 5-10 min (6-10x faster)
- Flaky tests: 30-35 -> 4-5 (85% reduction)
- Test coverage: 380 -> 700+ tests (84% growth)
- Time to first passing test: ~1 hour -> 5 minutes

**Critical lesson**: "Specialization over generalization. Early unified 'super agent' approaches failed."

#### Automated Code Review Tools (2026 State)

Leading tools detect 42-48% of real-world runtime bugs:
- **CodeRabbit**: Agentic code review with one-click fix generation
- **Qodo**: 15+ agentic workflows for AI code verification
- **SonarQube**: AI Code Assurance features in CI/CD
- **Pixee/Cursor BugBot**: Generate and apply patches automatically

#### Quality Gate Automation

```
Pre-Merge Quality Pipeline:

    Agent PR
      |
      v
    [Lint + Format] --> FAIL --> Block + Feedback
      |
      PASS
      v
    [Unit Tests] --> FAIL --> Block + Feedback
      |
      PASS
      v
    [Integration Tests] --> FAIL --> Block + Feedback
      |
      PASS
      v
    [AI Code Review] --> ISSUES --> Block + Feedback
      |
      PASS
      v
    [Security Scan] --> VULN --> Block + Feedback
      |
      PASS
      v
    [Human Review] (only reaches here if all automated gates pass)
```

### 9.4 The "Vibe, Then Verify" Approach

Emerging developer workflow:
1. Accept AI suggestions intuitively ("vibing")
2. Systematically validate through automation
3. Human review only for semantic/architectural concerns

### 9.5 The Compound Engineering Model

80% planning + review, 20% execution:
- Better specs produce better agent output
- Review time is investment, not waste
- Verification expertise now outweighs raw coding speed

### 9.6 Relevance to Vantage

Vantage must treat verification as a first-class concern, not an afterthought:

1. **Built-in quality gates**: Run tests/lint/security on every agent commit automatically
2. **AI review integration**: Run AI code review before surfacing PRs to humans
3. **Diff review UI**: Inline commenting with feedback-to-agent loop (like Vibe Kanban)
4. **Verification dashboard**: Show pass/fail status for every quality gate per agent branch
5. **Cost tracking**: Show token spend per agent to help users optimize
6. **Semantic conflict detection**: Beyond textual merge conflicts, check for logical contradictions
7. **The Sentinel pattern**: A dedicated verification agent that blocks merges on critical issues

---

## 10. Synthesis: Lessons for Vantage

### 10.1 Architecture Decision: What Vantage Should Build

Based on all research, Vantage's multi-agent layer should:

```
Vantage Multi-Agent Architecture:

    +--------------------------------------------------+
    |                 VANTAGE IDE                       |
    |                                                  |
    |  +--------------------------------------------+  |
    |  |          ORCHESTRATION DASHBOARD           |  |
    |  |  +--------+  +--------+  +--------+       |  |
    |  |  | Kanban |  |Conflict|  | Token  |       |  |
    |  |  | Board  |  | Matrix |  | Costs  |       |  |
    |  |  +--------+  +--------+  +--------+       |  |
    |  |  +--------+  +--------+  +--------+       |  |
    |  |  | Agent  |  | Quality|  | Merge  |       |  |
    |  |  | Status |  | Gates  |  | Queue  |       |  |
    |  |  +--------+  +--------+  +--------+       |  |
    |  +--------------------------------------------+  |
    |                                                  |
    |  +--------------------------------------------+  |
    |  |        AGENT MANAGEMENT LAYER              |  |
    |  |                                            |  |
    |  |  Wraps Claude Code Agent Teams protocol:   |  |
    |  |  - Watches ~/.claude/teams/ filesystem     |  |
    |  |  - Visualizes task JSON as kanban cards    |  |
    |  |  - Shows mailbox messages as chat          |  |
    |  |  - Manages worktrees per agent             |  |
    |  |  - Integrates Clash for conflict detection |  |
    |  +--------------------------------------------+  |
    |                                                  |
    |  +--------------------------------------------+  |
    |  |        VERIFICATION PIPELINE               |  |
    |  |                                            |  |
    |  |  Per-agent branch:                         |  |
    |  |  [Lint] -> [Test] -> [AI Review] ->        |  |
    |  |  [Conflict Check] -> [Human Review]        |  |
    |  +--------------------------------------------+  |
    |                                                  |
    |  +--------------------------------------------+  |
    |  |        MERGE ORCHESTRATOR                  |  |
    |  |                                            |  |
    |  |  Sequential merge with rebase:             |  |
    |  |  branch-1 -> main -> rebase remaining ->   |  |
    |  |  branch-2 -> main -> rebase remaining ->   |  |
    |  |  ... -> done                               |  |
    |  +--------------------------------------------+  |
    +--------------------------------------------------+
```

### 10.2 Core Design Principles

1. **File-based coordination is the right foundation**: Claude Code Agent Teams' filesystem approach is simple, debuggable, and works. Vantage should build a reactive GUI layer on top of it, not replace it.

2. **3-5 agents is the practical ceiling**: Research consistently shows diminishing returns beyond this. Vantage should support more but default to and optimize for 3-5.

3. **Hierarchical > flat**: Research shows 5.5% degradation (hierarchical) vs 10.5% (flat) vs 23.7% (linear). Vantage should default to coordinator/specialist/verifier topology.

4. **Verification is the bottleneck, not generation**: Vantage must make verification as easy as possible -- built-in quality gates, AI review, inline diff feedback.

5. **Sequential merges prevent semantic conflicts**: Vantage should automate the rebase-merge workflow rather than attempting parallel merges.

6. **Planning > execution**: Following BMAD and the Compound Engineering model, Vantage should invest heavily in plan/spec tooling. 80% planning, 20% execution.

7. **Conflict detection must be real-time**: Integrate Clash or equivalent to show conflicts as they develop, not at merge time.

8. **Cost visibility is essential**: At ~7x token cost for agent teams, users need real-time spend tracking and budget controls.

### 10.3 Feature Priority Matrix

| Feature                        | Priority | Source Inspiration           |
|:------------------------------ |:-------- |:---------------------------- |
| Visual task board (kanban)     | P0       | Vibe Kanban, Claw-Kanban     |
| Agent Teams filesystem watcher | P0       | Claude Code Agent Teams      |
| Per-agent terminal view        | P0       | Claude Squad                 |
| Git worktree management        | P0       | All tools agree              |
| Conflict detection matrix      | P0       | Clash                        |
| Inline diff review             | P1       | Vibe Kanban                  |
| Quality gate dashboard         | P1       | Augment Code Pattern 5       |
| Sequential merge assistant     | P1       | Augment Code Pattern 6       |
| Role-based agent templates     | P1       | BMAD, Claw-Kanban            |
| Token cost tracking            | P1       | Gas Town lessons             |
| Plan approval workflow         | P1       | Claude Code Agent Teams      |
| AI code review integration     | P2       | OpenObserve Council          |
| Webhook/chat task creation     | P2       | Claw-Kanban                  |
| Model routing per task type    | P2       | Augment Code Pattern 4       |
| BMAD-style spec editor         | P2       | BMAD v6                      |
| Agent memory/sidecar files     | P3       | BMAD Expert Agents, Gas Town |
| Budget controls/limits         | P3       | Gas Town cost lessons        |

### 10.4 Anti-Patterns to Avoid

1. **Unlimited parallelism**: Don't let users spawn 20 agents without warning. Research shows this amplifies errors 17.2x.
2. **Same-file editing**: Never let two agents edit the same file. This is the single most common failure mode.
3. **Skipping verification**: Every agent branch must pass automated checks before merge.
4. **Flat coordination**: Don't default to all-to-all communication. Use hierarchical topology.
5. **Monolithic context**: Follow BMAD's step-file approach -- give agents only the context they need.
6. **Ignoring semantic conflicts**: Textual merge success does not mean logical correctness.
7. **Running without plans**: Always encourage/require plan approval before expensive multi-agent execution.

### 10.5 The Agent Team Lifecycle in Vantage

```
Recommended Lifecycle:

    1. PLAN
       User writes spec or uses AI to draft one
       Spec reviewed and approved by human
       |
    2. DECOMPOSE
       AI decomposes spec into bounded tasks
       Human reviews task breakdown
       Tasks shown on kanban board
       |
    3. ASSIGN
       Role-based routing assigns agents to tasks
       OR manual assignment via drag-and-drop
       Each agent gets: worktree + terminal + task description
       |
    4. EXECUTE (parallel)
       Agents work independently
       Real-time: terminal output, diff preview, conflict matrix
       Quality hooks: lint/test on every save
       Clash checks: continuous conflict detection
       |
    5. REVIEW
       Per-agent: automated quality gates must pass
       Per-agent: AI code review runs
       Human reviews diffs with inline comments
       Comments sent as feedback to agent (Vibe Kanban pattern)
       |
    6. MERGE (sequential)
       Merge order determined by dependency graph
       Each merge: rebase onto main -> merge -> verify
       Remaining branches auto-rebase onto new main
       |
    7. VERIFY
       Integration tests on merged main
       Semantic verification by dedicated reviewer agent
       Human sign-off
       |
    8. RETROSPECTIVE
       Token cost summary
       Time-per-task analysis
       Conflict frequency report
       Lessons captured for future sessions
```

### 10.6 Key Metrics Vantage Should Track

| Metric                          | Why It Matters                           |
|:------------------------------- |:---------------------------------------- |
| Tokens per task                 | Cost efficiency                          |
| Time to first passing test      | Agent effectiveness                      |
| Conflict frequency per branch pair | Early indicator of poor task decomposition |
| Quality gate pass rate          | Agent output quality                     |
| Human review time per PR        | Verification bottleneck measurement      |
| Agent idle time                 | Underutilization or blocking             |
| Merge conflict rate             | Decomposition quality indicator          |
| Rework rate (tasks reopened)    | Specification quality indicator          |

### 10.7 Open Questions for Vantage

1. **Should Vantage wrap Claude Code Agent Teams directly or build its own coordination layer?**
   - Pros of wrapping: Compatible with CLI users, less maintenance, Anthropic improves it
   - Pros of own layer: More control, richer protocol, not limited by experimental feature

2. **How to handle the Windows limitation?**
   - Agent Teams split-pane mode doesn't work on Windows Terminal
   - Claude Squad requires tmux (Unix-oriented)
   - Vantage could provide native Windows terminal management via its Electron shell

3. **Should the merge orchestrator be automated or human-guided?**
   - Gas Town automates merges (but has stability issues)
   - BMAD requires human approval at every step
   - Recommended: Human-guided with automation assistance (show the plan, human clicks "merge")

4. **How to integrate with existing CI/CD?**
   - Pre-merge verification could run the project's existing CI pipeline
   - Or Vantage could provide its own lightweight verification
   - Recommended: Both, with project CI as the authoritative source

---

## Appendix A: Tool Comparison Matrix

| Feature                 | Agent Teams | Gas Town | Claude Squad | Vibe Kanban | Claw-Kanban | Clash |
|:----------------------- |:----------- |:-------- |:------------ |:----------- |:----------- |:----- |
| Multi-agent orchestration | Yes       | Yes      | Yes          | Yes         | Yes         | No    |
| Git worktree isolation  | No (file-based) | Yes | Yes          | Yes         | No          | N/A   |
| Conflict detection      | No          | Refinery | No           | No          | No          | Yes   |
| Visual kanban board     | No          | TUI      | TUI          | Web         | Web         | TUI   |
| Peer-to-peer messaging  | Yes         | Mailbox  | No           | No          | No          | No    |
| Task dependencies       | Yes         | Convoys  | No           | No          | No          | No    |
| Quality gates           | Hooks       | Refinery | No           | Diff review | Auto-review | No    |
| Model routing           | Yes         | No       | Profiles     | Yes         | AGENTS.md   | No    |
| Cost tracking           | No          | Implicit | No           | No          | No          | No    |
| Session persistence     | Files       | Git      | Git branches | Postgres    | SQLite      | N/A   |
| Max tested agents       | 5-6         | 20-30    | ~10          | 10+         | 6           | N/A   |
| Platform                | Cross       | Unix     | Unix         | Cross       | Cross       | Cross |

## Appendix B: Key Sources

### Official Documentation
- Claude Code Agent Teams: https://code.claude.com/docs/en/agent-teams
- BMAD Method: https://docs.bmad-method.org
- Clash: https://clash.sh

### Repositories
- Gas Town: https://github.com/steveyegge/gastown
- Clash: https://github.com/clash-sh/clash
- Claude Squad: https://github.com/smtg-ai/claude-squad
- Vibe Kanban: https://github.com/BloopAI/vibe-kanban
- Claw-Kanban: https://github.com/GreenSheep01201/Claw-Kanban
- BMAD METHOD: https://github.com/bmad-code-org/BMAD-METHOD

### Key Articles
- Addy Osmani, "Claude Code Swarms": https://addyosmani.com/blog/claude-code-agent-teams/
- Addy Osmani, "The Code Agent Orchestra": https://addyosmani.com/blog/code-agent-orchestra/
- Steve Yegge, "Welcome to Gas Town": https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04
- Augment Code, "How to Run a Multi-Agent Coding Workspace": https://www.augmentcode.com/guides/how-to-run-a-multi-agent-coding-workspace
- Reverse-Engineering Agent Teams: https://nwyin.com/blogs/claude-code-agent-teams-reverse-engineered
- Alexander Opalic, "From Tasks to Swarms": https://alexop.dev/posts/from-tasks-to-swarms-agent-teams-in-claude-code/
- Two Kinds of Multi-Agent: https://paddo.dev/blog/gastown-two-kinds-of-multi-agent/
- OpenObserve QA Automation: https://openobserve.ai/blog/autonomous-qa-testing-ai-agents-claude-code/
- BMAD v6 Token Savings: https://medium.com/@hieutrantrung.it/from-token-hell-to-90-savings-how-bmad-v6-revolutionized-ai-assisted-development-09c175013085

### Academic Papers
- "Towards a Science of Scaling Agent Systems" (Google/MIT, 2025): https://arxiv.org/abs/2512.08296
- "On the Resilience of LLM-Based Multi-Agent Collaboration with Faulty Agents" (2024): https://arxiv.org/abs/2408.00989
- "The Verification Bottleneck" (byteiota, 2026): https://byteiota.com/ai-code-verification-bottleneck-96-dont-trust-ai-code/

---

*End of research document. Total coverage: 9 major topics with architecture diagrams, protocol descriptions, token economics, academic research, and practical recommendations for Vantage IDE.*
