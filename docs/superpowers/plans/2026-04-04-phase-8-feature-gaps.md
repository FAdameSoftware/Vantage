# Vantage Phase 8: Feature Gaps — Plugin Ecosystem & Developer Experience

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address critical feature gaps that prevent Vantage from being a daily-driver Cursor replacement — plugin/skill discovery, slash command autocomplete, usage limits, codebase indexing, and plugin store.

**Architecture:** Plugin discovery reads Claude Code's filesystem (~/.claude/). Slash autocomplete parses available skills/commands. Usage tracking reads from conversation metadata. Codebase indexing generates a project map. Plugin store fetches from the npm registry.

**Tech Stack:** Existing Tauri IPC, Zustand stores, Claude Code filesystem conventions, npm registry API

---

### Task 1: Plugin & Skill Discovery Panel

**Files:**
- Create: `src-tauri/src/plugins.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/components/settings/PluginManager.tsx`
- Modify: `src/components/settings/SettingsPanel.tsx`
- Modify: `src/lib/tauriMock.ts` (add mocks for new commands)

This task adds Rust backend commands that scan Claude Code's plugin and skill directories at `~/.claude/plugins/` and `~/.claude/skills/`, then surfaces the results in a new "Plugins" tab in the SettingsPanel. Claude Code plugins are DXT (Developer Extension) packages — each directory under `~/.claude/plugins/` contains a `plugin.json` manifest with name, version, description, author, and declarations of commands, agents, hooks, skills, and MCP servers contributed by the plugin. Skills live in `~/.claude/skills/` as directories with `SKILL.md` files containing YAML frontmatter.

The current SettingsPanel (`src/components/settings/SettingsPanel.tsx`, 76 lines) has three tabs: "claude-md", "mcp-servers", "spec-viewer". The tab bar is at lines 9-13, the tab type union at line 7, and tab content rendering at lines 64-73.

The existing `mcp.rs` module (142 lines) provides a good pattern for reading Claude Code's filesystem — it reads `~/.claude/mcp-config.json` using `dirs::home_dir()`, parses JSON with serde, and returns typed structs with `specta::Type` for auto-generated TypeScript bindings. The new `plugins.rs` module follows this exact pattern.

The `Cargo.toml` already has all needed dependencies (`serde`, `serde_json`, `dirs`, `ignore`, `specta`, `tauri-specta`).

- [ ] **Step 1: Create `src-tauri/src/plugins.rs` with types and scan functions**

Create the file `src-tauri/src/plugins.rs`. Define the following types, all deriving `Debug, Clone, Serialize, Deserialize, specta::Type` with `#[serde(rename_all = "camelCase")]`:

```rust
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::path::PathBuf;

/// Represents a single Claude Code plugin discovered on disk
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    /// Directory path of the plugin
    pub path: String,
    /// Whether the plugin is enabled in settings.json
    pub enabled: bool,
    /// List of skill names this plugin provides
    pub skills: Vec<String>,
    /// List of command names (slash commands) this plugin provides
    pub commands: Vec<String>,
    /// List of hook event types this plugin registers
    pub hooks: Vec<String>,
    /// List of MCP server names this plugin configures
    pub mcp_servers: Vec<String>,
    /// List of agent names this plugin provides
    pub agents: Vec<String>,
}

/// Represents a skill discovered from ~/.claude/skills/ or from a plugin
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub when_to_use: String,
    /// "built-in", "user", or plugin name
    pub source: String,
    /// Whether the skill can be invoked by user (vs model-only)
    pub user_invocable: bool,
    /// Argument hint string if the skill takes arguments
    pub argument_hint: Option<String>,
    /// Path to the SKILL.md file
    pub path: String,
}

/// Raw plugin.json structure (flexible parsing)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginManifest {
    #[serde(default)]
    name: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    author: String,
    #[serde(default)]
    skills: Vec<serde_json::Value>,
    #[serde(default)]
    commands: Vec<serde_json::Value>,
    #[serde(default)]
    hooks: Vec<serde_json::Value>,
    #[serde(default, rename = "mcpServers")]
    mcp_servers: Vec<serde_json::Value>,
    #[serde(default)]
    agents: Vec<serde_json::Value>,
}

/// Raw SKILL.md YAML frontmatter fields
#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct SkillFrontmatter {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    when_to_use: Option<String>,
    #[serde(default)]
    user_invocable: Option<bool>,
    #[serde(default)]
    argument_hint: Option<String>,
}
```

Then implement these functions:

`fn plugins_dir() -> Result<PathBuf, String>` — returns `~/.claude/plugins/` using `dirs::home_dir()`.

`fn skills_dir() -> Result<PathBuf, String>` — returns `~/.claude/skills/` using `dirs::home_dir()`.

`fn settings_path() -> Result<PathBuf, String>` — returns `~/.claude/settings.json`.

`fn read_disabled_plugins() -> Vec<String>` — reads `~/.claude/settings.json`, parses it as JSON, looks for a `"disabledPlugins"` array of strings. Returns empty vec on any failure.

`fn parse_skill_frontmatter(content: &str) -> Option<SkillFrontmatter>` — if the content starts with `---`, extract the YAML between the first and second `---` delimiters. Parse with `serde_json` (or just manual string splitting for the simple key: value pairs since we want to avoid adding a YAML dependency). For each line between the delimiters, split on `: ` to extract key-value pairs. Build a SkillFrontmatter from the extracted values. Return None if no frontmatter found.

`pub fn list_installed_plugins() -> Result<Vec<PluginInfo>, String>` — reads `plugins_dir()`. For each subdirectory, look for `plugin.json`. Parse it as `PluginManifest`. Extract string names from the `skills`, `commands`, `hooks`, `mcp_servers`, `agents` arrays (each element may be an object with a `"name"` field, or just a string). Check against `read_disabled_plugins()` for the `enabled` field. Return the list sorted by name.

`pub fn list_installed_skills() -> Result<Vec<SkillInfo>, String>` — reads `skills_dir()`. For each subdirectory, look for `SKILL.md`. Parse the frontmatter with `parse_skill_frontmatter()`. Use the directory name as fallback for the skill name. Set `source` to `"user"`. Also iterate all installed plugins and extract their skill entries with `source` set to the plugin name. Return combined list sorted by name.

`pub fn get_plugin_config(plugin_name: &str) -> Result<PluginInfo, String>` — find the plugin by name in `plugins_dir()` and return its full info. Error if not found.

`pub fn toggle_plugin(plugin_name: &str, enabled: bool) -> Result<(), String>` — reads `~/.claude/settings.json`, parses it as a `serde_json::Value` object. If `enabled` is false, ensure `plugin_name` is in the `"disabledPlugins"` array (create the array if it doesn't exist). If `enabled` is true, remove `plugin_name` from the array. Write the JSON back to `settings.json` with pretty formatting. Use the same read-modify-write pattern as `mcp.rs` `write_mcp_config`.

- [ ] **Step 2: Register new Rust commands in `src-tauri/src/lib.rs`**

At the top of `lib.rs`, add `mod plugins;` after the existing module declarations (after line 12 `mod worktree;`).

Add these four Tauri command wrappers after the Analytics Commands section (after line 373) and before the Checkpoint Commands section. Follow the exact same pattern as existing commands — `#[tauri::command]` + `#[specta::specta]` annotations, function delegates to the module:

```rust
// -- Plugin Commands ------------------------------------------

#[tauri::command]
#[specta::specta]
fn list_installed_plugins() -> Result<Vec<plugins::PluginInfo>, String> {
    plugins::list_installed_plugins()
}

#[tauri::command]
#[specta::specta]
fn list_installed_skills() -> Result<Vec<plugins::SkillInfo>, String> {
    plugins::list_installed_skills()
}

#[tauri::command]
#[specta::specta]
fn get_plugin_config(plugin_name: String) -> Result<plugins::PluginInfo, String> {
    plugins::get_plugin_config(&plugin_name)
}

#[tauri::command]
#[specta::specta]
fn toggle_plugin(plugin_name: String, enabled: bool) -> Result<(), String> {
    plugins::toggle_plugin(&plugin_name, enabled)
}
```

In the `tauri_specta::collect_commands!` macro invocation (line 471-524), add the four new commands after `rebase_branch,`:

```
list_installed_plugins,
list_installed_skills,
get_plugin_config,
toggle_plugin,
```

- [ ] **Step 3: Create `src/components/settings/PluginManager.tsx`**

Create the file. This component lists installed plugins with toggle switches, and shows skills/hooks/MCP servers each plugin provides.

Import: `useState`, `useEffect`, `useCallback` from react. `invoke` from `@tauri-apps/api/core`. `Puzzle, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Wand2, Terminal, Server, GitBranch, Bot` from `lucide-react`. `toast` from `sonner`.

Define TypeScript interfaces mirroring the Rust types:

```typescript
interface PluginInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  path: string;
  enabled: boolean;
  skills: string[];
  commands: string[];
  hooks: string[];
  mcpServers: string[];
  agents: string[];
}

interface SkillInfo {
  name: string;
  description: string;
  whenToUse: string;
  source: string;
  userInvocable: boolean;
  argumentHint: string | null;
  path: string;
}
```

Create a `PluginCard` subcomponent that receives a `PluginInfo` and an `onToggle` callback. It renders:
- A row with: toggle button (ToggleRight/ToggleLeft icons, green when enabled, overlay-1 when disabled), plugin name (text-xs font-semibold), version badge (text-[9px]), author (text-[10px] overlay-1)
- An expand/collapse chevron on the right side
- When expanded, show four subsections only if non-empty:
  - "Skills" with Wand2 icon — list skill names as small tags
  - "Commands" with Terminal icon — list command names
  - "Hooks" with GitBranch icon — list hook event types
  - "MCP Servers" with Server icon — list server names
  - "Agents" with Bot icon — list agent names
- Each subsection label is text-[10px] in subtext-0 color, items are text-[10px] in overlay-1 with a surface-1 background tag

The main `PluginManager` component:
- State: `plugins: PluginInfo[]`, `skills: SkillInfo[]`, `loading: boolean`, `expandedPlugin: string | null`
- On mount, call `invoke<PluginInfo[]>("list_installed_plugins")` and `invoke<SkillInfo[]>("list_installed_skills")`. Store results, set loading false.
- `handleToggle(pluginName, currentEnabled)` — call `invoke("toggle_plugin", { pluginName, enabled: !currentEnabled })`, then reload the plugin list. Show toast on success/error.
- Render: header bar matching McpManager style (Puzzle icon, "Installed Plugins" title, count badge). Below, scrollable list of `PluginCard` components. If no plugins found, show empty state with Puzzle icon and "No plugins installed" text and a hint to use `claude plugins add <name>`.
- Below the plugins list, render a "Skills" section showing standalone user skills (those with `source === "user"`) as a simple list with name and description.

Style everything with inline `style` props using CSS variables (`var(--color-surface-0)`, `var(--color-text)`, `var(--color-overlay-1)`, etc.) matching the existing McpManager and SettingsPanel patterns. Use `className` for layout (flex, gap, padding) and `style` for colors/borders.

- [ ] **Step 4: Add "Plugins" tab to SettingsPanel**

In `src/components/settings/SettingsPanel.tsx`:

Add import: `import { Puzzle } from "lucide-react";` and `import { PluginManager } from "./PluginManager";`.

Update the `SettingsTab` type union at line 7 to add `"plugins"`:
```typescript
type SettingsTab = "claude-md" | "mcp-servers" | "plugins" | "spec-viewer";
```

Add a new entry to the `tabs` array at line 9, inserted after the "mcp-servers" entry:
```typescript
{ id: "plugins", label: "Plugins", icon: <Puzzle size={12} /> },
```

In the tab content rendering (lines 64-73), add the plugins case. Change the ternary chain to handle the new tab:
```typescript
{activeTab === "claude-md" ? (
  <ClaudeMdEditor />
) : activeTab === "mcp-servers" ? (
  <McpManager />
) : activeTab === "plugins" ? (
  <PluginManager />
) : (
  <SpecViewer />
)}
```

- [ ] **Step 5: Add mock implementations for new commands in `tauriMock.ts`**

Find `tauriMock.ts` in `src/lib/`. Locate the mock command handler (the object or switch that maps command names to mock responses). Add entries for the four new commands:

- `list_installed_plugins` — return an array with 2 sample plugins:
  ```typescript
  [
    {
      name: "context7",
      version: "1.2.0",
      description: "Fetch current documentation for libraries and frameworks",
      author: "context7",
      path: "~/.claude/plugins/context7",
      enabled: true,
      skills: ["resolve-library-id", "query-docs"],
      commands: [],
      hooks: [],
      mcpServers: ["context7"],
      agents: [],
    },
    {
      name: "chrome-devtools-mcp",
      version: "2.0.1",
      description: "Chrome DevTools integration via MCP",
      author: "anthropic",
      path: "~/.claude/plugins/chrome-devtools-mcp",
      enabled: true,
      skills: ["chrome-devtools", "troubleshooting", "a11y-debugging"],
      commands: [],
      hooks: [],
      mcpServers: ["chrome-devtools"],
      agents: [],
    },
  ]
  ```
- `list_installed_skills` — return 3 sample skills with source "user" and "context7"
- `get_plugin_config` — return the first sample plugin
- `toggle_plugin` — return `null` (void)

---

### Task 2: Slash Command Autocomplete

**Files:**
- Create: `src/lib/slashCommands.ts`
- Create: `src/components/chat/SlashAutocomplete.tsx`
- Modify: `src/components/chat/ChatInput.tsx`
- Modify: `src/lib/tauriMock.ts` (if needed)

This task adds a dropdown autocomplete that appears when the user types `/` at the start of their input in the chat box. Claude Code has built-in slash commands (/help, /clear, /compact, /cost, /doctor, /init, /login, /logout, /memory, /model, /permissions, /review, /status, /vim) plus skills from plugins that can be invoked via `/skill-name`. The autocomplete shows matching commands with name, description, and source.

The current ChatInput component (`src/components/chat/ChatInput.tsx`, 129 lines) is a controlled textarea with `text` state (line 19), `onChange` handler (line 90), and `onKeyDown` handler (lines 46-54) that sends on Enter. The textarea ref is `textareaRef` (line 20). The component receives `onSend`, `onStop`, `isStreaming`, `disabled`, `connectionStatus` as props.

- [ ] **Step 1: Create `src/lib/slashCommands.ts` with command registry**

Create the file. Define:

```typescript
export interface SlashCommand {
  /** The command name without the leading "/" */
  name: string;
  /** Short description shown in the autocomplete */
  description: string;
  /** "built-in" or the plugin/skill name that provides it */
  source: "built-in" | string;
  /** Whether this is a skill (invoked via Skill tool) vs a CLI command */
  isSkill: boolean;
}
```

Export a constant array `BUILTIN_COMMANDS: SlashCommand[]` with these entries:
- `{ name: "help", description: "Show available commands and usage information", source: "built-in", isSkill: false }`
- `{ name: "clear", description: "Clear the conversation history", source: "built-in", isSkill: false }`
- `{ name: "compact", description: "Compact conversation to reduce context usage", source: "built-in", isSkill: false }`
- `{ name: "cost", description: "Show token usage and cost for this session", source: "built-in", isSkill: false }`
- `{ name: "doctor", description: "Check Claude Code installation health", source: "built-in", isSkill: false }`
- `{ name: "init", description: "Initialize CLAUDE.md in the current project", source: "built-in", isSkill: false }`
- `{ name: "login", description: "Log in to your Anthropic account", source: "built-in", isSkill: false }`
- `{ name: "logout", description: "Log out of your Anthropic account", source: "built-in", isSkill: false }`
- `{ name: "memory", description: "View or edit CLAUDE.md project memory", source: "built-in", isSkill: false }`
- `{ name: "model", description: "Switch the active Claude model", source: "built-in", isSkill: false }`
- `{ name: "permissions", description: "View or modify tool permissions", source: "built-in", isSkill: false }`
- `{ name: "review", description: "Review recent code changes", source: "built-in", isSkill: false }`
- `{ name: "status", description: "Show current session status", source: "built-in", isSkill: false }`
- `{ name: "vim", description: "Toggle vim keybinding mode", source: "built-in", isSkill: false }`
- `{ name: "config", description: "View or edit Claude Code configuration", source: "built-in", isSkill: false }`
- `{ name: "bug", description: "Report a bug to Anthropic", source: "built-in", isSkill: false }`

Export a function `buildCommandList(skills: Array<{ name: string; description: string; source: string }>): SlashCommand[]` that:
1. Starts with a copy of `BUILTIN_COMMANDS`
2. For each skill, adds a `SlashCommand` with `isSkill: true` and the skill's source
3. Sorts the combined list alphabetically by name
4. Returns it

Export a function `filterCommands(commands: SlashCommand[], query: string): SlashCommand[]` that:
1. If query is empty, return all commands
2. Lowercase the query
3. Filter commands where `name` includes the query OR `description` includes the query
4. Sort: exact prefix matches on name first, then contains-name matches, then description-only matches
5. Limit to 12 results

- [ ] **Step 2: Create `src/components/chat/SlashAutocomplete.tsx`**

Create the file. This is a dropdown overlay that renders above the chat input.

Props interface:
```typescript
interface SlashAutocompleteProps {
  commands: SlashCommand[];
  query: string;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  visible: boolean;
}
```

The component:
- If `!visible` or `commands.length === 0`, return null
- Render a `div` positioned absolutely above the input (use `bottom: "100%"`, `left: 0`, `right: 0`)
- Background: `var(--color-surface-0)`, border: `1px solid var(--color-surface-1)`, rounded-md, shadow-lg, max-height 300px, overflow-y auto, z-50
- For each command in the list, render a row:
  - Highlighted if its index matches `selectedIndex` (background `var(--color-surface-1)`)
  - Left: `/{command.name}` in text-xs font-mono, color `var(--color-blue)` for built-in, `var(--color-mauve)` for skills
  - Right side of name row: source badge — if `source !== "built-in"`, show a small tag with the source name in text-[9px]
  - Below the name: description in text-[10px] color `var(--color-overlay-1)`, truncated to one line
  - On click: call `onSelect(command)`
  - On mouseenter: no state change needed (keyboard navigation is primary)
- Each row has `px-2 py-1.5` padding and cursor-pointer

- [ ] **Step 3: Wire SlashAutocomplete into ChatInput**

In `src/components/chat/ChatInput.tsx`:

Add imports at the top:
```typescript
import { SlashAutocomplete } from "./SlashAutocomplete";
import { BUILTIN_COMMANDS, filterCommands, buildCommandList, type SlashCommand } from "@/lib/slashCommands";
```

Add new state variables inside the `ChatInput` component (after existing state on line 19-20):
```typescript
const [showSlash, setShowSlash] = useState(false);
const [slashQuery, setSlashQuery] = useState("");
const [slashIndex, setSlashIndex] = useState(0);
const [allCommands] = useState<SlashCommand[]>(() => buildCommandList([]));
```

Note: Initially we pass an empty skills array to `buildCommandList`. In a later enhancement, the ChatPanel can pass installed skills as a prop. For now, built-in commands are sufficient.

Compute filtered commands:
```typescript
const filteredSlash = showSlash ? filterCommands(allCommands, slashQuery) : [];
```

Modify the `onChange` handler (line 90). Replace the inline `onChange={(e) => setText(e.target.value)}` with a named handler:
```typescript
const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
  const val = e.target.value;
  setText(val);

  // Check if we should show slash autocomplete
  if (val.startsWith("/")) {
    const query = val.slice(1); // everything after the "/"
    setShowSlash(true);
    setSlashQuery(query);
    setSlashIndex(0);
  } else {
    setShowSlash(false);
    setSlashQuery("");
  }
}, []);
```

Create a slash command selection handler:
```typescript
const handleSlashSelect = useCallback((cmd: SlashCommand) => {
  setText("/" + cmd.name + " ");
  setShowSlash(false);
  setSlashQuery("");
  textareaRef.current?.focus();
}, []);
```

Modify `handleKeyDown` (lines 46-54) to intercept arrow keys and Enter when slash autocomplete is visible:
```typescript
const handleKeyDown = useCallback(
  (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlash && filteredSlash.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, filteredSlash.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        handleSlashSelect(filteredSlash[slashIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSlash(false);
        return;
      }
    }
    // Original Enter-to-send behavior
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  },
  [showSlash, filteredSlash, slashIndex, handleSlashSelect, handleSend],
);
```

In the JSX, wrap the textarea container `div` (the one with `className="flex items-end gap-1.5 rounded-md p-1.5"`) in a `div` with `className="relative"` so the autocomplete can position absolutely above it. Place the `SlashAutocomplete` component just before the inner container:

```tsx
<div className="relative">
  <SlashAutocomplete
    commands={filteredSlash}
    query={slashQuery}
    selectedIndex={slashIndex}
    onSelect={handleSlashSelect}
    visible={showSlash}
  />
  <div className="flex items-end gap-1.5 rounded-md p-1.5" style={...}>
    {/* existing textarea and buttons */}
  </div>
</div>
```

Update the textarea to use `handleChange` instead of the inline onChange.

- [ ] **Step 4: Add skills from installed plugins to the command list**

Modify `ChatInput` props to optionally accept installed skills:
```typescript
interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
  connectionStatus: string;
  installedSkills?: Array<{ name: string; description: string; source: string }>;
}
```

Update the `allCommands` initialization to use `installedSkills`:
```typescript
const [allCommands, setAllCommands] = useState<SlashCommand[]>(() => buildCommandList([]));

useEffect(() => {
  if (installedSkills) {
    setAllCommands(buildCommandList(installedSkills));
  }
}, [installedSkills]);
```

In `ChatPanel.tsx`, load installed skills on mount and pass them to ChatInput. Add state:
```typescript
const [installedSkills, setInstalledSkills] = useState<Array<{ name: string; description: string; source: string }>>([]);
```

On mount, invoke `list_installed_skills` and map the result to the simplified format. Pass to ChatInput:
```tsx
<ChatInput
  /* existing props */
  installedSkills={installedSkills}
/>
```

---

### Task 3: Usage Limits & Session Info Display

**Files:**
- Create: `src/stores/usage.ts`
- Create: `src/components/shared/UsagePanel.tsx`
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/stores/conversation.ts` (add session start tracking)

This task replaces the bare "$0.0000" cost display in the status bar with richer session info: a session timer, token count, and cost. It also adds a detailed usage panel accessible by clicking on the status bar usage area.

The current StatusBar (`src/components/layout/StatusBar.tsx`, 192 lines) shows `totalCost` from the conversation store (line 25, displayed at lines 125-128). The conversation store (`src/stores/conversation.ts`, 476 lines) already tracks `totalCost` and `totalTokens` (lines 114-115), and updates them in the `handleResult` action (lines 419-438). The `ResultMessage` includes `duration_ms`, `duration_api_ms`, `num_turns`, `total_cost_usd`, and `usage` with token breakdowns.

The `SessionMetadata` interface (lines 58-66) has `sessionId`, `model`, `claudeCodeVersion`, `tools`, `permissionMode`, `cwd`. We need to add `startedAt`.

- [ ] **Step 1: Create `src/stores/usage.ts` with session timing and aggregation**

Create the file. This is a lightweight Zustand store that tracks session timing separately from the conversation store (which handles message data). The usage store aggregates token/cost data and computes derived values.

```typescript
import { create } from "zustand";

export interface UsageState {
  /** When the current session started (epoch ms) */
  sessionStartedAt: number | null;
  /** Running total of input tokens across all turns */
  inputTokens: number;
  /** Running total of output tokens across all turns */
  outputTokens: number;
  /** Cache creation tokens */
  cacheCreationTokens: number;
  /** Cache read tokens */
  cacheReadTokens: number;
  /** Running total cost in USD */
  totalCostUsd: number;
  /** Number of completed turns */
  turnCount: number;
  /** Last known rate limit info (if available) */
  rateLimitInfo: {
    requestsRemaining: number | null;
    tokensRemaining: number | null;
    resetsAt: string | null;
  } | null;

  // Actions
  startSession: () => void;
  addTurnUsage: (usage: {
    inputTokens?: number;
    outputTokens?: number;
    cacheCreation?: number;
    cacheRead?: number;
    costUsd?: number;
  }) => void;
  setRateLimitInfo: (info: UsageState["rateLimitInfo"]) => void;
  reset: () => void;

  // Computed getters (as functions to avoid stale closures)
  getSessionDurationMs: () => number;
  getSessionDurationFormatted: () => string;
  getTotalTokens: () => number;
  getTokensFormatted: () => string;
}
```

Implement:
- `startSession()` — set `sessionStartedAt` to `Date.now()`, reset all counters to 0
- `addTurnUsage(usage)` — add each field to the running totals, increment `turnCount`
- `setRateLimitInfo(info)` — store it
- `reset()` — set everything back to initial values (null/0)
- `getSessionDurationMs()` — if `sessionStartedAt` is null, return 0; else return `Date.now() - sessionStartedAt`
- `getSessionDurationFormatted()` — convert ms to "Xh Ym" or "Ym Zs" format. If over 1 hour, show hours and minutes. If under 1 hour, show minutes and seconds. If under 1 minute, show seconds.
- `getTotalTokens()` — return `inputTokens + outputTokens`
- `getTokensFormatted()` — format as "45.2k" if >= 1000, otherwise just the number

- [ ] **Step 2: Wire usage store into conversation event handlers**

In `src/stores/conversation.ts`, import the usage store:
```typescript
import { useUsageStore } from "./usage";
```

In the `handleSystemInit` action (lines 281-290), after setting the session, call:
```typescript
useUsageStore.getState().startSession();
```

In the `handleResult` action (lines 419-438), after updating `totalCost` and `totalTokens`, also call:
```typescript
useUsageStore.getState().addTurnUsage({
  inputTokens: msg.usage?.input_tokens,
  outputTokens: msg.usage?.output_tokens,
  cacheCreation: msg.usage?.cache_creation_input_tokens,
  cacheRead: msg.usage?.cache_read_input_tokens,
  costUsd: msg.total_cost_usd,
});
```

In `clearConversation` (lines 462-466), also call:
```typescript
useUsageStore.getState().reset();
```

- [ ] **Step 3: Update StatusBar with richer usage display**

In `src/components/layout/StatusBar.tsx`:

Add imports:
```typescript
import { Clock, Coins, Hash } from "lucide-react";
import { useUsageStore } from "@/stores/usage";
```

Add state subscriptions inside the StatusBar component:
```typescript
const sessionStartedAt = useUsageStore((s) => s.sessionStartedAt);
const usageTotalCost = useUsageStore((s) => s.totalCostUsd);
const usageInputTokens = useUsageStore((s) => s.inputTokens);
const usageOutputTokens = useUsageStore((s) => s.outputTokens);
```

Add a session timer that updates every second. Use a `useState` + `useEffect` with `setInterval`:
```typescript
const [elapsed, setElapsed] = useState("");
useEffect(() => {
  if (!sessionStartedAt) {
    setElapsed("");
    return;
  }
  const update = () => {
    const ms = Date.now() - sessionStartedAt;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) setElapsed(`${h}h ${m % 60}m`);
    else if (m > 0) setElapsed(`${m}m ${s % 60}s`);
    else setElapsed(`${s}s`);
  };
  update();
  const id = setInterval(update, 1000);
  return () => clearInterval(id);
}, [sessionStartedAt]);
```

Import `useState` and `useEffect` — add them to the existing import if not present. The StatusBar currently has no React hooks imported; add `import { useState, useEffect } from "react";` at the top.

Replace the existing cost display (lines 124-128) with a richer section. Replace:
```tsx
{/* Cost */}
<div className="flex items-center gap-1">
  <CircleDollarSign size={12} />
  <span>${totalCost.toFixed(4)}</span>
</div>
```

With:
```tsx
{/* Session timer */}
{elapsed && (
  <div className="flex items-center gap-1" title="Session duration">
    <Clock size={11} />
    <span>{elapsed}</span>
  </div>
)}

{/* Token count */}
{(usageInputTokens > 0 || usageOutputTokens > 0) && (
  <div
    className="flex items-center gap-1"
    title={`Input: ${usageInputTokens.toLocaleString()} | Output: ${usageOutputTokens.toLocaleString()}`}
  >
    <Hash size={11} />
    <span>
      {((usageInputTokens + usageOutputTokens) / 1000).toFixed(1)}k
    </span>
  </div>
)}

{/* Cost */}
<div className="flex items-center gap-1" title="Session cost">
  <Coins size={11} />
  <span>${(usageTotalCost || totalCost).toFixed(4)}</span>
</div>
```

- [ ] **Step 4: Create `src/components/shared/UsagePanel.tsx` for detailed view**

Create the file. This is a panel that can be shown in a popover or modal when the user clicks the usage area in the status bar. For now, implement it as a standalone component that could be mounted anywhere.

```typescript
import { useUsageStore } from "@/stores/usage";
import { useConversationStore } from "@/stores/conversation";
import { Clock, Hash, Coins, Zap, ArrowUpRight, ArrowDownLeft } from "lucide-react";
```

The component shows:
- **Session Duration** section: elapsed time as a large display, with a subtle progress bar showing position within a 5-hour window (5h = 18,000,000 ms). Bar uses `var(--color-blue)` fill, `var(--color-surface-1)` background, 4px height, rounded.
- **Token Breakdown** section: four rows:
  - Input tokens (ArrowUpRight icon, green)
  - Output tokens (ArrowDownLeft icon, blue)
  - Cache creation tokens (if > 0)
  - Cache read tokens (if > 0)
  - Each row: icon, label, formatted count right-aligned
- **Cost** section: total cost in large text, cost per turn as small subtitle
- **Turn Count**: number of completed turns
- **Model**: from conversation store session

Style: dark panel background (`var(--color-surface-0)`), border (`var(--color-surface-1)`), padding, rounded corners. Each section separated by a thin border. All text uses CSS variables.

The StatusBar can later be enhanced to show this panel as a tooltip/popover on click, but for this task just create the component. Add a simple state toggle in StatusBar — clicking the cost area toggles a small absolute-positioned panel above the status bar:

In StatusBar, add state: `const [showUsage, setShowUsage] = useState(false);`

Wrap the cost/timer/token area in a clickable container:
```tsx
<button
  className="flex items-center gap-3 hover:text-[var(--color-text)] transition-colors"
  onClick={() => setShowUsage((s) => !s)}
>
  {/* session timer, token count, cost items */}
</button>
```

Render the panel conditionally above the status bar:
```tsx
{showUsage && (
  <div className="absolute bottom-7 right-2 z-50">
    <UsagePanel />
  </div>
)}
```

Wrap the entire StatusBar in `<div className="relative">` to allow absolute positioning of the popover.

---

### Task 4: Codebase Indexing

**Files:**
- Create: `src-tauri/src/indexer.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/components/shared/ProjectIndex.tsx`
- Modify: `src/components/layout/StatusBar.tsx` (add index indicator)
- Modify: `src/lib/tauriMock.ts` (add mocks)

This task creates a structural project indexer that generates a summary of the codebase — file counts, directory tree, key files, dependencies — stored as JSON. This is not full semantic indexing like Cursor, but gives Claude better context about project structure without consuming tokens re-reading directory listings. The index can be injected into prompts or shown in the UI.

The existing `search.rs` and `files/tree.rs` modules already walk the filesystem using the `ignore` crate (which respects .gitignore). The indexer reuses this approach. The `ignore` crate is already in `Cargo.toml`.

- [ ] **Step 1: Create `src-tauri/src/indexer.rs` with project scanning**

Create the file. Define types:

```rust
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIndex {
    /// Root path that was indexed
    pub root_path: String,
    /// When the index was generated (epoch ms)
    pub indexed_at: u64,
    /// Total number of files (excluding gitignored)
    pub total_files: u32,
    /// Total number of directories
    pub total_dirs: u32,
    /// Approximate total lines of code
    pub total_lines: u64,
    /// File count grouped by extension
    pub files_by_extension: HashMap<String, u32>,
    /// Directory tree (limited depth)
    pub directory_tree: String,
    /// Key files detected at the root
    pub key_files: Vec<KeyFile>,
    /// Dependencies extracted from manifest files
    pub dependencies: Vec<Dependency>,
    /// Top-level languages detected (sorted by file count)
    pub languages: Vec<LanguageInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct KeyFile {
    pub name: String,
    /// "config", "readme", "manifest", "ci", "lock", "dockerfile"
    pub category: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    pub name: String,
    pub version: String,
    /// "npm", "cargo", "pip", "go"
    pub ecosystem: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LanguageInfo {
    pub name: String,
    pub extension: String,
    pub file_count: u32,
    pub percentage: f32,
}
```

Implement `pub fn index_project(root_path: &str) -> Result<ProjectIndex, String>`:

1. Use `ignore::WalkBuilder::new(root_path).hidden(false).git_ignore(true).build()` to walk the filesystem
2. For each entry:
   - Track file count and directory count
   - Categorize by extension (count per extension)
   - For files < 1MB, count lines (read and count `\n` characters) — skip binary files (check if first 512 bytes contain a null byte)
   - Total line count is approximate (skip very large files)
3. Build `directory_tree` as a text representation (like `tree` command output), limited to depth 3. Use indentation with `|--` prefixes. Only include directories, not individual files. Cap at 100 directories.
4. Detect key files at the root: check for `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `README.md`, `CLAUDE.md`, `.github/`, `Dockerfile`, `docker-compose.yml`, `tsconfig.json`, `vite.config.ts`, `.env.example`, `Makefile`. For each found, create a `KeyFile` with appropriate category.
5. Parse dependencies from manifest files:
   - If `package.json` exists: read it, parse `dependencies` and `devDependencies` objects, extract name+version pairs with ecosystem "npm". Limit to 50 dependencies.
   - If `Cargo.toml` exists: read it, find `[dependencies]` section, parse `name = "version"` or `name = { version = "..." }` lines. Ecosystem "cargo". Limit to 50.
6. Build `languages` array from the extension counts. Map common extensions to language names (ts->TypeScript, rs->Rust, py->Python, etc.). Sort by file count descending. Take top 10. Calculate percentage of total files.
7. Return the assembled `ProjectIndex`.

Implement `pub fn get_cached_index(root_path: &str) -> Result<Option<ProjectIndex>, String>`:
- Check for `.vantage/project-index.json` in `root_path`
- If it exists and was modified less than 5 minutes ago, parse and return it
- Otherwise return None

Implement `pub fn save_index(root_path: &str, index: &ProjectIndex) -> Result<(), String>`:
- Create `.vantage/` directory if needed
- Write the index as pretty JSON to `.vantage/project-index.json`

Implement the public function that the Tauri command will call:

`pub fn index_project_cached(root_path: &str, force: bool) -> Result<ProjectIndex, String>`:
- If not `force`, try `get_cached_index` first
- If cache hit, return it
- Otherwise, call `index_project`, then `save_index`, then return the index

- [ ] **Step 2: Register indexer commands in `src-tauri/src/lib.rs`**

Add `mod indexer;` after `mod plugins;`.

Add two Tauri commands after the Plugin Commands section:

```rust
// -- Indexer Commands -----------------------------------------

#[tauri::command]
#[specta::specta]
fn index_project(root_path: String, force: bool) -> Result<indexer::ProjectIndex, String> {
    indexer::index_project_cached(&root_path, force)
}

#[tauri::command]
#[specta::specta]
fn get_project_index(root_path: String) -> Result<Option<indexer::ProjectIndex>, String> {
    indexer::get_cached_index(&root_path)
}
```

Add `index_project` and `get_project_index` to the `collect_commands!` macro.

- [ ] **Step 3: Create `src/components/shared/ProjectIndex.tsx`**

Create the file. This component shows the project index summary and a re-index button.

Imports: `useState`, `useEffect`, `useCallback` from react. `invoke` from `@tauri-apps/api/core`. `FolderTree, RefreshCw, FileCode, Package, FileText` from `lucide-react`. `useLayoutStore` from `@/stores/layout`. `toast` from `sonner`.

TypeScript interfaces mirroring Rust types:
```typescript
interface ProjectIndexData {
  rootPath: string;
  indexedAt: number;
  totalFiles: number;
  totalDirs: number;
  totalLines: number;
  filesByExtension: Record<string, number>;
  directoryTree: string;
  keyFiles: Array<{ name: string; category: string; path: string }>;
  dependencies: Array<{ name: string; version: string; ecosystem: string }>;
  languages: Array<{ name: string; extension: string; fileCount: number; percentage: number }>;
}
```

The component:
- State: `index: ProjectIndexData | null`, `loading: boolean`, `indexing: boolean`
- On mount (and when `projectRootPath` changes), try `invoke("get_project_index", { rootPath })`. If result is not null, set it. Otherwise auto-trigger indexing.
- `handleReindex()` — set `indexing` true, call `invoke("index_project", { rootPath, force: true })`, set result, `indexing` false. Toast success.
- Render sections:
  1. **Header**: FolderTree icon, "Project Index" title, "Re-index" button (RefreshCw icon, spinning when indexing)
  2. **Overview row**: four stat cards in a 2x2 grid — Files (totalFiles), Directories (totalDirs), Lines (totalLines formatted as "X.Xk" if large), Languages (languages.length)
  3. **Languages bar**: horizontal stacked bar chart showing language percentages. Each segment colored differently (use a small palette: blue for TS, orange for Rust, green for Python, teal for Go, yellow for JS, etc.). Below the bar, show language names with percentage labels.
  4. **Key Files**: list of detected key files with category icons (FileText for readme, Package for manifest, FileCode for config)
  5. **Directory Tree**: collapsible section showing the `directoryTree` text in a monospace pre block, max-height 200px with overflow scroll
  6. **Dependencies**: collapsible section listing dependency names grouped by ecosystem, shown as small tags
  7. **Index metadata**: "Indexed at [timestamp]" in text-[9px] at the bottom

Style matching existing patterns: CSS variables for colors, flex layouts, surface-0/surface-1 for card backgrounds.

- [ ] **Step 4: Add index status to StatusBar**

In `src/components/layout/StatusBar.tsx`, add a small indicator showing whether the project is indexed.

Add imports: `import { Database } from "lucide-react";`

Add state for index status:
```typescript
const [isIndexed, setIsIndexed] = useState(false);
useEffect(() => {
  if (!projectRootPath) return;
  invoke<ProjectIndexData | null>("get_project_index", { rootPath: projectRootPath })
    .then((idx) => setIsIndexed(idx !== null))
    .catch(() => setIsIndexed(false));
}, [projectRootPath]);
```

Add a small indicator in the left section of the status bar (after the errors/warnings area):
```tsx
<div
  className="flex items-center gap-0.5"
  title={isIndexed ? "Project indexed" : "Project not indexed"}
>
  <Database size={11} style={{ color: isIndexed ? "var(--color-green)" : "var(--color-overlay-0)" }} />
</div>
```

- [ ] **Step 5: Add mock implementations for indexer commands**

In `tauriMock.ts`, add mock handlers:
- `index_project` — return a sample ProjectIndex with realistic data for a TypeScript/Rust project
- `get_project_index` — return the same sample data

---

### Task 5: Plugin Store Browser

**Files:**
- Create: `src/lib/pluginRegistry.ts`
- Create: `src/components/settings/PluginStore.tsx`
- Modify: `src/components/settings/PluginManager.tsx` (add "Browse Store" button)

This task adds the ability to browse Claude Code plugins from the npm registry. Claude Code plugins are npm packages tagged with the `claude-code-plugin` keyword. The npm registry provides a public search API that doesn't require authentication.

- [ ] **Step 1: Create `src/lib/pluginRegistry.ts` with npm registry search**

Create the file. This module fetches plugin listings from the npm registry.

```typescript
export interface RegistryPlugin {
  /** npm package name */
  name: string;
  description: string;
  version: string;
  author: string;
  /** npm weekly downloads */
  downloads: number;
  /** Last publish date */
  lastPublished: string;
  /** npm package URL */
  npmUrl: string;
  /** Keywords from package.json */
  keywords: string[];
}

interface NpmSearchResult {
  objects: Array<{
    package: {
      name: string;
      version: string;
      description: string;
      keywords: string[];
      author?: { name: string };
      date: string;
      links: { npm: string };
    };
    score: { detail: { popularity: number } };
  }>;
  total: number;
}
```

Export `async function searchPluginRegistry(query: string = "", offset: number = 0): Promise<{ plugins: RegistryPlugin[]; total: number }>`:
1. Build URL: `https://registry.npmjs.org/-/v1/search?text=keywords:claude-code-plugin${query ? "+" + encodeURIComponent(query) : ""}&size=20&from=${offset}`
2. Fetch with `fetch()` (available in Tauri's webview)
3. Parse the JSON response as `NpmSearchResult`
4. Map each result to a `RegistryPlugin`
5. For download counts, make a separate call to `https://api.npmjs.org/downloads/point/last-week/${name}` for each package (batch with Promise.all, limit to 10 concurrent). Parse `{ downloads: number }` from each response. Fallback to 0 on error.
6. Return the mapped list and total count

Export `function getNpmInstallCommand(packageName: string): string`:
- Return `claude plugins add ${packageName}`

- [ ] **Step 2: Create `src/components/settings/PluginStore.tsx`**

Create the file. This is a browseable store for discovering and installing Claude Code plugins.

Imports: `useState`, `useEffect`, `useCallback` from react. `Search, Download, ExternalLink, Package, Loader2, ChevronLeft, ChevronRight` from `lucide-react`. `searchPluginRegistry, type RegistryPlugin` from `@/lib/pluginRegistry`. `toast` from `sonner`.

Props interface:
```typescript
interface PluginStoreProps {
  /** Names of already-installed plugins, for showing "Installed" badge */
  installedPluginNames: string[];
  /** Callback to close the store and go back to plugin list */
  onBack: () => void;
}
```

The component:
- State: `plugins: RegistryPlugin[]`, `loading: boolean`, `searchQuery: string`, `debouncedQuery: string`, `total: number`, `page: number`
- Debounce the search query with a 300ms delay (useEffect with setTimeout)
- When `debouncedQuery` or `page` changes, call `searchPluginRegistry(debouncedQuery, page * 20)`
- Render:
  1. **Header**: ChevronLeft back button, "Plugin Store" title, Package icon
  2. **Search bar**: text input with Search icon, placeholder "Search Claude Code plugins..."
  3. **Results count**: "Showing X of Y plugins" in text-[10px]
  4. **Plugin grid**: list of plugin cards, each showing:
     - Package name in text-xs font-semibold, blue color (clickable, opens npm URL)
     - Version badge in text-[9px]
     - Description in text-[10px] color overlay-1, truncated to 2 lines
     - Author name in text-[10px]
     - Download count with Download icon
     - "Installed" badge if name is in `installedPluginNames` (green background)
     - "Install" button for non-installed plugins — shows the install command in a toast: `toast.info("Run in terminal: claude plugins add ${name}")`
  5. **Pagination**: Previous/Next buttons with page number
- Loading state: show Loader2 spinner centered
- Empty state: "No plugins found" with search query
- Error state: catch fetch errors and show "Failed to load plugins" with retry button

Styles: match existing settings panel patterns. Cards use `var(--color-surface-0)` background with `var(--color-surface-1)` border. Hover state brightens.

- [ ] **Step 3: Integrate PluginStore into PluginManager**

In `src/components/settings/PluginManager.tsx`:

Add import: `import { PluginStore } from "./PluginStore";`

Add state: `const [showStore, setShowStore] = useState(false);`

In the header bar (next to the existing Puzzle icon and title), add a "Browse Store" button:
```tsx
<button
  onClick={() => setShowStore(true)}
  className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded transition-colors hover:opacity-80"
  style={{
    backgroundColor: "var(--color-blue)",
    color: "var(--color-base)",
  }}
  title="Browse plugin store"
>
  <Package size={10} />
  Store
</button>
```

Conditionally render the store or the plugin list:
```tsx
{showStore ? (
  <PluginStore
    installedPluginNames={plugins.map((p) => p.name)}
    onBack={() => setShowStore(false)}
  />
) : (
  /* existing plugin list content */
)}
```

Add the `Package` icon to the lucide-react imports.

---

### Task 6: Coding Buddy Widget

**Files:**
- Create: `src/components/shared/BuddyWidget.tsx`
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/stores/settings.ts` (add buddy visibility setting)

This task adds a small companion widget — a turtle named Inkwell — as a fun status indicator in the bottom of the interface. The user explicitly asked for this. It shows simple status-based messages and an ASCII/emoji turtle.

The settings store (`src/stores/settings.ts`) manages user preferences. The StatusBar is the natural home for a small widget.

- [ ] **Step 1: Create `src/components/shared/BuddyWidget.tsx`**

Create the file. The BuddyWidget shows a small turtle character with context-sensitive status messages.

```typescript
import { useConversationStore } from "@/stores/conversation";

interface BuddyWidgetProps {
  visible: boolean;
}
```

The component:
- Read from conversation store: `isStreaming`, `isThinking`, `connectionStatus`
- Determine the turtle's state and message based on current activity:
  - `connectionStatus === "disconnected"` -> message: "zzz..." (sleeping)
  - `isThinking` -> message: "hmm..." (thinking)
  - `isStreaming` -> message: "writing..." (busy)
  - `connectionStatus === "ready"` and not streaming -> message: random from a pool of idle messages, picked once per state transition: ["ready!", "let's go", "what's next?", "here to help", "~"]
  - `connectionStatus === "error"` -> message: "oh no..."
- If `!visible`, return null
- Render a small inline element (fits in status bar):
  - A tiny turtle character: use the Unicode turtle emoji or a simple text art. Display as a small span.
  - The status message in a small speech bubble (text-[9px], italic, overlay-1 color)
  - The whole widget is a `span` with `display: inline-flex`, `align-items: center`, `gap: 4px`
- Keep it minimal — this sits in the status bar and should not take much space

```tsx
export function BuddyWidget({ visible }: BuddyWidgetProps) {
  const isStreaming = useConversationStore((s) => s.isStreaming);
  const isThinking = useConversationStore((s) => s.isThinking);
  const connectionStatus = useConversationStore((s) => s.connectionStatus);

  if (!visible) return null;

  let message = "~";
  if (connectionStatus === "disconnected" || connectionStatus === "stopped") {
    message = "zzz...";
  } else if (connectionStatus === "error") {
    message = "oh no...";
  } else if (isThinking) {
    message = "hmm...";
  } else if (isStreaming) {
    message = "writing...";
  } else {
    // Idle messages - pick based on current second to avoid re-renders
    const idleMessages = ["ready!", "let's go", "what's next?", "~", "here to help"];
    message = idleMessages[Math.floor(Date.now() / 60000) % idleMessages.length];
  }

  return (
    <span
      className="inline-flex items-center gap-1"
      title="Inkwell the coding turtle"
    >
      <span style={{ fontSize: "11px" }} role="img" aria-label="turtle">
        {/* Using CSS to avoid emoji rendering issues on some systems */}
        {"\uD83D\uDC22"}
      </span>
      <span
        className="text-[9px] italic"
        style={{ color: "var(--color-overlay-1)" }}
      >
        {message}
      </span>
    </span>
  );
}
```

- [ ] **Step 2: Add buddy visibility setting to settings store**

In `src/stores/settings.ts`, find the settings state interface and the default values. Add:

```typescript
/** Whether to show Inkwell the coding buddy in the status bar */
showBuddy: boolean;
toggleBuddy: () => void;
```

Default `showBuddy` to `true`.

Implement `toggleBuddy`:
```typescript
toggleBuddy() {
  set((state) => ({ showBuddy: !state.showBuddy }));
},
```

- [ ] **Step 3: Add BuddyWidget to StatusBar**

In `src/components/layout/StatusBar.tsx`:

Add imports:
```typescript
import { BuddyWidget } from "@/components/shared/BuddyWidget";
import { useSettingsStore } from "@/stores/settings";
```

The `useSettingsStore` import may already exist (it's at line 12). Add the buddy subscription:
```typescript
const showBuddy = useSettingsStore((s) => s.showBuddy);
```

Place the BuddyWidget in the left section of the status bar, after the git branch and before the errors/warnings area:

```tsx
{/* Coding buddy */}
<BuddyWidget visible={showBuddy} />
```

This puts Inkwell in a subtle spot in the status bar where the user can see it without it being intrusive.

---

### Task 7: Integration Testing & Polish

**Files:**
- Modify: `src/lib/tauriMock.ts` (ensure all new mocks work)
- All new files from Tasks 1-6

This task verifies all new features work together, tests edge cases, and ensures the build succeeds.

- [ ] **Step 1: Verify TypeScript compilation**

Run `npx tsc --noEmit` from the project root. Fix any type errors in the new files. Common issues to check:
- Ensure all TypeScript interfaces match their Rust counterpart's camelCase field names
- Ensure `invoke` calls use the exact command names registered in `lib.rs`
- Ensure all imports resolve correctly (use `@/` path aliases)

- [ ] **Step 2: Verify mock layer completeness**

In `src/lib/tauriMock.ts`, ensure every new Tauri command has a mock implementation. The mock layer is essential because the app renders in a browser during development without Tauri. Check that:
- `list_installed_plugins` returns sample data
- `list_installed_skills` returns sample data
- `get_plugin_config` returns a sample plugin
- `toggle_plugin` returns void
- `index_project` returns a sample ProjectIndex
- `get_project_index` returns a sample ProjectIndex

- [ ] **Step 3: Run unit tests**

Run `npx vitest run` to verify existing tests still pass. No new test files need to be created for this phase, but ensure:
- The conversation store tests still pass with the added `useUsageStore` calls
- The settings store tests (if any) pass with the new `showBuddy` field

- [ ] **Step 4: Verify production build**

Run `npm run build` to check the Vite production build succeeds. Fix any build errors. Common issues:
- Missing exports in barrel files
- Unused imports triggering warnings
- CSS variable references in inline styles (these are fine but verify no typos)

- [ ] **Step 5: Test the PluginStore network calls**

The PluginStore makes real HTTP calls to the npm registry. Test that:
- The search URL construction is correct
- The response parsing handles missing fields gracefully
- Network errors are caught and displayed (add a try/catch around the fetch)
- The CORS policy allows calls to registry.npmjs.org from the Tauri webview (it should, since Tauri's webview doesn't have the same CORS restrictions as a browser)

- [ ] **Step 6: Commit all Phase 8 changes**

Stage all new and modified files:
- `src-tauri/src/plugins.rs` (new)
- `src-tauri/src/indexer.rs` (new)
- `src-tauri/src/lib.rs` (modified)
- `src/components/settings/PluginManager.tsx` (new)
- `src/components/settings/PluginStore.tsx` (new)
- `src/components/settings/SettingsPanel.tsx` (modified)
- `src/components/chat/SlashAutocomplete.tsx` (new)
- `src/components/chat/ChatInput.tsx` (modified)
- `src/components/chat/ChatPanel.tsx` (modified)
- `src/components/shared/UsagePanel.tsx` (new)
- `src/components/shared/ProjectIndex.tsx` (new)
- `src/components/shared/BuddyWidget.tsx` (new)
- `src/components/layout/StatusBar.tsx` (modified)
- `src/stores/usage.ts` (new)
- `src/stores/conversation.ts` (modified)
- `src/stores/settings.ts` (modified)
- `src/lib/slashCommands.ts` (new)
- `src/lib/pluginRegistry.ts` (new)
- `src/lib/tauriMock.ts` (modified)

Commit with message: "feat: Phase 8 — plugin discovery, slash autocomplete, usage limits, codebase indexing, plugin store, coding buddy"
