# Development Tooling Research: MCP Servers, Plugins, Skills & Tools

**Date:** 2026-04-03
**Purpose:** Exhaustive survey of tools to enhance AI-assisted development for Vantage (Tauri v2 + React desktop IDE)
**Status:** Research complete -- ready for installation decisions

---

## Table of Contents

1. [UI Development & Testing](#1-ui-development--testing)
2. [Code Review & Quality](#2-code-review--quality)
3. [Better Agentic Frameworks](#3-better-agentic-frameworks)
4. [Browser Automation & Testing](#4-browser-automation--testing)
5. [Development Workflow](#5-development-workflow)
6. [Documentation & Learning](#6-documentation--learning)
7. [Already Installed (Inventory)](#7-already-installed-inventory)
8. [Prioritized Installation Plan](#8-prioritized-installation-plan)

---

## 1. UI Development & Testing

### 1.1 Visual Testing & Screenshot Comparison

#### Playwright MCP (Already Installed)
- **URL:** https://github.com/microsoft/playwright-mcp
- **What:** Microsoft's official MCP server for Playwright. Reads pages via accessibility tree (not screenshots), enabling structured page understanding. Supports `toHaveScreenshot()` for built-in visual regression.
- **Vantage relevance:** Already installed as `mcp__plugin_playwright_playwright`. Can drive the Vantage webview for E2E testing. Built-in screenshot comparison provides zero-dependency visual regression.
- **Install:** Already present
- **Maturity:** Very high -- Microsoft-backed, de facto standard in 2026

#### LambdaTest SmartUI MCP Server
- **URL:** https://www.lambdatest.com/support/docs/smartui-mcp-server/
- **What:** AI-powered visual regression server. Evaluates UI changes based on human-like perception rather than pixel-only diffs. Returns natural-language summaries, visual change detection, and root-cause analysis via `comparisonId`.
- **Vantage relevance:** Could provide sophisticated visual regression analysis for the IDE's UI during development. The AI-powered diff is more useful than raw pixel comparison for complex UIs.
- **Install:** `npm install -g @lambdatest/smartui-cli` + MCP URL config with LambdaTest credentials
- **Maturity:** Commercial (LambdaTest/BrowserStack). Launched May 2025. Requires paid account.
- **Verdict:** Consider if we need cloud-based VRT beyond Playwright's built-in

#### BackstopJS
- **URL:** https://github.com/garris/BackstopJS
- **What:** Most established open-source visual regression tool. Uses headless Chrome via Puppeteer/Playwright. Generates interactive HTML report with before/after scrubber.
- **Vantage relevance:** The interactive scrubber report is genuinely useful for reviewing visual changes. Could be used in CI to catch UI regressions in Vantage's component library.
- **Install:** `npm install -g backstopjs`
- **Maturity:** High -- long-standing OSS project, MIT license
- **Verdict:** Good complement to Playwright's `toHaveScreenshot()` for richer reporting

### 1.2 CSS Debugging & Layout Inspection

#### Web Inspector MCP (antonzherdev/mcp-web-inspector)
- **URL:** https://github.com/antonzherdev/mcp-web-inspector
- **What:** Comprehensive web inspection and debugging via MCP. Built on Playwright. Provides progressive DOM inspection, visibility debugging (why clicks fail), layout constraint tracing (walks DOM to find unexpected margins/width/overflow), computed CSS access, and selector testing.
- **Vantage relevance:** **HIGH PRIORITY.** Directly addresses AI's weakness with UI development. Can trace layout issues, validate element spacing, debug CSS problems in Vantage's complex panel layouts.
- **Install:** Auto-installs via npx when configured in MCP settings
- **Maturity:** Active GitHub project
- **Verdict:** INSTALL -- directly solves the "AI can't debug CSS" problem

#### Chrome Inspector MCP (devtoolcss/chrome-inspector-mcp)
- **URL:** https://github.com/devtoolcss/chrome-inspector-mcp
- **What:** Gives agents DOM Elements, CSS Rules, and Computed Styles from Chrome DevTools. Maintains a DOM mirror of the inspected page. Lightweight alternative to full devtools-frontend SDK.
- **Vantage relevance:** Enables AI to read computed styles, calculate CSS values, and write fixes. Useful for debugging dark mode, responsive layouts, and CSS variable issues.
- **Install:** `npx chrome-inspector-mcp@latest` in MCP config
- **Maturity:** Active development
- **Verdict:** INSTALL -- complementary to the chrome-devtools-mcp we already have

#### dev-inspector-mcp (mcpc-tech/dev-inspector-mcp)
- **URL:** https://github.com/mcpc-tech/dev-inspector-mcp
- **What:** AI-powered visual debugging for React, Vue, Svelte, SolidJS, Preact & Next.js. Click "Ask AI" in browser, select agent (Claude Code, etc.), agent runs in terminal but interacts with browser overlay. Provides source code location, computed styles, component hierarchy, IDs, classes, and screenshots.
- **Vantage relevance:** **HIGH PRIORITY.** React-specific visual debugging. Can inspect Vantage's React component hierarchy, get full context including source file locations and computed styles. Custom tools feature allows registering tools that run in browser context with access to app state.
- **Install:** npm package, configure as MCP server
- **Maturity:** Active, supports both MCP and ACP protocols
- **Verdict:** INSTALL -- React-specific component inspection is exactly what we need

### 1.3 Design-to-Code Workflows

#### Figma MCP (Already Installed)
- **URL:** Anthropic official integration
- **What:** Read designs from Figma, get design context, screenshots, metadata. Supports Code Connect mappings between Figma components and codebase components.
- **Vantage relevance:** Already installed. Use for translating Figma mockups to Vantage components.
- **Install:** Already present as `mcp__claude_ai_Figma`
- **Maturity:** Official Anthropic integration

#### shadcn/ui MCP Server (Official)
- **URL:** https://ui.shadcn.com/docs/mcp
- **What:** Official MCP server for shadcn/ui v4. Provides browsing/discovering components, retrieving documentation and usage examples, installing components with auto-detection of package manager.
- **Vantage relevance:** **HIGH PRIORITY.** Vantage uses shadcn components (evidenced by `shadcn` in package.json). This server gives AI direct access to component docs, installation, and usage patterns.
- **Install:** Configure as MCP server per shadcn docs
- **Maturity:** Official -- maintained by shadcn team. CLI v4 released March 2026.
- **Verdict:** INSTALL -- we're already using shadcn, this makes AI much better at using it

#### shadcn-ui-mcp-server (Jpisnice)
- **URL:** https://github.com/Jpisnice/shadcn-ui-mcp-server
- **What:** Community MCP server for shadcn component structure, usage, and installation. Compatible with React, Svelte 5, Vue & React Native.
- **Vantage relevance:** Alternative to official server if official lacks features.
- **Install:** npm/npx
- **Maturity:** Community project
- **Verdict:** Use official server first, fall back to this if needed

### 1.4 Component Library & Storybook

#### Storybook MCP Server (Official)
- **URL:** https://storybook.js.org/docs/ai/mcp/overview
- **What:** Official MCP server connecting Storybook to AI agents. Agents can write stories, preview generated UI, run interaction tests and accessibility checks. Provides development, docs, and testing toolsets.
- **Vantage relevance:** If we add Storybook for Vantage's component library (recommended), this lets AI agents write and test component stories. Accessibility checks are built in. Currently React-only in preview, which matches our stack.
- **Install:** `@storybook/addon-mcp` + `storybook-mcp-server`
- **Maturity:** Official Storybook project. Preview status as of March 2026.
- **Verdict:** CONSIDER -- requires adding Storybook to project first, but very valuable for component-driven development

### 1.5 Accessibility Testing

#### Axe MCP Server (Official -- Deque)
- **URL:** https://github.com/dequelabs/axe-mcp-server-public
- **What:** Official Deque MCP server for axe accessibility testing. Integrates with Claude, Copilot, Cursor. AI-powered remediation suggestions.
- **Vantage relevance:** **HIGH PRIORITY.** IDE should be accessible. This enables AI to find and fix a11y issues in Vantage's UI during development. Official Deque backing means gold-standard WCAG compliance.
- **Install:** Configure in MCP settings
- **Maturity:** Official vendor product (Deque is the axe-core company)
- **Verdict:** INSTALL -- accessibility is critical for an IDE

#### a11y-mcp (priyankark)
- **URL:** https://github.com/priyankark/a11y-mcp
- **What:** Open-source MCP server for accessibility audits using axe-core. Works in agentic loops with AI assistants.
- **Vantage relevance:** Lighter-weight alternative to official Deque server. Good for quick audits.
- **Install:** `npx a11y-mcp`
- **Maturity:** Community project, active
- **Verdict:** Use as backup if Deque's server has licensing concerns

#### a11ymcp (ronantakizawa)
- **URL:** https://github.com/ronantakizawa/a11ymcp
- **What:** Uses axe-core + Puppeteer. 6k+ downloads, #20 on ProductHunt. WCAG compliance checking.
- **Vantage relevance:** Another option for accessibility auditing.
- **Install:** npm/npx
- **Maturity:** 6k+ downloads, ProductHunt featured
- **Verdict:** Consider as alternative

---

## 2. Code Review & Quality

### 2.1 Security Analysis

#### Trail of Bits Security Skills (Claude Code Plugin)
- **URL:** https://github.com/trailofbits/skills
- **What:** Claude Code plugin marketplace from one of the most respected security firms. Skills for security research, vulnerability detection, and audit workflows. Includes:
  - **Audit Context Building:** Line-by-line code analysis with cross-function flow tracking
  - **Dimensional Analysis:** 93% recall vs 50% for baseline prompts on real audit findings
  - **Agentic Actions Auditor:** Analyzes GitHub Actions for AI-agent vulnerabilities
- **Vantage relevance:** **HIGH PRIORITY.** Critical for an IDE that will handle user code and execute commands. Security audit of Tauri IPC channels, command injection vectors, and React XSS patterns.
- **Install:** Claude Code plugin marketplace
- **Maturity:** Very high -- Trail of Bits is industry-leading security firm. Updated Feb 2026.
- **Verdict:** INSTALL -- non-negotiable for a tool that runs code

#### Semgrep MCP Server
- **URL:** https://www.pulsemcp.com/servers/stefanskiasan-semgrep
- **What:** MCP wrapper around Semgrep CLI. 639 GitHub stars. Provides 7 tools for static analysis.
- **Vantage relevance:** Semgrep is already installed but needs configuration. This MCP server lets AI agents run Semgrep scans directly. Semgrep has dedicated TypeScript and React rulesets with 423+ TypeScript-specific rules.
- **Install:** MCP server config (requires Semgrep CLI installed)
- **Maturity:** 639 stars, active community
- **Verdict:** INSTALL -- makes our existing Semgrep installation AI-accessible

#### Semgrep Configuration for Vantage
- **URL:** https://semgrep.dev/p/typescript | https://semgrep.dev/p/react
- **What:** Pre-built rulesets. TypeScript ruleset covers type safety, security patterns. React ruleset covers XSS, unsanitized methods, and unsafe patterns.
- **Vantage relevance:** Direct configuration for our TypeScript + React stack.
- **Install:** `semgrep --config p/typescript --config p/react`
- **Maturity:** Official Semgrep registry
- **Verdict:** CONFIGURE -- we have Semgrep, just need to point it at the right rules

#### Snyk MCP Server (Official)
- **URL:** Referenced in chatforest.com/reviews/code-security-mcp-servers/
- **What:** Most comprehensive security MCP -- 11 tools covering SAST, SCA, IaC, containers, SBOM, and AI-BOM. Scans dependencies, code patterns, and infrastructure.
- **Vantage relevance:** SCA (Software Composition Analysis) is critical -- Vantage has many npm dependencies. Snyk can scan for vulnerable packages and suggest fixes.
- **Install:** MCP server config + Snyk CLI (`npm install -g snyk`)
- **Maturity:** 26 GitHub stars for MCP server, but Snyk itself is the industry leader
- **Verdict:** INSTALL -- dependency vulnerability scanning is essential

#### SonarQube MCP Server (Official)
- **URL:** https://github.com/SonarSource/sonarqube-mcp-server
- **What:** 423 stars, 321 commits. Code quality analysis including bugs, code smells, security hotspots, and maintainability.
- **Vantage relevance:** Comprehensive code quality beyond just security. Catches code smells and maintainability issues in our growing codebase.
- **Install:** `claude mcp add sonarqube` or Docker container
- **Maturity:** High -- 423 stars, official vendor, active development
- **Verdict:** CONSIDER -- may be overkill for current team size, but valuable as codebase grows

#### Trivy MCP Server (Official -- Aqua Security)
- **URL:** https://github.com/aquasecurity/trivy-mcp
- **What:** Official Trivy plugin for MCP. Scans local filesystems, container images, and remote repos for CVEs and misconfigurations.
- **Vantage relevance:** Container and filesystem scanning. Useful if we Docker-ize Vantage's development environment or scan the Rust/npm supply chain.
- **Install:** Trivy plugin system
- **Maturity:** Official Aqua Security product
- **Verdict:** CONSIDER -- more relevant when we have Docker/container workflows

#### CodeQL MCP Server (GitHub)
- **URL:** Referenced in chatforest.com security review
- **What:** Wraps CodeQL CLI for database operations, query compilation, and code analysis. Supports 9 languages including TypeScript and Rust.
- **Vantage relevance:** Covers both TypeScript frontend and Rust backend. Semantic code analysis finds deeper vulnerabilities than pattern matching.
- **Install:** Requires CodeQL CLI
- **Maturity:** GitHub/Microsoft-backed
- **Verdict:** CONSIDER -- powerful but complex setup, better suited for CI

### 2.2 Linting & Formatting

#### Biome
- **URL:** https://biomejs.dev/
- **What:** Unified linter + formatter replacing ESLint + Prettier. 10-56x faster. v2.3 as of Jan 2026 with 423+ lint rules including type-aware linting. 15M+ monthly npm downloads.
- **Vantage relevance:** Single tool replacing ESLint + Prettier for our TypeScript + React codebase. Performance matters for IDE development where we run linting frequently.
- **Install:** `npm install --save-dev @biomejs/biome`
- **Maturity:** Very high -- v2.3, 15M+ monthly downloads, active development
- **Verdict:** STRONGLY CONSIDER -- modern replacement for ESLint+Prettier with dramatically better performance. No dedicated MCP server yet, but can be run via hooks.

### 2.3 Code Review Automation

#### Code Guardian (Claude Code Skill)
- **URL:** Referenced in awesome-claude-code-toolkit
- **What:** Automated code review with security scanning and quality enforcement.
- **Vantage relevance:** Automated quality gates on code changes.
- **Install:** Claude Code skill/plugin
- **Maturity:** Community project
- **Verdict:** CONSIDER alongside Trail of Bits skills

#### claudekit
- **URL:** https://github.com/carlrannaberg/claudekit
- **What:** CLI toolkit with quality hooks and 20+ specialized subagents for code quality.
- **Vantage relevance:** Pre-built quality workflow hooks.
- **Install:** Claude Code plugin
- **Maturity:** Community project
- **Verdict:** EVALUATE -- may overlap with our existing hooks

---

## 3. Better Agentic Frameworks

### 3.1 Multi-Agent Orchestration

#### oh-my-claudecode (OMC)
- **URL:** https://github.com/yeachan-heo/oh-my-claudecode
- **What:** 9,900+ stars. Transforms Claude Code into a team of 32 specialized agents. 5 execution modes. Auto-resume when rate limits reset. Agents include: Architect, Executor, Designer, QA Tester, Security Auditor, Data Scientist, each with model tier matched to complexity.
- **Vantage relevance:** **HIGH PRIORITY.** Could dramatically accelerate Vantage development. Designer agent for UI work, Security Auditor for Tauri IPC security, QA agent for testing, Architect for system design.
- **Install:** Claude Code plugin
- **Maturity:** 9,900+ stars, actively maintained
- **Verdict:** INSTALL -- best-in-class multi-agent orchestration for Claude Code

#### Superpowers Plugin (Already Installed)
- **URL:** https://claude.com/plugins/superpowers
- **What:** 29,000+ GitHub stars. Official Anthropic marketplace. Composable skills for TDD, systematic debugging, brainstorming, subagent-driven development, code review.
- **Vantage relevance:** Already installed and providing significant value. Skills like `brainstorming`, `writing-plans`, `executing-plans`, `test-driven-development`, `systematic-debugging` are all active.
- **Install:** Already present
- **Maturity:** Very high -- Anthropic marketplace accepted Jan 2026

#### Claude Squad
- **URL:** https://github.com/smtg-ai/claude-squad
- **What:** Terminal app managing multiple AI agents in separate workspaces using tmux + git worktrees. Each agent works on isolated branch in isolated directory.
- **Vantage relevance:** Run multiple Claude Code instances in parallel -- one on UI, one on backend, one on tests. Git worktree isolation prevents conflicts.
- **Install:** Go binary or `go install`
- **Maturity:** Active GitHub project
- **Verdict:** INSTALL -- enables true parallel development on Vantage

#### Vibe Kanban
- **URL:** https://www.vibekanban.com/
- **What:** 23,200+ stars. Cross-platform CLI + web UI for managing AI coding agents. Kanban board for planning, parallel agent execution in isolated git worktrees, visual code review. Supports Claude Code, Cursor, Copilot, Gemini CLI.
- **Vantage relevance:** Visual task management for multi-agent development. Plan features on Kanban, assign to agents, review diffs in visual UI.
- **Install:** npm package + CLI
- **Maturity:** 23,200+ stars, v0.1.37 (Mar 2026), active development
- **Verdict:** CONSIDER -- great for project management across agents, but may be more than we need right now

#### wshobson/agents
- **URL:** https://github.com/wshobson/agents
- **What:** 31,300+ stars. 112 specialized agents, 16 multi-agent workflow orchestrators, 146 skills. Intelligent automation and orchestration.
- **Vantage relevance:** Massive collection of pre-built agents and workflows. Can cherry-pick relevant ones.
- **Install:** Claude Code plugin/skills
- **Maturity:** 31,300+ stars
- **Verdict:** EVALUATE -- large collection, pick what's relevant

#### ccswarm
- **URL:** https://github.com/nwiizo/ccswarm
- **What:** Multi-agent orchestration using Claude Code with Git worktree isolation and specialized AI agents. Task delegation infrastructure, template-based scaffolding.
- **Vantage relevance:** More focused than Claude Squad on task delegation and templates.
- **Install:** CLI tool
- **Maturity:** Active development
- **Verdict:** EVALUATE as alternative to Claude Squad

### 3.2 Task Management

#### TSK - Task Manager
- **URL:** https://github.com/dtormoen/tsk
- **What:** Rust CLI delegating tasks to sandboxed Docker agents with full environment isolation.
- **Vantage relevance:** Sandboxed execution is valuable for an IDE that runs user code.
- **Install:** Rust binary
- **Maturity:** Active development
- **Verdict:** EVALUATE -- interesting sandboxing approach

#### ccpm
- **URL:** Referenced in awesome-claude-code-toolkit (7,600+ stars)
- **What:** Project management via GitHub Issues with git worktrees for parallel execution.
- **Vantage relevance:** GitHub-integrated project management for the Vantage repo.
- **Install:** CLI tool
- **Maturity:** 7,600+ stars
- **Verdict:** CONSIDER -- if using GitHub Issues for task tracking

### 3.3 Memory & Context Management

#### Knowledge Graph Memory MCP Server (Anthropic)
- **URL:** https://www.pulsemcp.com/servers/modelcontextprotocol-memory
- **What:** Enables persistent memory across conversations using local knowledge graph. Stores entities, relations, and observations.
- **Vantage relevance:** AI can remember architectural decisions, component patterns, and codebase conventions across sessions. Critical for long-running IDE development.
- **Install:** MCP server config
- **Maturity:** Official Anthropic/MCP project
- **Verdict:** INSTALL -- persistent memory across sessions is invaluable

#### Zep Knowledge Graph MCP
- **URL:** https://www.getzep.com/product/knowledge-graph-mcp/
- **What:** Powered by Graphiti (temporal graph framework). Tracks relationships and understands how information evolves over time. Runs locally.
- **Vantage relevance:** Temporal tracking is valuable -- understand how Vantage's architecture has evolved, track decision history.
- **Install:** MCP server config
- **Maturity:** Commercial product with OSS Graphiti foundation
- **Verdict:** CONSIDER as alternative to Anthropic's memory server

#### mcp-memory-service
- **URL:** https://github.com/doobidoo/mcp-memory-service
- **What:** Open-source persistent memory with semantic search, AI embeddings, multi-client compatibility (20+ AI apps), optional cloud sync, D3.js visualization.
- **Vantage relevance:** REST API + knowledge graph + autonomous consolidation. Multi-client support means memory persists across different AI tools.
- **Install:** npm/pip
- **Maturity:** Active OSS project
- **Verdict:** EVALUATE -- more features than Anthropic's server but less official

### 3.4 Session & Context

#### claude-session-restore
- **URL:** https://github.com/ZENG3LD/claude-session-restore
- **What:** Restore context from prior sessions via git history analysis.
- **Vantage relevance:** Recover context when Claude Code sessions are interrupted or compacted.
- **Install:** Claude Code plugin
- **Maturity:** Community project
- **Verdict:** CONSIDER -- useful for long development sessions

#### recall
- **URL:** https://github.com/zippoxer/recall
- **What:** Full-text search across Claude Code sessions in terminal.
- **Vantage relevance:** Search past conversations for decisions, patterns, solutions.
- **Install:** CLI tool
- **Maturity:** Community project
- **Verdict:** INSTALL -- lightweight and immediately useful

---

## 4. Browser Automation & Testing

### 4.1 Tauri-Specific Testing

#### tauri-plugin-mcp (P3GLEG)
- **URL:** https://github.com/P3GLEG/tauri-plugin-mcp
- **What:** **PURPOSE-BUILT for Vantage's use case.** Allows AI agents to debug Tauri apps via screenshot capture, window management, DOM access, and simulated user inputs. Architecture: Rust plugin (async socket server) + guest JavaScript (DOM interaction) + MCP server (tool calls to socket commands). Supports IPC socket and TCP modes.
- **Vantage relevance:** **CRITICAL PRIORITY.** This is THE tool for AI-assisted Tauri development. Enables Claude Code to:
  - Capture screenshots of Vantage windows (with thumbnails optimized for token efficiency)
  - Inspect page in multiple modes: `map` (structured refs), `html` (raw DOM), `state` (URL/title/scroll/viewport), `find_element` (CSS pixel coordinates), `app_info` (metadata/windows/monitors)
  - Debug directly within our running Tauri app
- **Install:** Add as Tauri plugin in `Cargo.toml` + configure MCP server
- **Maturity:** Active development, Tauri-specific
- **Verdict:** **MUST INSTALL** -- built specifically for what we're doing

#### @hypothesi/tauri-mcp-server
- **URL:** https://github.com/hypothesi/mcp-server-tauri
- **What:** MCP server + plugin for Tauri v2 development. AI assistants can build, test, and debug Tauri v2 apps. Features:
  - Screenshots, DOM state, console logs from running app
  - Click, type, scroll, find elements, pick elements visually
  - Capture/inspect Tauri IPC calls between frontend and backend
  - Mobile testing (Android emulators, iOS simulators)
  - Multi-application support (connect to multiple Tauri apps)
- **Vantage relevance:** **CRITICAL PRIORITY.** More comprehensive than P3GLEG's plugin. IPC call inspection is invaluable for debugging Vantage's Rust-JS communication. Mobile support future-proofs for potential mobile Vantage.
- **Install:** `npx -y install-mcp @hypothesi/tauri-mcp-server --client claude-code`
- **Maturity:** Active, npm package, multiple AI client support
- **Verdict:** **MUST INSTALL** -- the most complete Tauri development MCP server

#### tauri-plugin-mcp-client (sublayerapp)
- **URL:** https://github.com/sublayerapp/tauri-plugin-mcp-client
- **What:** Comprehensive Tauri plugin for integrating MCP servers into desktop applications. Production-ready solution for managing MCP server connections, executing tools, and handling real-time events.
- **Vantage relevance:** For Vantage AS an IDE -- lets Vantage itself connect to MCP servers. Critical for the product's MCP integration feature.
- **Install:** Cargo/npm dependency
- **Maturity:** Active development
- **Verdict:** INSTALL -- for Vantage's own MCP client capabilities

### 4.2 E2E Testing for Tauri

#### Playwright (Already Configured)
- **URL:** Already in `package.json` as `@playwright/test`
- **What:** E2E test framework. Configured with `e2e/playwright.config.ts`.
- **Vantage relevance:** Already set up. Needs configuration for Tauri webview testing (mock IPC calls).
- **Maturity:** Industry standard

#### TestDriver AI
- **URL:** https://docs.testdriver.ai/v6/apps/tauri-apps
- **What:** AI-powered testing that converts Tauri apps to selectorless, Vision AI testing. Uses natural language instead of CSS selectors. Black-box testing approach -- no test IDs needed.
- **Vantage relevance:** Eliminates brittle selectors in tests. AI understands what's on screen and operates mouse/keyboard. Tests don't break when UI changes. Can test ANY application including native Tauri windows.
- **Install:** TestDriver SDK + Playwright integration
- **Maturity:** Active, dedicated Tauri support documentation
- **Verdict:** STRONGLY CONSIDER -- selectorless testing is the future for IDE UI testing

#### WebdriverIO (Tauri Official)
- **URL:** https://v2.tauri.app/develop/tests/webdriver/example/webdriverio/
- **What:** Official Tauri-recommended E2E testing approach. Few lines of config to set up.
- **Vantage relevance:** Official support means reliable Tauri integration.
- **Install:** npm dependency
- **Maturity:** Official Tauri documentation
- **Verdict:** EVALUATE -- we already have Playwright, may not need both

### 4.3 Visual Regression Testing

#### Percy (BrowserStack)
- **URL:** https://percy.io/
- **What:** Cloud-based visual regression platform. AI-powered Visual Review Agent (late 2025) reduces review time 3x, filters ~40% false positives. CI/CD integration.
- **Vantage relevance:** Professional VRT for CI pipeline. Catches unintended UI changes across components.
- **Install:** npm SDK + CI config
- **Maturity:** Industry leader. Part of BrowserStack. Paid service.
- **Verdict:** CONSIDER for CI -- paid but very polished

#### Chromatic
- **URL:** https://www.chromatic.com/
- **What:** Built by Storybook team. Component-driven VRT. Doubles as Storybook hosting. Excels at component-level visual testing and team feedback.
- **Vantage relevance:** Best if we adopt Storybook. Component-level visual testing matches Vantage's component-driven architecture.
- **Install:** npm SDK + CI config
- **Maturity:** Very high -- Storybook team. Paid with free tier.
- **Verdict:** CONSIDER if we add Storybook

### 4.4 Chrome DevTools MCP (Already Installed)
- **URL:** Already installed as `mcp__plugin_chrome-devtools-mcp_chrome-devtools`
- **What:** Full Chrome DevTools access: take screenshots, navigate, evaluate scripts, network monitoring, Lighthouse audits, performance tracing, memory snapshots.
- **Vantage relevance:** Already providing value. 40+ tools for browser automation, performance analysis, and debugging.
- **Install:** Already present
- **Maturity:** Official Chrome team project

---

## 5. Development Workflow

### 5.1 Claude Code Plugins (Installed)

Current plugin inventory from our session:
- **Superpowers** -- TDD, debugging, brainstorming, planning, code review skills
- **Playwright** -- Browser automation MCP
- **Chrome DevTools MCP** -- DevTools access
- **Figma** -- Design-to-code
- **Context7** -- Documentation fetching
- **Semgrep Plugin** -- Static analysis (needs setup)
- **Hookify** -- Hook rule management
- **Plugin Dev** -- Plugin development tools
- **Skill Creator** -- Skill authoring
- **Pixel Plugin** -- Pixel art (Aseprite integration)
- **Various Claude AI integrations** -- Slack, Gmail, Atlassian, Canva, Fireflies

### 5.2 Recommended New Plugins

#### agnix
- **URL:** https://github.com/agent-sh/agnix
- **What:** Comprehensive linter for Claude Code agent files. Validates CLAUDE.md, AGENTS.md, SKILL.md, hooks, MCP configs. Includes IDE plugins and auto-fixes.
- **Vantage relevance:** Ensures our Claude Code configuration is correct and follows best practices.
- **Install:** Claude Code plugin
- **Maturity:** Active development
- **Verdict:** INSTALL -- meta-tooling to keep our AI config healthy

#### claude-devtools
- **URL:** Referenced in awesome lists (matt1398)
- **What:** Desktop app for detailed observability into Claude Code sessions. Turn-based context analysis, compaction visualization, subagent execution trees, custom notification triggers.
- **Vantage relevance:** Debug and optimize our Claude Code usage during development. Understand token consumption and agent behavior.
- **Install:** Desktop application
- **Maturity:** Community project
- **Verdict:** INSTALL -- helps us understand and optimize AI usage

#### ClaudeCTX
- **URL:** https://github.com/foxj77/claudectx
- **What:** Switch entire Claude Code configuration with single command. Context-switching for different project modes.
- **Vantage relevance:** Switch between "building UI", "security audit", "performance optimization" configurations.
- **Install:** Claude Code plugin
- **Maturity:** Community project
- **Verdict:** CONSIDER -- useful if we define multiple AI workflow modes

### 5.3 Curated Resource Directories

These directories should be bookmarked for ongoing discovery:

| Resource | URL | Description |
|----------|-----|-------------|
| awesome-claude-code | https://github.com/hesreallyhim/awesome-claude-code | Curated skills, hooks, commands, orchestrators, plugins |
| awesome-claude-code-toolkit | https://github.com/rohitg00/awesome-claude-code-toolkit | 135 agents, 35 skills, 42 commands, 150+ plugins |
| awesome-claude-plugins | https://github.com/ComposioHQ/awesome-claude-plugins | Claude plugins with adoption metrics |
| awesome-claude-skills | https://github.com/travisvn/awesome-claude-skills | Claude Skills directory |
| Awesome Skills | https://awesome-skills.com/ | Web-based skills browser |
| MCP Market | https://mcpmarket.com/leaderboards | Top 100 MCP servers ranked by stars |
| PulseMCP | https://www.pulsemcp.com/ | MCP server directory with reviews |
| MCP.so | https://mcp.so/ | 3,000+ MCP server index |
| Smithery | https://smithery.ai/ | 2,200+ MCP servers with automated install |

### 5.4 Git & Workflow Tools

#### cc-tools
- **URL:** https://github.com/Veraticus/cc-tools
- **What:** Go-based hooks/utilities for smart linting and testing integration with Claude Code.
- **Vantage relevance:** Pre-built quality hooks.
- **Install:** Go-based
- **Maturity:** Community project
- **Verdict:** EVALUATE

#### ccusage
- **URL:** Referenced in awesome lists (11,500+ stars)
- **What:** CLI for analyzing Claude Code usage with offline reporting.
- **Vantage relevance:** Track API costs and token usage during development.
- **Install:** CLI tool
- **Maturity:** 11,500+ stars
- **Verdict:** INSTALL -- cost tracking is important

---

## 6. Documentation & Learning

### 6.1 Tauri-Specific Documentation

#### tauri-docs MCP Server
- **URL:** https://github.com/Michael-Obele/tauri-docs
- **What:** Mastra MCP server exposing Tauri documentation tools. Provides: `list_sections` (parse tauri.app/llms.txt), `get_page` (fetch Tauri doc page), `search` (keyword search across docs index).
- **Vantage relevance:** **HIGH PRIORITY.** Direct Tauri v2 documentation access in the AI assistant. No more hallucinated Tauri APIs.
- **Install:** SSE transport via Mastra Cloud URL, or self-host
- **Maturity:** Active development
- **Verdict:** INSTALL -- ensures AI always has correct Tauri v2 API info

#### @hypothesi/tauri-mcp-server (dual purpose)
- **URL:** https://github.com/hypothesi/mcp-server-tauri
- **What:** Also includes documentation tools alongside development tools.
- **Vantage relevance:** Two-for-one: debugging AND docs access.
- **Install:** Already recommended above
- **Verdict:** Already in MUST INSTALL list

### 6.2 General Documentation Servers

#### Context7 (Already Installed)
- **URL:** https://github.com/upstash/context7
- **What:** Already installed. Indexes 9,000+ library docs and serves via MCP.
- **Vantage relevance:** Already providing value for React, TypeScript, and other library docs.
- **Limitations:** Free tier reduced to 1,000 requests/month (Jan 2026). Cloud-dependent.
- **Install:** Already present
- **Verdict:** Keep, but consider supplements

#### Docfork
- **URL:** Referenced at fastmcp.me and multiple sources
- **What:** 9,000+ libraries, MIT license. Standout feature: "Cabinets" for project-specific context isolation. Prevents context poisoning from unrelated libraries.
- **Vantage relevance:** Can lock AI to Vantage's exact stack (Tauri + React 19 + TypeScript 5 + Tailwind 4 + Zustand 5). Prevents contamination from wrong library versions.
- **Install:** One-click via FastMCP, supports remote connections
- **Maturity:** Active OSS, MIT license
- **Verdict:** INSTALL as Context7 supplement -- the Cabinets feature is uniquely valuable

#### Deepcon
- **URL:** Referenced in Context7 alternatives articles
- **What:** 90% accuracy in contextual benchmarks vs Context7's 65%. Tested across 20 real-world scenarios.
- **Vantage relevance:** Higher accuracy means fewer hallucinated API suggestions.
- **Install:** MCP server config
- **Maturity:** Newer entrant, benchmarks look strong
- **Verdict:** EVALUATE -- promising accuracy improvements

#### Grounded Docs MCP Server
- **URL:** https://github.com/arabold/docs-mcp-server
- **What:** Open-source alternative to Context7, Nia, and Ref.Tools. BM25 scoring, token-aware filtering, local index building. Works with private repos.
- **Vantage relevance:** Can index Vantage's own internal documentation. Local-first means no cloud dependency.
- **Install:** npm/npx
- **Maturity:** Active OSS
- **Verdict:** CONSIDER for indexing our own project docs

### 6.3 Framework-Specific Knowledge

#### Vercel Skills (Already Available)
Multiple Vercel-provided skills are already loaded:
- `vercel:shadcn` -- shadcn/ui patterns
- `vercel:react-best-practices` -- React TSX quality
- `vercel:ai-sdk` -- AI SDK integration
- `vercel:nextjs` -- Next.js expertise (less relevant for Tauri but good patterns)

---

## 7. Already Installed (Inventory)

### MCP Servers Active
| Server | Category | Status |
|--------|----------|--------|
| Playwright MCP | Browser automation / testing | Active |
| Chrome DevTools MCP | Browser debugging | Active |
| Figma MCP | Design-to-code | Active |
| Context7 | Documentation | Active |
| Claude-in-Chrome | Browser control | Active |
| Vercel MCP | Deployment | Active |
| GitHub MCP | Repository | Active |
| GitLab MCP | Repository | Active |
| Supabase MCP | Database | Active |
| Pixel Plugin (Aseprite) | Pixel art | Active |

### Claude Code Plugins Active
| Plugin | Category | Status |
|--------|----------|--------|
| Superpowers | Agentic workflow | Active, heavily used |
| Semgrep | Static analysis | Installed, needs config |
| Hookify | Hook management | Active |
| Plugin Dev | Plugin authoring | Active |
| Skill Creator | Skill authoring | Active |
| BMAD | Workflow methodology | Active |
| Ralph Loop | Autonomous development | Active |
| PR Review Toolkit | Code review | Active |
| Feature Dev | Feature development | Active |
| Code Review | Code review | Active |
| Chrome DevTools MCP skills | A11y, debugging, LCP | Active |
| Frontend Design | UI design | Active |
| Playground | Interactive HTML | Active |
| Firecrawl | Web scraping | Active |

---

## 8. Prioritized Installation Plan

### Tier 1: MUST INSTALL (Immediate, high impact)

| Tool | Type | Why | Install Command |
|------|------|-----|-----------------|
| **@hypothesi/tauri-mcp-server** | MCP Server | Tauri v2 debugging, IPC inspection, screenshots, DOM access | `npx -y install-mcp @hypothesi/tauri-mcp-server --client claude-code` |
| **tauri-plugin-mcp (P3GLEG)** | Tauri Plugin + MCP | AI agent debugging within Tauri apps | Add Cargo dependency + MCP config |
| **Trail of Bits Security Skills** | Claude Plugin | Security auditing, vulnerability detection | Clone + install from plugin marketplace |
| **Web Inspector MCP** | MCP Server | CSS debugging, layout inspection, visibility tracing | Add npx config to MCP settings |
| **dev-inspector-mcp** | MCP Server | React component visual debugging | npm + MCP config |
| **shadcn/ui MCP Server** | MCP Server | Component library assistance (we use shadcn) | Per official docs |
| **Axe MCP Server (Deque)** | MCP Server | Accessibility testing | MCP config |
| **tauri-docs MCP** | MCP Server | Tauri v2 documentation access | SSE transport config |
| **Knowledge Graph Memory MCP** | MCP Server | Persistent memory across sessions | MCP config |

### Tier 2: SHOULD INSTALL (Near-term, significant value)

| Tool | Type | Why | Install Command |
|------|------|-----|-----------------|
| **oh-my-claudecode** | Claude Plugin | 32 specialized agents, multi-agent orchestration | Claude plugin install |
| **Claude Squad** | CLI Tool | Parallel agents in isolated git worktrees | `go install` |
| **Semgrep MCP Server** | MCP Server | Makes existing Semgrep AI-accessible | MCP config |
| **Snyk MCP** | MCP Server | Dependency vulnerability scanning | `npm install -g snyk` + MCP config |
| **Docfork** | MCP Server | Documentation with project-specific context isolation | FastMCP one-click |
| **agnix** | Claude Plugin | Validate our Claude Code config files | Plugin install |
| **recall** | CLI Tool | Search past Claude sessions | CLI install |
| **ccusage** | CLI Tool | Usage analytics and cost tracking | CLI install |
| **Chrome Inspector MCP** | MCP Server | CSS rules and computed styles from DevTools | `npx chrome-inspector-mcp@latest` |
| **Semgrep config** | Configuration | Apply TypeScript + React rulesets | `semgrep --config p/typescript --config p/react` |

### Tier 3: CONSIDER (Evaluate based on needs)

| Tool | Type | Why |
|------|------|-----|
| **Storybook MCP** | MCP Server | Component isolation + AI testing (requires adding Storybook) |
| **Biome** | Linter/Formatter | Replace ESLint+Prettier, 10-56x faster |
| **TestDriver AI** | Testing | Selectorless AI-powered E2E testing for Tauri |
| **BackstopJS** | Testing | Interactive VRT reports with scrubber |
| **Vibe Kanban** | Orchestration | Visual multi-agent task management |
| **Percy** | Testing | Cloud VRT for CI (paid) |
| **Chromatic** | Testing | Component VRT if using Storybook (paid) |
| **SonarQube MCP** | Quality | Comprehensive code quality (may be overkill now) |
| **Trivy MCP** | Security | Container/filesystem scanning |
| **Zep Knowledge Graph** | Memory | Temporal knowledge tracking |
| **mcp-memory-service** | Memory | Multi-client persistent memory with visualization |
| **ClaudeCTX** | Workflow | Context-switching between AI configurations |
| **wshobson/agents** | Agents | 112 agents to cherry-pick from |

### Tier 4: WATCH (Not ready yet or not needed now)

| Tool | Type | Why |
|------|------|-----|
| **CodeQL MCP** | Security | Powerful but complex setup, better for CI |
| **tauri-plugin-mcp-client** | Tauri Plugin | For Vantage's own MCP client feature (product, not dev tool) |
| **LambdaTest SmartUI** | Testing | Requires paid account |
| **Deepcon** | Docs | Promising accuracy but newer, evaluate stability |

---

## Key Findings & Recommendations

### The Biggest Gaps to Fill

1. **Tauri Development MCP (CRITICAL):** We have zero Tauri-specific MCP tooling. The `@hypothesi/tauri-mcp-server` and `tauri-plugin-mcp` should be installed immediately. They enable AI to see, debug, and interact with our running Tauri app.

2. **CSS/Layout Debugging (HIGH):** AI's known weakness. `mcp-web-inspector` and `dev-inspector-mcp` directly address this by giving AI access to computed styles, layout constraints, and visibility diagnostics.

3. **Security Auditing (HIGH):** Trail of Bits skills are the gold standard. For a tool that runs user code, security is non-negotiable.

4. **Persistent Memory (HIGH):** Anthropic's Knowledge Graph Memory MCP prevents context loss across sessions. Critical for maintaining architectural coherence in a complex project.

5. **Semgrep Configuration (QUICK WIN):** Already installed, just needs `--config p/typescript --config p/react` to start catching TypeScript and React security issues.

### What NOT to Install

- **Duplicate functionality:** Don't install both Percy AND Chromatic AND BackstopJS -- pick one VRT strategy
- **Too many orchestrators:** Pick either oh-my-claudecode OR Claude Squad, not three parallel systems
- **Deprecated tools:** Puppeteer MCP is deprecated in favor of Playwright MCP (already installed)
- **Over-engineering:** SonarQube + Snyk + Trivy + CodeQL is too many security tools -- start with Trail of Bits + Semgrep + Snyk

### Expected Impact

Installing Tier 1 tools will:
- Enable AI to visually debug Vantage's running Tauri app (screenshots, DOM, IPC)
- Provide CSS layout debugging (computed styles, visibility tracing, constraint analysis)
- Add security auditing at the code level (Trail of Bits) and dependency level (Snyk)
- Give AI persistent memory across development sessions
- Ensure AI always has correct Tauri v2 and shadcn API information

---

## Sources

- [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
- [awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit)
- [awesome-claude-plugins](https://github.com/ComposioHQ/awesome-claude-plugins)
- [tauri-plugin-mcp (P3GLEG)](https://github.com/P3GLEG/tauri-plugin-mcp)
- [@hypothesi/tauri-mcp-server](https://github.com/hypothesi/mcp-server-tauri)
- [tauri-docs MCP](https://github.com/Michael-Obele/tauri-docs)
- [Trail of Bits Security Skills](https://github.com/trailofbits/skills)
- [Web Inspector MCP](https://github.com/antonzherdev/mcp-web-inspector)
- [dev-inspector-mcp](https://github.com/mcpc-tech/dev-inspector-mcp)
- [Chrome Inspector MCP](https://github.com/devtoolcss/chrome-inspector-mcp)
- [shadcn/ui MCP Server](https://ui.shadcn.com/docs/mcp)
- [Storybook MCP](https://storybook.js.org/docs/ai/mcp/overview)
- [Axe MCP Server (Deque)](https://github.com/dequelabs/axe-mcp-server-public)
- [a11y-mcp (priyankark)](https://github.com/priyankark/a11y-mcp)
- [SonarQube MCP](https://github.com/SonarSource/sonarqube-mcp-server)
- [Trivy MCP](https://github.com/aquasecurity/trivy-mcp)
- [Semgrep MCP](https://www.pulsemcp.com/servers/stefanskiasan-semgrep)
- [oh-my-claudecode](https://github.com/yeachan-heo/oh-my-claudecode)
- [Claude Squad](https://github.com/smtg-ai/claude-squad)
- [Vibe Kanban](https://www.vibekanban.com/)
- [Knowledge Graph Memory MCP](https://www.pulsemcp.com/servers/modelcontextprotocol-memory)
- [Zep Knowledge Graph MCP](https://www.getzep.com/product/knowledge-graph-mcp/)
- [mcp-memory-service](https://github.com/doobidoo/mcp-memory-service)
- [Docfork MCP](https://fastmcp.me/mcp/details/146/docfork)
- [Context7 Alternatives](https://dev.to/moshe_io/top-7-mcp-alternatives-for-context7-in-2026-2555)
- [Code Security MCP Servers Review](https://chatforest.com/reviews/code-security-mcp-servers/)
- [Percy](https://percy.io/)
- [Chromatic](https://www.chromatic.com/)
- [BackstopJS](https://github.com/garris/BackstopJS)
- [TestDriver AI (Tauri)](https://docs.testdriver.ai/v6/apps/tauri-apps)
- [LambdaTest SmartUI MCP](https://www.lambdatest.com/support/docs/smartui-mcp-server/)
- [Biome Migration Guide](https://dev.to/pockit_tools/biome-the-eslint-and-prettier-killer-complete-migration-guide-for-2026-27m)
- [Superpowers Plugin](https://claude.com/plugins/superpowers)
- [MCP Market Leaderboard](https://mcpmarket.com/leaderboards)
- [Tauri v2 Testing Docs](https://v2.tauri.app/develop/tests/)
- [Semgrep TypeScript Ruleset](https://semgrep.dev/p/typescript)
- [Semgrep React Ruleset](https://semgrep.dev/p/react)
- [Opcode (Tauri GUI for Claude Code)](https://github.com/winfunc/opcode)
- [Grounded Docs MCP Server](https://github.com/arabold/docs-mcp-server)
