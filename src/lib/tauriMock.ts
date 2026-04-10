/**
 * Tauri Mock Layer
 *
 * Intercepts all Tauri API calls when running outside of Tauri (in a browser).
 * This enables the full UI to render for automated testing and development.
 *
 * The Tauri JS SDK reads everything through `window.__TAURI_INTERNALS__`:
 *   - `.invoke(cmd, args, options)` — the command bus (core + all plugins)
 *   - `.transformCallback(fn, once)` — registers JS callbacks for Rust to call
 *   - `.metadata` — window/webview labels used by the Window constructor
 *   - `.convertFileSrc(path)` — converts native paths to loadable URLs
 */

// ── Detection ────────────────────────────────────────────────────────────────

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_FILE_TREE = [
  {
    name: "src",
    path: "/mock-project/src",
    is_dir: true,
    is_file: false,
    extension: null,
    is_symlink: false,
    size: null,
    children: [
      {
        name: "main.tsx",
        path: "/mock-project/src/main.tsx",
        is_dir: false,
        is_file: true,
        extension: "tsx",
        is_symlink: false,
        size: 1240,
        children: null,
      },
      {
        name: "App.tsx",
        path: "/mock-project/src/App.tsx",
        is_dir: false,
        is_file: true,
        extension: "tsx",
        is_symlink: false,
        size: 3456,
        children: null,
      },
      {
        name: "index.css",
        path: "/mock-project/src/index.css",
        is_dir: false,
        is_file: true,
        extension: "css",
        is_symlink: false,
        size: 892,
        children: null,
      },
      {
        name: "components",
        path: "/mock-project/src/components",
        is_dir: true,
        is_file: false,
        extension: null,
        is_symlink: false,
        size: null,
        children: null,
      },
      {
        name: "lib",
        path: "/mock-project/src/lib",
        is_dir: true,
        is_file: false,
        extension: null,
        is_symlink: false,
        size: null,
        children: null,
      },
    ],
  },
  {
    name: "package.json",
    path: "/mock-project/package.json",
    is_dir: false,
    is_file: true,
    extension: "json",
    is_symlink: false,
    size: 1567,
    children: null,
  },
  {
    name: "tsconfig.json",
    path: "/mock-project/tsconfig.json",
    is_dir: false,
    is_file: true,
    extension: "json",
    is_symlink: false,
    size: 423,
    children: null,
  },
  {
    name: "README.md",
    path: "/mock-project/README.md",
    is_dir: false,
    is_file: true,
    extension: "md",
    is_symlink: false,
    size: 2048,
    children: null,
  },
];

const MOCK_PREREQUISITE_RESULTS = [
  {
    name: "Node.js",
    passed: true,
    version: "v20.11.0",
    message: "Node.js is installed",
    install_hint: null,
    severity: "error",
  },
  {
    name: "Claude CLI",
    passed: true,
    version: "1.0.0",
    message: "Claude CLI is available",
    install_hint: null,
    severity: "error",
  },
  {
    name: "Git",
    passed: true,
    version: "2.43.0",
    message: "Git is installed",
    install_hint: null,
    severity: "error",
  },
];

// ── In-memory store for @tauri-apps/plugin-store ─────────────────────────────

const inMemoryStores = new Map<string, Map<string, unknown>>();
let nextStoreRid = 1;
const ridToPath = new Map<number, string>();

function getOrCreateStore(path: string): number {
  // If already loaded, return existing rid
  for (const [rid, p] of ridToPath) {
    if (p === path) return rid;
  }
  const rid = nextStoreRid++;
  ridToPath.set(rid, path);
  if (!inMemoryStores.has(path)) {
    inMemoryStores.set(path, new Map());
  }
  return rid;
}

function getStoreByRid(rid: number): Map<string, unknown> | null {
  const path = ridToPath.get(rid);
  if (!path) return null;
  return inMemoryStores.get(path) ?? null;
}

// ── Error simulation mode ────────────────────────────────────────────────────

/**
 * When enabled, specified commands will reject with simulated errors.
 * Useful for testing error boundaries, retry logic, and error UI states.
 *
 * Usage from tests or browser console:
 *   import { mockErrors } from "@/lib/tauriMock";
 *   mockErrors.enable("read_file");              // default error message
 *   mockErrors.enable("write_file", "Disk full");// custom message
 *   mockErrors.disable("read_file");
 *   mockErrors.disableAll();
 *   mockErrors.isEnabled("read_file");           // boolean check
 */
class MockErrorSimulator {
  private errors = new Map<string, string>();

  enable(command: string, message?: string): void {
    this.errors.set(command, message ?? `[MockError] Simulated failure for "${command}"`);
  }

  disable(command: string): void {
    this.errors.delete(command);
  }

  disableAll(): void {
    this.errors.clear();
  }

  isEnabled(command: string): boolean {
    return this.errors.has(command);
  }

  getMessage(command: string): string | undefined {
    return this.errors.get(command);
  }
}

export const mockErrors = new MockErrorSimulator();

// ── Mock invoke handler ──────────────────────────────────────────────────────

type MockArgs = Record<string, unknown> | undefined;
type MockInvokeHandler = (args?: MockArgs) => unknown;

const mockInvokeHandlers: Record<string, MockInvokeHandler> = {
  // ── File tree operations ──
  get_file_tree: () => MOCK_FILE_TREE,
  get_directory_children: () => [],
  start_file_watcher: () => null,
  stop_file_watcher: () => null,

  // ── File operations ──
  read_file: (args) => ({
    path: (args?.path as string) ?? "/mock-project/src/main.tsx",
    content:
      '// Sample file content\nimport React from "react";\n\nfunction App() {\n  return <div>Hello World</div>;\n}\n\nexport default App;\n',
    language: "typescript",
  }),
  write_file: () => null,
  create_file: () => null,
  create_dir: () => null,
  delete_file: () => null,
  delete_dir: () => null,
  rename_path: () => null,
  format_file: (args) =>
    (args?.path as string) ? "// formatted content\n" : "// formatted content\n",

  // ── Git operations ──
  get_git_branch: () => ({ branch: "main", is_detached: false }),
  get_git_status: () => [],
  git_log: () => [],
  git_blame: () => [],
  git_diff_commit: () => "",
  git_diff_working: () =>
    "diff --git a/src/App.tsx b/src/App.tsx\nindex abc1234..def5678 100644\n--- a/src/App.tsx\n+++ b/src/App.tsx\n@@ -1,3 +1,4 @@\n import React from 'react';\n+import { NewFeature } from './NewFeature';\n \n function App() {\n",
  git_diff_staged: () => "",
  git_diff_stat: () => ({ insertions: 12, deletions: 5, files_changed: 3 }),
  git_show_file: () => "",
  git_stage: () => "",
  git_unstage: () => "",
  git_commit: () => "1 file changed, 1 insertion(+)",
  git_push: () => "Everything up-to-date",
  git_pull: () => "Already up to date.",
  git_create_branch: () => "Switched to a new branch 'feature/new'",
  git_list_branches: () => ["main", "develop", "feature/auth", "feature/dashboard", "bugfix/login-fix"],
  git_checkout_branch: () => "Switched to branch 'develop'",
  get_worktree_changes: () => [],
  rebase_branch: () => true,

  // ── Shell / Terminal ──
  list_shells: () => [
    {
      name: "PowerShell",
      path: "powershell.exe",
      args: [],
      is_default: true,
    },
  ],

  // ── Prerequisite checks ──
  check_prerequisites: () => MOCK_PREREQUISITE_RESULTS,

  // ── Search ──
  search_project: () => ({ files: [], total_matches: 0 }),
  replace_in_files: () => ({ replacements: 0, files_modified: 0 }),

  // ── Theme ──
  read_theme_file: () => null,
  write_theme_file: () => null,
  get_theme_file_path: () => "~/.vantage/theme.json",

  // ── Claude session management ──
  claude_single_shot: (args) => {
    const prompt = (args?.prompt as string) ?? "";
    // Return a plausible mock edit so the inline-edit diff preview works in browser mode
    return `// AI edit applied\n${prompt.slice(0, 120)}`;
  },
  claude_start_session: () => "mock-session-" + Date.now(),
  claude_send_message: () => null,
  claude_respond_permission: () => null,
  claude_interrupt_session: () => null,
  claude_stop_session: () => null,
  claude_stop_all_sessions: () => null,
  claude_list_active_sessions: () => [],
  claude_is_session_alive: () => false,
  claude_list_sessions: () => [],
  search_sessions: () => [],
  get_project_usage: () => ({
    session_id: "mock-session-abc123",
    session_cost: 0.1842,
    session_input_tokens: 45200,
    session_output_tokens: 12800,
    session_cache_tokens: 8400,
    session_cache_read_tokens: 32000,
    model: "claude-opus-4-6",
    session_turn_count: 14,
    last_activity: "2026-04-04T15:30:00Z",
    all_time_cost: 2.4731,
    all_time_tokens: 892400,
    session_count: 23,
  }),

  // ── Plan usage (OAuth subscription) ──
  get_plan_usage: () => ({
    fiveHour: {
      utilization: 46.0,
      resetsAt: new Date(Date.now() + 46 * 60 * 1000).toISOString(),
    },
    sevenDay: {
      utilization: 18.5,
      resetsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000).toISOString(),
    },
    sevenDayOpus: {
      utilization: 0.0,
      resetsAt: null,
    },
    extraUsage: {
      isEnabled: true,
      monthlyLimit: 1000,
      usedCredits: 245.50,
      utilization: 24.5,
    },
    fetchedAt: new Date().toISOString(),
    isOauthUser: true,
  }),

  // ── PR list ──
  get_pr_list: () => [
    { number: 42, title: "feat: example pull request", state: "OPEN" },
    { number: 41, title: "fix: another example PR", state: "OPEN" },
  ],

  // ── MCP config ──
  read_mcp_config: () => [],
  write_mcp_config: () => null,

  // ── Plugin discovery ──
  list_installed_plugins: () => [
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
  ],
  list_installed_skills: () => [
    {
      name: "my-workflow",
      description: "Custom workflow for this project",
      whenToUse: "When setting up a new feature",
      source: "user",
      userInvocable: true,
      argumentHint: null,
      path: "~/.claude/skills/my-workflow/SKILL.md",
    },
    {
      name: "query-docs",
      description: "Query library documentation",
      whenToUse: "When needing up-to-date API docs",
      source: "context7",
      userInvocable: true,
      argumentHint: "<library> <query>",
      path: "~/.claude/plugins/context7",
    },
    {
      name: "resolve-library-id",
      description: "Resolve a library name to a context7 library ID",
      whenToUse: "Before querying docs for a library",
      source: "context7",
      userInvocable: true,
      argumentHint: "<library-name>",
      path: "~/.claude/plugins/context7",
    },
  ],
  get_plugin_config: () => ({
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
  }),
  toggle_plugin: () => null,
  install_plugin: () => "Plugin installed successfully (mock)",

  // ── Worktree helpers ──
  get_agent_worktree_path: () => "/mock/.vantage-worktrees/mock-agent-12345678",
  get_agent_branch_name: () => "vantage/mock-agent-12345678",
  create_worktree: () => ({ path: "/mock/.vantage-worktrees/mock-agent-12345678", branch: "vantage/mock-agent-12345678" }),

  // ── Indexer ──
  index_project: () => ({
    rootPath: "/mock-project",
    indexedAt: Date.now(),
    totalFiles: 247,
    totalDirs: 38,
    totalLines: 18420,
    filesByExtension: { ts: 85, tsx: 62, rs: 34, json: 18, css: 12, md: 8 },
    directoryTree:
      "mock-project\n|-- src\n|   |-- components\n|   |-- stores\n|   `-- lib\n|-- src-tauri\n|   `-- src\n`-- public\n",
    keyFiles: [
      { name: "package.json", category: "manifest", path: "/mock-project/package.json" },
      { name: "Cargo.toml", category: "manifest", path: "/mock-project/Cargo.toml" },
      { name: "tsconfig.json", category: "config", path: "/mock-project/tsconfig.json" },
      { name: "README.md", category: "readme", path: "/mock-project/README.md" },
    ],
    dependencies: [
      { name: "react", version: "^19.0.0", ecosystem: "npm" },
      { name: "zustand", version: "^5.0.0", ecosystem: "npm" },
      { name: "tauri", version: "2", ecosystem: "cargo" },
      { name: "serde", version: "1", ecosystem: "cargo" },
    ],
    languages: [
      { name: "TypeScript", extension: "ts", fileCount: 147, percentage: 59.5 },
      { name: "Rust", extension: "rs", fileCount: 34, percentage: 13.8 },
      { name: "JSON", extension: "json", fileCount: 18, percentage: 7.3 },
      { name: "CSS", extension: "css", fileCount: 12, percentage: 4.9 },
      { name: "Markdown", extension: "md", fileCount: 8, percentage: 3.2 },
    ],
  }),
  get_project_index: () => ({
    rootPath: "/mock-project",
    indexedAt: Date.now(),
    totalFiles: 247,
    totalDirs: 38,
    totalLines: 18420,
    filesByExtension: { ts: 85, tsx: 62, rs: 34, json: 18, css: 12, md: 8 },
    directoryTree:
      "mock-project\n|-- src\n|   |-- components\n|   |-- stores\n|   `-- lib\n|-- src-tauri\n|   `-- src\n`-- public\n",
    keyFiles: [
      { name: "package.json", category: "manifest", path: "/mock-project/package.json" },
      { name: "Cargo.toml", category: "manifest", path: "/mock-project/Cargo.toml" },
      { name: "tsconfig.json", category: "config", path: "/mock-project/tsconfig.json" },
      { name: "README.md", category: "readme", path: "/mock-project/README.md" },
    ],
    dependencies: [
      { name: "react", version: "^19.0.0", ecosystem: "npm" },
      { name: "zustand", version: "^5.0.0", ecosystem: "npm" },
      { name: "tauri", version: "2", ecosystem: "cargo" },
      { name: "serde", version: "1", ecosystem: "cargo" },
    ],
    languages: [
      { name: "TypeScript", extension: "ts", fileCount: 147, percentage: 59.5 },
      { name: "Rust", extension: "rs", fileCount: 34, percentage: 13.8 },
      { name: "JSON", extension: "json", fileCount: 18, percentage: 7.3 },
      { name: "CSS", extension: "css", fileCount: 12, percentage: 4.9 },
      { name: "Markdown", extension: "md", fileCount: 8, percentage: 3.2 },
    ],
  }),

  // ── Analytics ──
  get_analytics: () => ({
    daily_costs: [],
    model_usage: [],
    total_cost_usd: 0,
    total_sessions: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cache_creation_tokens: 0,
    total_cache_read_tokens: 0,
    avg_cost_per_session: 0,
    date_range_start: null,
    date_range_end: null,
  }),

  // ── Claude Settings ──
  read_claude_settings: () =>
    JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: "Bash", command: "echo 'Pre-tool hook'" },
        ],
        PostToolUse: [
          { matcher: "Write", command: "npx prettier --write $FILE_PATH" },
        ],
      },
    }),
  write_claude_settings: () => null,

  // ── Workspace I/O ──
  read_workspace_file: () => null,
  write_workspace_file: () => null,
  list_workspace_files: () => [],

  // ── Agent checkpoints ──
  restore_checkpoint: () => null,
  delete_checkpoint: () => null,

  // ── Plugin: event ──
  // listen() and emit() go through invoke with plugin-namespaced commands
  "plugin:event|listen": () => 0, // returns an eventId (number)
  "plugin:event|unlisten": () => null,
  "plugin:event|emit": () => null,
  "plugin:event|emit_to": () => null,

  // ── Plugin: window ──
  "plugin:window|create": () => null,
  "plugin:window|scale_factor": () => 1,
  "plugin:window|inner_position": () => ({ x: 0, y: 0 }),
  "plugin:window|outer_position": () => ({ x: 0, y: 0 }),
  "plugin:window|inner_size": () => ({ width: 1280, height: 720 }),
  "plugin:window|outer_size": () => ({ width: 1280, height: 720 }),
  "plugin:window|is_fullscreen": () => false,
  "plugin:window|is_minimized": () => false,
  "plugin:window|is_maximized": () => false,
  "plugin:window|is_focused": () => true,
  "plugin:window|is_decorated": () => true,
  "plugin:window|is_resizable": () => true,
  "plugin:window|is_maximizable": () => true,
  "plugin:window|is_minimizable": () => true,
  "plugin:window|is_closable": () => true,
  "plugin:window|is_visible": () => true,
  "plugin:window|is_always_on_top": () => false,
  "plugin:window|title": () => "Vantage",
  "plugin:window|theme": () => "dark",
  "plugin:window|close": () => null,
  "plugin:window|minimize": () => null,
  "plugin:window|maximize": () => null,
  "plugin:window|unmaximize": () => null,
  "plugin:window|toggle_maximize": () => null,
  "plugin:window|set_focus": () => null,
  "plugin:window|set_title": () => null,
  "plugin:window|set_size": () => null,
  "plugin:window|set_min_size": () => null,
  "plugin:window|set_max_size": () => null,
  "plugin:window|set_position": () => null,
  "plugin:window|set_fullscreen": () => null,
  "plugin:window|set_decorations": () => null,
  "plugin:window|set_always_on_top": () => null,
  "plugin:window|set_resizable": () => null,
  "plugin:window|center": () => null,
  "plugin:window|show": () => null,
  "plugin:window|hide": () => null,
  "plugin:window|available_monitors": () => [],
  "plugin:window|primary_monitor": () => null,
  "plugin:window|current_monitor": () => null,

  // ── Plugin: webview ──
  "plugin:webview|create_webview": () => null,
  "plugin:webview|create_webview_window": () => null,
  "plugin:webview|get_all_webviews": () => [
    { label: "main", windowLabel: "main" },
  ],

  // ── Plugin: webviewWindow ──
  "plugin:webview|get_by_label": () => null,

  // ── Plugin: store ──
  "plugin:store|load": (args) => {
    const path = (args?.path as string) ?? "default.json";
    return getOrCreateStore(path);
  },
  "plugin:store|get_store": (args) => {
    const path = (args?.path as string) ?? "default.json";
    for (const [rid, p] of ridToPath) {
      if (p === path) return rid;
    }
    return null;
  },
  "plugin:store|set": (args) => {
    const rid = args?.rid as number;
    const key = args?.key as string;
    const value = args?.value;
    const store = getStoreByRid(rid);
    if (store) store.set(key, value);
    return null;
  },
  "plugin:store|get": (args) => {
    const rid = args?.rid as number;
    const key = args?.key as string;
    const store = getStoreByRid(rid);
    if (store && store.has(key)) {
      return [store.get(key), true];
    }
    return [null, false];
  },
  "plugin:store|has": (args) => {
    const rid = args?.rid as number;
    const key = args?.key as string;
    const store = getStoreByRid(rid);
    return store ? store.has(key) : false;
  },
  "plugin:store|delete": (args) => {
    const rid = args?.rid as number;
    const key = args?.key as string;
    const store = getStoreByRid(rid);
    return store ? store.delete(key) : false;
  },
  "plugin:store|clear": (args) => {
    const rid = args?.rid as number;
    const store = getStoreByRid(rid);
    if (store) store.clear();
    return null;
  },
  "plugin:store|keys": (args) => {
    const rid = args?.rid as number;
    const store = getStoreByRid(rid);
    return store ? [...store.keys()] : [];
  },
  "plugin:store|values": (args) => {
    const rid = args?.rid as number;
    const store = getStoreByRid(rid);
    return store ? [...store.values()] : [];
  },
  "plugin:store|entries": (args) => {
    const rid = args?.rid as number;
    const store = getStoreByRid(rid);
    return store ? [...store.entries()] : [];
  },
  "plugin:store|length": (args) => {
    const rid = args?.rid as number;
    const store = getStoreByRid(rid);
    return store ? store.size : 0;
  },
  "plugin:store|save": () => null,

  // ── Plugin: updater ──
  "plugin:updater|check": () => null, // no update available

  // ── Plugin: process ──
  "plugin:process|restart": () => null,
  "plugin:process|exit": () => null,

  // ── Plugin: dialog ──
  "plugin:dialog|open": () => "/mock-project",
  "plugin:dialog|save": () => "/mock-project/output.txt",
  "plugin:dialog|message": () => null,
  "plugin:dialog|ask": () => true,
  "plugin:dialog|confirm": () => true,

  // ── Plugin: notification ──
  "plugin:notification|is_permission_granted": () => true,
  "plugin:notification|request_permission": () => "granted",
  "plugin:notification|notify": () => null,

  // ── Plugin: resources ──
  "plugin:resources|close": () => null,

  // ── Plugin: opener ──
  "plugin:opener|open_url": () => null,
  "plugin:opener|open_path": () => null,
  "plugin:opener|reveal_item_in_dir": () => null,

  // ── Checkpoints ──
  create_checkpoint: () => ({ tag_name: "checkpoint-mock", commit_hash: "abc1234" }),
  list_checkpoints: () => [],

  // ── Quality gates / merge ──
  detect_quality_gates: () => [],
  run_quality_gate: () => ({ passed: true, output: "All checks passed" }),
  merge_branch: () => ({ success: true, message: "Merged" }),

  // ── Shell ──
  get_default_shell: () => "powershell.exe",

  // ── Session stats ──
  get_session_stats: () => ({ total_sessions: 0, total_cost: 0, avg_duration: 0 }),

  // ── Worktree helpers (additional) ──
  get_worktree_disk_usage: () => ({ total_bytes: 0, worktrees: [] }),
  list_worktrees: () => [],
  remove_worktree: () => null,
};

function mockInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  // Error simulation: if the command is marked for failure, reject immediately
  if (mockErrors.isEnabled(cmd)) {
    return Promise.reject(new Error(mockErrors.getMessage(cmd)));
  }

  const handler = mockInvokeHandlers[cmd];
  if (handler) {
    const result = handler(args);
    return Promise.resolve(result as T);
  }
  console.log(`[TauriMock] Unhandled invoke: "${cmd}"`, args);
  return Promise.resolve(null as T);
}

// ── transformCallback — registers JS callbacks the Rust side would call ──────

let nextCallbackId = 1;

function mockTransformCallback(
  callback: (...callbackArgs: unknown[]) => unknown,
  _once = false,
): number {
  const id = nextCallbackId++;
  // Store the callback so it could be called if needed for tests.
  // In production Tauri, Rust calls back via window.__TAURI_IPC__.
  // In mock mode, nothing calls it — listeners are effectively no-ops.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any)[`_${id}`] = callback;
  return id;
}

// ── Setup function ───────────────────────────────────────────────────────────

/**
 * Install mock `__TAURI_INTERNALS__` on window so that `@tauri-apps/*`
 * modules find the object they expect and do not crash.
 *
 * Must be called BEFORE any Tauri import is evaluated.
 */
export function setupMocks(): void {
  if (isTauri) return; // Already running in Tauri; nothing to mock.

  // The Tauri JS runtime reads everything from window.__TAURI_INTERNALS__
  const internals = {
    // @tauri-apps/api/core — invoke()
    invoke: (cmd: string, args?: Record<string, unknown>) =>
      mockInvoke(cmd, args),

    // @tauri-apps/api/core — transformCallback()
    // Used by Channel, listen(), once() to register JS callbacks.
    transformCallback: mockTransformCallback,

    // Metadata used by @tauri-apps/api/window's getCurrentWindow()
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main", windowLabel: "main" },
      currentWebviewWindow: { label: "main", windowLabel: "main" },
      windows: [{ label: "main" }],
      webviews: [{ label: "main", windowLabel: "main" }],
    },

    // @tauri-apps/api/core — convertFileSrc()
    convertFileSrc: (filePath: string) => filePath,

    // Plugin stubs (some plugins check for existence)
    plugins: {},
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__TAURI_INTERNALS__ = internals;

  // The event module uses a separate global for listener bookkeeping.
  // _unlisten() calls window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: (_event: string, _eventId: number) => {
      // No-op in mock mode
    },
  };

  // Expose error simulator on window for test/console access
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__TAURI_MOCK_ERRORS__ = mockErrors;

  // ── Mock tauri-pty module ─────────────────────────────────────────────
  // The terminal hook does `import("tauri-pty")` which returns { spawn }.
  // In browser mode we intercept this via a module-level mock so the
  // terminal renders with a simulated shell instead of crashing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__TAURI_PTY_MOCK__ = {
    spawn: (
      _shell: string,
      _args: string[],
      _opts: { cols: number; rows: number; cwd?: string },
    ) => {
      let onDataCb: ((data: string) => void) | null = null;
      let onExitCb: ((_ev: { exitCode: number }) => void) | null = null;

      // Send welcome message asynchronously so the terminal is ready
      setTimeout(() => {
        onDataCb?.("Vantage Mock Terminal v1.0\r\n$ ");
      }, 50);

      return {
        onData: (cb: (data: string) => void) => {
          onDataCb = cb;
          return { dispose: () => { onDataCb = null; } };
        },
        onExit: (cb: (_ev: { exitCode: number }) => void) => {
          onExitCb = cb;
          void onExitCb; // stored but never fires in mock
          return { dispose: () => { onExitCb = null; } };
        },
        write: (data: string) => {
          // Echo input back through onData to simulate a shell
          if (onDataCb) {
            // Handle Enter key — echo a new prompt
            if (data === "\r") {
              onDataCb("\r\n$ ");
            } else if (data === "\x7f") {
              // Backspace
              onDataCb("\b \b");
            } else {
              onDataCb(data);
            }
          }
        },
        resize: (_cols: number, _rows: number) => {
          // no-op
        },
        kill: () => {
          // no-op
        },
      };
    },
  };

  console.log("[TauriMock] Mocks installed — running in browser mode");
  console.log("[TauriMock] Error simulation available via window.__TAURI_MOCK_ERRORS__ or import { mockErrors }");
}
