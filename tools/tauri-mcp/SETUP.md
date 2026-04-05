# Tauri MCP Server Setup for Vantage

This guide integrates `@hypothesi/tauri-mcp-server` so Claude Code (and other AI
assistants) can take screenshots, click elements, read DOM, inspect state, and
execute IPC commands against a running Vantage instance.

## Architecture

```
Claude Code  <--MCP/stdio-->  @hypothesi/tauri-mcp-server  <--WebSocket-->  tauri-plugin-mcp-bridge (in Vantage)
```

The MCP server runs as a local process spawned by Claude Code. It connects via
WebSocket to a bridge plugin running inside the Tauri app (debug builds only).

## Step 1: Add the Rust Plugin

In `src-tauri/Cargo.toml`, add:

```toml
tauri-plugin-mcp-bridge = "0.10"
```

## Step 2: Register the Plugin (debug builds only)

In `src-tauri/src/lib.rs`, inside the builder chain, add the plugin behind
`#[cfg(debug_assertions)]`:

```rust
// After existing plugins, before .manage()
#[cfg(debug_assertions)]
{
    app_builder = app_builder.plugin(tauri_plugin_mcp_bridge::init());
}
```

The plugin is excluded from release builds automatically.

## Step 3: Configure Claude Code

The `.mcp.json` at project root is updated to include:

```json
{
  "mcpServers": {
    "tauri-mcp": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@hypothesi/tauri-mcp-server@latest"],
      "env": {}
    }
  }
}
```

On Windows, the `cmd /c` wrapper is required (see CLAUDE.md gotchas).

## Step 4: Usage

1. Start Vantage in dev mode: `npm run tauri dev`
2. Start a Claude Code session in this project directory
3. Claude Code will auto-start the MCP server

### Available tools (once connected)

**Setup**:
- `driver_session` -- Start/stop automation session (call with `action: "start"` first)

**UI Automation**:
- `webview_screenshot` -- Capture what the app looks like right now
- `webview_find_element` -- Find elements by CSS selector, XPath, or text
- `webview_interact` -- Click, scroll, swipe, focus elements
- `webview_keyboard` -- Type text or send key events
- `webview_wait_for` -- Wait for elements/text/events
- `webview_get_styles` -- Get computed CSS styles
- `webview_execute_js` -- Execute arbitrary JS in the webview
- `webview_dom_snapshot` -- Get structured DOM snapshot (accessibility or structure)
- `webview_select_element` -- Visual element picker (user clicks, returns metadata)
- `manage_window` -- List/resize/move windows

**IPC & Backend**:
- `ipc_execute_command` -- Call Tauri IPC commands directly (e.g., `get_file_tree`)
- `ipc_get_backend_state` -- Get app metadata and state
- `ipc_monitor` / `ipc_get_captured` -- Monitor and capture IPC traffic
- `ipc_emit_event` -- Emit custom events

**Logs**:
- `read_logs` -- Read console output from the webview

### Example workflow

```
> Take a screenshot of Vantage
[Claude calls driver_session with action: "start"]
[Claude calls webview_screenshot]
[Returns JPEG image of the running app]

> Click the "Files" icon in the activity bar
[Claude calls webview_find_element with selector: "[data-testid='activity-files']"]
[Claude calls webview_interact with action: "click"]

> What's in the editor store right now?
[Claude calls webview_execute_js with code: "JSON.stringify(window.__ZUSTAND_STORES__?.editor?.getState())"]

> Call the git_log IPC command
[Claude calls ipc_execute_command with command: "git_log", args: { cwd: "C:/CursorProjects/Vantage", limit: 5 }]
```

## Fallback: Chrome DevTools MCP via WebView2 Remote Debugging

If `tauri-plugin-mcp-bridge` cannot be used for some reason, you can enable
WebView2 remote debugging as a fallback:

**Windows**: Set the environment variable before launching:
```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
npm run tauri dev
```

Then connect `chrome-devtools-mcp` with `--browser-url=http://127.0.0.1:9222`.

This provides screenshot/DOM/JS execution but lacks Tauri IPC monitoring.

## Multi-App Support

The MCP server supports connecting to multiple Tauri apps on different ports.
Each `driver_session start` can specify a different port. The most recently
connected app becomes the default target.

## Troubleshooting

- **MCP server can't connect**: Ensure Vantage is running in dev mode (`npm run tauri dev`). The bridge plugin only activates in debug builds.
- **Port conflict**: The bridge plugin defaults to port 9223 for WebSocket. If another app uses that port, the MCP server will try the next available.
- **Windows named pipes**: On Windows, the WebSocket transport avoids named pipe issues that IPC sockets can have.
- **Plugin not found by cargo**: Run `cargo update -p tauri-plugin-mcp-bridge` in `src-tauri/`.
