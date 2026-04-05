# Vantage 2.0 Evolution Plan

Competitive analysis of 6 reference Claude Code GUI projects, distilled into a concrete roadmap for taking Vantage from "it works" to "I'd never go back to Cursor."

**Date**: 2026-04-04
**Source repos analyzed**:
- **opcode** (Tauri 2 + React, 21k stars) -- chat-focused Claude GUI with agents, checkpoints, usage dashboard
- **companion** (Bun + Hono + React 19) -- best protocol understanding, `--sdk-url` WebSocket bridge, session orchestration
- **kanna** (Bun + React + Zustand) -- event sourcing architecture, multi-provider, CQRS read models
- **claude-devtools** (Electron + React) -- session log inspector, context tracking, chunk visualization
- **codepilot** (Electron + Next.js) -- multi-provider, SQLite, Bridge system, generative UI, error classifier
- **clauductor** (Go + Nuxt/Vue) -- execution map visualization, MCP server, single binary

---

## Part 1: Per-Repo Analysis

---

### 1. Opcode (MOST IMPORTANT -- closest competitor)

**What they do better**:
- **Virtual scrolling** for message lists via `@tanstack/react-virtual` -- critical for long conversations. Vantage has none; our chat panel will choke on 200+ message sessions.
- **Prompt queuing** -- if user sends a prompt while Claude is streaming, it gets queued and auto-sent when the current response finishes. Clean UX vs our "please wait" approach.
- **Two-phase event listeners** -- generic listeners catch the `system:init` message to extract `session_id`, then switch to scoped `claude-output:{sessionId}` listeners. Solves the race condition Vantage has where a new session ID might differ from what we expected.
- **Multi-method process cancellation** -- try registry kill, fall back to process state kill, last resort `taskkill /F`. More robust than our single kill approach.
- **JSONL deduplication** via `message_id + request_id` composite hash. Prevents double-counting in usage analytics.
- **costUSD fallback** -- uses the `costUSD` field from the CLI stream when available, only falls back to manual calculation. More accurate.
- **Client-side data caching** with TTL for usage dashboard (10-minute cache, avoids re-parsing JSONL on tab switches).
- **Lazy tab content** via `React.lazy()` -- heavy panels only load when first visited.
- **Claude binary version selection** -- discovers all system installations (NVM, Homebrew, system PATH), compares versions, lets user pick. More robust than our basic prerequisite check.
- **Checkpoint fork/branch** -- their file-snapshot checkpoint system supports forking from any point to create alternative conversation branches.
- **Slash command picker** with autocomplete triggered by `/` in the prompt input, plus a dedicated CRUD management UI.
- **GitHub agent import/export** for community agent sharing.

**What they do worse**:
- **No file explorer** -- just a basic file picker modal. Vantage's lazy-loading tree with git status is far ahead.
- **No editor** -- no Monaco, no code editing at all. They're a chat client, not an IDE.
- **No terminal** -- no PTY, no xterm.js. They rely entirely on Claude's Bash tool.
- **No permission handling** -- uses `--dangerously-skip-permissions` everywhere. Major security hole.
- **No input validation** -- no path traversal prevention, no shell injection prevention.
- **No type-safe IPC** -- raw `#[tauri::command]` without tauri-specta. We're ahead.
- **No resizable panels** -- tab-based browser layout, not an IDE.
- **No search** -- no ripgrep, no project-wide search.
- **No git integration** -- no branch, status, log, blame, stage/commit.
- **No testing** -- zero visible tests. Vantage has 362 frontend + 76 Rust tests.
- **React 18** -- we're on React 19.

**Code worth copying**:
| Feature | Source file | Adaptation target |
|---------|-----------|-------------------|
| JSONL deduplication | `src-tauri/src/commands/usage.rs:170-199` | `src-tauri/src/analytics.rs` |
| costUSD fallback from stream | `usage.rs:192-198` | `analytics.rs` |
| Two-phase event listeners | `ClaudeCodeSession.tsx:529-602` | `src/hooks/useClaude.ts` |
| Multi-method process kill | `claude.rs:1018-1149` | `src-tauri/src/claude/` |
| Virtual scrolling pattern | `ClaudeCodeSession.tsx:263-268` | `src/components/chat/ChatPanel.tsx` |
| Prompt queuing | `ClaudeCodeSession.tsx:498-507` | `src/stores/conversationStore.ts` |
| Client-side usage cache | `UsageDashboard.tsx:24-89` | `src/components/analytics/UsageDashboard.tsx` |
| Lazy tab content | `TabContent.tsx:13-21` | Panel loading in IDELayout |
| ProcessRegistry | `src-tauri/src/process/registry.rs` | `src-tauri/src/claude/` |

**Architecture lessons**:
- SQLite (via `rusqlite`) for structured data (agents, settings) is cleaner than our JSON workspace files for data that gets queried/filtered. Consider for agent persistence.
- Their web server mode (Axum) is interesting for "access your IDE from phone" but low priority.
- Their simple tab-based layout works for a chat client but would be a regression for an IDE.

---

### 2. Companion (Best protocol understanding)

**What they do better**:
- **`--sdk-url` WebSocket protocol** -- the gold standard. They reverse-engineered the undocumented `--sdk-url ws://` flag that makes Claude Code CLI act as a WebSocket client connecting to YOUR server. This is fundamentally superior to our `--output-format stream-json` stdout pipe approach because:
  - Bidirectional control without PTY hacking
  - Clean session management (CLI reconnects to your server on crash)
  - Permission control via `control_request`/`control_response` messages
  - Model switching mid-conversation via `control_request` with `set_model` subtype
  - Uses the Claude Code subscription (no API billing)
- **Full protocol type definitions** -- `session-types.ts` has complete TypeScript types for every CLI message type: `CLISystemInitMessage`, `CLIAssistantMessage`, `CLIResultMessage`, `CLIStreamEventMessage`, `CLIControlRequestMessage`, `CLIToolProgressMessage`, `CLIToolUseSummaryMessage`, `CLICompactBoundaryMessage`, `CLIHookStartedMessage`, `CLIHookProgressMessage`, `CLIHookResponseMessage`. This is the most complete protocol reference in any project.
- **Session state machine** -- formal `SessionPhase` type with validated transitions: `starting -> initializing -> ready -> streaming -> awaiting_permission -> compacting -> reconnecting -> terminated`. Invalid transitions are blocked with warnings. This prevents the chaotic state bugs we've had.
- **Session orchestration** -- `SessionOrchestrator` manages the full lifecycle: session creation with worktree/branch/container options, CLI relaunch with backoff on crash, reconnection grace periods, auto-naming, git info enrichment, Linear issue integration.
- **Protocol recording** -- automatically records ALL raw protocol messages to JSONL files at `~/.companion/recordings/`. Invaluable for debugging, protocol drift detection, and replay-based testing. Can be enabled/disabled per session.
- **WsBridge decomposition** -- the 54KB `ws-bridge.ts` is split into focused modules: `ws-bridge-browser-ingest.ts`, `ws-bridge-cli-ingest.ts`, `ws-bridge-persist.ts`, `ws-bridge-publish.ts`, `ws-bridge-replay.ts`, `ws-bridge-controls.ts`. Each under 4KB. Clean separation of concerns.
- **Container support** -- can run Claude Code sessions inside Docker containers with port forwarding, volume mounts, and workspace isolation. Enables secure sandboxing.
- **Dual-provider support** -- works with both Claude Code and OpenAI Codex CLIs. Provider-specific adapters (`claude-adapter.ts` at 28KB, `codex-adapter.ts` at 122KB) handle protocol differences.
- **AI validation of permissions** -- `ai-validator.ts` can automatically approve/deny tool permissions based on configurable rules, with an AI-based validation layer.
- **Metrics collector** -- structured metrics for session health, message latency, error rates.
- **Massive test coverage** -- `ws-bridge.test.ts` alone is 178KB. Tests for every server module. Pre-commit hooks enforce typecheck + tests.
- **Component playground** -- mandatory for all message-related UI components. Accessible at `#/playground`.

**What they do worse**:
- **No desktop native features** -- web-only (Bun + Hono). No file explorer, no editor, no native terminal, no OS integration.
- **No Monaco editor** -- no code editing capability.
- **Bun-only** -- requires Bun runtime, doesn't work with Node.js.
- **No offline support** -- requires running server.
- **No theming** -- basic dark mode only.

**Code worth copying**:
| Feature | Source file | Adaptation target |
|---------|-----------|-------------------|
| Protocol types (ALL CLI messages) | `web/server/session-types.ts` | `src/lib/protocol.ts` |
| Session state machine | `web/server/session-state-machine.ts` | `src/stores/conversationStore.ts` |
| WebSocket protocol doc | `WEBSOCKET_PROTOCOL_REVERSED.md` | Reference for --sdk-url migration |
| Protocol recording | `web/server/recorder.ts` | New `src-tauri/src/claude/recorder.rs` |
| AI permission validation | `web/server/ai-validator.ts` | `src/components/permissions/` |
| Session orchestrator pattern | `web/server/session-orchestrator.ts` | `src-tauri/src/claude/` |
| Metrics collector | `web/server/metrics-collector.ts` | New `src/lib/metrics.ts` |

**Architecture lessons**:
- **The `--sdk-url` approach is the future.** Companion proved that using the undocumented WebSocket protocol gives cleaner bidirectional control than stdout parsing. Vantage 2.0 should migrate from `--output-format stream-json` to `--sdk-url` with a Rust-side WebSocket server. This unlocks: clean reconnection, mid-conversation model switching, proper permission flow, session resumption without re-parsing, and compatibility with whatever transport the official SDK eventually standardizes on.
- **Session state machines prevent bugs.** Our conversation store tracks state as a bag of booleans (`isStreaming`, `isWaiting`, etc.) which can get out of sync. A formal state machine with validated transitions is more reliable.
- **Protocol recordings are gold for debugging.** We should record all Claude communication to files, toggled per session. Makes it possible to replay exact sequences for bug reproduction.
- **The bridge decomposition pattern works.** Splitting a large bridge module into focused sub-modules (ingest, persist, publish, replay, controls) keeps each piece testable and readable.

---

### 3. Kanna (Event sourcing architecture)

**What they do better**:
- **Event sourcing for ALL state mutations** -- every change is an event appended to a JSONL log. State is derived by replaying events. This gives:
  - Full audit trail of everything that happened
  - Time-travel debugging (replay to any point)
  - Crash recovery (replay from last snapshot + event log)
  - No data corruption from partial writes
- **CQRS (Command Query Responsibility Segregation)** -- separate write path (event logs) from read path (derived snapshots/views). `read-models.ts` derives `SidebarData`, `ChatSnapshot`, `LocalProjectsSnapshot` from the raw event store. This means the UI always reads from optimized views, never directly from the event log.
- **Snapshot compaction** -- when event logs exceed 2MB, the store compacts: writes a full snapshot, truncates logs. Prevents unbounded log growth while preserving history.
- **Multi-provider agent coordination** -- `AgentCoordinator` manages both Claude (via SDK) and Codex (via app server) with per-provider model/effort normalization. The `ProviderCatalog` pattern cleanly abstracts provider differences.
- **Reactive WebSocket broadcasting** -- `ws-router.ts` implements a subscription model where clients subscribe to topics (sidebar, chat, keybindings, update) and get pushed fresh snapshots on every state change. No polling.
- **Per-chat transcript isolation** -- transcripts stored in individual files under `transcripts/{chatId}.jsonl`. Prevents a single large file from becoming a bottleneck.
- **Plan mode with tool gating** -- user reviews and approves agent plans before execution. Tool requests that need approval (ask_user_question, exit_plan_mode) block until resolved.
- **Auto-generated titles** -- background title generation via Claude Haiku with Codex fallback. Separate from the main conversation flow.
- **Public share links** via Cloudflare tunnel (`--share` flag). One command to get a public URL with QR code.

**What they do worse**:
- **No desktop app** -- web-only, requires Bun server running.
- **No file editing** -- chat interface only.
- **No terminal** -- embedded terminal uses Bun native PTY (macOS/Linux only).
- **No search** -- no project-wide search capability.
- **Simpler git integration** -- basic project discovery from Claude/Codex history.
- **No theming** beyond dark/light.

**Code worth copying**:
| Feature | Source file | Adaptation target |
|---------|-----------|-------------------|
| Event sourcing pattern | `src/server/event-store.ts` | Consider for conversation persistence |
| CQRS read models | `src/server/read-models.ts` | Derived views for sidebar/dashboard |
| Snapshot compaction | `event-store.ts:64-88` | Workspace persistence optimization |
| Provider catalog normalization | `src/server/provider-catalog.ts` | Future multi-provider support |
| Reactive subscription model | `src/server/ws-router.ts` | Tauri event system improvement |
| Agent coordinator | `src/server/agent.ts` | Multi-agent session management |

**Architecture lessons**:
- **Event sourcing prevents data loss.** Our JSON workspace files can corrupt on crash. An append-only event log with periodic snapshots is more resilient. Consider adopting this for conversation history at minimum.
- **CQRS keeps the UI fast.** Deriving optimized read models (sidebar data, chat snapshots) from raw state means the UI never does expensive transformations at render time. We do some of this with Zustand selectors but could be more systematic.
- **The provider catalog pattern is prescient.** If we ever support non-Claude providers (Codex, local models), Kanna's clean abstraction with per-provider model options, effort normalization, and service tier selection is the pattern to follow.

---

### 4. Claude DevTools (Session log inspector)

**What they do better**:
- **Context reconstruction** -- the killer feature. They reverse-engineer what's actually in Claude's context window, tracking 6 categories of token attribution: CLAUDE.md files, @-mentioned files, tool outputs, thinking text, team coordination, user messages. Per-turn breakdown with percentages. This is information Claude Code hides that users desperately want.
- **Compaction visualization** -- detects when Claude Code hits its context limit and silently compresses the conversation. Shows the token delta before/after, how context fills/compresses/refills over time. No other tool does this.
- **Rich tool call inspector** -- every tool call paired with its result in expandable cards. Specialized viewers: Read shows syntax-highlighted code, Edit shows inline diffs, Bash shows command output, Subagent shows full execution tree.
- **Chunk-based timeline** -- groups messages into UserChunks, AIChunks, SystemChunks, CompactChunks. Each chunk has timestamp, duration, metrics (tokens, cost, tools). This is better than our flat message list for understanding session flow.
- **Team/subagent visualization** -- untangles Claude Code's team orchestration (TeamCreate, SendMessage, TaskUpdate, TaskList, TeamDelete) into visual cards with color-coded teammates, nested subagent trees, and shutdown lifecycle tracking.
- **Custom notification triggers** -- regex-based rules that fire system notifications. Built-in defaults for `.env` file access, tool errors, high token usage. User can add custom patterns matching file_path, command, content, etc.
- **SSH remote sessions** -- connect to remote machines over SSH, inspect Claude Code sessions running there. Parses `~/.ssh/config`, supports key/password auth. Each host gets isolated caches.
- **Multi-pane layout** with drag-and-drop tabs between panes. Split views for comparing sessions side-by-side.
- **Cross-session search** -- Cmd+K command palette searches across all sessions in a project with context snippets and highlighted keywords.
- **Adaptive refresh debounce** -- long sessions (500+ AI groups) refresh less frequently (30-60s) to reduce memory churn. Short sessions refresh every 150ms. This is smart performance optimization.
- **16 Zustand store slices** -- extremely well-organized state: project, repository, session, sessionDetail, subagent, conversation, tab, tabUI, pane, ui, notification, config, connection, context, update. Per-tab UI isolation.

**What they do worse**:
- **Read-only** -- cannot interact with Claude Code at all. Only inspects past session logs. No chat, no prompting, no permissions.
- **No code editing** -- purely an inspector tool.
- **No terminal** -- no ability to run commands.
- **Electron (not Tauri)** -- heavier runtime, larger binary.
- **Zustand 4** (not 5) -- slightly older patterns.

**Code worth copying**:
| Feature | Source file | Adaptation target |
|---------|-----------|-------------------|
| Context injection tracking types | `src/renderer/types/contextInjection.ts` | New `src/lib/contextTracking.ts` |
| Context tracker implementation | `src/renderer/utils/contextTracker.ts` | New context panel in chat |
| Chunk builder (timeline grouping) | `src/main/services/analysis/ChunkBuilder.ts` | Chat message grouping |
| Tool linking engine | `src/renderer/utils/toolLinkingEngine.ts` | Tool call/result pairing |
| Notification trigger system | `src/renderer/store/slices/notificationSlice.ts` | Notification center enhancement |
| Adaptive refresh debounce | `src/renderer/store/index.ts:85-100` | File watcher / session refresh |
| Per-tab UI isolation | `src/renderer/store/slices/tabUISlice.ts` | Editor tab state management |
| CLAUDE.md injection tracker | `src/renderer/utils/claudeMdTracker.ts` | Context awareness feature |

**Architecture lessons**:
- **The "inspector not wrapper" philosophy has merit for debugging.** We should have a debug mode that shows the same level of detail as claude-devtools: raw protocol messages, context composition, compaction events, token attribution per turn.
- **Chunk-based grouping is better than flat messages.** Grouping assistant responses with their tool calls into chunks makes the conversation far more navigable. Our flat MessageBubble list should evolve toward this.
- **Per-tab UI isolation is essential.** Their `tabUISlice` maintains independent expansion state, scroll position, etc. per tab. We need this for editor tabs -- expanding a diff in one tab shouldn't affect another.
- **Adaptive debounce prevents performance cliffs.** Using AI group count to determine refresh frequency is smart. We should adopt similar adaptive strategies for file watching and session updates.

---

### 5. CodePilot (Multi-provider, most feature-rich)

**What they do better**:
- **17+ AI provider support** -- Anthropic, OpenRouter, AWS Bedrock, Google Vertex, Zhipu GLM, Kimi, Moonshot, MiniMax, Volcengine, Xiaomi MiMo, Aliyun Bailian, Ollama, LiteLLM, custom endpoints. Model switching mid-conversation. Per-provider configuration with API keys.
- **Claude Agent SDK integration** -- uses the official `@anthropic-ai/claude-agent-sdk` `query()` function directly instead of shelling out to the CLI. This gives structured typed messages, clean error handling, and programmatic control.
- **SQLite with WAL mode** -- `better-sqlite3` with WAL journal mode, busy timeout, foreign keys. 12 tables for sessions, messages, settings, tasks, providers, media, jobs, channels. File-based migration lock for concurrent workers. This is production-grade persistence vs our JSON files.
- **Error classifier** -- 18 structured error categories (`CLI_NOT_FOUND`, `NO_CREDENTIALS`, `AUTH_REJECTED`, `RATE_LIMITED`, `NETWORK_UNREACHABLE`, `MODEL_NOT_AVAILABLE`, `CONTEXT_TOO_LONG`, `PROCESS_CRASH`, etc.) with user-facing messages, action hints, and recovery actions. Sentry integration for reportable errors.
- **Provider doctor** -- diagnostic engine with 5 probes that checks CLI presence, credentials, provider configuration, auth style, and session state. Produces structured findings with severity levels and repair actions.
- **IM Bridge system** -- Telegram, Feishu, Discord, QQ, WeChat integration. Send messages from your phone, get responses on desktop. Permission requests become inline buttons in Telegram. Message chunking and rate limiting for IM delivery.
- **Generative UI** -- AI can create interactive dashboards, charts, and visual widgets rendered live in-app. The `artifact.tsx` component system provides structured rendering.
- **Task scheduler** -- cron-based and interval scheduling with persistence. Run recurring tasks automatically.
- **Internationalization** -- full i18n with English + Chinese. Every string is translatable.
- **Stream session manager** -- client-side singleton that survives React component lifecycle changes. When user switches sessions, the stream continues running. Uses `globalThis` to survive Next.js HMR.
- **Assistant workspace** -- persona files (`soul.md`, `user.md`, `claude.md`, `memory.md`), onboarding flows, daily check-ins. The AI learns user preferences over time.
- **Runtime log** -- console ring buffer (200 entries, auto-sanitized) for debugging.

**What they do worse**:
- **Electron (not Tauri)** -- heavier, larger binary, more memory usage.
- **Next.js overhead** -- App Router adds complexity for a desktop app. SSR is unnecessary.
- **No Rust backend** -- all business logic in Node.js/TypeScript. Slower for file operations and search.
- **Chinese-primary documentation** -- ARCHITECTURE.md, CLAUDE.md, and most docs are in Chinese. Limits international contributor accessibility.
- **Complex build** -- needs `after-pack.js` to recompile `better-sqlite3` for Electron ABI.
- **BSL-1.1 license** -- not truly open source (Business Source License).

**Code worth copying**:
| Feature | Source file | Adaptation target |
|---------|-----------|-------------------|
| Error classifier pattern | `src/lib/error-classifier.ts` | New `src/lib/errorClassifier.ts` |
| Provider doctor pattern | `src/lib/provider-doctor.ts` | Prerequisites/diagnostics enhancement |
| Stream session manager | `src/lib/stream-session-manager.ts` | Conversation store resilience |
| Env sanitization for spawn | `src/lib/claude-client.ts:37-55` | `src-tauri/src/claude/` |
| .cmd wrapper resolution (Windows) | `src/lib/claude-client.ts:62-90` | `src-tauri/src/prerequisites.rs` |
| DB migration with file lock | `src/lib/db.ts:17-49` | If we adopt SQLite |
| Artifact component system | `src/components/ai-elements/artifact.tsx` | Chat code block rendering |

**Architecture lessons**:
- **SQLite is the right persistence layer.** Both opcode and codepilot use SQLite for structured data. Our JSON workspace files are fragile, can't be queried efficiently, and don't support concurrent access. Migrate agent state, conversation history, and settings to SQLite.
- **An error classifier makes the app feel professional.** Instead of showing raw error messages, classifying them into categories with user-facing messages and recovery actions makes the app feel polished and trustworthy.
- **The provider doctor pattern is UX gold.** First-launch diagnostics that check CLI presence, credentials, and configuration -- with severity levels and one-click repair actions -- eliminates 90% of "it doesn't work" support requests.
- **Stream managers must outlive components.** CodePilot's `globalThis` pattern for stream session management ensures streams survive React unmounting. We should ensure our Claude process communication doesn't get interrupted by component lifecycle changes.

---

### 6. Clauductor (Execution map visualization)

**What they do better**:
- **Work map visualization** -- the standout feature. Uses `@vue-flow/core` (a flow diagram library) to visualize Claude's work as a real-time node graph. Each tool call becomes a node (Edit, Read, Write, Bash, WebSearch) with typed node components, connected by edges showing execution flow. Three layout modes:
  - **Snake**: snaking grid layout (default)
  - **Radial**: Archimedean spiral from center
  - **Linear**: vertical timeline
- **Single binary** -- Go backend compiles to one executable. No runtime dependencies. `make build` produces a self-contained binary for any platform.
- **Built-in MCP server** -- ships as both a web app AND an MCP server. When run with `--mcp`, it becomes a tool that Claude Code can call for approval prompts. This means Claude Code can delegate permission decisions to the Clauductor UI.
- **Environment profiles** -- CRUD for named environment variable profiles stored at `~/.clauductor/profiles.json`. Switch between profiles per session.
- **Session management** with concurrent sessions, process tracking, and clean lifecycle.

**What they do worse**:
- **Vue/Nuxt (not React)** -- different ecosystem, components can't be directly reused.
- **Go backend (not Rust)** -- different language, code can't be directly adapted.
- **No code editing** -- chat + work map only.
- **No file explorer** -- no project browsing.
- **No search** -- no project-wide search.
- **No git integration** -- no version control features.
- **Basic UI** -- Nuxt UI components, less polished than shadcn/ui.
- **No testing visible** -- only 1 test file (`sessions_test.go`).

**Code worth copying**:
| Feature | Source (concept) | Adaptation target |
|---------|-----------------|-------------------|
| Work map / execution flow visualization | `app/components/WorkMap.vue` + `app/composables/useWorkGraph.ts` | New execution map panel |
| Node type components (Edit, Read, Write, Bash) | `app/components/nodes/` | Tool call visualization |
| Snake/Radial/Linear layout algorithms | `useWorkGraph.ts:42-100` | Execution map layout options |
| MCP server mode | `backend/mcp.go` | Consider for permission bridge |
| Environment profiles | `backend/handler.go:51-97` | Settings enhancement |

**Architecture lessons**:
- **Execution visualization is a differentiator.** No other tool makes Claude's work visible as a graph. This is the kind of feature that makes people say "I can't go back." We should build this -- using `@xyflow/react` (the React port of the same library) instead of vue-flow.
- **MCP server for permission bridging is clever.** Instead of wrapping Claude Code, running alongside it and receiving permission requests via MCP is a lighter-weight integration path. Could be useful for cases where Vantage wants to observe sessions started outside the app.
- **Single-binary deployment is user-friendly.** While Tauri gives us this for the desktop app, we should ensure our build process produces clean, self-contained installers.

---

## Part 2: The Vantage 2.0 Evolution Plan

### COPY -- Specific features to port from reference projects

#### Tier 1: Port immediately (high impact, low risk)

1. **Virtual scrolling for chat messages** (from opcode)
   - Add `@tanstack/react-virtual` to ChatPanel
   - Source: opcode `ClaudeCodeSession.tsx:263-268`
   - Target: `src/components/chat/ChatPanel.tsx`
   - Why: Long conversations currently choke the UI. This is a performance cliff.

2. **Prompt queuing** (from opcode)
   - Queue messages when Claude is streaming, auto-send when done
   - Source: opcode `ClaudeCodeSession.tsx:498-507`
   - Target: `src/stores/conversationStore.ts`
   - Why: Users naturally want to type the next thing while waiting.

3. **Two-phase event listeners** (from opcode)
   - Generic listener catches init, then switch to scoped listeners
   - Source: opcode `ClaudeCodeSession.tsx:529-602`
   - Target: `src/hooks/useClaude.ts`
   - Why: Fixes our session ID race condition.

4. **JSONL deduplication + costUSD fallback** (from opcode)
   - Composite hash for dedup, prefer stream costUSD over manual calc
   - Source: opcode `usage.rs:170-199`
   - Target: `src-tauri/src/analytics.rs`
   - Why: More accurate usage tracking with less double-counting.

5. **Error classifier** (from codepilot)
   - 18 categories with user messages, action hints, recovery actions
   - Source pattern: codepilot `src/lib/error-classifier.ts`
   - Target: New `src/lib/errorClassifier.ts`
   - Why: Raw error messages make the app feel broken. Classified errors feel professional.

6. **Multi-method process cancellation** (from opcode)
   - Registry kill -> process state kill -> OS kill fallback
   - Source: opcode `claude.rs:1018-1149`
   - Target: `src-tauri/src/claude/`
   - Why: Our single-kill approach sometimes fails, leaving zombie processes.

7. **Lazy panel loading** (from opcode)
   - `React.lazy()` for heavy panels (usage dashboard, agent kanban, etc.)
   - Source pattern: opcode `TabContent.tsx:13-21`
   - Target: `src/components/layout/IDELayout.tsx`
   - Why: Reduces initial load time and memory footprint.

#### Tier 2: Build next (medium complexity, high value)

8. **Session state machine** (from companion)
   - Formal phases with validated transitions
   - Source: companion `web/server/session-state-machine.ts`
   - Target: New `src/lib/sessionStateMachine.ts` + integrate into conversation store
   - Why: Prevents state bugs. Our boolean flags get out of sync.

9. **Context tracking / token attribution** (from claude-devtools)
   - Track what consumes tokens: CLAUDE.md, @-mentions, tool outputs, thinking, user messages
   - Source: claude-devtools `src/renderer/types/contextInjection.ts` + `src/renderer/utils/contextTracker.ts`
   - Target: New context panel in chat sidebar
   - Why: Users need to understand why context ran out. This is the #1 pain point with Claude Code.

10. **Chunk-based message grouping** (from claude-devtools)
    - Group user message + assistant response + tool calls into chunks
    - Source: claude-devtools ChunkBuilder pattern
    - Target: `src/components/chat/` message rendering
    - Why: Flat message lists are hard to navigate. Chunks make conversation structure visible.

11. **Rich tool call rendering** (from claude-devtools)
    - Specialized viewers: Read shows highlighted code, Edit shows diffs, Bash shows output
    - Source: claude-devtools `src/renderer/components/chat/` viewers
    - Target: `src/components/chat/ToolCallCard.tsx`
    - Why: Our current ToolCallCard is basic. Rich rendering makes tool calls actually useful.

12. **Provider doctor / diagnostics** (from codepilot)
    - First-launch health checks with severity levels and repair actions
    - Source pattern: codepilot `src/lib/provider-doctor.ts`
    - Target: `src/components/shared/PrerequisiteCheck.tsx` enhancement
    - Why: Eliminates "it doesn't work" confusion on first launch.

13. **Notification triggers** (from claude-devtools)
    - Regex-based rules for system notifications on events
    - Source: claude-devtools notification system
    - Target: `src/components/shared/NotificationCenter.tsx`
    - Why: Users want to know when Claude reads `.env`, when errors happen, when costs spike.

14. **Protocol recording** (from companion)
    - Record all Claude protocol messages to JSONL files
    - Source: companion `web/server/recorder.ts`
    - Target: New `src-tauri/src/claude/recorder.rs`
    - Why: Invaluable for debugging, protocol drift detection, and replay testing.

#### Tier 3: Build later (high complexity, transformative)

15. **Migrate to `--sdk-url` WebSocket protocol** (from companion)
    - Rust-side WebSocket server, Claude CLI connects as client
    - Source: companion `WEBSOCKET_PROTOCOL_REVERSED.md` + `ws-bridge.ts`
    - Target: Complete rewrite of `src-tauri/src/claude/`
    - Why: Clean bidirectional control, reconnection, model switching, permission flow. This is the architectural foundation for Vantage 2.0. Highest effort but highest reward.

16. **Execution map visualization** (from clauductor)
    - Real-time flow diagram of Claude's work using `@xyflow/react`
    - Source concept: clauductor `app/components/WorkMap.vue` + `useWorkGraph.ts`
    - Target: New `src/components/chat/ExecutionMap.tsx`
    - Why: Unique differentiator. No other IDE shows Claude's work as a visual graph.

17. **SQLite persistence** (from opcode, codepilot)
    - Replace JSON workspace files with SQLite for structured data
    - Source pattern: codepilot `src/lib/db.ts`, opcode `rusqlite` usage
    - Target: New `src-tauri/src/database.rs` using `rusqlite` with `bundled` feature
    - Why: Queryable, concurrent-safe, crash-resilient. Fixes our workspace corruption issues.

18. **Event sourcing for conversation history** (from kanna)
    - Append-only event logs with snapshot compaction
    - Source: kanna `src/server/event-store.ts` + `src/server/events.ts`
    - Target: Conversation persistence layer
    - Why: Crash recovery, audit trail, time-travel debugging. Combined with SQLite.

19. **Compaction visualization** (from claude-devtools)
    - Show when and how context compaction happened
    - Source: claude-devtools compaction detection
    - Target: Chat timeline / context panel
    - Why: Context compaction is invisible but critical. Making it visible helps users understand session behavior.

---

### REDESIGN -- What to rethink based on their lessons

1. **Claude communication layer** (learn from companion)
   - **Current**: Spawn `claude` CLI with `--output-format stream-json`, parse stdout line by line
   - **Target**: Spawn `claude --sdk-url ws://localhost:{port}/ws/cli/{session}`, run a WebSocket server in Rust, bridge messages bidirectionally
   - **Why**: stdout parsing is fragile. WebSocket gives us clean reconnection, model switching, permission flow, and compatibility with the SDK protocol

2. **Workspace persistence** (learn from codepilot, kanna)
   - **Current**: JSON files at `~/.vantage/workspaces/{base64url-path}.json` with 2-second debounce
   - **Target**: SQLite database at `~/.vantage/vantage.db` with event-sourced conversation history and WAL mode
   - **Why**: JSON files corrupt on crash, can't be queried, don't support concurrent access. SQLite with event sourcing gives us crash recovery and queryable history.

3. **Message rendering** (learn from claude-devtools)
   - **Current**: Flat list of MessageBubble components
   - **Target**: Chunk-based grouping (UserChunk + AIChunk with embedded tool calls), virtual scrolling, collapsible tool groups
   - **Why**: Long conversations are unnavigable. Chunks make structure visible, virtual scrolling makes them performant.

4. **Session management** (learn from companion)
   - **Current**: Ad-hoc state tracking with boolean flags
   - **Target**: Formal state machine with validated transitions, process registry for multiple concurrent sessions
   - **Why**: Boolean flags get out of sync. State machines prevent impossible states.

5. **Error handling** (learn from codepilot)
   - **Current**: Raw error messages from CLI
   - **Target**: Classified errors with user-facing messages, recovery actions, diagnostics
   - **Why**: "exited with code 1" tells users nothing. "Claude Code CLI not found. Install it with `npm install -g @anthropic-ai/claude-code`" tells them exactly what to do.

6. **Permission UX** (learn from companion, clauductor)
   - **Current**: Permission dialog with risk-level color coding
   - **Target**: Keep our dialog but add: auto-approval rules (configurable per tool/path), AI-assisted validation, permission history/audit log
   - **Why**: Companion's AI validator and clauductor's MCP-based approval show that permissions can be smarter than binary allow/deny.

---

### ADD -- Features none of them have (Vantage differentiators)

1. **Integrated IDE + Chat + Inspector in one window**
   - None of the reference projects combine a full Monaco editor, terminal, file explorer, AND Claude chat with tool inspection in a single native window. opcode has chat but no editor. claude-devtools has inspection but no interaction. codepilot has chat but no real editor. Vantage already does this -- we just need to do it better.

2. **Cross-file TypeScript intelligence with Claude awareness**
   - No reference project provides Monaco-level code intelligence that's aware of what Claude changed. We should show: "Claude modified this function 3 turns ago" inline in the editor, with one-click jump to the conversation turn.

3. **Git worktree isolation per agent with visual conflict detection**
   - Our multi-agent system with worktree isolation is unique. No reference project has this. Enhance it with visual file ownership indicators and merge conflict prediction.

4. **Execution map + code editor split**
   - clauductor has the execution map. We have the editor. Combine them: split view where the left pane shows the execution graph and clicking a node opens the affected file at the relevant line in the right pane.

5. **Context budget planner**
   - claude-devtools shows what consumed context after the fact. We should show it BEFORE: "Your next message + these 3 open files will use ~45K tokens, leaving 155K for Claude's response." Proactive context management.

6. **Session diff view**
   - No project shows a unified diff of ALL files Claude changed in a session. We should: "Claude modified 12 files in this session. Here's a unified diff view with accept/reject per file." Like a code review of Claude's work.

7. **Intelligent session resumption**
   - Show session history with: what was the goal, what was accomplished, what was left incomplete, estimated context cost to resume. Help users decide whether to resume or start fresh.

8. **Cost projection**
   - "At your current rate, this session will cost ~$X by the end." Real-time cost projection based on token velocity.

---

### REMOVE -- What we built badly and should cut or rebuild

1. **The Tauri mock layer as a testing strategy**
   - The mock layer hides IPC mismatches (our own CLAUDE.md warns about this). Tests passing against mocks give false confidence. Replace with: (a) integration tests that run against real Tauri, (b) protocol replay tests using recorded sessions (like companion's recorder).

2. **Overcomplicated multi-agent Kanban**
   - The Kanban board with coordinator/specialist/verifier roles is overengineered for the current state of Claude's multi-agent capabilities. Simplify to: agent list with status indicators, worktree isolation, and a merge button. Rebuild the full Kanban when Claude's team orchestration is more mature.

3. **Excessive store count**
   - 8+ workspace-scoped stores is too many. Consolidate: editor + conversation + layout can share a single workspace store with domain slices (like claude-devtools' 16-slice single store). Fewer stores = fewer subscription bugs.

4. **Custom resizable panel implementation concerns**
   - If `react-resizable-panels v4.9` API issues are causing bugs (as noted in CLAUDE.md gotchas), consider switching to a simpler CSS Grid-based layout for the main panels, reserving the library for editor splits only.

5. **DevPanel in production builds**
   - DevPanel should be completely tree-shaken from production builds, not just hidden. Verify this is happening.

---

### PRIORITY ORDER

**Phase 1: Performance & Reliability (Week 1-2)**
- [x] Virtual scrolling for chat (item 1)
- [x] Multi-method process cancellation (item 6)
- [x] Lazy panel loading (item 7)
- [x] JSONL deduplication + costUSD fallback (item 4)
- [x] Two-phase event listeners (item 3)

**Phase 2: UX Polish (Week 3-4)**
- [x] Prompt queuing (item 2)
- [x] Error classifier (item 5)
- [x] Session state machine (item 8)
- [x] Provider doctor / diagnostics (item 12)
- [x] Rich tool call rendering (item 11)

**Phase 3: Intelligence (Week 5-7)**
- [x] Context tracking / token attribution (item 9)
- [x] Chunk-based message grouping (item 10)
- [x] Notification triggers (item 13)
- [x] Protocol recording (item 14)
- [x] Compaction visualization (item 19)

**Phase 4: Foundation (Week 8-12)**
- [x] SQLite persistence migration (item 17)
- [x] Migrate to `--sdk-url` WebSocket protocol (item 15)
- [x] Event sourcing for conversations (item 18)

**Phase 5: Differentiation (Week 13-16)**
- [x] Execution map visualization (item 16)
- [x] Context budget planner (ADD item 5)
- [x] Session diff view (ADD item 6)
- [x] Cost projection (ADD item 8)

---

## Part 3: Architecture Decision Records

### ADR-001: Migrate from stdout parsing to --sdk-url WebSocket

**Status**: Proposed
**Context**: Companion proved that `--sdk-url` WebSocket gives cleaner bidirectional control than stdout parsing. The protocol is NDJSON over WebSocket -- same format, different transport.
**Decision**: Add a Rust-side WebSocket server (using `tokio-tungstenite`) that Claude CLI connects to. This runs alongside (not replacing) our current stdout approach during migration.
**Consequences**: Enables reconnection, model switching, clean permission flow. Requires maintaining two communication paths during transition. The `WEBSOCKET_PROTOCOL_REVERSED.md` from companion is our protocol reference.

### ADR-002: Adopt SQLite for structured persistence

**Status**: Proposed
**Context**: Both opcode (rusqlite) and codepilot (better-sqlite3) use SQLite for structured data. Our JSON workspace files corrupt on crash and can't be queried.
**Decision**: Add `rusqlite` with `bundled` feature to the Tauri backend. Migrate agent state, settings, and conversation metadata to SQLite. Keep file-based persistence for large blobs (editor content, terminal state).
**Consequences**: Better crash recovery, queryable data, concurrent-safe. Adds ~1.5MB to binary size (SQLite bundled). Migration path needed for existing JSON workspace files.

### ADR-003: Adopt virtual scrolling for all long lists

**Status**: Proposed
**Context**: opcode and claude-devtools both use `@tanstack/react-virtual`. Our chat panel, file explorer, and search results will all choke on large datasets.
**Decision**: Add `@tanstack/react-virtual` and apply to: chat message list, file explorer tree, search results, session list.
**Consequences**: Constant memory usage regardless of list length. Requires estimating item heights (or using dynamic measurement). Some complexity in scroll-to-message functionality.

---

## Appendix: Feature Matrix

| Feature | Vantage | opcode | companion | kanna | devtools | codepilot | clauductor |
|---------|---------|--------|-----------|-------|----------|-----------|------------|
| Desktop native (Tauri) | Y | Y | - | - | Electron | Electron | - |
| Monaco editor | Y | - | - | - | - | - | - |
| Terminal (PTY) | Y | - | - | Bun PTY | - | - | - |
| File explorer | Y | basic | - | - | - | basic | - |
| Git integration | Y | - | Y | basic | - | Y | - |
| Project search | Y | - | - | - | basic | - | - |
| Multi-agent | Y | SQLite | - | - | - | - | - |
| Worktree isolation | Y | - | Y | - | - | - | - |
| Permission dialogs | Y | - | Y | Y | - | Y | MCP |
| Usage dashboard | Y | Y | - | - | - | Y | - |
| Virtual scrolling | - | Y | - | - | Y | - | - |
| Context tracking | - | - | - | - | Y | - | - |
| Compaction viz | - | - | - | - | Y | - | - |
| Execution map | - | - | - | - | - | - | Y |
| --sdk-url protocol | - | - | Y | Y | - | - | - |
| WebSocket bridge | - | web | Y | Y | - | - | Y |
| Event sourcing | - | - | - | Y | - | - | - |
| SQLite persistence | - | Y | - | - | - | Y | - |
| Multi-provider | - | - | Y | Y | - | Y | - |
| Error classification | - | - | - | - | - | Y | - |
| Provider diagnostics | - | - | - | - | - | Y | - |
| Session recording | - | - | Y | - | - | - | - |
| Container support | - | - | Y | - | - | - | - |
| IM bridge | - | - | - | - | - | Y | - |
| SSH remote | - | - | - | - | Y | - | - |
| Notification triggers | - | - | - | - | Y | - | - |
| Prompt queuing | - | Y | - | - | - | - | - |
| i18n | - | - | - | - | - | Y | - |
| Testing (frontend) | 362 | 0 | Y | Y | Y | Y | 0 |
| Testing (backend) | 76 | 0 | Y | Y | Y | Y | 1 |
| Security hardening | Y | - | Y | - | - | - | - |

**Key insight**: Vantage is the ONLY project that combines a full IDE (editor + terminal + file explorer + search + git) with Claude Code integration. Every other project is either a chat client (opcode, companion, kanna, clauductor) or an inspector (claude-devtools). CodePilot comes closest but lacks a real code editor. Our competitive advantage is the integrated experience -- we just need to bring the intelligence features (context tracking, execution visualization, error classification) up to the level of the specialized tools.

---

*This document is the roadmap. Execute it phase by phase. After each phase, stop and verify with `npm run tauri dev` before proceeding.*
