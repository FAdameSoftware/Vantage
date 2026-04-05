# Feature Parity Matrix: Vantage vs VS Code/Cursor vs Claude Code

Legend:
- **FULL** = Feature-complete implementation
- **PARTIAL** = Some capability exists but incomplete
- **MINIMAL** = Skeleton/stub exists
- **NONE** = Not implemented
- **N/A** = Not applicable to this platform
- **AHEAD** = Vantage is ahead of the competition

---

## EDITOR FEATURES

| Feature | VS Code/Cursor | Claude Code Desktop | Vantage | Gap Severity |
|---------|---------------|-------------------|---------|-------------|
| Syntax highlighting (30+ langs) | FULL | PARTIAL | FULL | -- |
| Multi-tab editing | FULL | N/A | FULL | -- |
| IntelliSense / autocomplete | FULL | N/A | NONE | BLOCKER |
| Go to Definition | FULL | N/A | NONE | BLOCKER |
| Find All References | FULL | N/A | NONE | BLOCKER |
| Peek Definition | FULL | N/A | NONE | BLOCKER |
| Rename Symbol | FULL | N/A | NONE | BLOCKER |
| Code Actions / Quick Fixes | FULL | N/A | NONE | BLOCKER |
| Diagnostic errors/warnings | FULL | N/A | NONE | BLOCKER |
| Inlay hints | FULL | N/A | NONE | MAJOR |
| CodeLens | FULL | N/A | NONE | MAJOR |
| Semantic highlighting | FULL | N/A | NONE | MAJOR |
| Breadcrumbs | FULL | N/A | NONE | MAJOR |
| Outline view / symbol tree | FULL | N/A | NONE | MAJOR |
| Sticky scroll | FULL | N/A | NONE | MINOR |
| Call/type hierarchy | FULL | N/A | NONE | MINOR |
| Multi-cursor editing | FULL | N/A | NONE* | MAJOR |
| Find/replace in file | FULL | N/A | NONE* | MAJOR |
| Code folding | FULL | N/A | PARTIAL* | MINOR |
| Snippets | FULL | N/A | NONE | MAJOR |
| Emmet | FULL | N/A | NONE | MAJOR |
| Format on save | FULL | N/A | NONE | CRITICAL |
| Auto-save | FULL | N/A | NONE | MAJOR |
| Hot exit | FULL | N/A | NONE | MAJOR |
| Editor split / groups | FULL | N/A | NONE | CRITICAL |
| Vim mode | FULL (ext) | N/A | FULL | -- |
| Markdown preview | FULL | N/A | FULL | -- |
| Diff viewer | FULL | FULL | FULL | -- |
| Image preview | FULL | N/A | NONE | MINOR |
| Zen mode | FULL | N/A | NONE | MINOR |
| Minimap | FULL | N/A | FULL | -- |
| Word wrap | FULL | N/A | FULL | -- |
| Bracket pair colorization | FULL | N/A | FULL | -- |
| Popout windows | FULL | N/A | FULL | -- |

*Monaco has these built-in but they may not be configured/exposed in Vantage.

---

## DEBUGGING

| Feature | VS Code/Cursor | Claude Code Desktop | Vantage | Gap Severity |
|---------|---------------|-------------------|---------|-------------|
| Breakpoints | FULL | N/A | NONE | BLOCKER |
| Conditional breakpoints | FULL | N/A | NONE | BLOCKER |
| Logpoints | FULL | N/A | NONE | MAJOR |
| Call stack | FULL | N/A | NONE | BLOCKER |
| Variable inspection | FULL | N/A | NONE | BLOCKER |
| Watch expressions | FULL | N/A | NONE | BLOCKER |
| Debug console (REPL) | FULL | N/A | NONE | BLOCKER |
| Step over/into/out | FULL | N/A | NONE | BLOCKER |
| Launch configurations | FULL | N/A | NONE | BLOCKER |
| Multi-target debugging | FULL | N/A | NONE | MAJOR |
| Remote debugging | FULL | N/A | NONE | MAJOR |
| Debug Adapter Protocol | FULL | N/A | NONE | BLOCKER |

---

## SOURCE CONTROL / GIT

| Feature | VS Code/Cursor | Claude Code Desktop | Vantage | Gap Severity |
|---------|---------------|-------------------|---------|-------------|
| File status indicators | FULL | PARTIAL | FULL | -- |
| Commit log | FULL | N/A | FULL | -- |
| Blame | FULL | N/A | FULL | -- |
| Side-by-side diff | FULL | FULL | FULL | -- |
| Inline diff | FULL | N/A | NONE | MAJOR |
| Stage files | FULL | N/A | NONE | CRITICAL |
| Stage hunks/lines | FULL | N/A | NONE | CRITICAL |
| Commit with message | FULL | N/A | NONE | CRITICAL |
| Branch create/switch/delete | FULL | N/A | NONE | CRITICAL |
| Merge (3-way editor) | FULL | N/A | MINIMAL | CRITICAL |
| Rebase | FULL | N/A | MINIMAL | MAJOR |
| Stash | FULL | N/A | NONE | MAJOR |
| Cherry-pick | FULL | N/A | NONE | MINOR |
| Push/Pull/Fetch | FULL | N/A | NONE | CRITICAL |
| Remote management | FULL | N/A | NONE | MAJOR |
| Gutter change indicators | FULL | N/A | NONE | MAJOR |
| Source control graph | FULL | N/A | NONE | MAJOR |
| Timeline view | FULL | N/A | NONE | MINOR |
| Conflict resolution UI | FULL | N/A | NONE | CRITICAL |
| Git worktrees | FULL | FULL | FULL | -- |
| PR integration | FULL (ext) | FULL | MINIMAL | CRITICAL |

---

## TERMINAL

| Feature | VS Code/Cursor | Claude Code Desktop | Vantage | Gap Severity |
|---------|---------------|-------------------|---------|-------------|
| Integrated terminal | FULL | FULL (CLI) | FULL | -- |
| Multiple terminals | FULL | N/A | FULL | -- |
| Split terminals | FULL | N/A | NONE | MAJOR |
| Terminal profiles | FULL | N/A | PARTIAL | MINOR |
| Terminal tabs | FULL | N/A | FULL | -- |
| Shell integration | FULL | FULL | PARTIAL | MAJOR |
| Find in terminal | FULL | N/A | FULL | -- |
| GPU rendering | FULL | N/A | FULL | -- |
| Terminal links | FULL | N/A | PARTIAL | MINOR |
| Task runner integration | FULL | N/A | NONE | MAJOR |

---

## AI / CLAUDE INTEGRATION

| Feature | VS Code/Cursor | Claude Code Desktop | Vantage | Gap Severity |
|---------|---------------|-------------------|---------|-------------|
| AI chat panel | FULL | FULL | FULL | -- |
| Streaming responses | FULL | FULL | FULL | -- |
| Tool call visualization | PARTIAL | FULL | FULL | -- |
| Thinking display | PARTIAL | FULL | FULL | -- |
| Permission dialog | N/A | FULL | FULL | -- |
| Inline AI autocomplete | FULL (Copilot/Tab) | N/A | NONE | CRITICAL |
| Inline edit (Cmd+K/Ctrl+I) | FULL | N/A | NONE | CRITICAL |
| @-mentions for context | FULL | FULL | NONE | CRITICAL |
| Codebase indexing / RAG | FULL (Cursor) | N/A | NONE | CRITICAL |
| Agent mode | FULL | FULL | FULL (unique) | -- |
| Background agents | FULL (Cursor) | FULL | FULL (unique) | -- |
| Multi-agent orchestration | PARTIAL | PARTIAL | **AHEAD** | ADVANTAGE |
| Agent kanban board | NONE | NONE | **AHEAD** | ADVANTAGE |
| Agent worktree isolation | PARTIAL | FULL | **AHEAD** | ADVANTAGE |
| Agent hierarchy/pipeline | NONE | NONE | **AHEAD** | ADVANTAGE |
| Merge queue + quality gates | NONE | PARTIAL | **AHEAD** | ADVANTAGE |
| Verification dashboard | NONE | NONE | **AHEAD** | ADVANTAGE |
| Apply/review AI diffs | FULL | FULL | FULL | -- |
| Multi-model selection | FULL | FULL | PARTIAL | MINOR |
| Plan mode | FULL | FULL | FULL | -- |
| Effort level | N/A | FULL | PARTIAL | MINOR |
| Design mode (annotate UI) | FULL (Cursor 3) | N/A | NONE | MINOR |
| Bug finder / code review bot | FULL (BugBot) | FULL (GH) | NONE | MAJOR |
| Custom rules/instructions | FULL | FULL | FULL (CLAUDE.md) | -- |
| Memory across sessions | FULL | FULL | PARTIAL | MINOR |

---

## SEARCH

| Feature | VS Code/Cursor | Claude Code Desktop | Vantage | Gap Severity |
|---------|---------------|-------------------|---------|-------------|
| Find in files | FULL | N/A | FULL | -- |
| Replace in files | FULL | N/A | NONE | MAJOR |
| Regex search | FULL | N/A | FULL | -- |
| Case-sensitive toggle | FULL | N/A | FULL | -- |
| Glob filtering | FULL | N/A | FULL | -- |
| Search editor | FULL | N/A | NONE | MINOR |

---

## CLAUDE CODE CLI FEATURES

| Feature | VS Code/Cursor | Claude Code Desktop | Vantage | Gap Severity |
|---------|---------------|-------------------|---------|-------------|
| Session resume | N/A | FULL | PARTIAL | CRITICAL |
| Session branching/fork | N/A | FULL | NONE | CRITICAL |
| Session rewind/checkpoint | N/A | FULL | NONE (backend exists) | CRITICAL |
| Named sessions | N/A | FULL | NONE | MAJOR |
| Fast mode toggle | N/A | FULL | NONE | CRITICAL |
| 60+ slash commands | N/A | FULL | 17 (25%) | CRITICAL |
| Hooks system (26 events) | PARTIAL (Copilot) | FULL | NONE | CRITICAL |
| Skills system | PARTIAL (Copilot) | FULL | NONE | MAJOR |
| Plugin system | FULL (ext) | FULL | MINIMAL | MAJOR |
| MCP lifecycle management | PARTIAL | FULL | MINIMAL | MAJOR |
| Permission patterns | N/A | FULL | NONE | MAJOR |
| Context visualization | N/A | FULL | NONE | MAJOR |
| Voice mode | N/A | FULL | NONE | MINOR |
| Remote control | N/A | FULL | NONE | MAJOR |
| Dispatch (mobile → desktop) | N/A | FULL | NONE | MAJOR |
| Cloud sessions | N/A | FULL | NONE | MAJOR |
| Computer Use | N/A | FULL | NONE | MINOR |
| Connectors (+) | N/A | FULL | NONE | MAJOR |
| Scheduled tasks | N/A | FULL | NONE | MAJOR |
| Live app preview | N/A | FULL | PARTIAL | MAJOR |
| PR monitoring + auto-fix | N/A | FULL | NONE | CRITICAL |
| Cost tracking | N/A | FULL | FULL | -- |
| Export conversation | N/A | FULL | NONE | MAJOR |
| LSP tool | N/A | FULL | NONE | BLOCKER |

---

## WORKSPACE & SETTINGS

| Feature | VS Code/Cursor | Claude Code Desktop | Vantage | Gap Severity |
|---------|---------------|-------------------|---------|-------------|
| Open folder | FULL | FULL | FULL | -- |
| Multi-root workspaces | FULL | N/A | NONE | MAJOR |
| Workspace settings | FULL | N/A | PARTIAL | MAJOR |
| Settings UI | FULL | PARTIAL | PARTIAL | MAJOR |
| Settings sync | FULL | N/A | NONE | MINOR |
| Profiles | FULL | N/A | NONE | MINOR |
| Keybinding editor | FULL | N/A | NONE | MAJOR |
| Recent projects | FULL | N/A | FULL | -- |
| Workspace trust | FULL | N/A | NONE | MINOR |
| Command palette | FULL | N/A | FULL | -- |

---

## REMOTE DEVELOPMENT

| Feature | VS Code/Cursor | Claude Code Desktop | Vantage | Gap Severity |
|---------|---------------|-------------------|---------|-------------|
| Remote SSH | FULL | FULL (sessions) | NONE | CRITICAL |
| Dev Containers | FULL | N/A | NONE | MAJOR |
| WSL integration | FULL | N/A | NONE | MAJOR |
| Remote Tunnels | FULL | N/A | NONE | MAJOR |
| Codespaces / Cloud | FULL | FULL | NONE | MAJOR |

---

## TESTING

| Feature | VS Code/Cursor | Claude Code Desktop | Vantage | Gap Severity |
|---------|---------------|-------------------|---------|-------------|
| Test Explorer | FULL | N/A | NONE | CRITICAL |
| Run tests from gutter | FULL | N/A | NONE | CRITICAL |
| Debug tests | FULL | N/A | NONE | CRITICAL |
| Test coverage overlays | FULL | N/A | NONE | MAJOR |
| Continuous test run | FULL | N/A | NONE | MAJOR |

---

## COLLABORATION

| Feature | VS Code/Cursor | Claude Code Desktop | Vantage | Gap Severity |
|---------|---------------|-------------------|---------|-------------|
| Live Share | FULL | N/A | NONE | MINOR |
| Shared terminals | FULL | N/A | NONE | MINOR |
| PR comments | FULL (ext) | FULL | NONE | MAJOR |

---

## ACCESSIBILITY

| Feature | VS Code/Cursor | Claude Code Desktop | Vantage | Gap Severity |
|---------|---------------|-------------------|---------|-------------|
| Screen reader support | FULL | PARTIAL | UNKNOWN | NEEDS AUDIT |
| High contrast themes | FULL (2 themes) | N/A | PARTIAL (1 theme) | MINOR |
| Keyboard navigation | FULL | FULL | PARTIAL | MAJOR |
| ARIA attributes | FULL | N/A | PARTIAL | MAJOR |
| Zoom control | FULL | N/A | NONE | MINOR |

---

## OVERALL COVERAGE SUMMARY

| Category | vs VS Code/Cursor | vs Claude Code | Combined |
|----------|------------------|----------------|----------|
| Editor Intelligence | 0% | N/A | 0% |
| Debugging | 0% | N/A | 0% |
| Extensions/Plugins | 0% | 10% | 5% |
| AI-Powered Coding | 15% | 40% | 25% |
| Source Control | 30% | N/A | 30% |
| Terminal | 60% | N/A | 60% |
| Search | 70% | N/A | 70% |
| Claude CLI Features | N/A | 28% | 28% |
| Session Management | N/A | 40% | 40% |
| Hooks/Automation | 0% | 0% | 0% |
| Remote Development | 0% | 0% | 0% |
| Testing | 0% | N/A | 0% |
| Workspace/Settings | 40% | N/A | 40% |
| **WEIGHTED AVERAGE** | **~20%** | **~28%** | **~22%** |

### Areas Where Vantage Leads

| Feature | Vantage Advantage |
|---------|------------------|
| Multi-agent kanban orchestration | Neither competitor has this |
| Agent hierarchy (coordinator/specialist/verifier) | Unique to Vantage |
| Agent worktree isolation with branch management | More integrated than competitors |
| Merge queue with quality gates | Unique to Vantage |
| Verification dashboard | Unique to Vantage |
| Combined IDE + AI agent interface | Neither competitor is a full fusion |
