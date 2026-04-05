# Tauri MCP Server Research

## Date: 2026-04-04

## Research Summary

Three approaches were investigated for letting Claude Code interact with a running Tauri app:

### Option 1: @hypothesi/tauri-mcp-server (RECOMMENDED)

- **npm**: `@hypothesi/tauri-mcp-server@0.10.0` (published 2026-03-16)
- **Rust crate**: `tauri-plugin-mcp-bridge@0.10.0` on crates.io
- **GitHub**: https://github.com/hypothesi/mcp-server-tauri
- **Docs**: https://hypothesi.github.io/mcp-server-tauri
- **License**: MIT

**20 tools available:**

| Tool | Purpose |
|------|---------|
| `get_setup_instructions` | Setup/update instructions for the MCP Bridge plugin |
| `driver_session` | Start/stop/status automation session |
| `webview_find_element` | Find elements by CSS selector, XPath, text, or ref ID |
| `webview_interact` | Click, scroll, swipe, focus, long-press |
| `webview_screenshot` | Capture webview screenshots (JPEG default) |
| `webview_keyboard` | Type text or send key events |
| `webview_wait_for` | Wait for elements, text, or events |
| `webview_get_styles` | Get computed CSS styles |
| `webview_execute_js` | Execute JavaScript in webview |
| `webview_dom_snapshot` | Get structured DOM snapshot |
| `webview_select_element` | Visual element picker |
| `webview_get_pointed_element` | Get metadata for Alt+Shift+Clicked element |
| `manage_window` | List windows, get info, resize |
| `ipc_execute_command` | Execute Tauri IPC commands directly |
| `ipc_get_backend_state` | Get app metadata and state |
| `ipc_monitor` | Start/stop IPC monitoring |
| `ipc_get_captured` | Get captured IPC traffic |
| `ipc_emit_event` | Emit custom events |
| `read_logs` | Read console, Android, iOS, system logs |
| `list_devices` | List Android/iOS devices |

**Architecture**: The MCP server connects via WebSocket to a Rust plugin (`tauri-plugin-mcp-bridge`) embedded in the Tauri app. The plugin is only included in debug builds.

**Dependencies**: `@modelcontextprotocol/sdk`, `aria-api`, `execa`, `html2canvas-pro`, `ws`, `zod`

**Why this is best**: Production-quality, actively maintained, 20 tools covering screenshots/clicks/DOM/IPC/JS execution, multi-app support, purpose-built for Tauri v2.

### Option 2: tauri-plugin-mcp by P3GLEG

- **npm**: `tauri-plugin-mcp@0.1.0`
- **Rust crate**: `tauri-plugin-mcp@0.8.0-alpha.4` (alpha, different package)
- **GitHub**: https://github.com/P3GLEG/tauri-plugin-mcp

**Features**: Screenshots, window management, DOM access, mouse/keyboard simulation, localStorage, JS execution. Communicates via IPC socket or TCP.

**Why not chosen**: Alpha quality (0.1.0 npm / 0.8.0-alpha.4 crate), fewer tools, no IPC monitoring, less documentation. However, it works directly via socket without WebSocket, which could be simpler for some setups.

### Option 3: chrome-devtools-mcp (CDP approach)

- **npm**: `chrome-devtools-mcp@0.21.0`
- **Approach**: Enable WebView2 remote debugging in Tauri, then connect Chrome DevTools MCP

**Why not chosen as primary**: Requires setting environment variable `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` before app launch. Works but is less integrated than a purpose-built Tauri MCP server -- no IPC monitoring, no Tauri-specific commands, and requires launching the app with special env vars. However, this could serve as a fallback since we already have chrome-devtools-mcp skills installed.

### Other crates found

- `tauri-plugin-mcp-gui@0.1.0` -- AI agent GUI interaction via screenshots
- `tauri-plugin-mcp-server@0.1.0` -- Extend Tauri backends with MCP capabilities

## Decision

Use **@hypothesi/tauri-mcp-server** as the primary Tauri MCP integration. It provides the most complete toolset, is production-quality, and is designed specifically for the Tauri v2 + AI assistant workflow.

## Integration Steps

See `SETUP.md` in this directory for installation instructions.
