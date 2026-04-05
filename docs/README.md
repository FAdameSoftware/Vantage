# Vantage — Getting Started

Vantage is a personal desktop IDE built around the Claude Code CLI. It wraps Tauri v2 (Rust backend + WebView2) around a React 19 frontend, adding a Monaco editor, xterm.js terminal, multi-agent orchestration, and a persistent workspace model on top of Claude's stream-json protocol.

---

## Prerequisites

| Tool | Notes |
|------|-------|
| **Node.js 20+** | For the React frontend and Vite dev server |
| **Rust + Cargo** | Tauri compiles the Rust backend. Add `$env:USERPROFILE\.cargo\bin` to PATH on Windows or use `/c/Users/ferpu/.cargo/bin/cargo` in Git Bash. |
| **Git** | Required for worktree, source control, and checkpoint features |
| **Claude Code CLI** (`claude.exe`) | Must be discoverable on PATH. Git Bash shell required on Windows for correct process spawning. |
| **WebView2 runtime** | Ships with Windows 11; install separately on older Windows |

---

## Build and Run

```bash
# Install JS dependencies (first time only)
npm install

# Frontend-only dev server (no Tauri — uses the mock layer)
npm run dev

# Full Tauri dev mode — needs Cargo on PATH
npm run tauri dev

# Production build
npm run build
```

The `npm run dev` mode activates `src/lib/tauriMock.ts` automatically, which mocks all IPC calls so the UI is fully functional in a browser. **Always verify real behavior with `npm run tauri dev`** — the mock layer hides IPC mismatches.

---

## Running Tests

```bash
# Frontend unit + component tests (355 tests, 22 files)
npx vitest run

# E2E tests — requires Vite dev server running on port 1420
npm run dev &
npx playwright test

# Accessibility tests (axe-core WCAG audits)
npx playwright test e2e/accessibility.spec.ts

# Security scan (Semgrep, TypeScript + React rules)
npm run lint:security

# Rust backend tests (76 tests)
cd src-tauri && /c/Users/ferpu/.cargo/bin/cargo test
```

Test locations:
- `src/stores/__tests__/` — Zustand store unit tests (Vitest + jsdom)
- `src/components/__tests__/` — Component tests (Testing Library + Vitest)
- `src/__tests__/ipc-edge-cases.test.ts` — IPC edge case tests
- `e2e/` — Playwright E2E and accessibility tests
- `src-tauri/src/**` — Rust `#[cfg(test)]` modules

---

## Project Structure

```
Vantage/
  src/                    # React 19 + TypeScript frontend
    components/           # UI components (layout, editor, chat, terminal, agents, ...)
    stores/               # Zustand v5 state stores
    hooks/                # Custom React hooks
    lib/                  # Utilities, protocol types, mock layer
  src-tauri/              # Rust backend (Tauri v2)
    src/
      claude/             # Claude CLI process management + stream-json protocol
      files/              # File tree, watcher, CRUD
      terminal/           # PTY (ConPTY) management
      git.rs              # Git operations
      workspace.rs        # ~/.vantage/ state persistence
      mcp.rs              # MCP server config
      ...
  docs/                   # This documentation
    superpowers/specs/    # Full design spec
    superpowers/plans/    # Sprint plans
    testing/              # Testing strategy
  e2e/                    # Playwright tests
  research/               # 10 research documents (480KB+)
```

See `CLAUDE.md` in the repo root for the full feature inventory and architecture reference.
