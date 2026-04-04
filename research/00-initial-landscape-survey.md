# Vantage Research — Initial Landscape Survey
## Round 1 Findings (2026-04-04)

---

## 1. Existing Claude Code GUI Projects

### Tier 1: Major Desktop Apps

| Project | Tech Stack | Stars | Key Differentiator |
|---------|-----------|-------|-------------------|
| **Opcode** (formerly Claudia) | Tauri 2 + React + TS + Rust | ~19-21k | Most popular OSS option. Sandbox security. AGPL. |
| **CodePilot** | Electron + Next.js | Active | Full IDE-like experience. SQLite sessions. Multi-provider. |
| **Nimbalyst** | Desktop app | Active | 7+ visual editors, kanban for parallel agents, iOS companion. |
| **AionUi** | Electron | Active | Supports 15+ CLI agents. Auto-detects installed CLIs. |
| **Caudex** | Native desktop terminal | Launched | Lightweight enhancer. Real-time cost monitoring. |
| **TOKENICODE** | Tauri 2 + React 19 + TS + Tailwind 4 | Active | Multi-provider. Apache 2.0. Chinese market focus. |
| **Kuse Cowork** | Rust-native | Active | Multi-provider, local-first, no lock-in. |

### Tier 2: Web-Based UIs

| Project | Tech Stack | Key Differentiator |
|---------|-----------|-------------------|
| **CloudCLI** | React, responsive | File explorer, git, MCP, plugin system, mobile-responsive. |
| **Kanna** | React + Zustand + Bun + WebSocket | Multi-provider, drag-and-drop, rich transcript rendering. |
| **Companion** | Bun + React 19 + Tailwind v4 | Exploits hidden `-sdk-url` flag. Permission control from UI. |
| **Clauductor** | Web-based | Unique "execution map" visualization of tool calls. |
| **Claudeck** | Zero-framework, 6 deps | DAG workflows, multi-client sync. |
| **lennardv2/webui** | Nuxt 4, PWA | Voice input, TTS, mobile-first. |

### Tier 3: Inspection / History Tools

| Project | Approach |
|---------|---------|
| **claude-devtools** | "Browser DevTools for Claude Code" — reads raw session logs, visualizes tool calls, subagent trees, token attribution. |
| **claude-run** | Beautiful web UI for browsing conversation history. |
| **Claude Code History Viewer** | SSE live updates, full-text search, token/cost stats. |

### Tier 4: Agent Orchestration GUIs

| Project | Approach |
|---------|---------|
| **claude_agent_teams_ui** | Real-time kanban for Claude Code's native agent teams. |
| **Vibe Kanban** | Rust + TS. 10+ agents, kanban, code review, browser preview. |
| **Claw-Kanban** | 6-column kanban, role-based auto-assignment across CLIs. |

### Tier 5: Terminal Enhancers

| Project | Approach |
|---------|---------|
| **cmux** | Swift/AppKit + libghostty. Purpose-built terminal for multi-agent. Vertical tabs, notification system, scriptable browser. macOS only. |

---

## 2. Official Offerings

- **Claude Code Desktop** (Electron): Computer use, Dispatch, parallel sessions with git isolation, visual diff review, app previews, PR monitoring. First-party.
- **Claude Code Web** (claude.ai/code): Research preview with GitHub integration.

---

## 3. Tech Stack Patterns in the Wild

| Approach | Examples | Pros | Cons |
|----------|---------|------|------|
| **Tauri 2 + React + Rust** | Opcode, TOKENICODE | ~6MB binaries, native perf, security sandbox | Smaller ecosystem |
| **Electron + Next.js/React** | CodePilot, AionUi, Official Desktop | Familiar stack, large ecosystem | Heavy RAM (~200-400MB overhead) |
| **Web-only (Bun/Node server)** | Kanna, Companion, CloudCLI | No install, any device | No native OS integration |
| **Native Swift/AppKit** | cmux | Best macOS perf, deep OS integration | macOS only |
| **Rust native** | Kuse Cowork | Lightweight, fast | Smaller community |

---

## 4. Multi-Agent Orchestration Landscape

### Methodologies

| Methodology | Key Idea |
|------------|---------|
| **BMAD** | AI-specific Agile. 12+ agent personas as Markdown files. YAML workflows. Sharding for context management. |
| **ChatDev** | Waterfall with role-playing agents (CEO, CTO, Programmer, Tester). |
| **MetaGPT** | SOP-driven. Takes one-line requirement, outputs through internal roles. |
| **AgileCoder** | Sprint-based. Dynamic Code Graph Generator. Outperforms ChatDev/MetaGPT. |
| **Augment Code Patterns** | Six coordination patterns: spec-driven decomposition, worktree isolation, coordinator/specialist/verifier, model routing, quality gates, sequential merges. |

### Orchestration Tools

| Tier | Tools |
|------|-------|
| **In-Process** | Claude Code Subagents, Claude Code Agent Teams (experimental) |
| **Local Orchestrators** | Conductor, Claude Squad, Gas Town, Multiclaude, Agent Orchestrator, Superset, amux, Antfarm |
| **Cloud Async** | Claude Code Web, GitHub Copilot Agent, Jules (Google), Codex Web, Cursor Cloud + Glass |

### Git Isolation Strategies

- **Worktrees** are the consensus mechanism (shared .git, isolated working files)
- **Sequential merging** is the universal best practice
- **File ownership model** prevents two agents from editing the same file
- **Clash** tool provides early conflict detection via three-way merge simulation
- **Hotspot files** (configs, routing tables, barrel exports) need special handling

### Key Research Findings

- **Optimal agent count**: 3-5 parallel agents is the sweet spot
- **Hierarchical > flat**: Two-level hierarchies (router + specialists) outperform other structures
- **Verification is the bottleneck**: Multi-agent gains bounded by review throughput, not generation speed
- **Four failure modes**: merge conflicts, duplicated implementations, semantic contradictions, context exhaustion
- **Critical insight**: "Running ten agents in parallel is easy. Giving ten agents tasks that are actually independent — that's hard."

### Context Sharing Patterns

| Pattern | Used By |
|---------|---------|
| AGENTS.md / CLAUDE.md shared files | Claude Code, Gas Town, most tools |
| Beads (immutable JSONL records) | Gas Town |
| Peer messaging | Claude Code Agent Teams |
| Progress files (DATA.md, LOGIC.md) | Various orchestrators |
| Shared kanban / SQLite task list | amux, Agent Teams |

---

## 5. Community Sentiment

- r/ClaudeCode has 4,200+ weekly contributors — most active AI coding community
- **"Chat wrapper" → "workspace"** evolution is happening in real-time
- **Multi-agent is the frontier** — most new tools focus on orchestration
- **Mobile access** is highly demanded
- **Inspection tools** represent a counter-trend (understand what happened vs. control what happens)
