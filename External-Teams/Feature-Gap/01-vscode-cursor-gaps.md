# Gap Analysis: Vantage vs VS Code / Cursor

## SEVERITY LEGEND
- **BLOCKER** - Developers cannot work without this. Switching is impossible.
- **CRITICAL** - Developers will constantly hit friction. Switching is painful.
- **MAJOR** - Developers will miss this daily. Quality of life issue.
- **MINOR** - Nice to have. Won't prevent adoption but affects polish.

---

## 1. CODE INTELLIGENCE (BLOCKER - 0% coverage)

This is the single biggest gap. VS Code's core value proposition is IntelliSense and Language Server Protocol (LSP) integration. Vantage has **none of it**.

### What VS Code/Cursor Has

| Feature | VS Code | Vantage | Status |
|---------|---------|---------|--------|
| IntelliSense autocomplete | Full context-aware completions | None | MISSING |
| Go to Definition (F12) | Jump to any symbol definition | None | MISSING |
| Peek Definition (Alt+F12) | Inline definition preview | None | MISSING |
| Go to Type Definition | Navigate to type | None | MISSING |
| Go to Implementation | Find interface implementations | None | MISSING |
| Find All References (Shift+F12) | All usages across workspace | None | MISSING |
| Go to Symbol in File (Ctrl+Shift+O) | Symbol navigation | None | MISSING |
| Go to Symbol in Workspace (Ctrl+T) | Cross-file symbol search | None | MISSING |
| Rename Symbol (F2) | Rename across all files | None | MISSING |
| Code Actions / Quick Fixes | Lightbulb auto-fixes | None | MISSING |
| Extract Method/Variable | Refactoring actions | None | MISSING |
| Organize Imports | Auto-sort/remove imports | None | MISSING |
| Parameter Hints / Signature Help | Function parameter info | None | MISSING |
| Inlay Hints | Inline type/param annotations | None | MISSING |
| CodeLens | Inline reference counts, test buttons | None | MISSING |
| Semantic Highlighting | Language server token coloring | None | MISSING |
| Diagnostic Errors/Warnings | Real-time error underlines | None | MISSING |
| Breadcrumbs | File path + symbol hierarchy bar | None | MISSING |
| Outline View | Symbol tree in sidebar | None | MISSING |
| Call Hierarchy | View incoming/outgoing calls | None | MISSING |
| Type Hierarchy | View super/sub types | None | MISSING |
| Sticky Scroll | Scope headers pinned at top | None | MISSING |
| Auto-import suggestions | Import on completion select | None | MISSING |

### Why This Is a Blocker

**Every modern developer relies on LSP daily.** Without go-to-definition, a TypeScript developer in a 200-file project is navigating blind. Without error diagnostics, they won't see type errors until they run the compiler. Without autocomplete, they're typing every character manually.

**Important note:** Claude Code CLI has a built-in LSP tool that provides go-to-definition, find-references, and diagnostics. Vantage doesn't expose it. This is a massive missed opportunity.

### What It Would Take

Vantage needs to either:
1. **Integrate LSP clients** for major languages (TypeScript, Python, Rust, Go, Java, C++) via Monaco's language client APIs using `monaco-languageclient`
2. **Or** expose Claude Code's LSP tool through the UI for on-demand intelligence

Option 1 is the standard approach but is months of work. Option 2 is faster but less interactive (no real-time autocomplete).

**Recommended hybrid:** Use Monaco's built-in TypeScript/JavaScript language service (it's already bundled with Monaco but may not be configured), add `monaco-languageclient` for other languages, and expose Claude's LSP tool as a fallback.

---

## 2. DEBUGGING (BLOCKER - 0% coverage)

Vantage has **zero debugging capability**. VS Code's debugger is the #2 reason developers use it.

### What VS Code/Cursor Has

| Feature | VS Code | Vantage | Status |
|---------|---------|---------|--------|
| Set breakpoints (click gutter) | Full support | None | MISSING |
| Conditional breakpoints | Expression-based | None | MISSING |
| Logpoints | Log without stopping | None | MISSING |
| Hit count breakpoints | Break after N hits | None | MISSING |
| Data breakpoints | Break on variable change | None | MISSING |
| Exception breakpoints | Break on throw | None | MISSING |
| Call stack | Navigate stack frames | None | MISSING |
| Variable inspection | View/edit locals/globals | None | MISSING |
| Watch expressions | Monitor expressions | None | MISSING |
| Debug console (REPL) | Evaluate during pause | None | MISSING |
| Step over/into/out | Execution control | None | MISSING |
| Multi-target debugging | Multiple processes | None | MISSING |
| Remote debugging | Attach to remote | None | MISSING |
| Launch configurations | launch.json | None | MISSING |

### Why This Is a Blocker

You cannot build software without debugging. A developer using Vantage would need a separate VS Code window just to debug, defeating the purpose of Vantage as a replacement.

### What It Would Take

Implementing debugging requires:
1. **Debug Adapter Protocol (DAP)** client in the frontend
2. DAP server management in the Rust backend
3. Monaco integration for gutter breakpoints, inline values
4. UI panels: variables, call stack, watch, debug console
5. Launch configuration system

This is a 3-6 month effort and one of the hardest features to build well. Consider starting with Node.js/TypeScript debugging only (using the built-in DAP adapter).

---

## 3. EXTENSIONS / PLUGIN ECOSYSTEM (BLOCKER - 0% coverage)

VS Code has 50,000+ extensions. Cursor inherits all of them. Vantage has zero working extensions.

### What VS Code/Cursor Has

| Feature | VS Code | Vantage | Status |
|---------|---------|---------|--------|
| Extension marketplace | 50,000+ extensions | Plugin UI (empty) | MISSING |
| Language extensions | Hundreds of languages | Syntax highlighting only | MINIMAL |
| Formatters (Prettier, Black, etc.) | Via extensions | None | MISSING |
| Linters (ESLint, Pylint, etc.) | Via extensions | None | MISSING |
| Theme extensions | Thousands | 3 built-in | MINIMAL |
| Snippet packs | Hundreds | None | MISSING |
| Git extensions (GitLens, etc.) | Rich ecosystem | None | MISSING |
| Docker/K8s extensions | Full support | None | MISSING |
| Database extensions | SQL, MongoDB viewers | None | MISSING |
| REST client extensions | Thunder Client, etc. | None | MISSING |
| Extension API | Rich, documented | None | MISSING |

### Why This Is a Blocker

Extensions are not optional luxuries. **Most developers' workflows depend on them:**
- ESLint + Prettier for code quality (nearly universal in JS/TS)
- Language-specific extensions (Python, Go, Rust, Java require them)
- GitLens for advanced git features
- Docker for container management

### Realistic Path Forward

Building a full extension ecosystem is impractical. Vantage should:
1. **Build in** the top 10 most-used VS Code features (formatter, linter, Git enhancements)
2. **Leverage MCP** as a lighter extension mechanism
3. **Build Claude Code's plugin system** into the UI (skills, hooks, agents as plugins)
4. Long-term: consider a WASM-based extension API for third-party plugins

---

## 4. AI-POWERED CODING (CRITICAL - 15% coverage)

Cursor's AI features are why people switch from VS Code. Vantage has Claude integration but misses most AI coding features.

### What Cursor Has vs Vantage

| Feature | Cursor | Vantage | Status |
|---------|--------|---------|--------|
| Inline AI autocomplete (Tab) | Specialized model, diffs | None | MISSING |
| Next Edit Suggestions | Predicts next edit location | None | MISSING |
| AI Chat with codebase context | @codebase, @file, @docs | Chat only, no @ context | PARTIAL |
| Agent mode (autonomous editing) | Full multi-file agent | Chat with Claude CLI | PARTIAL |
| Inline Edit (Cmd+K) | Surgical code edits via prompt | None | MISSING |
| Apply/review AI suggestions | Inline diff preview per file | Diff viewer exists | PARTIAL |
| Codebase indexing / RAG | Semantic vector search | None | MISSING |
| @-mentions for context | @file, @folder, @web, @git | None | MISSING |
| Background agents | Cloud-hosted, async | Agent kanban exists | PARTIAL |
| Design Mode | Annotate UI elements in browser | None | MISSING |
| Multi-model per conversation | Choose different models | Settings only | PARTIAL |
| Bug finder (BugBot) | Automated PR review | None | MISSING |
| Parallel agents (up to 8) | Simultaneous on one prompt | Multi-agent system | PARTIAL |
| Embedded browser for agents | DOM context passing | BrowserPreview (basic) | PARTIAL |
| Custom rules (.cursor/rules/) | Per-project AI instructions | CLAUDE.md | EQUIVALENT |
| Memory across sessions | Notepad, retained context | Auto-memory (via CLI) | EQUIVALENT |

### What Vantage Has That's Unique (ahead of Cursor)

- Multi-agent kanban board with coordinator/specialist/verifier hierarchy
- Agent worktree isolation with git branch management
- Agent timeline with event logging
- Merge queue with quality gates
- Verification dashboard
- Writer/reviewer launcher

These are genuinely innovative and **ahead of both VS Code and Cursor** in agent orchestration. But they don't compensate for missing the basics.

### Priority AI Features to Add

1. **@-mentions** - Context attachment (files, folders, selections, URLs) in chat input. This is the #1 quality-of-life AI feature.
2. **Inline AI autocomplete** - Either integrate with Claude completion API or build custom ghost-text suggestions
3. **Inline edit** - Select code, prompt for transformation, preview diff in-place
4. **Codebase indexing** - Semantic search for AI context retrieval

---

## 5. SOURCE CONTROL / GIT (CRITICAL - 30% coverage)

Vantage has basic git display but can't perform most git operations from the UI.

### What VS Code/Cursor Has

| Feature | VS Code | Vantage | Status |
|---------|---------|---------|--------|
| Git status per file | Full | Full | DONE |
| Commit log | Full | Full | DONE |
| Blame | Full | Full | DONE |
| Diff viewer | Side-by-side + inline | Side-by-side only | PARTIAL |
| Branch create/switch/delete | Full UI | None | MISSING |
| Stage files/hunks/lines | Granular staging | None | MISSING |
| Commit with message | Full UI | None | MISSING |
| Merge with 3-way editor | Full | merge_branch cmd only | MINIMAL |
| Rebase | Interactive | rebase_branch cmd only | MINIMAL |
| Stash | Save/apply/drop | None | MISSING |
| Cherry-pick | Full | None | MISSING |
| Push/Pull/Fetch | Full UI | None | MISSING |
| Remote management | Full | None | MISSING |
| Gutter indicators | Add/modify/delete lines | None | MISSING |
| Source Control Graph | Visual commit graph | None | MISSING |
| Timeline view | Per-file history | None | MISSING |
| Conflict resolution UI | 3-way merge editor | None | MISSING |
| PR integration | GitHub PRs extension | Resume from PR only | MINIMAL |
| Worktrees | Built-in | Full (agents) | DONE |

### Quick Wins

Many git features just need UI wired to existing backend capabilities:
- Stage/unstage: backend has `get_git_status`, just needs stage/unstage commands
- Commit: needs a commit command + message input
- Branch management: needs branch create/switch/delete commands
- Push/pull: needs remote operation commands

---

## 6. REMOTE DEVELOPMENT (CRITICAL - 0% coverage)

| Feature | VS Code | Vantage | Status |
|---------|---------|---------|--------|
| Remote SSH | Full IDE over SSH | None | MISSING |
| Dev Containers | Docker-based dev environments | None | MISSING |
| WSL integration | Develop in WSL | None | MISSING |
| Remote Tunnels | Secure tunnel connections | None | MISSING |
| GitHub Codespaces | Cloud dev environments | None | MISSING |

This is critical for teams that develop on remote servers or use containers. It's also a massive engineering effort to implement.

---

## 7. TESTING (CRITICAL - 0% coverage)

| Feature | VS Code | Vantage | Status |
|---------|---------|---------|--------|
| Test Explorer | Hierarchical test tree | None | MISSING |
| Run individual tests | From gutter/tree | None | MISSING |
| Debug tests | Full debugger integration | None | MISSING |
| Test coverage | Color-coded overlays | None | MISSING |
| Continuous test run | On file change | None | MISSING |
| Test status decorations | Pass/fail in gutter | None | MISSING |

---

## 8. TERMINAL (MAJOR - 60% coverage)

### Comparison

| Feature | VS Code | Vantage | Status |
|---------|---------|---------|--------|
| Multiple terminals | Full | Full | DONE |
| Split terminals | Side-by-side panes | None | MISSING |
| Terminal profiles | Configurable per shell | Shell detection only | PARTIAL |
| Terminal tabs | Named with icons | Basic tabs | PARTIAL |
| Shell integration | Command detection, exit codes | Exit codes only | PARTIAL |
| Task runner integration | tasks.json, problem matchers | None | MISSING |
| Find in terminal | Full | Search addon loaded | DONE |
| GPU rendering | WebGL | WebGL with fallback | DONE |
| Terminal links | Clickable paths/URLs | Web links only | PARTIAL |
| Terminal decorations | Command success/failure icons | None | MISSING |
| Drag-and-drop terminals | Reorder, move to groups | None | MISSING |

---

## 9. SEARCH (MAJOR - 70% coverage)

| Feature | VS Code | Vantage | Status |
|---------|---------|---------|--------|
| Find in files | Full | Full | DONE |
| Replace in files | Full | None | MISSING |
| Regex search | Full | Full | DONE |
| Case-sensitive toggle | Full | Full | DONE |
| Include/exclude patterns | Glob patterns | Glob filter | DONE |
| Search editor | Full-size results editor | None | MISSING |
| Find in selection | Yes | None | MISSING |
| Preserve case in replace | Yes | N/A | MISSING |

---

## 10. EDITOR FEATURES (MAJOR - 40% coverage)

### What Vantage Has
- Syntax highlighting (30+ languages via TextMate grammars)
- Multi-tab with preview/pinned
- Vim mode (monaco-vim)
- Markdown preview
- Diff viewer (Monaco DiffEditor)
- Font/theme customization
- Line numbers, minimap, word wrap
- Bracket pair colorization
- Popout editor windows

### What's Missing

| Feature | VS Code | Vantage | Status |
|---------|---------|---------|--------|
| Multi-cursor editing | Full (Alt+Click, Ctrl+D) | Not configured* | MISSING |
| Snippets (built-in + custom) | Full | None | MISSING |
| Emmet abbreviation expansion | Built-in | None | MISSING |
| Find/replace in current file | Ctrl+F / Ctrl+H | Not exposed* | MISSING |
| Format on save/paste/type | Full | None | MISSING |
| Auto-save | Configurable triggers | None | MISSING |
| Hot exit (preserve unsaved) | Full | None | MISSING |
| Editor split / groups | Grid layout | None | MISSING |
| Column/box selection | Shift+Alt+drag | Not configured* | MISSING |
| Select all occurrences | Ctrl+Shift+L | Not configured* | MISSING |
| Code folding controls | Full UI | Monaco default only* | PARTIAL |
| Linked editing (HTML tags) | Built-in | None | MISSING |
| Trim trailing whitespace | On save | None | MISSING |
| Insert final newline | On save | None | MISSING |
| Font ligatures | Full support | Unknown | MISSING |
| Color picker (CSS) | Inline | None | MISSING |
| Image preview | Built-in | None | MISSING |
| Zen mode | Distraction-free | None | MISSING |
| Drag-and-drop text | Built-in | None | MISSING |

*Items marked with * — Monaco Editor has these capabilities built-in but Vantage may not have them configured or exposed. **This should be verified** as some may be quick wins just by enabling Monaco options.

---

## 11. WORKSPACE & SETTINGS (MAJOR - 40% coverage)

| Feature | VS Code | Vantage | Status |
|---------|---------|---------|--------|
| Open folder | Full | Full | DONE |
| Multi-root workspaces | .code-workspace | None | MISSING |
| Workspace settings | .vscode/settings.json | localStorage | PARTIAL |
| Workspace trust | Restricted mode | None | MISSING |
| Profiles | Create/switch/export | None | MISSING |
| Settings sync | Cloud sync | None | MISSING |
| Recent projects | Full | Full | DONE |
| Settings UI | Graphical editor | SettingsPanel | PARTIAL |
| Keybinding editor | Graphical with conflict detection | None | MISSING |
| Settings search | Full | None | MISSING |

---

## 12. ACCESSIBILITY (MINOR but important)

| Feature | VS Code | Vantage | Status |
|---------|---------|---------|--------|
| Screen reader support | Optimized | Unknown | NEEDS AUDIT |
| High contrast themes | Dedicated HC Dark/Light | 1 HC theme | PARTIAL |
| Keyboard navigation | Full Tab/Shift+Tab | Partial | PARTIAL |
| ARIA attributes | Comprehensive | Some | PARTIAL |
| Accessible view (Alt+F2) | For hovers/notifications | None | MISSING |
| Zoom level control | Full | None | MISSING |

---

## Summary: VS Code/Cursor Feature Parity

| Category | Coverage | Severity | Quick Wins? |
|----------|----------|----------|-------------|
| Code Intelligence (LSP) | 0% | BLOCKER | Monaco TS built-in, Claude LSP tool |
| Debugging | 0% | BLOCKER | None — requires major effort |
| Extensions/Plugins | 0% | BLOCKER | MCP + built-in features |
| AI-Powered Coding | 15% | CRITICAL | @-mentions, inline edit |
| Source Control (Git) | 30% | CRITICAL | UI for existing backend commands |
| Remote Development | 0% | CRITICAL | None — requires major effort |
| Testing | 0% | CRITICAL | Test explorer + output parsing |
| Terminal | 60% | MAJOR | Split terminals, profiles |
| Search | 70% | MAJOR | Replace in files |
| Editor Features | 40% | MAJOR | Enable Monaco built-ins |
| Workspace/Project | 40% | MAJOR | Settings UI, multi-root |
| Accessibility | ~30% | MINOR | ARIA audit, keyboard nav |

**Overall VS Code/Cursor feature parity: ~20%**
