# Existing GUI Projects for Claude Code: Deep Dive Analysis

> **Research Date:** April 3, 2026
> **Purpose:** Exhaustive analysis of the 10 most relevant existing GUI projects built around Claude Code CLI, to inform Vantage's architecture and feature decisions.

---

## Table of Contents

1. [Executive Summary & Comparison Matrix](#1-executive-summary--comparison-matrix)
2. [Opcode (formerly Claudia)](#2-opcode-formerly-claudia)
3. [Nimbalyst](#3-nimbalyst)
4. [CodePilot](#4-codepilot)
5. [cmux](#5-cmux)
6. [AionUi](#6-aionui)
7. [Caudex](#7-caudex)
8. [Clauductor](#8-clauductor)
9. [Kanna](#9-kanna)
10. [Companion](#10-companion)
11. [claude-devtools](#11-claude-devtools)
12. [Communication Protocol Taxonomy](#12-communication-protocol-taxonomy)
13. [Community Feature Demand Analysis](#13-community-feature-demand-analysis)
14. [Strategic Lessons for Vantage](#14-strategic-lessons-for-vantage)

---

## 1. Executive Summary & Comparison Matrix

### Quick Reference Table

| Project | Stars | Framework | Language | License | Platform | Communication Method | Maturity |
|---------|-------|-----------|----------|---------|----------|---------------------|----------|
| **Opcode** | 21.3k | Tauri 2 + React | Rust + TS | AGPL | Win/Mac/Linux | Filesystem + Process spawn | Stale (last release Aug 2025) |
| **Nimbalyst** | 116 | Electron + React | TS | Proprietary | Win/Mac/Linux + iOS | Unknown (closed-source) | Active (v0.56.17, weekly releases) |
| **CodePilot** | 5.0k | Electron + Next.js | TS | BSL-1.1 | Win/Mac/Linux | Claude Agent SDK + JSONL import | Active (531 commits) |
| **cmux** | 12.5k | Swift/AppKit | Swift + Zig | GPL-3.0 | macOS only | Terminal PTY + OSC sequences | Active (2,049 commits) |
| **AionUi** | 20.9k | Electron + React | TS | Apache-2.0 | Win/Mac/Linux | ACP protocol (stdio) | Active (v1.9.6) |
| **Caudex** | ~95 | Unknown (likely Electron/Next.js) | TS | Proprietary | Win/Mac (Linux soon) | Native terminal embedding | Early (v0.1.48) |
| **Clauductor** | 10 | Nuxt (Vue) + Go | Go + Vue + TS | MIT | Win/Mac/Linux | MCP server (stdio) | Early (v0.2.0) |
| **Kanna** | 459 | React + Bun | TS | MIT | Web (localhost) | Claude Agent SDK (stdio) | Active (npm package) |
| **Companion** | 2.3k | React + Bun + Hono | TS | MIT | Web (localhost) | `--sdk-url` WebSocket + NDJSON | Very Active (v0.95.0, 509 commits) |
| **claude-devtools** | 2.9k | Electron + React | TS | MIT | Win/Mac/Linux + Docker | Passive log reading (~/.claude/) | Active (288 commits) |

### Communication Methods Summary

| Method | Projects Using It | Pros | Cons |
|--------|------------------|------|------|
| **Filesystem reading** (`~/.claude/`) | Opcode, claude-devtools | Non-invasive, works retroactively | Read-only, no real-time control |
| **Process spawn + stdin/stdout** | Opcode (agents), AionUi | Full control, bidirectional | Fragile PTY handling, encoding issues |
| **Claude Agent SDK** | Kanna, CodePilot | Official library, typed events | SDK still pre-1.0 (v0.2.x) |
| **`--sdk-url` WebSocket + NDJSON** | Companion | Full bidirectional control, streaming | Undocumented/unofficial flag, could break |
| **MCP Server (stdio)** | Clauductor | Leverages official MCP protocol | Limited to tool approval, not full control |
| **Terminal PTY + OSC** | cmux, Caudex | Pure terminal experience, no wrapper | Cannot intercept Claude's internal state |
| **ACP (Agent Client Protocol)** | AionUi | Multi-agent abstraction | Custom protocol, not standardized |

---

## 2. Opcode (formerly Claudia)

**Repository:** https://github.com/winfunc/opcode
**Website:** https://opcode.sh
**Stars:** 21,300 | **Forks:** 1,600 | **Commits:** 201

### Tech Stack (Specific Libraries)

**Rust Backend (src-tauri/):**
- Tauri 2 with plugins: shell, dialog, fs, process, updater, notification, clipboard-manager, global-shortcut, http
- Axum 0.8 (web server with WebSocket support)
- Tower + Tower-HTTP (middleware, CORS, filesystem serving)
- Rusqlite 0.32 with bundled SQLite
- Tokio (full features) for async runtime
- Reqwest 0.12 for HTTP client
- Serde/serde_json/serde_yaml for serialization
- SHA2, zstd compression, UUID generation
- macOS: window-vibrancy, cocoa, objc bindings

**React Frontend (src/):**
- React 18 + TypeScript
- Vite 6 + @vitejs/plugin-react
- Tailwind CSS v4 + tailwind-merge
- Radix UI (dialog, dropdown, label, popover, radio, select, switch, tabs, toast, tooltip)
- Zustand (state management)
- Recharts (data visualization)
- @tanstack/react-virtual (virtualized lists)
- Framer Motion (animations)
- React Hook Form + Zod (form validation)
- React Markdown + remark-gfm + react-syntax-highlighter
- @uiw/react-md-editor (CLAUDE.md editing)
- ansi-to-html, html2canvas, diff, date-fns
- Lucide React (icons)
- PostHog JS (analytics)

### Architecture

```
opcode/
├── src/                    # React frontend
│   ├── components/         # UI components (shadcn/ui + Radix)
│   ├── lib/               # API client & utilities
│   └── assets/            # Static assets
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── commands/      # Tauri IPC command handlers
│   │   ├── checkpoint/    # Timeline/versioning management
│   │   └── process/       # CLI process management
│   └── tests/
└── public/
```

### Communication with Claude Code

Opcode communicates through **filesystem reading + process spawning**:
1. **Reads `~/.claude/projects/`** directory to discover sessions, history, and metadata
2. **Spawns Claude Code CLI** as a child process via Tauri's shell plugin for interactive sessions
3. **Reads session files** from standard Claude Code locations for history viewing
4. **No SDK integration** - purely process and filesystem based
5. The Axum WebSocket server in Rust likely handles real-time updates between the backend process manager and the React frontend

### Top Community Requests (from 262 open issues)

1. **Windows support** (#219, #332, #353) - Most demanded platform
2. **SSH remote access** (#163) - Remote development workflows
3. **HTTP/Web access** (#79, #260) - Browser-based interface
4. **Model selection flexibility** (#84) - Per-agent model config
5. **Additional AI model support** (#124, #391) - Gemini CLI, Haiku

### What They Got Right

- **Checkpoint/timeline system** is unique and powerful - ability to branch, restore, and diff between session states
- **Usage analytics** with per-model cost tracking is highly valued
- **MCP server management** UI for visual configuration is well-received
- **CLAUDE.md editor** with live preview addresses a real developer need
- **CC Agents** (custom background agents) with execution history and metrics
- **Tauri 2** delivers genuinely smaller binaries (~15-30MB vs 150MB+ Electron)

### What They Got Wrong

- **Development has stalled** - last release August 31, 2025 (7+ months ago) despite Claude Code's rapid evolution
- **No response from maintainers** on issues since stalling
- **AGPL license** deters commercial adoption and forks
- **No Windows builds** at launch despite being cross-platform framework
- **Single-session paradigm** - no parallel agent support
- **No mobile/remote access** despite heavy community demand

### License & Maturity

- **AGPL-3.0** - Viral copyleft, requires source disclosure for network services
- **Mature codebase but abandoned trajectory** - 201 commits then silence
- Not affiliated with Anthropic (explicit disclaimer)

---

## 3. Nimbalyst

**Repository:** https://github.com/Nimbalyst/nimbalyst (releases-only, closed source)
**Website:** https://nimbalyst.com
**Stars:** 116 | **Releases:** 20 (latest v0.56.17)

### Tech Stack

**Desktop App (Electron):**
- Electron (desktop framework)
- React (UI)
- Lexical (Meta's rich text editor framework - for WYSIWYG markdown)
- Monaco Editor (code editing, same engine as VS Code)
- Ghostty terminal (embedded terminal)
- Platform: macOS (Apple Silicon + Intel), Windows, Linux

**Editors (7+):**
- WYSIWYG Markdown (Lexical-based)
- Monaco code editor with full project awareness
- CSV spreadsheet editor
- UI mockup editor (wireframes with code generation)
- Excalidraw integration (AI-powered diagrams)
- Data model/ERD editor (with Prisma export)
- Mermaid diagram renderer

**Mobile:**
- iOS app for session management, voice/text replies, push notifications

### Architecture

Closed-source; architecture inferred from features and acknowledgments:
- Electron main process manages Claude Code and Codex subprocesses
- Embedded Ghostty terminal for direct CLI interaction
- Lexical-based editor framework for rich content editing
- File watcher system for detecting agent changes per session
- Git worktree isolation per session (automatic)

### Communication with Claude Code

**Not publicly documented.** Since the source is closed and the GitHub repo is releases-only, the exact communication protocol is unknown. Given the embedded Ghostty terminal, Nimbalyst likely:
1. Spawns Claude Code as a PTY process within the embedded terminal
2. Monitors file changes via filesystem watchers
3. Possibly uses the Claude Agent SDK for programmatic session control
4. The iOS app suggests a local server component for remote access

### Top Community Requests (from 28 open issues)

1. **Claude Code thinking trace** (#18) - Visibility into reasoning
2. **Auto-refresh file panel** (#21) - Real-time file updates
3. **Word-level diff highlighting** (#11) - Granular prose diffs
4. **Voice mode on Windows** (#30) - Platform parity
5. **Built-in command support** (#3) - Interactive /mcp, /add-dir commands

### What They Got Right

- **Visual workspace paradigm** is genuinely differentiated - not just another chat wrapper
- **Kanban for sessions** solves a real workflow problem for multi-session management
- **Git worktree per session** prevents file conflicts between parallel agents
- **7+ visual editors** make Claude Code accessible for non-pure-code tasks (docs, diagrams, data models)
- **iOS app** is unique in the space and enables async workflow management
- **SOC-2 Type 2 certification** signals enterprise readiness
- **Weekly release cadence** demonstrates commitment

### What They Got Wrong

- **Closed source + proprietary** limits community trust and contribution
- **Low GitHub stars (116)** despite good features suggests marketing/discovery issue
- **No public architecture documentation** makes integration/extension impossible
- **Electron overhead** - heavier than Tauri alternatives
- **SOC-2 claim is unusual** for a desktop app - needs verification

### License & Maturity

- **Proprietary** - "All rights reserved. (c) 2026 Nimbalyst"
- Free for individual users with no feature limits
- Active development with weekly releases
- SOC-2 Type 2 certified (claimed)

---

## 4. CodePilot

**Repository:** https://github.com/op7418/CodePilot
**Stars:** 5,000 | **Forks:** 513 | **Commits:** 531

### Tech Stack (Specific Libraries)

**Desktop Framework:**
- Electron 40.2.1 + electron-builder
- Next.js 16.2.1 (standalone server forked per window)
- React 19.2.3

**AI Integration:**
- @anthropic-ai/claude-agent-sdk ^0.2.62 (primary Claude integration)
- ai ^6.0.73 (Vercel AI SDK)
- @ai-sdk/* packages (Anthropic, OpenAI, Google, Bedrock, Vertex providers)
- better-sqlite3 for local data persistence

**UI & Rendering:**
- Radix UI component suite
- Tailwind CSS v4
- Shiki (syntax highlighting)
- Streamdown libraries (CJK, code, math, mermaid rendering)
- react-markdown + remark-gfm + rehype-raw
- motion (animations)
- Primer React (GitHub design system)

**Communication:**
- discord.js ^14.25.1 (Discord bot bridge)
- ws (WebSocket)

**Development:**
- TypeScript 5
- ESLint 9
- Playwright (E2E testing)
- Husky + lint-staged (git hooks)

### Architecture

```
CodePilot/
├── src/              # Next.js application code
├── electron/         # Electron main process
├── apps/site/        # Documentation site
├── docs/             # Handover documents, execution plans
├── themes/           # UI theme definitions
├── .assistant/       # Assistant workspace state
└── memory/daily/     # Daily memory storage
```

The architecture forks a **Next.js standalone server per window** on `127.0.0.1` with a random free port. This enables both browser and desktop modes from the same codebase.

### Communication with Claude Code

CodePilot uses **multiple methods**:
1. **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk ^0.2.62`) for programmatic control
2. **JSONL session import** - can import Claude Code CLI `.jsonl` session history files
3. **Vercel AI SDK** for multi-provider abstraction (17+ providers)
4. **Direct API calls** via provider-specific SDKs (Anthropic, OpenAI, Google, etc.)

### Top Community Requests (from 248 open issues)

1. **Theme persistence** (#385) - Settings lost on restart
2. **Scheduled tasks** (#165) - Cron-based automation
3. **Community access** (#297, #281) - Updated WeChat group codes
4. **File tree bugs** (#116) - Panel collapse/expand issues
5. **Homebrew installation** - Package manager support

### What They Got Right

- **17+ AI provider support** with unified interface is genuinely useful
- **Bridge system** (Telegram, Discord, Feishu, QQ, WeChat) enables remote control from anywhere
- **Assistant workspace** with soul.md/user.md/claude.md/memory.md is a novel personalization approach
- **Generative UI** - AI-created dashboards rendered in-app
- **Skills marketplace** (skills.sh) for extensibility
- **Three interaction modes** (Code/Plan/Ask) with reasoning effort levels

### What They Got Wrong

- **BSL-1.1 license** creates commercial uncertainty (free only for personal/academic use)
- **Chinese-community-centric** - most issues/docs in Chinese, limiting global adoption
- **248 open issues** with many stale suggests maintenance burden
- **Electron + Next.js per window** is heavy - each window runs a separate Next.js server
- **Feature bloat** - trying to be everything (chat + IDE + social + media studio)
- **macOS builds not notarized** - security warnings for users

### License & Maturity

- **BSL-1.1** - Free for personal/academic; commercial requires license. Converts to Apache 2.0 on 2029-03-16
- Active development but showing signs of scope creep
- Strong in Chinese developer community

---

## 5. cmux

**Repository:** https://github.com/manaflow-ai/cmux
**Website:** https://cmux.com
**Stars:** 12,500 | **Forks:** 880 | **Commits:** 2,049

### Tech Stack (Specific Libraries)

**Core:**
- **Swift** + **AppKit** (native macOS, NOT Electron/Tauri)
- **libghostty** (GPU-accelerated terminal rendering via Ghostty fork at manaflow-ai/ghostty)
- **Zig** (GhosttyKit framework + cmuxd daemon)
- **WebKit** (built-in scriptable browser)
- **Sparkle** (auto-update framework)

**Architecture Components:**
- **cmuxd** - Zig-based background daemon for socket communication
- **CLI** - Command-line remote control tool
- **Bonsplit** - Vendor submodule for split pane/tab management
- Unix sockets for IPC

**Configuration:**
- Reads `~/.config/ghostty/config` for terminal themes/fonts
- `~/.config/cmux/settings.json` for keyboard shortcuts
- `cmux.json` per-project for custom commands

### Architecture

```
cmux/
├── Sources/           # Main Swift application code
├── CLI/               # Command-line interface tool
├── daemon/remote/     # cmuxd background service (Zig)
├── ghostty/           # Git submodule (Ghostty terminal engine fork)
├── homebrew-cmux/     # Homebrew package definition
├── web/               # Web-related components
├── skills/            # Agent interaction scripts
├── Package.swift      # Swift Package Manager
└── cmux.entitlements  # macOS entitlements
```

Three performance-critical hot paths documented in CLAUDE.md:
1. **Event routing** (`WindowTerminalHostView.hitTest()`) - processes every keyboard event
2. **Tab rendering** (`TabItemView`) - uses `Equatable` conformance to skip re-evaluation during typing
3. **Terminal refresh** (`TerminalSurface.forceRefresh()`) - must avoid allocations/IO per keystroke

### Communication with Claude Code

cmux is a **pure terminal** approach - it does NOT wrap or intercept Claude Code:
1. **PTY-based** - Claude Code runs in standard terminal sessions
2. **OSC sequences** (OSC 9/99/777) for notification detection
3. **`cmux notify` CLI** for agent hooks integration
4. **No SDK or protocol interception** - purely observes terminal output
5. **Scriptable browser API** with accessibility tree snapshots for agent interaction

### Top Community Requests (from 632 open issues)

1. **Linux support** (#330) - Largest platform request
2. **Windows version** (#1012) - Major expansion demand
3. **Customizable keybindings** (#135, #645) - Modifier key customization
4. **Session persistence** (#480) - Save/restore tab layouts
5. **Browser integration** (#719) - "Open in browser" functionality

### What They Got Right

- **Native performance** - Swift/AppKit + GPU-accelerated Ghostty delivers zero-compromise terminal experience
- **Workspace metadata** in sidebar tabs (git branch, PR status, ports, working directory) is brilliant UX
- **Notification system** with blue rings, visual indicators, and notification panel solves real multi-agent monitoring
- **Built-in scriptable browser** enables powerful agent+web workflows
- **SSH workspaces** with browser routing through remote network
- **Claude Code Teams** native support for teammate mode as splits
- **Performance obsession** documented in CLAUDE.md - typing latency is sacred
- **Founder story is authentic** - built because existing tools didn't work for their multi-agent workflow

### What They Got Wrong

- **macOS only** - Swift/AppKit makes cross-platform extremely difficult (632 open issues, many about platform)
- **GPL-3.0 license** is restrictive for integration
- **Ghostty fork dependency** creates maintenance burden (submodule management)
- **No session state persistence** - terminal processes (Claude Code, tmux, vim) not restored on restart
- **Cannot access Claude Code's internal state** - pure terminal approach means no token/cost visibility

### License & Maturity

- **GPL-3.0-or-later** (commercial licensing available via founders@manaflow.com)
- Very active development (2,049 commits)
- Founder's Edition for premium features (iOS sync, cloud VMs, voice mode)
- Free and open source core

---

## 6. Caudex

**Product Hunt:** https://www.producthunt.com/products/caudex
**Website:** https://caudex.sh
**Score:** ~95 PH points | **Launched:** February 3, 2026

### Tech Stack

**Confirmed:**
- Next.js + React (inferred from website source: CSS modules, Google Fonts integration)
- TypeScript
- Likely Electron or Tauri for desktop wrapper (unconfirmed - closed source)

**Website infrastructure:**
- Satoshi font (Fontshare) + Manrope (Google Fonts)
- Google Analytics (G-M9CGNN74LB)
- Cloudflare R2 CDN for downloads

**Current version:** v0.1.48

### Architecture

Closed-source. Architecture inferred from features:
- Multi-tab terminal with split panes (horizontal + vertical)
- Sidebar panel for Sessions, Todos, MCP servers, Agents, Skills, Permissions
- Context and cost monitoring overlay
- Session management with resume capability
- Git integration panel

### Communication with Claude Code

**Native terminal embedding** - Caudex appears to be a dedicated terminal that:
1. Embeds actual terminal sessions where Claude Code runs natively
2. Reads session metadata for the sidebar panel
3. Monitors context usage and costs (likely from Claude Code's output or session files)
4. Provides one-click actions (Compact, Clear, Memory, Screenshots) by sending commands to the terminal

### Community Feedback

- Product Hunt: 95 points, 73 followers, 4 comments
- Listed as competitor to Warp, Ghostty, Maestri, iTerm2
- Creator: Koji Hayashida (Co-Founder of Reedr)
- "Chose to focus on Claude Code to deliver a tighter UX than a generic multi-provider client"

### What They Got Right

- **Focused scope** - Claude Code only, not trying to support everything
- **Lightweight terminal-first approach** - enhances rather than replaces
- **One-click actions** for common operations (Compact, Clear, Memory)
- **Keyboard-first workflow** - respects developer muscle memory
- **Cost monitoring** integrated into the UI
- **Clean, minimal design** language

### What They Got Wrong

- **Closed source** with no public repo limits community contribution
- **Very early** (v0.1.48) - many features likely incomplete
- **No Linux support** at launch
- **Low visibility** (95 PH points, no GitHub stars)
- **Unclear tech stack** - hard to assess performance/extensibility
- **Single-creator risk** - small team

### License & Maturity

- **Proprietary** (free)
- Very early stage (v0.1.48, launched February 2026)
- macOS + Windows available, Linux coming

---

## 7. Clauductor

**Repository:** https://github.com/mikolajbadyl/clauductor
**Stars:** 10 | **Commits:** 15 | **Latest:** v0.2.0

### Tech Stack

**Backend:**
- Go (17.7% of codebase)
- GoReleaser for cross-platform builds
- Single binary distribution (no runtime dependencies)

**Frontend:**
- Nuxt 3 (Vue.js framework)
- TypeScript (13.7%)
- Tailwind CSS

**Build:**
- Bun (package manager)
- Make (build system)
- GoReleaser (.goreleaser.yaml)

### Architecture

```
clauductor/
├── app/               # Nuxt frontend application
├── backend/           # Go backend service
├── scripts/           # Utility scripts
├── public/            # Static assets
├── .github/workflows/ # CI/CD
├── nuxt.config.ts
├── tailwind.config.ts
└── .goreleaser.yaml
```

The Go binary embeds the compiled Nuxt frontend and serves everything from a single executable on localhost:8080.

### Communication with Claude Code

Clauductor uses an **MCP server approach**:
1. Registers as an MCP server via `claude mcp add --scope user clauductor-mcp -- $(which clauductor) --mcp`
2. Communicates via **stdio** using the MCP protocol
3. Auto-detects the backend port for routing
4. Provides tool approval prompts through the MCP interface
5. Visualizes tool calls, file edits, and bash commands in real-time

**Configuration in `~/.claude.json`:**
```json
{
  "mcpServers": {
    "clauductor-mcp": {
      "type": "stdio",
      "command": "/path/to/clauductor",
      "args": ["--mcp"]
    }
  }
}
```

### Community Feedback

- 0 open issues, 0 closed issues
- Very early project with minimal community engagement
- 10 stars suggests early discovery phase

### What They Got Right

- **"Execution map" visualization** is a unique and powerful concept
- **Single binary** with no dependencies is excellent for distribution
- **MCP-based integration** leverages an official, supported protocol
- **Self-hosted** with cross-platform support
- **Systemd service** support for persistent Linux deployment
- **MIT license** is maximally permissive

### What They Got Wrong

- **Very early** (15 commits, v0.2.0) - barely a prototype
- **MCP-only integration** limits what can be observed/controlled
- **No session management** beyond basic history
- **Nuxt/Vue** is less popular than React in this ecosystem
- **Go + Vue** is an unusual combination that may limit contributors
- **Zero community engagement** (no issues, no discussions)

### License & Maturity

- **MIT** - maximally permissive
- Very early prototype stage
- Solo developer project

---

## 8. Kanna

**Repository:** https://github.com/jakemor/kanna
**Stars:** 459 | **npm:** kanna-code

### Tech Stack (Specific Libraries)

**Server (Bun):**
- Bun v1.3.5+ (runtime + HTTP/WebSocket server)
- @anthropic-ai/claude-agent-sdk ^0.2.39
- @xterm/headless ^6.0.0 (headless terminal for backend processing)
- cloudflared ^0.7.1 (Cloudflare tunnel for public sharing)
- qrcode ^1.5.4 (terminal QR codes)
- default-shell ^2.2.0 (shell detection)
- file-type ^22.0.0

**Client (React):**
- React 19.2.1
- Vite 6.0.0
- TypeScript 5.8.3
- Tailwind CSS 4.1.18
- Zustand (state management)
- @dnd-kit (drag-and-drop)
- @radix-ui (context-menu, select)
- @xterm/xterm ^6.0.0 + addons (fit, serialize, web-links)
- react-resizable-panels ^4.7.3

### Architecture

**Event Sourcing + CQRS pattern:**

```
Server (Bun)
├── WSRouter           # WebSocket subscription & command routing
├── AgentCoordinator   # Multi-provider turn management
├── ProviderCatalog    # Provider/model/effort normalization
├── QuickResponseAdapter # Structured queries with fallback
├── EventStore         # JSONL persistence + snapshot compaction
└── ReadModels         # Derived views from events

Client (React + Zustand)
├── app/               # Router, pages, socket client
├── components/        # Messages, dialogs, UI
├── stores/            # Zustand state stores
└── lib/               # Formatters, utilities
```

**Data persistence at `~/.kanna/data/`:**
- `projects.jsonl` - project events
- `chats.jsonl` - chat lifecycle
- `messages.jsonl` - transcript entries
- `turns.jsonl` - agent turn events
- `snapshot.json` - compacted state for fast startup

Event logs are append-only JSONL. On startup, Kanna replays the log tail after the last snapshot, then compacts if logs exceed 2MB.

### Communication with Claude Code

Kanna uses the **Claude Agent SDK** directly:
1. **@anthropic-ai/claude-agent-sdk** for spawning and controlling Claude Code processes
2. **stdio-based** communication through the SDK's local process interface
3. **Codex** support via JSON-RPC client for the Codex App Server
4. **Auto-discovers projects** from both Claude and Codex local history directories
5. WebSocket-driven reactive broadcasting pushes snapshots on every state change to connected browsers

### Top Community Requests (from 8 open issues)

1. **Skills, Plugins, and MCP** (#23) - Extensibility framework
2. **Attention notifications** (#20) - Unread indicators for completed work
3. **Speech-to-text input** (#9) - Voice-based messaging
4. **Chat history resume** (#8) - Restore previous conversations
5. **High CPU usage** (#12) - Performance issue during agent operations

### What They Got Right

- **Event sourcing architecture** is genuinely innovative for this space - enables replay, undo, and audit
- **CQRS separation** means reads never block writes
- **Snapshot compaction** prevents unbounded log growth
- **Multi-provider support** (Claude + Codex) with unified interface
- **Public share URLs** via Cloudflare tunneling - instant collaboration
- **Auto-generated chat titles** via Claude Haiku - nice polish
- **Clean npm install** (`bun install -g kanna-code`) - zero friction
- **MIT license** encourages adoption

### What They Got Wrong

- **Browser-only UI** (localhost) - no desktop app, no system tray
- **Bun dependency** limits some environments
- **Small community** (459 stars, 8 issues)
- **No file editing capability** - pure chat interface
- **High CPU usage** reported (#12) - event replay may be expensive
- **No persistence across server restarts** for active sessions (only event log)

### License & Maturity

- **MIT** - maximally permissive
- Moderate maturity, actively maintained
- Published as npm package (kanna-code)

---

## 9. Companion

**Repository:** https://github.com/The-Vibe-Company/companion
**Website:** https://thecompanion.sh
**Stars:** 2,300 | **Forks:** 283 | **Commits:** 509 | **Releases:** 166

### Tech Stack (Specific Libraries)

**Server (Bun + Hono):**
- Bun (runtime)
- Hono ^4.7.0 (lightweight web framework)
- ws ^8.19.0 (WebSocket)
- croner ^10.0.1 (job scheduling)
- diff ^8.0.3
- fzf ^0.5.2 (fuzzy finder)

**Client (React):**
- React 19
- Vite 6.3.0
- TypeScript 5.9.3
- Tailwind CSS v4
- Zustand 5.0.0 (state management)
- CodeMirror (@codemirror/lang-* suite for 12+ languages, @uiw/react-codemirror)
- @xterm/xterm ^6.0.0 + addon-fit
- react-markdown ^10.1.0 + remark-gfm
- axe-core ^4.11.1 (accessibility testing)
- posthog-js ^1.347.2 (analytics)
- qrcode ^1.5.4

**Testing:**
- Vitest 4.0.18 with V8 coverage
- @testing-library/react ^16.3.2
- @testing-library/jest-dom, @testing-library/user-event
- vitest-axe ^0.1.0 (accessibility testing)
- jsdom ^28.0.0
- jscpd ^4.0.8 (code duplication detection)

**Documentation:**
- Mintlify (docs framework)

### Architecture

```
companion/
├── web/
│   ├── server/
│   │   ├── index.ts          # Bootstrap + dual WebSocket upgrade
│   │   ├── ws-bridge.ts      # Per-session state, NDJSON parsing, message routing
│   │   ├── cli-launcher.ts   # Subprocess management with --resume recovery
│   │   ├── session-store.ts  # JSON persistence to $TMPDIR/vibe-sessions/
│   │   ├── session-types.ts  # Complete TypeScript definitions for all message types
│   │   ├── routes.ts         # REST API for session CRUD + filesystem ops
│   │   └── env-manager.ts    # Environment profiles at ~/.companion/envs/
│   └── src/
│       ├── store.ts          # Zustand (messages, permissions, tasks per session)
│       ├── ws.ts             # Browser WebSocket client with auto-reconnection
│       ├── App.tsx           # Hash-based routing
│       └── components/       # ChatView, MessageBubble, ToolBlock, Composer
├── relay/                    # WebSocket relay logic
├── platform/                 # Core platform code
├── docs/                     # Mintlify documentation
├── landing/                  # Marketing site
├── .agents/skills/           # Agent configurations
└── scripts/                  # Build/utility scripts
```

**Data flow:**
```
Browser (React) <--ws--> Companion Server (Bun + Hono) <--ws (NDJSON)--> Claude Code CLI
```

### Communication with Claude Code

Companion uses the **`--sdk-url` WebSocket + NDJSON protocol** - the most sophisticated integration of any project:

**Launch sequence:**
```bash
claude --sdk-url ws://localhost:3456/ws/cli/SESSION_ID \
       --print \
       --output-format stream-json \
       --input-format stream-json \
       "placeholder prompt"
```

**Protocol details** (from WEBSOCKET_PROTOCOL_REVERSED.md):

1. **Connection:** CLI connects TO the server as a WebSocket client with `Authorization: Bearer <token>` header
2. **Handshake:** Server sends initial `user` message with prompt; CLI responds with `system/init` (capabilities, session_id, tools, MCP servers, model, version)
3. **Streaming:** CLI sends `stream_event` messages for token-by-token output (requires `--verbose` flag)
4. **Assistant turns:** `assistant` message with full response, content blocks (text/tool_use/thinking), stop_reason, token usage
5. **Tool approval:** `control_request` (subtype `can_use_tool`) triggers browser UI; server sends `control_response` (allow/deny/modify)
6. **Completion:** `result` message signals query completion
7. **Keepalive:** Messages every 10 seconds + WebSocket ping/pong

**Six transport classes discovered:**
- `ProcessInputTransport` - Base NDJSON parser
- `SdkUrlTransport` - WebSocket delegation
- `WebSocketTransport` - Pure WebSocket bidirectional
- `HybridTransport` - WebSocket receive + HTTP POST send
- Web UI and remote session routing variants
- `DirectConnectWebSocket` - Browser client variant

**Recording:** Raw protocol messages auto-record to `~/.companion/recordings/` as JSONL, with rotation at 1M lines.

**Session persistence:** Sessions survive server restarts; processes reconnect within grace period or relaunch with `--resume`.

### Top Community Requests (from 42 open issues)

1. **Workspace file tree** (#391) - File navigation with markdown preview
2. **Session auto-renaming** (#392) - Based on conversation content
3. **UX improvements** (#80) - Cherry-pickable from community forks
4. **Authentication layer** (#104) - For network-exposed deployments
5. **Thinking effort controls** (#138) - Granular model configuration
6. **Drag & drop** (#93) - File uploads and session organization

### What They Got Right

- **Deepest protocol understanding** - WEBSOCKET_PROTOCOL_REVERSED.md is the definitive reference for `--sdk-url`
- **Full bidirectional control** without PTY hacks or tmux
- **NDJSON streaming** enables real-time token-by-token rendering
- **Permission gating UI** with approve/deny for sensitive operations
- **Session recovery** with `--resume` flag integration
- **Recording system** for debugging and replay
- **Dual engine support** (Claude Code + Codex)
- **PWA support** for mobile access
- **Excellent testing culture** - every component has .test.tsx, accessibility scans
- **MIT license** and very active development (166 releases, v0.95.0)
- **Clean architecture** with clear separation of concerns

### What They Got Wrong

- **`--sdk-url` is undocumented** - Anthropic could break it in any update
- **No desktop app** - browser-only with `bunx the-companion`
- **Auth token management** could be more robust
- **Relatively complex setup** compared to desktop apps
- **Posthog analytics** included (some users may object)
- **Name collision risk** - "Companion" is very generic

### License & Maturity

- **MIT** - maximally permissive
- Very active (509 commits, 166 releases, v0.95.0)
- The Vibe Company as organizational maintainer
- Comprehensive documentation via Mintlify

---

## 10. Companion Protocol Deep Dive

> This section documents the `--sdk-url` WebSocket protocol in detail, as it represents the most promising communication method for Vantage.

### Message Types Reference

**Server to CLI:**
| Type | Purpose |
|------|---------|
| `user` | Send prompts (string or structured array) |
| `control_response` | Approve/deny tool execution |
| `control_cancel_request` | Cancel pending tool |
| `keep_alive` | Heartbeat |
| `update_environment_variables` | Runtime env changes |

**CLI to Server:**
| Type | Purpose |
|------|---------|
| `system` / `system/init` | Handshake with capabilities |
| `assistant` | Full LLM response with content blocks |
| `result` | Query completion signal |
| `stream_event` | Individual tokens (requires --verbose) |
| `tool_progress` | Tool execution progress |
| `tool_use_summary` | Summarized tool results |
| `auth_status` | Authentication state |
| `control_request` | Permission request for tool use |

### Token/Auth Sources (priority order)
1. `CLAUDE_CODE_SESSION_ACCESS_TOKEN` env var
2. Internal session ingress token
3. File descriptor from `CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR`

### Key Constraints
- Both `--input-format` and `--output-format` must be `stream-json`
- Placeholder prompt is ignored when using `--sdk-url`
- CLI waits indefinitely for first `user` message
- Each JSON object requires trailing newline
- Timeout for permission responses defaults to 30 seconds

---

## 11. claude-devtools

**Repository:** https://github.com/matt1398/claude-devtools
**Website:** https://www.claude-dev.tools
**Stars:** 2,900 | **Forks:** 211 | **Commits:** 288

### Tech Stack (Specific Libraries)

**Frontend:**
- React + TypeScript
- Tailwind CSS + PostCSS
- Vite (build)
- Primer React (GitHub's design system)
- IndexedDB (local caching + workspace snapshots)

**Desktop:**
- Electron + electron-vite
- Native file watchers for real-time updates (via IPC)

**Server/Standalone:**
- Express.js
- SSE (Server-Sent Events) for HTTP mode
- Docker with docker-compose

**Testing:**
- Vitest with coverage
- ESLint + Prettier

**Remote:**
- SSH2 library (SFTP channel for remote ~/.claude/ streaming)

### Architecture

```
claude-devtools/
├── src/                       # Source code
├── electron.vite.config.ts    # Electron build config
├── vite.standalone.config.ts  # Standalone server config
├── vitest.config.ts           # Test config
├── pnpm-workspace.yaml        # Monorepo workspace
├── scripts/                   # Build utilities
├── test/                      # Test files
└── resources/                 # Icons/images
```

**Deployment modes:**
1. **Desktop (Electron):** Native file watchers via IPC for instant updates
2. **Standalone (Node.js):** Express server with SSE for HTTP delivery
3. **Docker:** Zero outbound network calls, can run with `--network none`

### Communication with Claude Code

claude-devtools uses **passive log reading** - the purest non-invasive approach:

1. **Reads `~/.claude/` directory** containing raw session logs
2. **Reconstructs execution** by parsing conversation turns
3. **Extracts 7 context categories:** CLAUDE.md (global/project/directory), skill activations, @-mentioned files, tool I/O, extended thinking, team overhead, user text
4. **Detects context compaction** events and visualizes token deltas
5. **SSH remote reading** via SFTP channel for remote machine inspection

**Zero modification** to Claude Code - works retroactively with any previous session.

### Top Community Requests (from 12 open issues)

1. **Performance** (#158) - "Application UI is very slow"
2. **Session display bugs** (#154) - Sessions not showing up
3. **Token cost/ROI dashboard** (#147) - Real-time cost calculation
4. **Tauri alternative** (#144) - 90% smaller build size requested
5. **Remote access** (#107) - Tailscale/mobile support
6. **Session management** (#139, #140) - Delete and rename capabilities

### What They Got Right

- **Non-invasive philosophy** is brilliant - observe without modify
- **Retroactive analysis** of any past session is uniquely valuable
- **7-category context attribution** provides unprecedented visibility
- **Compaction visualization** helps understand context window dynamics
- **Subagent execution trees** with recursive rendering
- **Custom notification system** with regex triggers (e.g., `.env` access alerts)
- **SSH remote inspection** extends to any machine
- **Spotlight-style command palette** (Cmd+K) for cross-session search
- **Multiple deployment modes** (desktop, standalone, Docker)
- **Security model** - path containment, credential blocking, zero outbound calls
- **MIT license** and active development

### What They Got Wrong

- **Performance issues** (#158) - UI slowness is a critical flaw for a monitoring tool
- **Read-only** - cannot interact with or control Claude Code
- **Electron overhead** for what is essentially a log viewer
- **Session display bugs** (#154) suggest fragile log parsing
- **No real-time streaming** in Docker/standalone mode (SSE polling instead of WebSocket)
- **pnpm monorepo** adds complexity for contributors

### License & Maturity

- **MIT** - maximally permissive
- Active development (288 commits)
- Homebrew cask available (`brew install --cask claude-devtools`)
- Comprehensive security model documented

---

## 12. Communication Protocol Taxonomy

### Method 1: Filesystem Reading (~/.claude/)

**Used by:** Opcode, claude-devtools

**How it works:**
- Claude Code stores session data in `~/.claude/projects/` as JSONL files
- Applications read these files (with or without file watchers) to reconstruct session state
- No interaction with running Claude Code processes

**Pros:**
- Zero risk of breaking Claude Code
- Works retroactively with any past session
- No dependency on undocumented APIs
- Simple implementation

**Cons:**
- Read-only (cannot send commands or approve tools)
- No real-time streaming of active sessions
- File format could change between Claude Code versions
- Cannot see active session state, only completed turns

### Method 2: Process Spawn + stdin/stdout

**Used by:** Opcode (agents), AionUi (ACP protocol)

**How it works:**
- Spawn Claude Code CLI as a child process
- Send prompts via stdin
- Read responses from stdout/stderr
- Manage process lifecycle

**Pros:**
- Bidirectional communication
- Full control over process lifecycle
- Works with any CLI tool

**Cons:**
- PTY handling is complex and fragile
- Encoding issues (ANSI escapes, Unicode)
- Hard to parse structured data from terminal output
- Process crashes require restart logic

### Method 3: Claude Agent SDK

**Used by:** Kanna, CodePilot

**How it works:**
- Import `@anthropic-ai/claude-agent-sdk` (currently v0.2.x)
- Use typed TypeScript API to spawn and control Claude Code
- Receive structured events via callback/stream interface

**Pros:**
- Official library from Anthropic
- Typed events and structured data
- Clean API surface
- Will likely be maintained as Claude Code evolves

**Cons:**
- SDK is pre-1.0 (v0.2.x) - breaking changes expected
- Limited documentation
- May not expose all CLI features
- Adds npm dependency

### Method 4: `--sdk-url` WebSocket + NDJSON

**Used by:** Companion

**How it works:**
- Launch Claude Code with `--sdk-url ws://server:port/path`
- CLI connects as WebSocket client to your server
- Exchange NDJSON messages for full bidirectional control
- All tool calls, responses, and permissions flow through WebSocket

**Pros:**
- Full bidirectional control
- Token-by-token streaming
- Permission gating
- Session recovery via --resume
- Uses existing Claude Code subscription (no API billing)
- Most powerful integration method

**Cons:**
- `--sdk-url` is UNDOCUMENTED - could break at any time
- Reverse-engineered protocol
- Complex implementation
- Requires managing WebSocket state and reconnection

### Method 5: MCP Server (stdio)

**Used by:** Clauductor

**How it works:**
- Register as an MCP server via `claude mcp add`
- Communicate using the official MCP protocol over stdio
- Receive tool approval requests and provide responses

**Pros:**
- Uses official, documented MCP protocol
- Leverages existing Claude Code MCP infrastructure
- Clean stdio interface

**Cons:**
- Limited scope - mainly tool approval, not full session control
- Cannot send prompts or see full conversation
- MCP is designed for tool providers, not GUI wrappers

### Method 6: Terminal PTY + OSC Sequences

**Used by:** cmux, Caudex

**How it works:**
- Embed a real terminal (Ghostty/xterm) where Claude Code runs natively
- Observe terminal output including OSC escape sequences
- Send commands by writing to the PTY

**Pros:**
- Pure terminal experience
- Zero interference with Claude Code's behavior
- No dependency on undocumented APIs
- Users keep familiar terminal workflow

**Cons:**
- Cannot access Claude Code's internal state (tokens, costs, tool calls)
- Hard to parse structured information from terminal output
- Limited programmatic control
- OSC support depends on terminal and Claude Code version

### Recommended Approach for Vantage

**Hybrid strategy:**
1. **Primary:** Claude Agent SDK for programmatic session control (official, typed, maintained)
2. **Secondary:** `--sdk-url` WebSocket for advanced features (streaming, permission gating)
3. **Fallback:** Filesystem reading for session history and analytics
4. **Embedded terminal** for users who prefer the CLI experience

---

## 13. Community Feature Demand Analysis

### Cross-Project Feature Request Ranking

Based on analyzing 1,000+ issues across all 10 projects, here are the most requested features:

| Rank | Feature | Projects Requesting | Evidence |
|------|---------|-------------------|----------|
| 1 | **Cross-platform support** (Win/Mac/Linux) | Opcode, cmux, Caudex | Hundreds of issues |
| 2 | **Parallel/multi-session management** | Opcode, Nimbalyst, AionUi, Companion | Core differentiator |
| 3 | **Remote/mobile access** | Opcode, cmux, claude-devtools, Companion | SSH, web, mobile |
| 4 | **Cost/token monitoring** | Opcode, Caudex, claude-devtools, Companion | Financial visibility |
| 5 | **Session persistence/recovery** | cmux, Kanna, Companion | Survive restarts |
| 6 | **Customizable keybindings** | cmux, Caudex | Developer ergonomics |
| 7 | **MCP server management UI** | Opcode, AionUi, Caudex | Visual config |
| 8 | **Multi-provider support** | CodePilot, AionUi, Kanna | Beyond Claude-only |
| 9 | **File tree/workspace view** | CodePilot, Companion | Project navigation |
| 10 | **Thinking/reasoning visibility** | Nimbalyst, claude-devtools | Debug/transparency |

### Underserved Needs (Gaps in All Projects)

1. **Diff review workflow** - Only Nimbalyst has meaningful inline diff review; most projects show raw text
2. **Team/collaborative features** - Only cmux has teammate mode support
3. **Git integration beyond status** - Only Nimbalyst provides worktree isolation per session
4. **Context window visualization** - Only claude-devtools shows compaction dynamics
5. **Notification customization** - Only claude-devtools has regex-based custom triggers
6. **Offline/export capabilities** - No project handles session export well
7. **Plugin/extension system** - Only Kanna community requests it; no project has one

---

## 14. Strategic Lessons for Vantage

### Lessons to Steal

| From | Lesson | Why It Matters |
|------|--------|---------------|
| **Companion** | `--sdk-url` protocol documentation | Deepest integration method available |
| **Companion** | NDJSON recording to ~/.companion/recordings/ | Debug and replay capability |
| **Companion** | Session recovery with --resume | Resilience against crashes |
| **Kanna** | Event sourcing + CQRS architecture | Enables undo, audit, replay |
| **Kanna** | Snapshot compaction for JSONL logs | Prevents unbounded growth |
| **cmux** | Performance obsession (3 hot paths documented) | Typing latency must be sacred |
| **cmux** | Workspace metadata in tabs (git branch, PR, ports) | Contextual awareness |
| **cmux** | Notification system with blue rings | Multi-agent monitoring |
| **Opcode** | Checkpoint/timeline system with branching | Session versioning |
| **Opcode** | CLAUDE.md editor with live preview | Developer need |
| **Opcode** | Tauri 2 for small binaries (15-30MB) | Distribution advantage |
| **claude-devtools** | 7-category context attribution | Unprecedented visibility |
| **claude-devtools** | Compaction visualization | Understanding context dynamics |
| **claude-devtools** | Custom notification triggers (regex) | Configurable monitoring |
| **claude-devtools** | SSH remote inspection | Enterprise need |
| **Nimbalyst** | Kanban for session management | Workflow organization |
| **Nimbalyst** | Git worktree per session | Conflict prevention |
| **Nimbalyst** | 7+ visual editors | Beyond chat paradigm |
| **AionUi** | Auto-detection of installed CLI agents | Zero-config discovery |
| **CodePilot** | Bridge system (Telegram/Discord/etc.) | Remote access |

### Mistakes to Avoid

| Mistake | Projects Affected | How to Avoid |
|---------|-------------------|-------------|
| **Development stall** | Opcode (7+ months silent) | Commit to sustainable cadence |
| **AGPL/GPL license** | Opcode, cmux | Use MIT or Apache-2.0 |
| **macOS-only** | cmux | Choose cross-platform tech from day 1 |
| **Feature bloat** | CodePilot, AionUi | Define scope, say no |
| **Closed source** | Nimbalyst, Caudex | Open source builds trust |
| **Depending on undocumented APIs** | Companion (--sdk-url) | Have fallback paths |
| **Electron bloat** | CodePilot (Next.js server per window) | Use Tauri 2 or optimize |
| **Chinese-only community** | CodePilot | English-first, i18n second |
| **Performance issues** | claude-devtools (#158) | Profile early, profile often |
| **No desktop app** | Kanna, Companion | Desktop presence matters for IDE |
| **Poor session persistence** | cmux, Kanna | Sessions must survive restarts |
| **Analytics without consent** | Opcode (PostHog), Companion (PostHog) | Explicit opt-in only |

### Architecture Recommendations for Vantage

Based on this analysis:

1. **Framework:** Tauri 2 (Rust backend, React frontend) - proven by Opcode's 21k stars, small binaries, native performance
2. **Communication:** Hybrid approach
   - Claude Agent SDK (primary, official)
   - `--sdk-url` WebSocket (advanced features, with fallback)
   - Filesystem reading (history, analytics)
   - Embedded terminal (power users)
3. **State Management:** Event sourcing with JSONL (from Kanna) + Zustand for UI state
4. **Session Model:** Kanban-style multi-session (from Nimbalyst) with git worktree isolation
5. **Monitoring:** Passive log analysis (from claude-devtools) + active streaming (from Companion)
6. **Distribution:** MIT license, cross-platform from day 1, auto-update via Tauri updater
7. **Performance:** Document and protect hot paths (from cmux's approach)
8. **Testing:** Accessibility-first testing (from Companion's vitest-axe approach)

### Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `--sdk-url` breaks in Claude Code update | Medium | High | Claude Agent SDK as primary, --sdk-url as enhancement |
| Claude Agent SDK has breaking changes (pre-1.0) | High | Medium | Abstract behind interface, version-lock |
| Session file format changes | Medium | Medium | Version detection, format adapters |
| Anthropic releases official GUI | High | Very High | Differentiate on multi-agent, visual editors, extensibility |
| Tauri 2 ecosystem limitations | Low | Medium | Escape hatches to native code via Rust |

---

## Appendix A: Dependency Comparison

### State Management

| Project | Solution |
|---------|----------|
| Opcode | Zustand |
| CodePilot | Zustand (inferred) |
| Kanna | Zustand + Event Sourcing |
| Companion | Zustand 5.0.0 |
| AionUi | React state (inferred) |

### UI Component Libraries

| Project | Solution |
|---------|----------|
| Opcode | Radix UI + shadcn/ui + Tailwind |
| CodePilot | Radix UI + Tailwind + Primer React |
| Kanna | Radix UI + Tailwind + @dnd-kit |
| Companion | CodeMirror + Tailwind + custom |
| AionUi | Arco Design + custom |
| claude-devtools | Primer React + Tailwind |

### Build Tools

| Project | Solution |
|---------|----------|
| Opcode | Vite 6 + Tauri CLI |
| CodePilot | Next.js 16 + electron-builder |
| Kanna | Vite 6 + Bun |
| Companion | Vite 6 + Bun |
| AionUi | electron-vite + Vite 6 |
| claude-devtools | electron-vite + Vite |
| Clauductor | Nuxt + GoReleaser |

### Terminal Libraries

| Project | Solution |
|---------|----------|
| Kanna | @xterm/xterm 6.0 + @xterm/headless |
| Companion | @xterm/xterm 6.0 |
| cmux | libghostty (native GPU-accelerated) |
| Nimbalyst | Ghostty (embedded) |

---

## Appendix B: Creator Background & Resources

| Project | Creator/Org | Background | Resources |
|---------|-------------|------------|-----------|
| Opcode | winfunc | Unknown | [Docs](https://opcode.sh/docs/), [BrightCoding review](https://www.blog.brightcoding.dev/2026/02/13/opcode-the-revolutionary-claude-code-command-center) |
| Nimbalyst | Nimbalyst Inc. | Enterprise product team | [Blog](https://nimbalyst.com/blog/), [Docs](https://docs.nimbalyst.com), [YouTube](https://youtube.com/@nimbalyst) |
| CodePilot | @op7418 | Chinese dev community | [Site](https://apps/site/) |
| cmux | Manaflow AI | Multi-agent workflow focus | [Docs](https://cmux.com/docs/), [CLAUDE.md](https://github.com/manaflow-ai/cmux/blob/main/CLAUDE.md), [Discord](https://discord.gg/cmux) |
| AionUi | iOfficeAI | Office automation + AI | [Wiki](https://github.com/iOfficeAI/AionUi/wiki), [Discord](https://discord.gg/aionui) |
| Caudex | Koji Hayashida | Co-Founder of Reedr | [caudex.sh](https://caudex.sh), [Product Hunt](https://producthunt.com/products/caudex) |
| Clauductor | Mikolaj Badyl | Solo developer | [GitHub](https://github.com/mikolajbadyl/clauductor) |
| Kanna | jakemor | Event sourcing enthusiast | [GitHub](https://github.com/jakemor/kanna), [npm](https://www.npmjs.com/package/kanna-code) |
| Companion | The Vibe Company / @stangirard | Protocol reverse-engineering | [Docs](https://thecompanion.sh), [Protocol](https://github.com/The-Vibe-Company/companion/blob/main/WEBSOCKET_PROTOCOL_REVERSED.md), [HN discussion](https://news.ycombinator.com/item?id=46959324) |
| claude-devtools | matt1398 | DevTools builder | [Website](https://www.claude-dev.tools/), [GitHub](https://github.com/matt1398/claude-devtools) |

---

*This research document is maintained as part of the Vantage project's competitive intelligence. Last updated: April 3, 2026.*
