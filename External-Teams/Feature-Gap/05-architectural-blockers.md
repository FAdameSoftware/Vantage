# Architectural Blockers & Design Issues

These are fundamental design decisions or missing infrastructure that block multiple features. They need to be addressed before or alongside feature development.

---

## 1. NO LANGUAGE SERVER PROTOCOL (LSP) INFRASTRUCTURE

### The Problem

Vantage has no mechanism to run, connect to, or communicate with language servers. This blocks:
- IntelliSense / autocomplete
- Go to definition / find references
- Diagnostics (error underlines)
- Rename symbol
- Code actions / quick fixes
- Inlay hints
- Semantic highlighting
- Format on save (via language servers)

### Current State

- Monaco Editor is configured with TextMate grammars for syntax highlighting only
- No `monaco-languageclient` dependency
- No language server process management in Rust backend
- No WebSocket or stdio bridge between frontend and language servers
- **Unknown:** Whether Monaco's built-in TypeScript worker is enabled (it ships with Monaco by default)

### What's Needed

**Architecture decision:** How should language servers be managed?

**Option A: Rust backend manages language server processes**
```
Monaco ←→ WebSocket ←→ Tauri Rust ←→ Language Server (stdio)
```
- Rust backend spawns language servers as child processes
- WebSocket bridge relays LSP JSON-RPC between Monaco and servers
- Pro: Centralized process management, cross-platform
- Con: Requires WebSocket server in Rust, complex bridge

**Option B: Frontend manages language servers via Monaco APIs**
```
Monaco ←→ monaco-languageclient ←→ WebSocket ←→ Language Server
```
- Use `monaco-languageclient` npm package
- Connect to language servers via WebSocket or Web Worker
- Pro: Established library, less custom code
- Con: Language servers need to be accessible from the browser context

**Option C: Leverage Claude Code's LSP tool**
```
User action → Tauri → Claude session → LSP tool → result → Monaco
```
- On-demand intelligence via Claude's existing LSP integration
- Pro: Zero infrastructure to build, works with any language Claude supports
- Con: Not real-time (requires Claude API call), no inline autocomplete

**Recommendation:** Start with **Option C** for immediate value, then implement **Option A** for TypeScript/JavaScript, and extend to other languages over time.

---

## 2. NO DEBUG ADAPTER PROTOCOL (DAP) INFRASTRUCTURE

### The Problem

Vantage has no mechanism to run, connect to, or communicate with debug adapters. This blocks the entire debugging feature set.

### What's Needed

```
Monaco (breakpoints) ←→ React (debug UI) ←→ Tauri Rust ←→ Debug Adapter (DAP)
```

Components required:
1. **DAP client in Rust** — JSON-RPC communication with debug adapters
2. **Breakpoint management** — Store breakpoints per file, sync to Monaco gutter
3. **Debug session state** — Running/paused/stopped, current frame, thread info
4. **Variable resolution** — Lazy-load variable trees from scopes
5. **Debug UI panels** — Variables, call stack, watch, debug console (all new React components)
6. **Launch configuration** — Equivalent to launch.json, stored per project

### Recommendation

Start with Node.js/TypeScript debugging (uses `node --inspect` + CDP or the built-in Node.js DAP). This covers the primary use case and is the simplest adapter to integrate.

---

## 3. NO EXTENSION / PLUGIN API

### The Problem

Vantage has UI scaffolding for plugins (PluginManager, PluginStore) and backend discovery (list_installed_plugins), but there is no actual plugin API that allows third-party code to:
- Add editor features (completions, diagnostics, code actions)
- Add sidebar panels
- Add commands
- Modify the UI
- Interact with the file system
- Extend the terminal

Without a plugin API, every feature must be built into Vantage core. This is unsustainable for covering the breadth of VS Code's extension ecosystem.

### What's Needed

**Architecture decision:** What kind of extensibility does Vantage need?

**Option A: Full extension host (VS Code-like)**
- WASM-sandboxed extensions
- Full contribution points (commands, views, languages, debuggers, etc.)
- Extension marketplace
- Extremely expensive to build (person-years of effort)

**Option B: MCP-based extensibility**
- MCP servers as the extension mechanism
- Tools, resources, and prompts as the contribution points
- Lighter than full extensions but less powerful
- Already part of the Claude ecosystem

**Option C: Built-in feature integration**
- Build the top 20 most-used features directly into Vantage
- Formatters, linters, basic language support, git enhancements
- No third-party extensibility
- Fastest to deliver but caps feature breadth

**Recommendation:** **Option B + C hybrid.** Build in the essential features (formatter, linter, top language servers) while using MCP as the extensibility layer for everything else. This leverages the Claude ecosystem rather than competing with VS Code's extension ecosystem.

---

## 4. CLAUDE CLI COUPLING

### The Problem

Vantage spawns the Claude CLI as a child process and communicates via NDJSON on stdin/stdout. This is functional but creates limitations:

1. **Feature lag** — Every new Claude Code feature requires Vantage to update its protocol handling
2. **No direct API access** — Can't call Anthropic API directly for features like inline autocomplete
3. **Black box protocol** — Vantage can't intercept or modify Claude's tool execution
4. **Process management overhead** — Each session is a separate process
5. **No structured input for advanced features** — Can't programmatically invoke specific tools

### What's Needed

Consider a **dual-mode architecture:**
1. **Claude CLI mode** (current) — For full Claude Code session features
2. **Direct API mode** — For lightweight features (autocomplete, inline edit, quick queries)

Direct API mode would:
- Use Anthropic SDK (or claude-agent-sdk) for TypeScript
- Enable inline autocomplete without a full CLI session
- Enable fast one-shot queries for code intelligence
- Reduce overhead for simple operations

### Risk

Building direct API integration means maintaining two AI integration paths. The benefit is flexibility for lightweight features.

---

## 5. NO PERSISTENT CONFIGURATION LAYER

### The Problem

Vantage stores settings in localStorage via Zustand persist middleware. This means:
- Settings don't sync across devices
- Settings don't live in the project (not version-controllable)
- No workspace-level vs user-level settings distinction
- No settings UI search or schema validation
- No support for Claude Code's settings hierarchy (managed → CLI → local → project → user)

### What's Needed

1. **Project settings** — `.vantage/settings.json` in project root
2. **User settings** — `~/.vantage/settings.json`
3. **Settings precedence** — Project overrides user
4. **Interop with Claude settings** — Read `.claude/settings.json` for permission rules, hooks, etc.
5. **Settings schema** — JSON Schema for validation and UI generation

---

## 6. INCOMPLETE BACKEND WIRING

### The Problem

Several features have both frontend state (Zustand stores) and backend commands (Tauri) but are not wired together:

| Feature | Frontend | Backend | Wiring |
|---------|----------|---------|--------|
| Verification checks | verification store | None visible | NOT WIRED |
| Merge queue gate execution | mergeQueue store | run_quality_gate cmd | NOT WIRED |
| Quick question | quickQuestion store | None | NOT WIRED |
| Custom themes | useCustomTheme hook | read/write_theme_file | PARTIAL |
| Plugin management | PluginManager component | list/toggle/install cmds | MOCK ONLY |
| Skill loading | ChatPanel installedSkills | list_installed_skills cmd | NOT WIRED |

### What's Needed

A systematic wiring pass to connect existing frontend and backend code.

---

## 7. NO TASK/BUILD SYSTEM

### The Problem

VS Code has tasks.json for build tasks, problem matchers, and pre-launch tasks. Vantage has nothing comparable. This blocks:
- Build task integration
- Problem matchers (parse compiler errors → diagnostics)
- Pre-debug build steps
- Custom task runners
- Continuous build/watch mode

### What's Needed

At minimum:
1. **Detect common build tools** (npm scripts, Cargo commands, Makefile targets)
2. **Run build tasks** with output in terminal
3. **Parse output** for errors/warnings (basic problem matchers)
4. **Display results** as diagnostics in editor

Note: The merge queue already has `detect_quality_gates` and `run_quality_gate` which do similar detection. This infrastructure could be extended.

---

## 8. NO @-MENTION / CONTEXT ATTACHMENT SYSTEM

### The Problem

Both Cursor and Claude Code Desktop have @-mentions for attaching context to AI messages. Vantage's chat input is a plain textarea with no context attachment mechanism.

This blocks:
- Targeted AI conversations ("explain @this-file")
- Multi-file context ("refactor @auth.ts using the pattern from @users.ts")
- Web search integration ("@web what's new in React 19")
- Git context ("@git what changed since last week")
- Selection context ("@selection fix this bug")

### What's Needed

1. **Context resolution** — Given `@filename`, read the file and include its content
2. **Autocomplete dropdown** — Show matching files/folders when typing `@`
3. **Visual tags** — Show attached context as chips/tags in the input
4. **Protocol integration** — Include context in the message sent to Claude CLI
5. **Context types** — files, folders, selections, terminal output, web URLs, git refs

---

## Priority Order

| # | Blocker | Impact | Effort |
|---|---------|--------|--------|
| 1 | Monaco built-in TypeScript intelligence | Unlocks TS/JS code intelligence | 1-2 days to verify/enable |
| 2 | @-mention system | Unlocks targeted AI conversations | 2 weeks |
| 3 | Incomplete backend wiring | Unlocks 6+ half-built features | 1-2 weeks |
| 4 | LSP infrastructure (Option C first) | Unlocks multi-language intelligence | 1-2 weeks |
| 5 | Persistent configuration | Unlocks hooks, permissions, project settings | 2 weeks |
| 6 | LSP infrastructure (Option A) | Unlocks real-time IntelliSense | 4-8 weeks |
| 7 | DAP infrastructure | Unlocks debugging | 6-8 weeks |
| 8 | Extension/plugin API | Unlocks third-party features | Ongoing |
| 9 | Task/build system | Unlocks build integration | 2-3 weeks |
| 10 | Claude CLI coupling resolution | Unlocks inline autocomplete | 4-6 weeks |
