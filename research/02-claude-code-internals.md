# Claude Code Internals: Deep Research for Vantage

**Date**: 2026-04-03
**Purpose**: Exhaustive technical reference for building Vantage, a desktop IDE wrapper around Claude Code CLI.

---

## Table of Contents

1. [Source Code Leak Overview](#1-source-code-leak-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Runtime & Build System](#3-runtime--build-system)
4. [Core Modules & File Structure](#4-core-modules--file-structure)
5. [QueryEngine & The Agentic Loop](#5-queryengine--the-agentic-loop)
6. [Tool System](#6-tool-system)
7. [Permission System](#7-permission-system)
8. [Session Management & JSONL Format](#8-session-management--jsonl-format)
9. [Memory Architecture](#9-memory-architecture)
10. [Context Management & Compaction](#10-context-management--compaction)
11. [Agent Orchestration & Subagents](#11-agent-orchestration--subagents)
12. [Agent Teams](#12-agent-teams)
13. [MCP Server Integration](#13-mcp-server-integration)
14. [Hook System](#14-hook-system)
15. [Skill & Plugin Systems](#15-skill--plugin-systems)
16. [Terminal UI (Ink/React)](#16-terminal-ui-inkreact)
17. [The Agent SDK & Programmatic Interface](#17-the-agent-sdk--programmatic-interface)
18. [The stream-json Protocol](#18-the-stream-json-protocol)
19. [The --sdk-url WebSocket Protocol](#19-the---sdk-url-websocket-protocol)
20. [Claude Code Desktop App](#20-claude-code-desktop-app)
21. [The Bridge System (Remote Sessions)](#21-the-bridge-system-remote-sessions)
22. [CLI Flags Reference](#22-cli-flags-reference)
23. [Environment Variables](#23-environment-variables)
24. [How Existing Tools Integrate](#24-how-existing-tools-integrate)
25. [Hidden Features & Internal Codenames](#25-hidden-features--internal-codenames)
26. [Community Reverse Engineering](#26-community-reverse-engineering)
27. [Key Implications for Vantage](#27-key-implications-for-vantage)

---

## 1. Source Code Leak Overview

On March 31, 2026, Anthropic accidentally exposed the full source code of Claude Code through a 59.8 MB JavaScript source map (.map) file bundled in the public npm package `@anthropic-ai/claude-code` version 2.1.88.

**What was exposed:**
- ~513,000 lines of unobfuscated TypeScript across 1,906 files
- ~398,000 lines of code, ~82,000 comments, ~33,000 blank lines
- The complete client-side agent harness (NOT model weights, training data, or API infrastructure)

**What was NOT exposed:**
- Model weights or training data
- API endpoints / infrastructure
- Customer API keys
- Server-side logic

The source was discovered by security researcher Chaofan Shou (@Fried_rice) and was hosted on Anthropic's own Cloudflare R2 bucket (referenced by the source map). Within hours it was mirrored to hundreds of GitHub repositories. Anthropic issued DMCA takedowns but the code remains widely available.

**Key mirrors (use at your own legal risk):**
- `github.com/nirholas/claude-code`
- `github.com/xorespesp/claude-code`
- `github.com/DonutShinobu/claude-code-fork`
- `github.com/Ahmad-progr/claude-leaked-files`

**WARNING**: Many repositories hosting "leaked code" have been trojanized with malware. Only use trusted sources.

**Sources:**
- [Cybernews: Leaked Claude Code source spawns fastest growing repository](https://cybernews.com/tech/claude-code-leak-spawns-fastest-github-repo/)
- [The Register: Fake Claude Code downloads delivered malware](https://www.theregister.com/2026/04/02/trojanized_claude_code_leak_github/)
- [Engineer's Codex: Diving into Claude Code's Source Code Leak](https://read.engineerscodex.com/p/diving-into-claude-codes-source-code)

---

## 2. Architecture Overview

Claude Code is a **five-layer architecture**:

```
Layer 1: Entry Points (src/entrypoints/)
  - CLI, MCP server, Agent SDK, Bridge, Daemon
  - All converge through memoized init.ts

Layer 2: State Management (src/state/)
  - Zustand-like store with selector-based subscriptions
  - Bootstrap singleton (1,758 lines) tracking session metadata, API costs, agent state

Layer 3: Query Engine (src/query/)
  - The agentic loop: context building -> API calls -> tool dispatch
  - 46,000 lines in QueryEngine.ts

Layer 4: Tool & Permission System (src/tools/, src/utils/permissions/)
  - 40+ permission-gated tools
  - Every action the model attempts is gated

Layer 5: Agent Orchestration (src/coordinator/, src/tasks/)
  - Multi-agent workflows
  - Leader-Worker pattern
```

The fundamental design is an **async generator loop** where:
1. User input enters `QueryEngine.submitMessage()`
2. The query generator calls the Anthropic API
3. Stream events yield text/thinking/tool_use blocks
4. Tool calls trigger `runTools()` orchestration
5. Results are appended to `messages[]`
6. Loop continues until `stop_reason = "end_turn"` or max turns reached

---

## 3. Runtime & Build System

- **Runtime**: Bun (NOT Node.js) -- chosen for build performance and startup speed
- **Bundler**: Bun's built-in bundler with source map generation (this is what caused the leak)
- **Language**: TypeScript compiled to production JavaScript
- **UI Framework**: React + Ink (terminal UI framework for React)
- **Layout Engine**: Yoga WASM (Meta's flexbox implementation)
- **Distribution**: npm package `@anthropic-ai/claude-code`
- **Build-time features**: Compile-time dead code elimination via feature gates (`bun:bundle`)

Feature gates control code path inclusion per build:
- `COORDINATOR_MODE`
- `BASH_CLASSIFIER`
- `DAEMON`
- `KAIROS` (compiled to `false` in public builds)
- `PROACTIVE`
- And 44+ more hidden feature flags

**API Attestation**: A Zig layer within the Bun runtime provides cryptographic proof of genuine binary origin. Placeholder values (`cch=ed1b0`) are overwritten with computed hashes at build time, preventing third-party API spoofing below the JavaScript layer.

---

## 4. Core Modules & File Structure

```
src/
├── entrypoints/           # Five execution modes
├── state/
│   └── AppStateStore.ts   # Zustand-like store
│   └── AppState.tsx       # React context
├── bootstrap/
│   └── state.ts           # 1,758-line bootstrap singleton
├── QueryEngine.ts         # 46,000 lines - THE core
├── query.ts
├── Tool.ts                # ~29,000 lines
├── tools.ts               # Tool registry
├── commands.ts            # Command registry
├── context.ts             # System/user context collection
├── main.tsx               # 785KB entry point
│
├── tools/                 # ~40 tool implementations
│   ├── AgentTool/
│   ├── BashTool/
│   ├── FileEditTool/
│   ├── FileReadTool/
│   ├── FileWriteTool/
│   ├── GlobTool/
│   ├── GrepTool/
│   └── ...
│
├── services/
│   ├── api/claude.ts
│   ├── mcp/client.ts, types.ts, auth.ts
│   ├── compact/compact.ts, autoCompact.ts, microCompact.ts, sessionMemoryCompact.ts
│   ├── tools/toolOrchestration.ts
│   ├── analytics/
│   ├── oauth/
│   ├── plugins/pluginLoader.ts
│   ├── tokenEstimation.ts
│   └── vcr.ts
│
├── utils/
│   ├── permissions/PermissionMode.ts, permissions.ts, autoModeState.ts
│   ├── bash/bashParser.ts, ast.ts
│   ├── claudemd.ts        # 46KB - CLAUDE.md loading
│   ├── hooks/postSamplingHooks.ts, sessionHooks.ts, hookHelpers.ts
│   ├── mailbox.ts
│   ├── fileStateCache.ts
│   ├── settings/
│   └── stream.ts
│
├── skills/
│   ├── loadSkillsDir.ts
│   ├── bundledSkills.ts
│   └── mcpSkillBuilders.ts
│
├── plugins/
│   └── builtinPlugins.ts
│
├── coordinator/
│   └── coordinatorMode.ts
│
├── tasks/
│   ├── LocalAgentTask/
│   ├── InProcessTeammateTask/
│   ├── DreamTask/
│   └── ...
│
├── bridge/
│   ├── replBridge.ts      # 2,406 lines
│   ├── bridgeMain.ts      # 2,999 lines
│   └── remoteBridgeCore.ts # 39KB
│
├── buddy/
│   └── companion.ts
│
├── ink/
│   ├── ink.tsx
│   └── reconciler.ts      # Custom React reconciler
│
├── screens/
│   └── REPL.tsx           # 896KB - largest file
│
├── components/
│   ├── Messages.tsx
│   ├── VirtualMessageList.tsx  # 149KB
│   ├── PromptInput/PromptInput.tsx  # 355KB
│   ├── Markdown.tsx
│   └── App.tsx            # 98KB
│
├── vim/                   # Full vim mode implementation
│
├── constants/
│   └── prompts.ts         # 54KB - system prompt construction
│
├── memdir/
│   └── memdir.ts          # Memory directory management
│
├── migrations/            # 11 migration scripts
│
└── undercover.ts          # 90 lines - codename suppression
```

**Codebase metrics:**
- 513,237 total lines (398K code, 82K comments, 33K blank)
- 1,902 TypeScript/TSX files
- 40 tools across 9 categories
- 101 commands
- 20 service modules
- 8 task execution types
- ~140 Ink UI components

---

## 5. QueryEngine & The Agentic Loop

`QueryEngine.ts` (~46,000 lines) is the central orchestrator. One instance exists per conversation session.

### Configuration

```typescript
interface QueryEngineConfig {
  maxTurns: number           // Limit tool iterations per submitMessage()
  maxBudgetUsd: number       // Hard cap on session cost
  taskBudget: number         // Budget for individual tasks
  fallbackModel: string      // Fallback model on overload
  thinkingConfig: {
    type?: 'enabled' | 'disabled' | 'adaptive'
    budget_tokens?: number
  }
  snipReplay: boolean        // Enable history snipping
  mcpClients: MCPClient[]
  handleElicitation: (req) => Promise<string>
  canUseTool: (name, mode) => Promise<boolean>
}
```

### Master Flow

```
User Input -> QueryEngine.submitMessage()
    |
    v
query() async generator initiates
    |
    v
fetchSystemPromptParts() -- parallel section fetching
    |
    v
queryModelWithStreaming() calls Anthropic API
    |
    v
Stream events: message_start -> content_block_start ->
  content_block_delta (text/thinking/tool_use) -> content_block_stop ->
  message_delta -> message_stop
    |
    v
Tool calls trigger runTools() orchestration
    |
    v
Results appended to messages[]
    |
    v
Loop until stop_reason = "end_turn" or maxTurns reached
```

### API Request Structure

```typescript
{
  model: "claude-opus-4-6-20250415",
  system: [
    { type: "text", text: "You are Claude Code..." },
    { type: "text", text: "# MCP Instructions..." },
    { type: "text", text: "# Environment...",
      cache_control: { type: "ephemeral" } }
  ],
  messages: [
    { role: "user", content: [...] },
    { role: "assistant", content: [...] }
  ],
  tools: [
    { name: "Bash", input_schema: {...} },
    { name: "mcp__server__tool", input_schema: {...} }
  ],
  thinking: { type: "adaptive", budget_tokens: 16000 },
  max_tokens: 16384,
  speed: "fast",
  temperature: 1,
  betas: [
    "context-1m-2025-...",
    "fast-mode-2025-...",
    "prompt-caching-2025-..."
  ],
  metadata: { user_id: JSON({...}) }
}
```

### Token Counting Strategies

| Method | Accuracy | Speed | Use Case |
|--------|----------|-------|----------|
| API token count | Exact | Slow | Pre-compaction decisions |
| chars/4 | ~85% | Instant | Message estimation |
| chars/2 | ~85% JSON | Instant | JSON content |
| Fixed 2000 | N/A | Instant | Images/documents |

### Diminishing Returns Detection

- `DIMINISHING_THRESHOLD` = 500 tokens
- `COMPLETION_THRESHOLD` = 0.9 (90%)
- If 3+ consecutive continuations each produce <500 tokens, system infers model is stuck and stops

### Max-Output-Tokens Recovery

Up to 3 retries when the model hits the output token limit before yielding to the user.

### Cost Tracking

Tracks `input_tokens`, `output_tokens`, and `cache_creation_input_tokens` in real-time. Session costs accumulate in `bootstrap/state.ts`. USD cost calculated based on model pricing.

---

## 6. Tool System

### Tool Interface

```typescript
interface Tool {
  name: string
  description: string
  inputJSONSchema: JSONSchema
  call(input, context): Promise<Result>
  validateInput?(input): ValidationResult
  checkPermissions?(input, context): PermissionResult
  isConcurrencySafe(input): boolean
  isReadOnly?: boolean
  isEnabled?(): boolean
  shouldDefer?: boolean
  alwaysLoad?: boolean
  userFacingName?: string
  maxResultSizeChars?: number
}
```

### Full ToolDef Interface (from source)

```typescript
interface ToolDef {
  // Async description and prompt functions accepting context
  description: string | ((ctx) => Promise<string>)
  prompt: string | ((ctx) => Promise<string>)
  // Input/output schemas (Zod-based validation)
  inputSchema: ZodSchema
  outputSchema?: ZodSchema
  // Core methods
  call(input, context): Promise<Result>
  checkPermissions(input, context): PermissionDecision  // allow, ask, deny, passthrough
  validateInput(input): ValidationResult
  // Metadata
  userFacingName: string
  isConcurrencySafe(input): boolean
  isReadOnly?: boolean
  shouldDefer?: boolean  // Deferred loading flag
  // UI
  renderUI?: ReactComponent
  maxResultSizeChars?: number
}
```

### Core Tools (Always Loaded)

- `BashTool` - Shell command execution
- `FileReadTool` (aka `Read` / `View`) - File reading (default 2000 lines)
- `FileEditTool` (aka `Edit`) - File modification
- `FileWriteTool` (aka `Write`) - File creation/overwrite
- `GlobTool` - Fast file pattern matching
- `GrepTool` - Regex content search
- `AgentTool` - Subagent spawning
- `SkillTool` - Skill execution
- `TaskCreate/Get/Update/List/Output/Stop` - Task management
- `EnterPlanMode` / `ExitPlanMode` - Plan mode control
- `WebFetch` - URL fetching
- `WebSearch` - Web search
- `ToolSearchTool` - Deferred tool schema loading
- `SendMessageTool` - Inter-agent messaging
- `NotebookEdit` / `ReadNotebook` - Jupyter support
- `BatchTool` - Parallel/serial multi-tool invocation
- `LS` - Directory listing

### Feature-Gated Tools (Conditional Loading)

Loaded based on GrowthBook feature flags:
- `KAIROS` tools (push notifications, file delivery, GitHub PR subscriptions)
- `MONITOR_TOOL`
- `COORDINATOR` tools
- `AGENT_TRIGGERS`
- `WORKFLOW` tools
- `WEB_BROWSER` tools
- `HISTORY_SNIP`

### Deferred Tools

Only tool names consume context at session start; full schemas loaded on-demand via `ToolSearchTool`. This saves significant context window space.

### MCP Tools

Discovered at runtime, normalized as `mcp__{server}__{tool}`. Follow same interface as built-in tools.

### Execution Orchestration

From `toolOrchestration.ts`:

1. Tools partitioned into batches by concurrency safety
2. All `isConcurrencySafe` tools execute in parallel (up to 10 concurrent, configurable via `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY`)
3. Non-safe tools execute serially
4. Sibling error handling: if one parallel tool errors, `siblingAbortController.abort()` cancels others

### Tool Execution Lifecycle (8 Steps)

1. Model emits `tool_use` block
2. `validateInput` runs against Zod schema
3. PreToolUse hooks fire (can return `permissionDecision`, modify input via `updatedInput`, inject `additionalContext`)
4. `checkPermissions` evaluates decision incorporating hook results
5. Permission dialog shown if behavior is "ask"
6. Tool's `call` method executes
7. PostToolUse hooks fire (can modify MCP output, perform cleanup)
8. Result mapped to `ToolResultBlockParam`

### BashTool Security Analysis

BashTool performs AST-level parsing via `src/utils/bash/bashParser.ts` and `ast.ts`. It defines 23 distinct violation types:

| ID | Type |
|----|------|
| 1 | INCOMPLETE_COMMANDS |
| 2 | JQ_SYSTEM_FUNCTION |
| 3 | JQ_FILE_ARGUMENTS |
| 4 | OBFUSCATED_FLAGS |
| 5 | SHELL_METACHARACTERS |
| 6 | DANGEROUS_VARIABLES |
| 7 | NEWLINES |
| 8-10 | DANGEROUS_PATTERNS (command substitution, I/O redirect variants) |
| 11 | IFS_INJECTION |
| 12 | GIT_COMMIT_SUBSTITUTION |
| 13 | PROC_ENVIRON_ACCESS |
| 14 | MALFORMED_TOKEN_INJECTION |
| 15+ | Escapes, brace expansion, control characters, Unicode whitespace, zsh commands, comment-quote desync |

18 zsh commands are blocked: `zmodload`, `emulate`, `sysopen`, `sysread`, `syswrite`, `zpty`, `ztcp`, `zsocket`, `mapfile`, and `zf_*` filesystem wrappers.

---

## 7. Permission System

### Permission Modes

| Mode | Behavior |
|------|----------|
| `default` | Prompt user for sensitive operations |
| `plan` | Read-only with narration |
| `acceptEdits` | Auto-approve file edits in working directory |
| `bypassPermissions` | Trust all (YOLO mode) |
| `dontAsk` | Suppress prompts, deny anything not in allow rules |
| `autoModeAcceptAll` | LLM classifier-driven approval |

### Permission Pipeline

Every tool call traverses this sequence:

1. **Check Mode**: bypass/dontAsk override all checks
2. **Apply Rules**: deny/allow/ask rule matching from settings
3. **Auto-Mode LLM Classifier**: (if enabled) classifies safety with 2-second timeout; falls back to ASK after >3 consecutive or >20 total denials
4. **Mode-Specific Default**: Default prompts; acceptEdits auto-allows cwd edits; plan pauses for review; bypassPermissions skips all

### Configuration Rules (settings.json)

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Bash(git log *)",
      "Bash(npm test *)"
    ],
    "deny": [
      "Bash(rm -rf *)"
    ]
  }
}
```

### Safety Mechanisms

- **Dangerous file protection**: `.gitconfig`, `.bashrc`, `.zshrc`, `.mcp.json` blocked (case-insensitive)
- **Dangerous command detection**: `rm -rf`, `git push --force`, `DROP TABLE` patterns
- **Auto-mode strip**: Strips `python`, `node`, `bash`, `npm run` from auto-mode commands
- **Bypass killswitch**: GrowthBook feature gate can disable bypass mode
- **Auto-mode circuit breaker**: Statsig gate can disable; once broken, cannot re-enter
- **MCP shell block**: MCP-sourced skills never execute shell commands
- **CVE-2025-59828 patch**: Code no longer executes before directory trust establishment

### Path-Level Permissions

- `checkReadPermissionForTool` - Different rules for read access
- `checkWritePermissionForTool` - Different rules for write access
- Project vs. system paths have different rules

### Critical Security Property

**A hook returning 'allow' does NOT override a deny rule -- deny rules always win.**

---

## 8. Session Management & JSONL Format

### Directory Structure

```
~/.claude/
├── projects/
│   ├── -Users-me-project-alpha/     # encoded CWD
│   │   ├── <session-uuid>.jsonl     # session transcript
│   │   ├── <session-uuid>.jsonl
│   │   ├── settings.json            # project-level settings
│   │   └── memory/
│   │       ├── MEMORY.md            # index (max 200 lines)
│   │       ├── user_role.md
│   │       ├── feedback_testing.md
│   │       └── reference_docs.md
│   └── -Users-me-project-beta/
│       ├── ...
│       └── memory/
├── settings.json                     # user-level settings
├── settings.local.json               # local overrides
├── mcp-config.json                   # MCP server config
├── skills/                           # user-level skills
├── plugins/                          # installed plugins
├── teams/                            # agent team data
│   └── {team-name}/
│       ├── config.json
│       └── inboxes/{agent-name}.json
├── tasks/                            # agent team tasks
│   └── {team-name}/
│       ├── .lock
│       ├── .highwatermark
│       └── {id}.json
├── debug/                            # debug logs
│   └── <session-id>.txt
└── worktrees/                        # git worktrees
```

### Path Encoding

The `<encoded-cwd>` directory name is the absolute working directory with every non-alphanumeric character replaced by `-`:
- `/Users/me/proj` becomes `-Users-me-proj`
- `C:\Users\me\proj` becomes `C--Users-me-proj`

### JSONL Record Format

Each line is a self-contained JSON object. The format is **append-only** -- conversations are event streams, not mutable documents.

#### Core Fields Present in Every Record

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Record type (see below) |
| `sessionId` | UUID string | Which session this belongs to |
| `timestamp` | ISO 8601 UTC | When the event occurred |
| `uuid` | UUID string | Unique identifier for this record |
| `parentUuid` | UUID string or null | Previous record, forming a linked list |

#### Record Types

**1. User Message**
```json
{
  "type": "user",
  "sessionId": "d8af951f-13ac-4a41-9748-7a7b9a6cfc00",
  "timestamp": "2026-02-21T01:15:23.451Z",
  "uuid": "a1b2c3d4-...",
  "parentUuid": "previous-uuid-...",
  "message": {
    "role": "user",
    "content": "Fix the auth bug"
  }
}
```

**2. Assistant Message (with tool use)**
```json
{
  "type": "assistant",
  "sessionId": "d8af951f-...",
  "timestamp": "2026-02-21T01:15:25.123Z",
  "uuid": "b2c3d4e5-...",
  "parentUuid": "a1b2c3d4-...",
  "message": {
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "Let me look at the auth module..."
      },
      {
        "type": "tool_use",
        "id": "toolu_01ABC...",
        "name": "Read",
        "input": {
          "file_path": "src/auth.ts"
        }
      }
    ]
  }
}
```

**3. Tool Result**
```json
{
  "type": "tool_result",
  "sessionId": "d8af951f-...",
  "timestamp": "2026-02-21T01:15:26.789Z",
  "uuid": "c3d4e5f6-...",
  "parentUuid": "b2c3d4e5-...",
  "toolUseId": "toolu_01ABC...",
  "content": "... file contents ...",
  "durationMs": 45
}
```

**4. System Record (various subtypes)**
```json
{
  "type": "system",
  "subtype": "init",
  "sessionId": "d8af951f-...",
  "timestamp": "2026-02-21T01:15:22.000Z",
  "uuid": "...",
  "parentUuid": null,
  "session_id": "d8af951f-...",
  "tools": [...],
  "model": "claude-opus-4-6-20250415",
  "permissionMode": "default",
  "claude_code_version": "2.1.88"
}
```

**5. Compact Boundary**
```json
{
  "type": "system",
  "subtype": "compact_boundary",
  "sessionId": "d8af951f-...",
  "timestamp": "2026-02-21T02:30:00.000Z",
  "uuid": "...",
  "logicalParentUuid": "last-message-before-erasure",
  "parentUuid": null,
  "compactMetadata": {
    "trigger": "auto",
    "preTokens": 167000
  }
}
```

Following the boundary is a synthetic user message:
```json
{
  "type": "user",
  "isCompactSummary": true,
  "isVisibleInTranscriptOnly": true,
  "message": {
    "role": "user",
    "content": "Summary of prior conversation..."
  }
}
```

**6. Session Start (for resumed sessions)**
```json
{
  "type": "session_start",
  "sessionId": "new-session-uuid",
  "parentSessionId": "original-session-uuid",
  "resumedFrom": "original-session-uuid",
  "timestamp": "..."
}
```

### Additional Fields

- `slug`: Human-readable conversation identifier (e.g., "zesty-singing-newell"), persists across continuations
- `isCompactSummary`: Marks synthetic summaries (exclude when reconstructing real dialogue)
- `isVisibleInTranscriptOnly`: Should not be shown in conversation view

### Cross-File Continuation

When sessions span multiple files (via `--continue` or `--resume`):
1. New file inherits parent's session ID in initial records
2. Transitions to its own ID
3. Shared `slug` field links them
4. First record may be a `compact_boundary` duplicate from parent
5. `parentUuid` bridges gaps across file boundaries

### Parsing Strategy

To reconstruct complete conversations:
1. Parse all JSONL files for the project
2. Build a parent -> child map using `parentUuid`
3. Follow the UUID chain chronologically
4. If first `sessionId` differs from filename ID, only include messages whose `sessionId` matches filename (prefix messages are duplicates)
5. Filter out `isCompactSummary` records for actual conversation display

---

## 9. Memory Architecture

### Three-Layer System

**Layer 1: MEMORY.md (Always Loaded)**
- Lightweight index of short pointers (~150 characters each)
- Max 200 lines or 25KB
- Located at `~/.claude/projects/<slug>/memory/MEMORY.md`
- Always loaded into context

**Layer 2: Topic Files (On Demand)**
- Detailed project notes pulled in on demand
- Located alongside MEMORY.md
- Each file includes YAML frontmatter:
  ```yaml
  name: "user_role"
  description: "Information about the user's role"
  type: "memory"
  ```

**Layer 3: Raw Transcripts (Search Only)**
- The JSONL session files
- Accessed via grep/search only, never loaded wholesale
- Located at `~/.claude/projects/<slug>/*.jsonl`

### Memory Directory Structure

```
~/.claude/projects/<project-slug>/memory/
├── MEMORY.md              # index (always loaded)
├── user_role.md           # user type/preferences
├── feedback_testing.md    # behavioral patterns
├── project_auth.md        # ongoing context
└── reference_docs.md      # external pointers
```

### autoDream / Memory Consolidation

A forked subagent process (`DreamTask`) runs during user idle periods:

```
Session active -> user idle -> DreamTask spawns
  ├── Reviews recent transcripts
  ├── Identifies patterns, decisions, preferences
  ├── Merges observations, removes logical contradictions
  ├── Consolidates notes
  ├── Updates MEMORY.md and memory files
  └── Completes silently
```

Dream task state:
```typescript
interface DreamTaskState {
  phase: 'starting' | 'updating'
  sessionsReviewing: number
  filesTouched: string[]
  turns: DreamTurn[]  // max 30
  priorMtime: number
}
```

Key design principle: Memory is treated as a **hint**, not ground truth. The agent is instructed to "verify against the actual codebase" when using memory.

---

## 10. Context Management & Compaction

### Context Window Budget (~200K tokens)

1. **System Prompt** (fixed): Base CLI instructions, non-deferred tool descriptions, MCP server instructions
2. **User Context** (injected): CLAUDE.md hierarchy (global -> user -> project -> local), git status, current date
3. **Conversation Messages**: Growing history with periodic compaction boundaries
4. **Output Reserve**: ~20K tokens preserved for model responses

### Prompt Caching Strategy

- `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` separates stable from dynamic content
- Static instructions never change between sessions
- `DANGEROUS_uncachedSystemPromptSection` tags mark cache-breaking modifications
- Cache breakpoints at system[2] with ephemeral type, messages[N-2] before latest
- TTL: 1 hour for eligible users
- Scope: "global" for cross-session sharing

### Four Compaction Stages (Progressive)

| Tier | Trigger | Strategy | Cost |
|------|---------|----------|------|
| **Micro-Compact** | 80% tokens | Clear old tool results surgically | Minimal |
| **Auto-Compact** | ~167K tokens (95%) | Full message summarization | Moderate |
| **Session Memory** | Approaching limit | Extract to persistent storage | Expensive |
| **Reactive** | API error | Truncate oldest messages | Last resort |

**Micro-compact targets**: FileRead, Bash, Grep, Glob, WebSearch, WebFetch, FileEdit, FileWrite tools.

**Auto-compact circuit breaker**: Limits to 3 consecutive failures.

### Compaction Configuration

```
CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=95     # Trigger % (default 95)
CLAUDE_CODE_AUTO_COMPACT_WINDOW=...    # Token window
DISABLE_AUTO_COMPACT=1                 # Disable auto
DISABLE_COMPACT=1                      # Disable all
```

### CLAUDE.md Loading

`src/utils/claudemd.ts` (46KB) processes instruction files from multiple sources:

Priority order:
1. Global: `~/.claude/CLAUDE.md`
2. User: `~/.claude/CLAUDE.md` (per-user preferences)
3. Project: `./.claude/CLAUDE.md` or `./CLAUDE.md`
4. Local: `./.claude/CLAUDE.local.md`
5. Directory-level: `CLAUDE.md` in subdirectories (conditional on path)

---

## 11. Agent Orchestration & Subagents

### Three Subagent Execution Models

| Model | Mechanism | Purpose |
|-------|-----------|---------|
| **Fork** | Byte-identical copy of parent context | Parallel work with cache reuse |
| **Teammate** | Separate tmux/iTerm pane with file-based mailbox | Loose coordination |
| **Worktree** | Own git worktree, isolated branch | Exploratory/risky work isolation |

### AgentTool Parameters

```typescript
{
  description: string        // What the agent should do
  prompt: string            // Instructions for the agent
  subagent_type: string     // Built-in or custom agent type
  model?: string            // Model override
  run_in_background?: boolean
  isolation?: 'worktree'    // Git-level isolation
  working_directory?: string
  team_name?: string
}
```

### Built-in Agent Types

| Type | Model | Tools | Purpose |
|------|-------|-------|---------|
| `general-purpose` | Parent model | All tools | Full capability |
| `explore` | Haiku | Read, Glob, Grep | Read-only exploration |
| `plan` | Parent model | Read-only | Architecture planning |
| `verification` | Parent model | Testing tools | Testing-focused |
| `CRI` | Haiku | Documentation tools | Documentation |

### Agent Isolation Details

| Aspect | Behavior |
|--------|----------|
| `agentId` | Unique UUID (agent-xyz) |
| `fileCache` | CLONED (isolated reads) |
| `abortCtrl` | NEW (async) or SHARED (sync) |
| `tools` | FILTERED by agent definition |
| `systemPrompt` | OVERRIDDEN per agent type |
| `messages` | FRESH (only prompt) or FORKED (full) |
| `transcript` | SEPARATE file on disk |
| `worktree` | OPTIONAL git worktree isolation |

### Fork Optimization (Prompt Cache)

When spawning multiple agents from same context:
- Fork children use byte-identical placeholder text for every `tool_result` block
- Only final directive text differs per child
- All children reference same cached tokens, paying once instead of N times
- Massive savings for parallel fork operations

### Recursive Fork Guard

`isInForkChild` checks querySource field and message history for `FORK_BOILERPLATE_TAG` preventing infinite recursion.

### Coordinator Mode

When `CLAUDE_CODE_COORDINATOR_MODE=1`:
- System prompt rewritten for orchestration
- Workers spawned via AgentTool with restricted tools
- XML task-notification protocol for results
- Coordinator aggregates responses

### Task System

Eight execution types via discriminated union:

| Type | Prefix | Description |
|------|--------|-------------|
| `LocalShellTask` | `b` | Bash/PowerShell execution |
| `LocalAgentTask` | `a` | Local Claude subprocesses |
| `RemoteAgentTask` | `r` | Cloud-hosted agents via CCR |
| `InProcessTeammateTask` | `t` | Same-process team members |
| `LocalWorkflowTask` | `w` | Task chains |
| `MonitorMcpTask` | `m` | MCP server supervision |
| `DreamTask` | `d` | Background memory consolidation |
| `LocalMainSessionTask` | - | Main REPL session |

Task IDs: Type prefix + 8-byte suffix in base-36 = ~2.8 trillion possible IDs.

State machine: `pending` -> `running` -> `completed` / `failed` / `killed`

---

## 12. Agent Teams

### Architecture

Agent Teams use a **Lead-and-Teammates** topology with entirely file-based coordination. There is no background process -- coordination emerges from shared file access.

### File Structure

```
~/.claude/
├── teams/{team-name}/
│   ├── config.json              # membership registry
│   └── inboxes/{agent-name}.json # per-agent mailbox
└── tasks/{team-name}/
    ├── .lock                    # flock() mutual exclusion
    ├── .highwatermark           # auto-increment counter
    └── {id}.json                # individual task files
```

### Team Configuration (config.json)

```json
{
  "members": [
    { "name": "team-lead", "agentId": "abc-123", "agentType": "leader" },
    { "name": "researcher", "agentId": "def-456", "agentType": "general-purpose" }
  ]
}
```

### Task File Schema

```json
{
  "id": "1",
  "subject": "Hunt for bugs",
  "description": "Requirements and acceptance criteria...",
  "activeForm": "Hunting for bugs",
  "status": "pending",
  "blocks": ["3"],
  "blockedBy": [],
  "owner": "researcher"
}
```

Status transitions: `pending` -> `in_progress` -> `completed`

### Inter-Agent Messaging (Mailbox)

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

Note: `text` field contains **JSON-in-JSON encoding** -- stringified message object with a `type` field.

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `task_assignment` | lead -> teammate | Assign work |
| `message` | any -> any | Direct messaging |
| `broadcast` | lead -> all | Same to all |
| `shutdown_request` | lead -> teammate | Graceful termination |
| `shutdown_response` | teammate -> lead | Approval/rejection |
| `plan_approval_request` | teammate -> lead | Submit plan for review |
| `plan_approval_response` | lead -> teammate | Approve with feedback |
| `idle_notification` | teammate -> lead | Auto-sent at turn end |

### Lead-Only Tools

- `TeamCreateTool` - Create named teams
- `TeamDeleteTool` - Delete teams
- `SendMessageTool` - Route messages between agents

### Key Implementation Details

- Teammates are separate CLI processes spawned via `Task` tool
- Each teammate gets fresh context (NO conversation history inherited)
- CLAUDE.md and MCP servers ARE inherited
- Permission mode inherited at spawn time
- `CLAUDE_CODE_TEAM_NAME` env var identifies the team
- `CLAUDE_CODE_PLAN_MODE_REQUIRED` forces plan mode

### Internal Functions

- `isTeammate()` / `isTeamLead()` - Role detection
- `waitForTeammatesToBecomeIdle()` - Synchronization
- `getTeammateContext()` / `setDynamicTeamContext()` - Runtime management
- Context fields via AsyncLocalStorage: `agentId`, `agentName`, `teamName`, `parentSessionId`, `color`, `planModeRequired`

### Token Economics

Agent teams use approximately **7x more tokens** than standard sessions when teammates run in plan mode. Each teammate maintains its own full context window.

---

## 13. MCP Server Integration

### Client Architecture

Claude Code implements one of the most comprehensive MCP client implementations:

**Transports supported:**
- `stdio` - Local process (recommended for local tools)
- `SSE` - Server-Sent Events (deprecated, use HTTP)
- `HTTP` - Request/response (recommended for remote)
- `WebSocket` - Bidirectional real-time
- SDK/IDE-native (embedded)

### Connection State Machine

```
PendingMCPServer -> ConnectedMCPServer
                 -> FailedMCPServer
                 -> NeedsAuthMCPServer
                 -> DisabledMCPServer
```

### Configuration Scopes (Priority Order)

```
managed (admin/enterprise) >
enterprise (MDM) >
project (.claude/settings.json) >
local (.claude/settings.local.json) >
user (~/.claude/settings.json) >
dynamic (runtime-added) >
claudeai (proxy)
```

Configuration files:
- User: `~/.claude/mcp-config.json`
- Project: `./.mcp.json`
- Per-directory: `.claude.json`

### Tool Name Normalization

Server "my-server", tool "send_message" -> `mcp__my_server__send_message`

Handles namespace collisions with server-prefixed naming.

### Deferred Tool Loading

Only tool names consume context at session start. Full definitions loaded on-demand when the model requests them via `ToolSearchTool`. This is controlled by `ENABLE_TOOL_SEARCH` env var.

### MCP Readiness

Before spawning agents requiring MCP servers, system polls up to 30 seconds:
- `MAX_WAIT_MS` = 30,000
- `POLL_INTERVAL_MS` = 500

### Error Handling

- 401 -> `McpAuthError`, marks "needs-auth" (15min cache)
- 404 + -32001 -> Session expired, clear cache, retry
- `isError: true` -> `McpToolCallError` with `_meta` field
- `-32042` (Elicitation Required) -> Invokes `handleElicitation` callback

### Default Timeout

100,000,000ms (~27.8 hours) per MCP tool call.

### OAuth/Authentication

PKCE flows, device code flows (terminal auth), cross-app access (XAA) for enterprise. `elicitationHandler.ts` manages credential collection via dynamically generated forms.

---

## 14. Hook System

### 26 Event Types

| Category | Events |
|----------|--------|
| Session | SessionStart, SessionEnd, Stop, StopFailure |
| User | UserPromptSubmit (exit 2 = BLOCK) |
| Tool | PreToolUse (exit 2 = BLOCK), PostToolUse, PostToolUseFailure |
| Agent | SubagentStart, SubagentStop |
| Task | TaskCreated, TaskCompleted, TeammateIdle |
| Other | PermissionRequest, PermissionDenied, ConfigChange, CwdChanged, FileChanged, Notification |
| Advanced | InstructionsLoaded, WorktreeCreate, WorktreeRemove, PreCompact, PostCompact, Elicitation, ElicitationResult |

### Four Handler Types

| Type | Description | Timeout |
|------|-------------|---------|
| **Command** | Shell execution | Configurable |
| **Prompt** | Single-turn LLM evaluation via Haiku | N/A |
| **Agent** | Full subagent with tools | 60s, no recursion |
| **HTTP** | POST to URL with JSON body | Configurable |

Plus runtime-only **Function** type (TypeScript callback, not persisted).

### Exit Code Semantics

- `0` = Success (continue)
- `2` = Blocking failure (stderr shown to model, operation blocked)
- Other = Non-blocking (stderr shown to user only)

### PreToolUse Hook Power

Can return:
- `permissionDecision` (allow/deny/ask)
- `updatedInput` (modify tool input)
- `additionalContext` (inject extra info)

### Configuration Sources (Priority)

```
User < Project < Local < GrowthBook < Enterprise MDM < Plugin < Runtime Function < Built-in
```

### Hook Configuration Example

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "validate.sh"
          }
        ]
      }
    ],
    "PostToolUse": [...],
    "TeammateIdle": [...]
  }
}
```

---

## 15. Skill & Plugin Systems

### Skills

Skills are folders with `SKILL.md` descriptors + YAML frontmatter + optional scripts.

**Frontmatter:**
```yaml
name: "My Skill"
description: "What this skill does"
when_to_use: "When user asks to X"
arguments: ["target", "options"]
argument-hint: "<target> [options]"
allowed-tools: [Read, Grep, Glob]
user-invocable: true
disable-model-invocation: false
model: "opus"
context: "fork"              # inline or fork
agent: "code-reviewer"       # agent type for fork
effort: "high"               # token budget hint
paths: ["src/**/**.ts"]      # conditional activation
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: "command"
          command: "validate.sh"
```

**Loading pipeline (priority):**
Bundled (compiled) -> Filesystem (`~/.claude/skills/`) -> MCP Servers (runtime) -> Plugins (marketplace) -> Managed (enterprise)

**Execution modes:**
- **Inline** (default): Template substitution, content injected into current turn
- **Forked** (`context: "fork"`): Sub-agent spawned with skill as prompt

**Path-Filtered Skills**: Activate automatically when model edits files matching glob patterns in `paths` field.

### Plugins

Higher-level DXT (Developer Extension) packages contributing:
- Commands
- Agents
- Hooks
- Output styles
- MCP server configurations

Managed via `claude plugin` CLI commands. Marketplace integration for discovery.

---

## 16. Terminal UI (Ink/React)

### Component Tree

```
<App>
  <FpsMetricsProvider>
    <StatsProvider>
      <AppStateProvider>
        <NotificationsProvider>
          <VoiceProvider>
            <MailboxProvider>
              <ThemeProvider>
                <REPL>
                  ├── <LogoV2>
                  ├── <Messages>
                  │   └── <VirtualMessageList>
                  │       ├── <UserTextMessage>
                  │       ├── <AssistantTextMessage>
                  │       ├── <AssistantToolUseMessage>
                  │       ├── <AssistantThinkingMessage>
                  │       └── <ToolUseLoader>
                  └── <PromptInput>
                      ├── <TextInput> / <VimTextInput>
                      ├── <PromptInputFooter>
                      └── <VoiceIndicator>
```

### Key Rendering Details

- **Custom React Reconciler**: `src/ink/reconciler.ts`
- **Layout**: Yoga WASM (flexbox)
- **Double-Buffered Rendering**: 2D cell grid (char + fg + bg + styles)
- **Frame Rate**: 16ms intervals (~60fps)
- **Diff-Based Output**: Only changed cells emitted
- **Hardware Scrolling**: DECSTBM scroll regions (SU/SD escape sequences)
- **Viewport Culling**: Only visible content rendered
- **Character/Style Interning**: CharPool and StylePool for ANSI code deduplication

### Component Sizes

| Component | Size | Description |
|-----------|------|-------------|
| REPL.tsx | 896KB | Largest file, orchestrates everything |
| PromptInput.tsx | 355KB | Command history, slash commands, model selection, voice, vim |
| VirtualMessageList.tsx | 149KB | Virtual scrolling, sticky-to-bottom, intersection observers |
| App.tsx | 98KB | stdin/stdout, keyboard parsing, multi-click, error boundaries |
| ScrollBox.tsx | 32KB | Imperative scroll APIs |
| Text.tsx | 17KB | Styled text |
| Button.tsx | 17KB | Clickable elements with focus/hover |

### Vim Mode

Full state machine implementation:
- Modes: Normal, Insert
- Motions: h/j/k/l/w/b/e
- Operators: d/c/y
- Text objects: iw/i"/a()
- Dot-repeat, registers, find (f/F/t/T)

### Voice Mode

- Hold-to-talk activation
- Waveform visualization
- 20+ languages via Anthropic STT
- Animated cursor (rainbow HSL)

---

## 17. The Agent SDK & Programmatic Interface

### Overview

The Agent SDK provides programmatic access to Claude Code's capabilities. Available as:
- **CLI**: `claude -p "prompt"` for scripts and CI/CD
- **Python**: `pip install claude-agent-sdk`
- **TypeScript**: `npm install @anthropic-ai/claude-agent-sdk`

### Basic CLI Usage

```bash
# One-shot query
claude -p "Find and fix the bug in auth.py" --allowedTools "Read,Edit,Bash"

# With structured output
claude -p "Summarize this project" --output-format json

# With streaming
claude -p "Explain recursion" --output-format stream-json --verbose

# Continue conversation
session_id=$(claude -p "Start a review" --output-format json | jq -r '.session_id')
claude -p "Continue that review" --resume "$session_id"

# Bare mode (fast, no auto-discovery)
claude --bare -p "Summarize this file" --allowedTools "Read"
```

### Python SDK

```python
import asyncio
from claude_agent_sdk import (
    ClaudeSDKClient, ClaudeAgentOptions,
    AssistantMessage, ResultMessage, TextBlock
)

async def main():
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Edit", "Glob", "Grep"],
    )
    async with ClaudeSDKClient(options=options) as client:
        await client.query("Analyze the auth module")
        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        print(block.text)

asyncio.run(main())
```

### TypeScript SDK

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Analyze the auth module",
  options: { allowedTools: ["Read", "Glob", "Grep"] }
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
```

### SDK Message Types

| Type | Python | TypeScript | Description |
|------|--------|------------|-------------|
| System init | `SystemMessage` | `SDKSystemMessage` | Session initialization |
| Assistant | `AssistantMessage` | `SDKAssistantMessage` | Complete responses |
| Stream event | `StreamEvent` | `SDKPartialAssistantMessage` | Streaming deltas |
| Result | `ResultMessage` | `SDKResultMessage` | Final result |
| Compact boundary | `SystemMessage` (subtype) | `SDKCompactBoundaryMessage` | Context compacted |

### Result Subtypes

- `success` - Agent completed normally
- `error_max_turns` - Hit turn limit
- `error_max_budget_usd` - Hit budget limit
- `error` - Other errors

### Session Management via SDK

```python
# List sessions
from claude_agent_sdk import list_sessions, get_session_messages

sessions = await list_sessions(cwd="/path/to/project")
messages = await get_session_messages(session_id="...")

# Session info
info = await get_session_info(session_id="...")
await rename_session(session_id="...", name="my-feature")
await tag_session(session_id="...", tag="review")
```

```typescript
import { listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";

const sessions = await listSessions({ cwd: "/path/to/project" });
const messages = await getSessionMessages({ sessionId: "..." });
```

---

## 18. The stream-json Protocol

The `--input-format stream-json --output-format stream-json` flags enable bidirectional NDJSON communication with the Claude Code CLI.

### Sending User Messages (stdin)

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "Fix the bug in auth.py"
  },
  "parent_tool_use_id": null,
  "session_id": "optional-session-id"
}
```

### Receiving Events (stdout)

**System init:**
```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "...",
  "tools": [...],
  "mcp_servers": [...],
  "model": "claude-opus-4-6-20250415",
  "permissionMode": "default",
  "apiKeySource": "...",
  "claude_code_version": "2.1.88",
  "slash_commands": [...],
  "agents": [...],
  "skills": [...]
}
```

**Stream events (with `--include-partial-messages`):**
```json
{"type": "stream_event", "event": {"type": "message_start", ...}, "uuid": "...", "session_id": "..."}
{"type": "stream_event", "event": {"type": "content_block_start", "content_block": {"type": "text"}}, ...}
{"type": "stream_event", "event": {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Let me"}}, ...}
{"type": "stream_event", "event": {"type": "content_block_delta", "delta": {"type": "text_delta", "text": " look at"}}, ...}
{"type": "stream_event", "event": {"type": "content_block_stop"}, ...}
{"type": "stream_event", "event": {"type": "content_block_start", "content_block": {"type": "tool_use", "name": "Read"}}, ...}
{"type": "stream_event", "event": {"type": "content_block_delta", "delta": {"type": "input_json_delta", "partial_json": "..."}}, ...}
```

**Permission control (bidirectional):**

Incoming from CLI:
```json
{
  "type": "control_request",
  "subtype": "can_use_tool",
  "tool_name": "Bash",
  "tool_input": {"command": "rm -rf /tmp/test"}
}
```

Response to CLI:
```json
{
  "type": "control_response",
  "allow": true
}
```

**API retry events:**
```json
{
  "type": "system",
  "subtype": "api_retry",
  "attempt": 1,
  "max_retries": 10,
  "retry_delay_ms": 5000,
  "error_status": 429,
  "error": "rate_limit",
  "uuid": "...",
  "session_id": "..."
}
```

**Result:**
```json
{
  "type": "result",
  "subtype": "success",
  "result": "I've fixed the bug...",
  "session_id": "...",
  "total_cost_usd": 0.0234,
  "structured_output": null
}
```

### Important Notes

- Each message is a single JSON line terminated with `\n`
- Multiple user messages can be sent for multi-turn conversations
- The `--permission-prompt-tool` flag designates an MCP tool to handle permissions in non-interactive mode
- `--replay-user-messages` echoes user messages back on stdout for acknowledgment
- **This protocol is largely undocumented** -- community reverse-engineered from Companion source code

---

## 19. The --sdk-url WebSocket Protocol

The `--sdk-url` flag is an **undocumented** flag (hidden with `.hideHelp()` in the Commander configuration) that transforms Claude Code from an interactive terminal tool into a WebSocket client.

### How It Works

```
claude --sdk-url ws://localhost:3456/ws/cli/{session-id}
```

The CLI connects to the specified WebSocket URL and streams all output as NDJSON over the WebSocket instead of to the terminal. Input (user messages, permission responses) comes back through the WebSocket.

### Message Format

Same NDJSON format as `--output-format stream-json`, but over WebSocket instead of stdout/stdin.

### Companion's Usage

The Companion tool (by The Vibe Company) uses this:

```
Browser (React)
  <-> ws://localhost:3456/ws/browser/:session
Companion Server (Bun + Hono)
  <-> ws://localhost:3456/ws/cli/:session
Claude Code CLI (--sdk-url ws://localhost:3456/ws/cli/:session)
```

The server acts as a bidirectional relay, maintaining separate sessions for browser clients and CLI connections.

### Protocol Analysis Document

The Companion repo includes `WEBSOCKET_PROTOCOL_REVERSED.md` containing reverse-engineered message specifications.

### Key Warning

This flag is **not officially supported by Anthropic**. If they remove it, tools depending on it will break. The Agent SDK (`claude -p` with stream-json) is the officially supported programmatic interface.

---

## 20. Claude Code Desktop App

### Architecture

The Claude Code Desktop app (the "Code" tab in the Claude Desktop app) is **NOT** Electron-based. It uses:

- **Tauri 2** for the desktop shell
- **React 19** frontend
- **Rust** backend (AgentBridge)
- **Node.js sidecar** running the Claude Agent SDK

### Communication Architecture

```
React 19 Frontend
  <-> Tauri IPC (invoke + emit)
Rust Backend (AgentBridge)
  <-> stdin/stdout JSON IPC (NDJSON)
Node.js Sidecar (Claude Agent SDK)
  <-> Anthropic API
```

The sidecar pattern spawns a Node.js process and communicates over stdin/stdout using newline-delimited JSON.

### Desktop-Specific Features

Beyond the CLI, Desktop adds:
- Visual diff review with inline comments
- Live app preview with dev servers
- Computer use (macOS, Windows)
- GitHub PR monitoring with auto-fix/auto-merge
- Parallel sessions with automatic Git worktree isolation
- Dispatch integration (send tasks from phone)
- Scheduled tasks on cron
- Connectors (GitHub, Slack, Linear)
- SSH and cloud remote environments

### Session Transport

Desktop sessions connect via three remote paradigms:
1. **Teleport**: Persistent Claude.ai web sessions (WebSocket/HTTP via Bridge Proxy)
2. **Direct Connect**: Local-to-local or local-to-remote proxying
3. **SSH Sessions**: SSH tunnel with child process management

---

## 21. The Bridge System (Remote Sessions)

### Components

**`bridgeMain.ts`** (2,999 lines): Poll loop for work items with:
- Spawn modes: single session, worktree-isolated, same-directory
- Multi-session management with capacity control
- Graceful shutdown (SIGTERM-to-SIGKILL grace periods)
- Connection error backoff
- Sleep detection

**`replBridge.ts`** (2,406 lines): REPL-side WebSocket integration with:
- Bidirectional message flow
- Permission response handling
- Message eligibility filtering
- SDK compatibility
- Deduplication via `BoundedUUIDSet`

**`remoteBridgeCore.ts`** (39KB): Core protocol with:
- Session lifecycle (create, archive, reconnect)
- Work polling with acknowledgment
- Token refresh scheduling
- Session activity updates

### Teleport Flow

1. `prepareApiRequest` validates Claude.ai OAuth tokens and Org UUID
2. `createBridgeSession` builds `session_context` with git repo sources
3. Session created via HTTP POST to `${BASE_API_URL}/v1/sessions`
4. WebSocket connection established for real-time communication

### Remote Permission Bridge

1. Remote agent encounters permission-requiring tool
2. Sends `PermissionRequest` SDK message
3. Local REPL uses `createToolStub` if tool unavailable locally
4. `createSyntheticAssistantMessage` generates local representation
5. User decision (Allow/Deny/Feedback) sent via `respondToPermissionRequest`

---

## 22. CLI Flags Reference

### Core Flags

| Flag | Description |
|------|-------------|
| `-p`, `--print` | Non-interactive mode, print response and exit |
| `-c`, `--continue` | Continue most recent conversation |
| `-r`, `--resume <id>` | Resume specific session by ID or name |
| `-n`, `--name <name>` | Set display name for session |
| `-w`, `--worktree <name>` | Start in isolated git worktree |
| `-v`, `--version` | Output version number |

### Output & Format

| Flag | Description |
|------|-------------|
| `--output-format <fmt>` | `text`, `json`, or `stream-json` |
| `--input-format <fmt>` | `text` or `stream-json` |
| `--json-schema <schema>` | Get validated JSON output matching schema |
| `--verbose` | Full turn-by-turn output |
| `--include-partial-messages` | Include streaming events (requires stream-json) |
| `--include-hook-events` | Include hook lifecycle events |
| `--replay-user-messages` | Echo user messages back on stdout |

### Model & Effort

| Flag | Description |
|------|-------------|
| `--model <model>` | Set model (`sonnet`, `opus`, or full name) |
| `--effort <level>` | `low`, `medium`, `high`, `max` |
| `--fallback-model <model>` | Fallback on overload (print mode) |
| `--betas <list>` | Beta headers for API |

### Permissions

| Flag | Description |
|------|-------------|
| `--permission-mode <mode>` | `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions` |
| `--dangerously-skip-permissions` | Skip all permission prompts |
| `--allow-dangerously-skip-permissions` | Add bypass to Shift+Tab cycle |
| `--enable-auto-mode` | Unlock auto mode in Shift+Tab cycle |
| `--allowedTools <tools>` | Auto-approve specified tools |
| `--disallowedTools <tools>` | Remove tools from model's context |
| `--tools <tools>` | Restrict available tools |
| `--permission-prompt-tool <tool>` | MCP tool for permission handling |

### System Prompt

| Flag | Description |
|------|-------------|
| `--system-prompt <text>` | Replace entire system prompt |
| `--system-prompt-file <path>` | Replace from file |
| `--append-system-prompt <text>` | Append to default prompt |
| `--append-system-prompt-file <path>` | Append from file |

### Session & Context

| Flag | Description |
|------|-------------|
| `--session-id <uuid>` | Use specific session ID |
| `--fork-session` | Create new session from existing |
| `--from-pr <number>` | Resume sessions linked to PR |
| `--add-dir <paths>` | Additional working directories |
| `--bare` | Skip auto-discovery for fast startup |
| `--no-session-persistence` | Don't save to disk |
| `--max-turns <n>` | Limit agentic turns (print mode) |
| `--max-budget-usd <n>` | Budget cap (print mode) |

### MCP & Plugins

| Flag | Description |
|------|-------------|
| `--mcp-config <file>` | Load MCP servers from file |
| `--strict-mcp-config` | Only use MCP from --mcp-config |
| `--plugin-dir <path>` | Load plugins from directory |
| `--agents <json>` | Define custom subagents |
| `--agent <name>` | Use specific agent for session |

### Display & Integration

| Flag | Description |
|------|-------------|
| `--chrome` | Enable Chrome browser integration |
| `--no-chrome` | Disable Chrome integration |
| `--ide` | Auto-connect to IDE |
| `--debug <categories>` | Enable debug mode |
| `--debug-file <path>` | Write debug logs to file |
| `--tmux` | Create tmux session for worktree |
| `--teammate-mode <mode>` | `auto`, `in-process`, `tmux` |
| `--channels <list>` | Channel notifications to listen for |

### Remote

| Flag | Description |
|------|-------------|
| `--remote <task>` | Create web session on claude.ai |
| `--remote-control` | Start Remote Control server |
| `--teleport` | Resume web session locally |

### Configuration

| Flag | Description |
|------|-------------|
| `--settings <file>` | Load additional settings |
| `--setting-sources <list>` | Which setting sources to load |
| `--init` | Run initialization hooks |
| `--init-only` | Run init hooks and exit |
| `--maintenance` | Run maintenance hooks |
| `--disable-slash-commands` | Disable skills and commands |

---

## 23. Environment Variables

### Most Important for Vantage Integration

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | API key | - |
| `ANTHROPIC_MODEL` | Model override | - |
| `CLAUDE_CONFIG_DIR` | Config directory | `~/.claude` |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | Max output tokens | Model-dependent |
| `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` | Parallel tools | 10 |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Subagent model | - |
| `CLAUDE_CODE_EFFORT_LEVEL` | Effort level | Model default |
| `MAX_THINKING_TOKENS` | Thinking budget | - |
| `BASH_DEFAULT_TIMEOUT_MS` | Bash timeout | - |
| `BASH_MAX_TIMEOUT_MS` | Max bash timeout | - |
| `BASH_MAX_OUTPUT_LENGTH` | Bash output limit | - |
| `API_TIMEOUT_MS` | API request timeout | 600000 |
| `DISABLE_AUTO_COMPACT` | Disable compaction | - |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | Disable auto memory | - |
| `CLAUDE_CODE_DISABLE_THINKING` | Disable thinking | - |
| `CLAUDE_CODE_SIMPLE` | Minimal system prompt | - |
| `DISABLE_TELEMETRY` | Opt out of telemetry | - |
| `DISABLE_NONESSENTIAL_TRAFFIC` | Disable updates/telemetry/errors | - |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | Enable agent teams | - |
| `CLAUDE_CODE_RESUME_INTERRUPTED_TURN` | Auto-resume | - |

### Internal/Hidden Variables (Useful for Deep Integration)

| Variable | Description |
|----------|-------------|
| `CLAUDE_CODE_SESSION_ID` | Session identifier |
| `CLAUDE_CODE_EAGER_FLUSH` | Force eager transcript flushing |
| `CLAUDE_CODE_IS_COWORK` | Cowork-specific flush |
| `CLAUDE_CODE_COORDINATOR_MODE` | Enable coordinator mode |
| `CLAUDE_CODE_TEAMMATE_COMMAND` | Override teammate executable |
| `CLAUDE_CODE_AGENT_COLOR` | Spawned teammate color |
| `CLAUDE_CODE_PLAN_MODE_REQUIRED` | Require plan mode |
| `CLAUDE_CODE_TEAM_NAME` | Team name for teammate |
| `CLAUDE_CODE_ABLATION_BASELINE` | Forces simplification toggles |
| `CLAUDE_CODE_VERIFY_PLAN` | Load VerifyPlanExecutionTool |
| `CLAUDE_CODE_PROACTIVE` | Enable proactive behavior |
| `CLAUDE_CODE_STREAMLINED_OUTPUT` | Alternate output mode |
| `CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER` | Debug render exit |
| `USER_TYPE` | Major internal/external gate |
| `CLAUBBIT` | Bypass trust dialog |
| `IS_SANDBOX` | Security bypass checks |

### Bridge/Remote Variables

| Variable | Description |
|----------|-------------|
| `CLAUDE_CODE_REMOTE` | Marks remote runtime |
| `CLAUDE_CODE_USE_CCR_V2` | CCR v2 transport |
| `CLAUDE_BRIDGE_OAUTH_TOKEN` | Bridge auth |
| `CLAUDE_BRIDGE_BASE_URL` | Bridge URL |
| `CLAUDE_CODE_SESSION_ACCESS_TOKEN` | Worker session token |
| `CLAUDE_CODE_ENVIRONMENT_KIND` | Environment runner kind |

### Full Official List

See the official documentation at: https://code.claude.com/docs/en/env-vars

The full list contains 100+ officially documented variables plus dozens of internal/hidden ones discovered through source analysis.

---

## 24. How Existing Tools Integrate

### Companion (The Vibe Company)

**Repository**: `github.com/The-Vibe-Company/companion`

**Integration method**: Uses the hidden `--sdk-url` WebSocket flag

**Architecture**:
```
Browser (React) <-> WebSocket <-> Companion Server (Bun+Hono) <-> WebSocket <-> Claude Code CLI
```

**Key files**:
- `web/server/ws-bridge.ts` - Message handling
- `web/server/cli-launcher.ts` - CLI invocation

**Features**: Multiple sessions, visual tool tracking, persistent context, mobile access, tool approval from browser.

**Risk**: Depends on undocumented `--sdk-url` flag that Anthropic could remove.

### claude-devtools

**Repository**: `github.com/matt1398/claude-devtools`

**Integration method**: Reads raw JSONL session logs from `~/.claude/` (no CLI modification)

**How it works**:
1. Reads `~/.claude/projects/<encoded-cwd>/*.jsonl` files
2. Reconstructs full execution trace from JSONL records
3. Per-turn token attribution across 7 categories
4. Pairs tool invocations with results in expandable cards
5. Resolves subagent sessions from Task tool calls
6. Renders nested agent hierarchies as recursive trees

**Remote access**: Parses `~/.ssh/config`, opens SFTP channels to stream remote `~/.claude/` logs.

### claude-code-log

**Repository**: `github.com/daaain/claude-code-log`

**Integration method**: Python CLI that converts JSONL files to readable HTML.

### claude-JSONL-browser

**Repository**: `github.com/withLinda/claude-JSONL-browser`

**Integration method**: Web-based tool converting JSONL to Markdown with file explorer.

### claude-code-reverse (Visualization)

**Repository**: `github.com/Yuyz0112/claude-code-reverse`

**Integration method**: Visualizes LLM request/response pairs from runtime analysis.

### Claude Code Desktop (Official)

**Integration method**: Tauri 2 + Node.js sidecar via Agent SDK

The desktop app spawns a Node.js sidecar process running the Agent SDK and communicates via NDJSON over stdin/stdout. It does NOT use the `--sdk-url` WebSocket approach.

### Third-Party IDE Desktop Wrappers

**Example**: CodePilot (`github.com/op7418/CodePilot`)

Built with Electron + Next.js, integrates with Claude Code CLI. Uses the Agent SDK or subprocess spawning pattern.

---

## 25. Hidden Features & Internal Codenames

### KAIROS System

**Status**: Feature-flagged (compiled to `false` in public builds), appears 150+ times in source

Named after the Ancient Greek concept of "the right time":
- 24/7 autonomous operation with heartbeat prompts
- Exclusive tools: push notifications, file delivery, GitHub PR subscriptions
- Append-only logging with self-persistence across sessions
- `autoDream` subprocess for memory consolidation during idle

### Buddy/Companion System

Deterministic personality generation via seeded PRNG from user ID:
- 16+ species: duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk
- Five rarity tiers: common, uncommon, rare, epic, legendary
- Species identifiers encoded to prevent codename leakage

### Internal Model Codenames

| Codename | Suspected Identity |
|----------|-------------------|
| Capybara/Mythos | Version 8, 1M context, "fast mode" |
| Numbat | Upcoming model |
| Fennec | Opus 4.6 |
| Tengu | Referenced in undercover mode |

### Undercover Mode

`undercover.ts` (90 lines):
- One-way suppression of internal codenames
- Automatic stripping for external repository builds
- Prevents disclosure of internal Slack references

### Anti-Distillation Mechanisms

- `anti_distillation: ['fake_tools']` injects decoy tool definitions
- `CONNECTOR_TEXT`: server-side summarization with cryptographic signatures
- Targets competitor model training at data collection time

### Unshipped Features Count

44+ hidden feature flags and 20+ unshipped features discovered in source.

---

## 26. Community Reverse Engineering

### Key Resources

| Resource | Type | URL |
|----------|------|-----|
| Engineer's Codex Deep Dive | Blog post | https://read.engineerscodex.com/p/diving-into-claude-codes-source-code |
| WaveSpeed Architecture Analysis | Blog post | https://wavespeed.ai/blog/posts/claude-code-agent-harness-architecture/ |
| DuoCode Harness Study | Blog post | https://duocodetech.com/blog/claude-code-harness-engineering |
| Kir Shatrov Internals | Blog post | https://kirshatrov.com/posts/claude-code-internals |
| Complete Architecture Gist | Gist | https://gist.github.com/yanchuk/0c47dd351c2805236e44ec3935e9095d |
| DeepWiki Analysis | Wiki | https://deepwiki.com/oboard/claude-code-rev/ |
| Session Continuation Analysis | Blog post | https://blog.fsck.com/releases/2026/02/22/claude-code-session-continuation/ |
| Claurst (Rust Rewrite) | GitHub | https://github.com/Kuberwastaken/claurst |
| Claw Code (Python/Rust Rewrite) | GitHub | Fastest growing repo in GitHub history |
| Companion Protocol Reverse | GitHub | https://github.com/The-Vibe-Company/companion |

### DEV Community Analysis

- [Claude Code's Entire Source Code Was Just Leaked](https://dev.to/gabrielanhaia/claude-codes-entire-source-code-was-just-leaked-via-npm-source-maps-heres-whats-inside-cjo)
- [What Claude Code's Leaked Architecture Reveals About Production MCP Servers](https://dev.to/shekharp1536/what-claude-codes-leaked-architecture-reveals-about-building-production-mcp-servers-2026-10on)
- [Reverse-Engineering Claude Code Agent Teams](https://dev.to/nwyin/reverse-engineering-claude-code-agent-teams-architecture-and-protocol-o49)

---

## 27. Key Implications for Vantage

### Recommended Integration Strategy

Based on this research, Vantage should use the **official Agent SDK** as the primary integration point, NOT the undocumented `--sdk-url` WebSocket flag:

**Primary integration**: Spawn Claude Code CLI as subprocess with:
```bash
claude -p \
  --input-format stream-json \
  --output-format stream-json \
  --include-partial-messages \
  --verbose
```

This gives full NDJSON bidirectional communication with:
- Real-time streaming of text and tool calls
- Permission control via `control_request`/`control_response`
- Session management via `--resume`/`--continue`
- Structured output via `--json-schema`

**Secondary integration**: Read `~/.claude/` session files directly for:
- Session history browser
- Token usage analytics
- Tool call inspection
- Subagent tree visualization

### What Vantage Should Build

1. **NDJSON Protocol Handler**: Parse the stream-json output, accumulate partial messages, handle control requests for permissions
2. **Session Manager**: Track session IDs, support continue/resume/fork
3. **JSONL Session Viewer**: Parse `~/.claude/projects/<slug>/*.jsonl` files for history browsing
4. **Permission UI**: Intercept `control_request` messages and present approval UI
5. **Tool Call Visualizer**: Render tool calls with specialized views (diffs for edits, syntax highlighting for reads, etc.)
6. **Token/Cost Dashboard**: Track `input_tokens`, `output_tokens`, `cache_creation_input_tokens` across sessions
7. **Memory Inspector**: Read and display MEMORY.md and topic files from `~/.claude/projects/<slug>/memory/`
8. **Agent Team Monitor**: Watch `~/.claude/teams/` and `~/.claude/tasks/` directories for real-time team coordination visualization
9. **MCP Server Manager**: Read/write `~/.claude/mcp-config.json` and `.mcp.json`
10. **Settings Editor**: Read/write settings from the three-tier hierarchy (user/project/local)

### Architecture Considerations

- **Desktop framework**: Tauri 2 or Electron. Anthropic's own Desktop uses Tauri 2 + Rust + Node.js sidecar. Companion uses Bun + Hono.
- **Process management**: The CLI is a long-lived process when using stream-json. Vantage needs robust process lifecycle management.
- **File watching**: Use filesystem watchers on `~/.claude/` for real-time session updates without polling.
- **Multiple sessions**: The CLI supports multiple concurrent sessions. Vantage should manage multiple processes.
- **Context preservation**: When resuming sessions, the `cwd` must match. Session files are stored under the encoded CWD path.

### What NOT to Do

1. **Don't rely on `--sdk-url`** -- undocumented, could be removed
2. **Don't modify Claude Code's source** -- DMCA risks, maintenance burden
3. **Don't parse the terminal output** -- use stream-json instead
4. **Don't store sensitive tokens** -- let Claude Code handle auth via its own OAuth flow
5. **Don't bypass the permission system** -- use `--permission-prompt-tool` or `control_request`/`control_response` instead

---

*This document was compiled from publicly available sources including official Anthropic documentation, community reverse engineering efforts, and analysis of the accidentally exposed source code. It is intended for educational and development purposes only.*

*Sources include: Anthropic official docs (code.claude.com, platform.claude.com), Engineer's Codex, WaveSpeed AI, DuoCode Tech, Kir Shatrov, DEV Community, GitHub repositories (claude-devtools, companion, claude-code-reverse, claude-code-log, claude-JSONL-browser), and community gists/analyses.*
