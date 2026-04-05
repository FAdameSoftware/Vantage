# Supplemental Findings: AI-Native IDE Deep Dive
## Additional Competitors & Detailed Analysis

**Generated**: 2026-04-04
**Source**: Final research agent covering AI-native IDE competitors in depth

---

## NEW COMPETITORS NOT IN OTHER REPORTS

### Hermes IDE (**HIGH THREAT** — Same Stack)
- **URL**: https://github.com/hermes-hq/hermes-ide / https://hermes-ide.com
- **Stack**: **Tauri + React + Rust** (same as Vantage)
- **What**: AI-native terminal emulator and IDE
- **Key Features**:
  - 5 AI providers in one terminal (Claude, Gemini, Aider, Codex, Copilot)
  - Three execution modes: Manual, Assisted, Autonomous
  - Git worktrees for parallel project work
  - Project scanning for context building
  - Real-time command suggestions
  - Pre-built installers for macOS, Windows, Linux
- **Threat Level**: HIGH. Same stack, multi-provider, execution modes are a compelling UX.

### SideX — VS Code Rebuilt on Tauri
- **URL**: https://github.com/Sidenai/sidex
- **Stack**: **Tauri + VS Code codebase**
- **What**: Full VS Code rebuilt on Tauri (96% smaller, 31MB installed)
- **Status**: Brand new (days old)
- **Key Features**: Core editor, terminal (real PTY), file explorer, git (17 commands), search, themes, extensions. 49 Tauri commands across 9 modules.
- **Threat Level**: MEDIUM. Proves VS Code on Tauri is possible. If AI features are added, direct competitor.
- **Key insight**: SideX achieving 31MB binary validates Vantage's Tauri approach decisively.

### Qodo (formerly CodiumAI)
- **URL**: https://www.qodo.ai
- **What**: AI code review and testing platform
- **Funding**: $70M Series B
- **Key Features**: Multi-agent code review (highest F1 score at 60.1%), automatic unit test generation, GitHub/GitLab/Bitbucket/Azure DevOps, Gartner "Visionary"
- **Relevance**: Shows quality gates and AI code review are becoming table stakes. Validates Vantage's VerificationDashboard direction.

### OpenCovibe
- **URL**: https://github.com/AnyiWang/OpenCovibe
- **Stack**: **Tauri v2 + Svelte 5 + SvelteKit** + xterm.js
- **What**: Local-first desktop app for AI coding agents (Claude Code, Codex)
- **Key Features**: Three communication modes (stream-JSON, PTY, pipe), all data stored locally, tool calls as inline cards with syntax-highlighted diffs
- **Relevance**: Another Tauri v2 competitor, using Svelte instead of React. Primarily macOS.

### Glyphic
- **Stack**: Tauri v2 + Svelte 5
- **What**: Built in 48 hours as a Claude Code GUI
- **Relevance**: Shows how quickly Tauri GUIs can be spun up — low barrier to entry in this space.

### AgentsView
- **URL**: https://github.com/wesm/agentsview
- **What**: Local-first app for browsing/analyzing sessions from Claude Code, Codex, Gemini, OpenCode, Copilot
- **Relevance**: Multi-agent session viewer, not a full IDE. But the observability angle is relevant to Vantage.

### Melty (Y Combinator)
- **URL**: https://github.com/meltylabs/melty
- **Stack**: VS Code fork, chat-first paradigm
- **Key Features**: Conversational AI as primary interface, VS Code compatible, multi-model
- **Status**: Active (Jan 2026)
- **Relevance**: "Chat-first" paradigm is interesting contrast to Vantage's "IDE-first" approach.

### Kilo Code
- **URL**: https://kilo.ai / https://github.com/Kilo-Org/kilocode
- **Users**: 1.5M+ "Kilo Coders"
- **What**: All-in-one agentic platform, #1 on OpenRouter
- **Key Features**: 500+ AI model support, VS Code + JetBrains + CLI, Architect/Coder/Debugger modes, MCP Marketplace, 25T+ tokens processed
- **Relevance**: Breadth of model support is notable — 500+ models.

---

## ADDITIONAL DETAIL ON KNOWN COMPETITORS

### Opcode/Claudia — Expanded Intel
- **Y Combinator backed** (Asterisk batch)
- **AGPL-3.0 license** — copyleft, which limits commercial forks
- Original name "Claudia" likely faced trademark pressure from Anthropic → renamed to "opcode"
- Community reported: installation failures, sluggish UI, poor scrolling, missing session context
- Despite 19-21K stars, user experience complaints suggest traction ≠ quality

### Cursor — Additional Data Points
- **2M+ total users**, 1M+ paying, 1M DAU
- **200K native context window** (vs Claude Code's 1M)
- June 2025 credit switch effectively cut Pro requests from ~500 to ~225/month
- Supermaven acquisition (Nov 2024) gave them 72% autocomplete acceptance rate

### Windsurf — Additional Data Points
- **Acquired by Cognition for $250M** (July 2025)
- Price raised from $15 to $20/month in March 2026
- **SOC 2/HIPAA/FedRAMP/ITAR certified** — enterprise compliance leader
- 40+ IDE plugins (JetBrains, Vim, NeoVim, Xcode) — broadest plugin support

### OpenAI Codex CLI — Open Source in Rust
- **URL**: https://github.com/openai/codex
- **Open source** — built in Rust
- Multi-step reasoning, subagents, code review by separate agent, MCP support
- Image input (paste screenshots/design specs into terminal)
- GPT-5.3-Codex model — "most capable agentic coding model"
- Windows: experimental/WSL only
- **Key insight**: OpenAI open-sourcing their CLI in Rust validates the Rust-based tooling approach.

### Gemini CLI — Free Tier is Disruptive
- **URL**: https://github.com/google-gemini/gemini-cli
- **Completely free** with personal Google account (60 req/min, 1000/day)
- Gemini 2.5 Pro with 1M token context
- MCP support, multi-step autonomous tasks
- **Key insight**: Vantage should consider Gemini CLI as an alternative backend — free model access would dramatically lower user costs.

---

## TOTAL TAURI-BASED COMPETITORS IDENTIFIED

A full accounting of every Tauri-based competitor found across all research:

| Project | Stack | Stars | Focus | Active? |
|---------|-------|-------|-------|---------|
| CC-Switch | Tauri 2 + Rust + TS | 39K | CLI manager | Yes |
| opcode | Tauri 2 + React + TS + shadcn | 21K | Claude Code GUI | Abandoned? |
| Hermes IDE | Tauri + React + Rust | Unknown | AI terminal + IDE | Yes |
| TOKENICODE | Tauri 2 + React 19 + TS + TW4 | 238 | Claude Code client | Yes |
| OpenCovibe | Tauri v2 + Svelte 5 | Unknown | Multi-agent desktop | Yes |
| IfAI | Tauri 2.0 + React 19 | 81 | AI code editor | Yes |
| SideX | Tauri + VS Code | Unknown | VS Code on Tauri | Brand new |
| ClifPad | Tauri + SolidJS + Monaco | 9 | Native code editor | Yes |
| Glyphic | Tauri v2 + Svelte 5 | Unknown | Claude Code GUI | Unknown |
| mensa | Svelte + Tauri | 19 | Claude Code UI | Stale |
| claude-code-desktop (hsiaol) | Tauri 2 + React + Zustand | 2 | Claude Code desktop | Active |
| **Vantage** | **Tauri 2 + React 19 + TS + TW4 + shadcn** | **—** | **Full IDE** | **Yes** |

**Key insight**: At least 11 other Tauri-based projects are in this space. The framework choice is validated, but Vantage needs to execute on being the most COMPLETE — full IDE, not just a GUI wrapper.

---

## MARKET SIZE DATA

- **$12.8B** — AI coding tools market 2026 (up from $5.1B in 2024)
- **$22.2B** — projected by 2030 at ~23% CAGR
- **84%** — developer adoption rate
- **51%** — code committed to GitHub that is AI-assisted (early 2026)
- **78%** — Fortune 500 companies with AI-assisted dev in production
- **20M+** — GitHub Copilot total users
- **4.7M** — GitHub Copilot paid subscribers (~42% market share)
- **2M+** — Cursor total users
- **1M+** — Windsurf active users
- **120K** — OpenCode GitHub stars
- **5M** — OpenCode monthly users

---

## ADDITIONAL SOURCES

- [Hermes IDE GitHub](https://github.com/hermes-hq/hermes-ide)
- [SideX GitHub](https://github.com/Sidenai/sidex)
- [Qodo](https://www.qodo.ai/)
- [OpenCovibe GitHub](https://github.com/AnyiWang/OpenCovibe)
- [Melty GitHub](https://github.com/meltylabs/melty)
- [Kilo Code](https://kilo.ai/)
- [OpenAI Codex CLI](https://github.com/openai/codex)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- [AI Coding Tools Market Report](https://www.cognitivemarketresearch.com/ai-code-tools-market-report)
- [Cursor AI Statistics 2026](https://www.getpanto.ai/blog/cursor-ai-statistics)
- [Windsurf AI Statistics](https://www.getpanto.ai/blog/windsurf-ai-ide-statistics)
- [Cursor vs Windsurf vs Claude Code 2026](https://dev.to/pockit_tools/cursor-vs-windsurf-vs-claude-code-in-2026-the-honest-comparison-after-using-all-three-3gof)
