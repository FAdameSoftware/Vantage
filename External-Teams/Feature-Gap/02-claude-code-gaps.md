# Gap Analysis: Vantage vs Claude Code CLI + Desktop App

## SEVERITY LEGEND
- **BLOCKER** - Core Claude Code functionality users depend on. Can't switch without it.
- **CRITICAL** - Frequently used features. Users will constantly reach for CLI instead.
- **MAJOR** - Important features that affect daily workflow.
- **MINOR** - Nice to have. Power-user or niche features.

---

## 1. SLASH COMMANDS (CRITICAL - 25% coverage)

Claude Code CLI has 60+ slash commands. Vantage exposes ~17 of them.

### Commands Vantage Has (17)

/btw, /bug, /clear, /compact, /config, /cost, /doctor, /help, /init, /interview, /login, /logout, /memory, /model, /permissions, /review, /status, /vim

### Critical Missing Commands (must-have)

| Command | Purpose | Why Critical |
|---------|---------|-------------|
| `/branch` / `/fork` | Fork conversation at current point | Core workflow: explore alternatives without losing progress |
| `/rewind` / `/checkpoint` | Rewind conversation AND code to previous point | Core workflow: undo Claude mistakes |
| `/resume` / `/continue` | Resume session by ID/name (interactive picker) | SessionSelector exists but basic |
| `/fast` | Toggle fast mode (2.5x speed) | Daily productivity |
| `/diff` | Interactive diff viewer for uncommitted changes | Core code review workflow |
| `/remote-control` | Bridge session to claude.ai/mobile | Multi-device workflow |
| `/tasks` / `/bashes` | List/manage background tasks | Essential for long-running operations |
| `/usage` | Show plan limits and rate status | Users need to know their limits |
| `/add-dir` | Add working directory for multi-folder access | Multi-project development |
| `/mcp` | Full MCP management (beyond current basic UI) | Extension ecosystem |
| `/export` | Export conversation as plain text | Documentation, sharing |
| `/context` | Visualize context usage as colored grid | Context management |

### Major Missing Commands

| Command | Purpose |
|---------|---------|
| `/agents` | Manage agent configurations |
| `/chrome` | Configure Chrome browser integration |
| `/copy` | Copy assistant response to clipboard |
| `/effort` | Set model effort level (has setting but no command) |
| `/hooks` | View hook configurations |
| `/insights` | Generate session analysis report |
| `/install-github-app` | Set up Claude GitHub Actions |
| `/keybindings` | Open keybindings config |
| `/plan` | Enter plan mode (has toggle but no command) |
| `/plugin` | Manage plugins (beyond current basic UI) |
| `/reload-plugins` | Reload active plugins |
| `/rename` | Rename current session |
| `/sandbox` | Toggle sandbox mode |
| `/schedule` | Create/manage cloud scheduled tasks |
| `/security-review` | Analyze changes for security vulnerabilities |
| `/skills` | List available skills |
| `/stats` | Visualize daily usage, sessions, streaks |
| `/ultraplan` | Draft plan in ultraplan session |
| `/voice` | Toggle push-to-talk voice dictation |

---

## 2. TOOLS EXPOSED (CRITICAL - 40% coverage)

Claude Code has 35+ built-in tools. Vantage passes messages to Claude but doesn't let users configure, invoke, or inspect most tools directly.

### Tool Exposure Status

| Tool | Used by Claude | User-configurable | UI for results | Status |
|------|---------------|-------------------|----------------|--------|
| Agent | Via agent panel | Via agent panel | Agent kanban/timeline | DONE |
| Bash | Yes | No config | ToolCallCard only | PARTIAL |
| Edit | Yes | No config | Diff review | DONE |
| Glob | Yes | No config | ToolCallCard only | PARTIAL |
| Grep | Yes | No config | ToolCallCard only | PARTIAL |
| Read | Yes | No config | ToolCallCard only | PARTIAL |
| Write | Yes | No config | Diff review | DONE |
| **LSP** | **Yes** | **Not exposed** | **None** | **MISSING** |
| AskUserQuestion | Not exposed | N/A | None | MISSING |
| CronCreate/Delete/List | Not exposed | N/A | None | MISSING |
| EnterWorktree/ExitWorktree | Via agents | Via agents | None | PARTIAL |
| ListMcpResourcesTool | Not exposed | N/A | None | MISSING |
| NotebookEdit | Not exposed | N/A | None | MISSING |
| ReadMcpResourceTool | Not exposed | N/A | None | MISSING |
| SendMessage | Not exposed | N/A | None | MISSING |
| Skill | Partial (commands) | No config | None | PARTIAL |
| TaskCreate/Get/List/Stop/Update | Not exposed | N/A | None | MISSING |
| TeamCreate/Delete | Not exposed | N/A | None | MISSING |
| TodoWrite | Not exposed | N/A | None | MISSING |
| ToolSearch | Not exposed | N/A | None | MISSING |
| WebFetch | Not exposed | N/A | None | MISSING |
| WebSearch | Not exposed | N/A | None | MISSING |

### The LSP Gap (Critical Missed Opportunity)

Claude Code CLI has a **built-in LSP tool** that provides:
- Go to definition
- Find references
- Get diagnostics (type errors, warnings)
- Symbol information

Vantage does NOT expose this tool to users. Even without building full LSP integration from scratch, Vantage could leverage Claude's existing LSP tool to provide basic code intelligence features through the UI.

---

## 3. SESSION MANAGEMENT (CRITICAL - 40% coverage)

### Comparison

| Feature | Claude Code | Vantage | Status |
|---------|------------|---------|--------|
| Start session | Full | Full | DONE |
| Send messages | Full | Full | DONE |
| Streaming responses | Full | Full | DONE |
| Stop/interrupt session | Full | Full | DONE |
| Resume last session (`-c`) | Full | SessionSelector (basic) | PARTIAL |
| Resume by ID/name (`-r`) | Full | SessionSelector (basic) | PARTIAL |
| Fork/branch session | `--fork-session`, `/branch` | None | MISSING |
| Named sessions | `--name` | None | MISSING |
| Export conversation | `/export` | None | MISSING |
| Conversation branching | Creates fork point | None | MISSING |
| Rewind/checkpoint | Rolls back code + conversation | Backend exists, no UI | MISSING |
| Session cost tracking | Per-session | Per-session | DONE |
| Multiple parallel sessions | Desktop supports | Main + agents | PARTIAL |
| Hand-off between devices | `/desktop`, `/remote-control` | None | MISSING |
| Session search | Full-text search | Backend exists, no UI | PARTIAL |
| Fast mode toggle | `/fast` | None | MISSING |

### Key Gap: Conversation Branching and Rewinding

Claude Code's `/rewind` and `/branch` are workflow-defining features:
- **Rewind**: Go back to any point and roll back all code changes to that point
- **Branch**: Fork to explore an alternative without losing the original

Vantage has checkpoint infrastructure in Rust (`create_checkpoint`, `list_checkpoints`, `restore_checkpoint`) but **no UI** for it. This is low-hanging fruit.

---

## 4. HOOKS SYSTEM (CRITICAL - 0% coverage)

Claude Code has 26 hook events with 4 handler types. Vantage has zero hook support.

### What Hooks Enable

Hooks are Claude Code's automation layer:
- **Auto-approve** specific tool patterns (PreToolUse)
- **Run tests** after every code change (PostToolUse)
- **Block dangerous commands** (PreToolUse deny)
- **Send notifications** on completion (Stop)
- **Inject context** on session start (SessionStart)
- **Validate outputs** before finalizing (Stop with agent handler)

### Hook Events (26 total)

**Lifecycle:** SessionStart, SessionEnd, InstructionsLoaded, UserPromptSubmit, ConfigChange, CwdChanged, FileChanged

**Tool Events:** PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, PermissionDenied

**Agent/Task Events:** SubagentStart, SubagentStop, Stop, StopFailure, TeammateIdle, TaskCreated, TaskCompleted

**MCP/Compaction/Worktree:** Elicitation, ElicitationResult, PreCompact, PostCompact, Notification, WorktreeCreate, WorktreeRemove

### Handler Types

1. `command` - Execute shell commands
2. `http` - POST to URL
3. `prompt` - Ask Claude model for yes/no decision
4. `agent` - Spawn subagent with tools for verification

### Path Forward

Vantage already receives tool call events from the Claude protocol. Hook support would need:
1. Read hook config from `.claude/settings.json` (or a hook config UI)
2. Execute handlers when events fire
3. Feed results back into the session (approve/deny/modify)

**Effort estimate: 1-2 weeks.** The protocol infrastructure is there.

---

## 5. PERMISSION MANAGEMENT (MAJOR - 60% coverage)

### Comparison

| Feature | Claude Code | Vantage | Status |
|---------|------------|---------|--------|
| Permission dialog | Full | Full | DONE |
| Allow/deny per request | Full | Full | DONE |
| Session-wide approval | Full | Full | DONE |
| Risk classification | 4 levels | 4 levels | DONE |
| Pattern-based rules | `Bash(npm run *)` | None | MISSING |
| Wildcard tool patterns | `Bash(git * main)` | None | MISSING |
| Domain-based WebFetch rules | `WebFetch(domain:...)` | None | MISSING |
| Path-based Read/Edit rules | Gitignore patterns | None | MISSING |
| MCP tool patterns | `mcp__server__tool` | None | MISSING |
| Permission modes (5) | default, acceptEdits, plan, auto, bypassPermissions | default + plan | PARTIAL |
| Settings precedence (5 levels) | Managed → CLI → local → project → user | None | MISSING |
| Persistent rules | Survive sessions | Session-only | MISSING |

### Key Gap: No Persistent Permission Rules

Users can't pre-configure "always allow `npm run test`" or "always deny `rm -rf`". Every session starts fresh.

---

## 6. MCP INTEGRATION (MAJOR - 20% coverage)

### Comparison

| Feature | Claude Code | Vantage | Status |
|---------|------------|---------|--------|
| Config reading | User + project scopes | User + project scopes | DONE |
| Config writing | Full | Full | DONE |
| Server lifecycle | Start/stop/restart/status | None | MISSING |
| Tool use via Claude | Full integration | Indirect (Claude uses) | PARTIAL |
| MCP resources | List + read | None | MISSING |
| MCP prompts as commands | As slash commands | None | MISSING |
| MCP OAuth | Authentication flow | None | MISSING |
| Tool Search (lazy loading) | 95% context reduction | None | MISSING |
| `/mcp` interactive management | Full | McpManager UI (basic) | PARTIAL |

---

## 7. SKILLS / CUSTOM COMMANDS (MAJOR - 15% coverage)

### Comparison

| Feature | Claude Code | Vantage | Status |
|---------|------------|---------|--------|
| Built-in skills | 5+ (/batch, /debug, /loop, /simplify) | None | MISSING |
| User skills (~/.claude/skills/) | Full | None | MISSING |
| Project skills (.claude/skills/) | Full | None | MISSING |
| Plugin skills | Full | None | MISSING |
| SKILL.md format with YAML frontmatter | Full | None | MISSING |
| $ARGUMENTS substitution | Full | None | MISSING |
| Dynamic context (!`command`) | Full | None | MISSING |
| Context fork (isolated subagent) | Full | None | MISSING |
| Path-scoped activation | Glob patterns | None | MISSING |

Vantage has a `SlashCommand` type and slot for `installedSkills` in ChatPanel, but the array is always empty. No skill discovery or loading exists.

---

## 8. CONTEXT MANAGEMENT (MAJOR - 30% coverage)

### Comparison

| Feature | Claude Code | Vantage | Status |
|---------|------------|---------|--------|
| /compact | Compress conversation | Sends to CLI | DONE |
| /clear | Clear history | Sends to CLI | DONE |
| /context visualization | Colored grid showing usage | None | MISSING |
| CLAUDE.md loading | Auto from project hierarchy | ClaudeMdEditor | PARTIAL |
| Auto memory | Saves learnings to memory files | None (CLI handles internally) | INDIRECT |
| Token count display | Input/output/cache breakdown | Token count in status bar | PARTIAL |
| @-mentions for context | @file, @folder, @codebase, @web, @git | None | MISSING |
| Effort level | low/medium/high/max/auto | low/medium/high | PARTIAL |
| Side questions (/btw) | Zero-context questions | Quick question overlay | DONE |

### Key Gap: @-mentions

This is the #1 missing context feature. Users should be able to:
- `@src/auth.ts` — attach a specific file
- `@src/components/` — attach a directory
- `@codebase` — semantic search the whole project
- `@web` — search the internet
- `@git` — reference git history

---

## 9. CLAUDE CODE DESKTOP APP FEATURES (CRITICAL - 20% coverage)

### Comparison

| Feature | Desktop App | Vantage | Status |
|---------|------------|---------|--------|
| Visual diff review | Full, with inline comments | Diff viewer (no inline comments) | PARTIAL |
| Live app preview | Dev server in-app with Claude vision | BrowserPreview (basic) | PARTIAL |
| Computer Use | Screen control (research preview) | None | MISSING |
| GitHub PR monitoring + auto-fix/merge | Full CI/CD visibility | None | MISSING |
| Parallel sessions with git isolation | Multiple side-by-side | Agent kanban (different model) | PARTIAL |
| Dispatch from mobile | Phone → desktop handoff | None | MISSING |
| Connectors (+) | GitHub, Slack, Linear, Notion, Calendar | None | MISSING |
| Cloud/SSH/Local sessions | 3 environment types | Local only | MISSING |
| Scheduled tasks UI | Create/manage | None | MISSING |

### What Vantage Has That Desktop App Doesn't

This is Vantage's genuine competitive advantage:
- **Full Monaco editor** with syntax highlighting, vim mode, multi-tab
- **Full terminal** with xterm.js, WebGL, multiple instances
- **File explorer** with git status indicators
- **Search panel** with regex and glob filtering
- **Multi-agent kanban board** with drag-and-drop
- **Agent hierarchy** (coordinator → specialist → verifier)
- **Agent timeline** with event logging
- **Merge queue** with quality gates
- **Verification dashboard**
- **Writer/reviewer launcher**
- **Command palette** with fuzzy search

---

## 10. REMOTE & MOBILE (MAJOR - 0% coverage)

| Feature | Claude Code | Vantage | Status |
|---------|------------|---------|--------|
| Remote control from claude.ai | Bridge local session to web | None | MISSING |
| Dispatch from phone | Send tasks from mobile | None | MISSING |
| Teleport (web → local) | Resume web session locally | None | MISSING |
| Cloud sessions | Run on Anthropic infrastructure | None | MISSING |
| SSH sessions | Connect to remote machines | None | MISSING |
| QR code for mobile | /mobile command | None | MISSING |

---

## 11. VOICE MODE (MINOR - 0% coverage)

| Feature | Claude Code | Vantage | Status |
|---------|------------|---------|--------|
| Push-to-talk dictation | /voice, hold spacebar | None | MISSING |
| 20+ languages | Full | None | MISSING |

---

## 12. CI/CD & GITHUB INTEGRATION (MAJOR - 0% coverage)

| Feature | Claude Code | Vantage | Status |
|---------|------------|---------|--------|
| GitHub Actions | claude-code-action | None | MISSING |
| Automatic code review | On every PR | None | MISSING |
| @claude mentions in PRs | Responds to mentions | None | MISSING |
| Slack integration | @Claude in channels | None | MISSING |
| Headless mode | `-p` flag for scripts | None | MISSING |
| Structured JSON output | `--json-schema` | None | MISSING |

---

## 13. PLUGIN SYSTEM (MAJOR - 10% coverage)

| Feature | Claude Code | Vantage | Status |
|---------|------------|---------|--------|
| Plugin discovery | ~/.claude/plugins/ | Backend exists | PARTIAL |
| Plugin manifest (plugin.json) | Full | Backend parses | PARTIAL |
| Plugin install from marketplace | npm-based | Mocked | MISSING |
| Plugin toggle | Enable/disable | Backend exists | PARTIAL |
| Plugin skills | Loaded from plugins | None | MISSING |
| Plugin hooks | Loaded from plugins | None | MISSING |
| Plugin agents | Loaded from plugins | None | MISSING |
| Plugin MCP configs | Loaded from plugins | None | MISSING |
| Plugin data directories | ${CLAUDE_PLUGIN_DATA} | None | MISSING |

---

## Summary: Claude Code Feature Parity

| Category | Coverage | Severity | Quick Wins? |
|----------|----------|----------|-------------|
| Slash Commands | 25% | CRITICAL | Route more commands to CLI |
| Tools Exposure | 40% | CRITICAL | Expose LSP tool, task management |
| Session Management | 40% | CRITICAL | Wire checkpoints, branching |
| Hooks System | 0% | CRITICAL | Read config + execute on events |
| Desktop App Features | 20% | CRITICAL | PR monitoring, connectors |
| Permission Management | 60% | MAJOR | Pattern rules, persistence |
| MCP Integration | 20% | MAJOR | Server lifecycle, resources |
| Skills System | 15% | MAJOR | Discover + load skills |
| Context Management | 30% | MAJOR | @-mentions, /context |
| Remote & Mobile | 0% | MAJOR | Remote control bridge |
| CI/CD & GitHub | 0% | MAJOR | GitHub app integration |
| Plugin System | 10% | MAJOR | Wire existing backend |
| Voice Mode | 0% | MINOR | Microphone API integration |

**Overall Claude Code feature parity: ~28%**
