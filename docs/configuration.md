# Vantage — Settings & Configuration

---

## Settings Store (Global)

Persisted to `localStorage` under the key `vantage-settings` via Zustand `persist` middleware. These settings are **global** — they survive project switches.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `theme` | `"vantage-dark" \| "vantage-light" \| "vantage-high-contrast"` | `"vantage-dark"` | UI + editor color theme (Catppuccin Mocha / Latte / High Contrast) |
| `fontSizeEditor` | number | `14` | Monaco editor font size in px (range: 8–32) |
| `fontSizeUI` | number | `13` | UI panels font size in px (range: 10–24) |
| `fontFamily` | string | `"JetBrains Mono", "Cascadia Code", "Fira Code", monospace` | Editor font stack |
| `tabSize` | number | `2` | Spaces per tab stop (range: 1–8) |
| `insertSpaces` | boolean | `true` | Insert spaces instead of tabs |
| `wordWrap` | boolean | `false` | Soft word wrap in editor |
| `minimap` | boolean | `true` | Show Monaco minimap |
| `lineNumbers` | boolean | `true` | Show line numbers |
| `terminalFontSize` | number | `14` | xterm.js terminal font size in px (range: 8–32) |
| `terminalScrollback` | number | `10000` | Terminal scrollback buffer lines (range: 1000–100000) |
| `vimMode` | boolean | `false` | Vim keybindings in Monaco editor |
| `showBuddy` | boolean | `true` | Show Inkwell the coding buddy widget in status bar |
| `effortLevel` | `"low" \| "medium" \| "high"` | `"high"` | Claude Code reasoning depth (sets `CLAUDE_CODE_EFFORT_LEVEL` env var) |
| `planMode` | boolean | `false` | Start Claude sessions with `--permission-mode plan` |
| `formatOnSave` | boolean | `false` | Run Prettier on `Ctrl+S` (calls `format_file` IPC command) |
| `keybindingOverrides` | `Record<string, {key, ctrl?, shift?, alt?}>` | `{}` | Per-ID keybinding overrides (see `docs/keybindings.md`) |

All settings are editable via `Ctrl+,` → the Settings panel. The panel is searchable.

---

## Workspace State (Per-Project)

Each open project gets its own state file at:

```
~/.vantage/workspaces/<base64url(projectPath)>.json
```

**8 stores are workspace-scoped** (reset on project switch, saved on change):

| Store | What it tracks |
|-------|---------------|
| `editor` | Open tabs, active tab, split state, pending diffs |
| `conversation` | Claude chat messages, session metadata, activity trail |
| `agents` | Kanban board agents, timelines, verification |
| `layout` | Sidebar visibility, panel sizes, active activity bar item |
| `mergeQueue` | Merge queue entries and quality gate results |
| `verification` | Verification dashboard state |
| `usage` | Token/cost usage records |
| `agentConversations` | Per-agent conversation histories |

**Auto-save**: workspace state is written to disk with a 2-second debounce after any store change. Triggered by `markDirty()` in the workspace store.

**Single-instance constraint**: no file locking is used. Running two Vantage windows on the same project path will corrupt workspace state.

**Recent projects list**: stored separately at `~/.vantage/workspaces/recent-projects.json`.

---

## Claude Code Settings (`~/.claude/settings.json`)

Vantage reads and writes the Claude Code CLI's own settings file at `~/.claude/settings.json`. The file is treated as opaque JSON — unknown keys are preserved. Vantage exposes this in Settings → Claude Settings. Managed by `src-tauri/src/claude_settings.rs`.

Common Claude Code settings (not exhaustive — controlled by the Claude Code CLI itself):

```json
{
  "permissions": { ... },
  "hooks": { ... }
}
```

---

## MCP Server Configuration

MCP servers are configured in two places. Vantage merges both into the MCP Manager UI (Settings → MCP Servers).

### User-level: `~/.claude/mcp-config.json`

Applies to all projects. Format:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@my/mcp-server"],
      "env": {},
      "enabled": true
    }
  }
}
```

### Project-level: `<project-root>/.mcp.json`

Overrides / supplements the user config for a specific project. Same format. Takes precedence for servers with the same name.

**Windows note**: MCP server commands must use the `cmd` wrapper:

```json
{
  "command": "cmd",
  "args": ["/c", "npx", "-y", "some-mcp-package"]
}
```

Direct `npx` invocation does not work on Windows. The `scope` field (`"user"` or `"project"`) is added by Vantage when listing servers.

---

## Claude Code Hooks

Hooks are configured inside `~/.claude/settings.json` under the `hooks` key. Vantage provides a Hooks Editor UI (Settings → Hooks) for CRUD operations. Hooks run shell commands at defined lifecycle points in the Claude Code CLI (e.g., before/after tool use).

---

## CLAUDE.md (Project Instructions)

Each project can have a `CLAUDE.md` in its root. This file is injected as system context for Claude Code sessions. Vantage includes a CLAUDE.md Editor (Settings → CLAUDE.md) with live Markdown preview. Edits are saved directly to `<project-root>/CLAUDE.md`.
