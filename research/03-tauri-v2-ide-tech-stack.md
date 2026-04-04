# Tauri v2 IDE Tech Stack Research

> Research compiled April 2026 for the Vantage project -- a desktop IDE built around Claude Code CLI.

---

## Table of Contents

1. [Tauri v2 for IDE-Like Apps: Real-World Case Studies](#1-tauri-v2-for-ide-like-apps-real-world-case-studies)
2. [Terminal Emulation in Tauri/WebView2](#2-terminal-emulation-in-tauriwebview2)
3. [Code Editor in Tauri](#3-code-editor-in-tauri)
4. [File System Integration from Tauri Rust Backend](#4-file-system-integration-from-tauri-rust-backend)
5. [Tauri v2 IPC Patterns](#5-tauri-v2-ipc-patterns)
6. [Tauri v2 vs Electron in 2025/2026](#6-tauri-v2-vs-electron-in-20252026)
7. [Split Pane / Panel Layout Libraries for React](#7-split-pane--panel-layout-libraries-for-react)
8. [Tauri v2 + React Starter Templates](#8-tauri-v2--react-starter-templates)
9. [Tauri v2 Plugins for IDE Development](#9-tauri-v2-plugins-for-ide-development)
10. [Existing Claude Code GUI Projects](#10-existing-claude-code-gui-projects)
11. [Architecture Recommendations for Vantage](#11-architecture-recommendations-for-vantage)

---

## 1. Tauri v2 for IDE-Like Apps: Real-World Case Studies

### SideX -- VS Code Rebuilt on Tauri

**Repository**: https://github.com/Sidenai/sidex

SideX is the most ambitious Tauri-based IDE project to date: a 1:1 architectural port of VS Code that replaces Electron with Tauri v2. Key facts:

- **Installed size**: 31.2 MB (vs VS Code's 775 MB)
- **Architecture**: 49 Rust commands across 9 modules (Terminal, Git, File System, Storage, Search, Extension Host)
- **Frontend**: The actual VS Code TypeScript codebase (5,687 TS files, 335 CSS files, 82 language extensions) with zero remaining Electron imports
- **Terminal**: Uses `portable-pty` crate for real PTY functionality
- **Git**: 17 native Rust git commands (status, diff, log, branch, stash, push/pull, clone)
- **Storage**: SQLite via `rusqlite` (replaces @vscode/sqlite3)
- **File watching**: `notify` crate
- **Extension host**: Node.js sidecar process so VS Code extensions still work; loads from Open VSX marketplace
- **Status**: Early release (April 2026), core editor/terminal/file explorer/git/themes/extensions work, many features still rough

**Lessons learned from SideX**:
- A Node.js sidecar is necessary for backward compatibility with VS Code extensions
- The architectural shift from bundled Chromium to native OS webviews provides the primary size/performance gains
- Monaco editor works within Tauri's WebView2 on Windows with syntax highlighting intact
- HTTP proxy layer needed to bypass CORS restrictions for marketplace access

### Agents UI -- Developer Tools Platform

**Website**: https://agents-ui.com

A full-featured developer tools platform built with Tauri, featuring Monaco editor, terminal emulator, SSH client, and file operations.

**Performance measurements (Agents UI v0.2)**:

| Metric | Agents UI (Tauri) | Electron Equivalent |
|---|---|---|
| Binary Size | 18 MB | 142 MB |
| Idle Memory | 52 MB | 184 MB |
| Cold Startup | 0.8s | 2.1s |
| Terminal Latency | 12ms | 18ms |

Key architecture: Rust backend handles PTY management, SSH protocol, Zellij session persistence, and file system operations. Reports ~40% lower latency for PTY handling compared to Node.js implementations under load.

### Opcode (formerly Claudia) -- Claude Code GUI

**Repository**: https://github.com/winfunc/opcode

The most popular open-source GUI for Claude Code, built with Tauri 2 + React 18 + TypeScript. Features include project browsing, session management, custom agents, analytics dashboard, MCP server management, timeline/checkpoints, and CLAUDE.md editing. Uses SQLite via rusqlite for storage.

### Other Notable Tauri Apps

- **Montauri Editor**: Lightweight cross-platform text editor based on Monaco Editor + Tauri (https://github.com/TimSusa/montauri-editor)
- **Min Editor**: Code editor based on Tauri + Monaco Editor + React (https://github.com/min-editor/code)
- **Solo IDE**: React 19 + Zustand frontend, Tauri 2 desktop shell, Rust backend, Node.js + Claude Agent SDK sidecar

### Challenges Reported Across Projects

1. **Windows WebView2 gotchas**: Fixed runtime detection issues, Administrator Protection elevation bugs, packaging limited to .exe and .msi (no .appx/.msix)
2. **macOS**: Issues with codesigning universal binaries (arm64/x64)
3. **Cross-platform UI consistency**: Different web engines per OS means visual differences
4. **Smaller ecosystem**: More custom implementation needed vs Electron
5. **Rust learning curve**: Steeper for web-focused teams, though basic Tauri requires minimal Rust
6. **WebView2 distribution**: Embedding a fixed WebView2 runtime adds ~180 MB to the installer

---

## 2. Terminal Emulation in Tauri/WebView2

### xterm.js in WebView2

**Library**: xterm.js (https://xtermjs.org/)
**Current version**: 5.x (scoped packages `@xterm/*`)

xterm.js is the dominant terminal emulation library for web contexts. It works well in WebView2 (Chromium-based) on Windows. Used by VS Code, Hyper, Theia, and many Tauri projects.

**Rendering backends** (choose one per instance):
- **DOM renderer**: Default, works everywhere, slowest
- **Canvas renderer** (`@xterm/addon-canvas`): 2D canvas fallback, moderate performance
- **WebGL renderer** (`@xterm/addon-webgl`): Fastest, best for high-throughput output, uses WebGL2

**Key addons for IDE use**:
- `@xterm/addon-fit`: Auto-resize terminal to container
- `@xterm/addon-webgl`: GPU-accelerated rendering
- `@xterm/addon-canvas`: Canvas fallback renderer
- `@xterm/addon-search`: In-terminal text search
- `@xterm/addon-web-links`: Clickable URLs
- `@xterm/addon-unicode11`: Full Unicode support
- `@xterm/addon-serialize`: Serialize terminal state
- `@xterm/addon-clipboard`: Enhanced clipboard support
- `@xterm/addon-image`: Sixel/iTerm2 image protocol support

**Gotchas on Windows/WebView2**:
- WebGL contexts can be dropped by the browser for OOM or system suspend; handle `webglcontextlost` event
- Multiple texture atlases are now supported (512x512 each) for better GPU performance
- Performance issues reported with very wide containers when using canvas renderer + FitAddon
- Font loading: Must ensure terminal fonts are available (e.g., JetBrains Mono, Fira Code)

**Multiple terminal instances**: Each instance gets its own WebGL context and texture atlas. Memory scales roughly linearly. The WebGL renderer scales better than canvas with large viewports. For 4-8 simultaneous terminals, memory overhead is manageable (~20-40 MB per terminal depending on scrollback buffer).

### xterm.js React Wrappers

| Library | Status | Notes |
|---|---|---|
| `@nicksrandall/xterm-react` | Active | Modern hooks-based wrapper |
| `react-xtermjs` (Qovery) | Active | Built because existing wrappers were outdated |
| `xterm-react` | Active | Focus on performance, component-based |
| `xterm-for-react` | Stale | Not updated for hooks/modern React |

**Recommendation**: Use xterm.js directly rather than a wrapper. Wrappers add abstraction but limit control over lifecycle management, addon loading, and resize handling. A custom React hook is straightforward:

```tsx
// Simplified xterm.js React integration pattern
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';

function useTerminal(containerRef: React.RefObject<HTMLDivElement>) {
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 14,
      theme: { background: '#1e1e1e' },
      cursorBlink: true,
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    
    // Try WebGL, fall back to canvas
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available, DOM renderer is fine
    }
    
    fitAddon.fit();
    termRef.current = term;
    
    return () => { term.dispose(); };
  }, []);

  return termRef;
}
```

### PTY (Pseudo-Terminal) from Rust Side

#### Option A: tauri-plugin-pty (Recommended for Tauri)

**Crate**: `tauri-plugin-pty` v0.1.1 (https://crates.io/crates/tauri-plugin-pty)
**JS package**: `tauri-pty`
**Depends on**: `portable-pty` ^0.9.0

This is the turnkey solution. It provides a Tauri plugin that spawns shells and bridges data between xterm.js and PTY processes.

```javascript
// Frontend: Spawn a shell and connect to xterm.js
import { Terminal } from "@xterm/xterm";
import { spawn } from "tauri-pty";

const term = new Terminal();
term.open(document.getElementById("terminal"));

const pty = spawn("powershell.exe", [], {
  cols: term.cols,
  rows: term.rows,
});

// Bidirectional data transport
pty.onData(data => term.write(data));
term.onData(data => pty.write(data));

// Handle resize
term.onResize(({ cols, rows }) => pty.resize(cols, rows));
```

```toml
# Cargo.toml
[dependencies]
tauri-plugin-pty = "0.1"
```

#### Option B: portable-pty (Direct Integration)

**Crate**: `portable-pty` v0.9.x (https://crates.io/crates/portable-pty)
**Origin**: Part of WezTerm project

Lower-level crate providing cross-platform PTY abstraction. Supports:
- Unix PTY (Linux, macOS)
- Windows ConPTY (Windows 10 1809+)
- Trait-based API for runtime backend selection

```rust
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use std::sync::Arc;

fn spawn_terminal() -> Result<(), Box<dyn std::error::Error>> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let cmd = CommandBuilder::new("powershell.exe");
    let _child = pair.slave.spawn_command(cmd)?;
    
    // pair.master provides read/write handles
    // for bidirectional communication
    let reader = pair.master.try_clone_reader()?;
    let writer = pair.master.take_writer()?;
    
    // Stream reader output to frontend via Tauri channels
    // Write frontend input to writer
    
    Ok(())
}
```

**Key consideration**: PTY reads are blocking. For multiple terminals, each needs its own reader thread (or use async wrappers). Spawn a dedicated `tokio::task::spawn_blocking` per terminal instance.

#### Option C: pseudoterminal crate

**Crate**: `pseudoterminal` (https://github.com/michaelvanstraten/pseudoterminal)

Newer cross-platform PTY/ConPTY implementation with native async support. Less battle-tested than portable-pty but designed for modern async Rust.

#### Windows-Specific: ConPTY Notes

- **ConPTY** (Console Pseudo-Terminal) is available on Windows 10 1809+ and all Windows 11
- portable-pty auto-selects ConPTY on supported Windows versions
- ConPTY handles ANSI escape sequences natively, so PowerShell and cmd.exe work correctly
- Known issue: Using portable-pty with Tauri on Windows can show a brief cmd window flash on spawn (wezterm issue #6946). Mitigate with `CREATE_NO_WINDOW` flag.

**Recommendation for Vantage**: Start with `tauri-plugin-pty` for rapid prototyping. If you need more control (e.g., custom shell environments, multiplexing, session persistence), drop down to `portable-pty` with custom Tauri commands.

---

## 3. Code Editor in Tauri

### Monaco Editor

**Package**: `monaco-editor` (https://microsoft.github.io/monaco-editor/)
**Bundle size**: ~5-10 MB uncompressed
**Origin**: The editor core extracted from VS Code

**Proven in Tauri**: SideX, Montauri Editor, Min Editor, and Agents UI all use Monaco within Tauri's WebView2 successfully.

**Strengths for IDE use**:
- Full IntelliSense with context-aware autocomplete
- Built-in diff viewer
- Code minimap
- Extensive language support out of the box (TypeScript, JavaScript, Python, CSS, HTML, JSON, etc.)
- Multi-cursor editing
- Find and replace with regex
- Code folding
- Bracket matching and auto-closing

**Known issues in WebView2/Tauri**:
- **Web Workers**: Monaco uses web workers for language services. WebView2 supports web workers natively, but you must configure your bundler (Vite) to handle the worker URLs correctly. The `monaco-editor-webpack-plugin` or Vite equivalent is needed.
- **SharedArrayBuffer**: If needed (e.g., for advanced features), configure COOP/COEP headers in `tauri.conf.json` (Tauri v2.1.0+):
  ```json
  {
    "app": {
      "security": {
        "headers": {
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp"
        }
      }
    }
  }
  ```
  Note: Headers in tauri.conf.json are only for production builds; configure your dev server separately.
- **Global state model**: Monaco uses a global reference model. Running multiple instances with different configurations requires registering separate language IDs. This is an architectural limitation.
- **Bundle size impact**: Monaco accounted for 40% of Sourcegraph's total JS bundle. Use dynamic imports and code splitting.

**Vite integration**:
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

export default defineConfig({
  plugins: [
    monacoEditorPlugin({
      languageWorkers: ['editorWorkerService', 'typescript', 'json', 'css', 'html'],
    }),
  ],
});
```

### CodeMirror 6

**Package**: `@codemirror/view`, `@codemirror/state`, etc.
**Core bundle**: ~300 KB (modular, tree-shakeable)
**Architecture**: Modular "Lego-brick" approach

**Why Sourcegraph migrated from Monaco to CodeMirror**:
- Reduced JS bundle from 6 MB to 3.4 MB (43% reduction)
- Monaco's global state model made running multiple instances problematic
- CSS integration: Monaco requires hardcoded hex colors in JS; CodeMirror uses standard CSS
- Missing basic features in Monaco (e.g., placeholder text, open issue since 2017)
- CodeMirror's modular design: include only what you need
- Each instance has completely independent state
- Proof of concept replacing 90% of Monaco took just 2 days

**Why Replit chose CodeMirror**: Superior mobile support, modular architecture, better performance for their use case.

**CodeMirror 6 strengths**:
- Extremely modular -- pay only for what you use
- Independent instance state (no global conflicts)
- Virtual scrolling handles millions of lines
- Superior mobile/touch support
- Excellent accessibility (screen readers, keyboard navigation)
- First-class extension system for custom languages, themes, keybindings
- Integrates with standard CSS frameworks

**CodeMirror 6 weaknesses vs Monaco**:
- No built-in IntelliSense/autocomplete (must build or integrate separately)
- No built-in diff viewer (extensions exist)
- No code minimap
- More initial configuration required
- Smaller out-of-the-box language support

### Monaco vs CodeMirror: Recommendation for Vantage

**Choose Monaco if**: You want VS Code-like editing experience out of the box, including IntelliSense, diff view, minimap, and don't mind the larger bundle. The global state issue is manageable if you're running one primary editor instance.

**Choose CodeMirror 6 if**: You need multiple editor instances (e.g., split views, inline diffs), want smaller bundles, need mobile support eventually, or want maximum customization control.

**For Vantage specifically**: Monaco is likely the better choice because:
1. Users will expect VS Code-like editing (Vantage is an IDE)
2. IntelliSense and diff viewing are critical for code review with Claude
3. The bundle size penalty is acceptable for a desktop app (not a website)
4. SideX and Agents UI have proven Monaco works well in Tauri

### LSP (Language Server Protocol) Integration

There are three approaches for LSP in a Tauri-based IDE:

#### Approach 1: Shell out to language servers from Rust (Recommended)

Spawn language server processes (e.g., `typescript-language-server`, `rust-analyzer`) as child processes from Rust, communicate via stdin/stdout, and bridge to Monaco via Tauri IPC.

```rust
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader, Write};

fn spawn_language_server(server_path: &str) -> std::io::Result<std::process::Child> {
    Command::new(server_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
}
```

Then bridge LSP JSON-RPC messages between the language server process and the Monaco frontend through Tauri channels.

#### Approach 2: monaco-languageclient

**Package**: `monaco-languageclient` (https://github.com/TypeFox/monaco-languageclient)

Typically uses WebSocket transport (`browser <-> websocket <-> node-app <-> language-server`). For Tauri, you can implement custom `AbstractMessageReader` and `AbstractMessageWriter` classes that use Tauri IPC instead of WebSockets:

```typescript
// Custom Tauri message transport for LSP
import { AbstractMessageReader, AbstractMessageWriter } from 'vscode-jsonrpc';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

class TauriMessageReader extends AbstractMessageReader {
  listen(callback: (data: any) => void) {
    listen('lsp-message', (event) => {
      callback(JSON.parse(event.payload as string));
    });
    return { dispose: () => {} };
  }
}

class TauriMessageWriter extends AbstractMessageWriter {
  async write(msg: any) {
    await invoke('send_lsp_message', { message: JSON.stringify(msg) });
  }
}
```

However, the monaco-languageclient maintainers note that since Tauri has file-system access (like Electron), you may not need monaco-languageclient at all and could use `vscode-languageclient` directly instead.

#### Approach 3: tower-lsp (For custom Rust-based language servers)

**Crate**: `tower-lsp` (https://github.com/ebkalderon/tower-lsp)

If building custom language intelligence in Rust (e.g., for CLAUDE.md files, project-specific features), tower-lsp provides a framework for implementing LSP servers in Rust using the Tower service trait pattern.

```rust
use tower_lsp::{LspService, Server};
use tower_lsp::lsp_types::*;

#[derive(Debug)]
struct Backend;

#[tower_lsp::async_trait]
impl tower_lsp::LanguageServer for Backend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult::default())
    }
    async fn shutdown(&self) -> Result<()> { Ok(()) }
}
```

### Syntax Highlighting Libraries

Beyond Monaco/CodeMirror built-in highlighting:

- **Shiki** (https://shiki.matsu.io/): VS Code-compatible TextMate grammar-based highlighting. Great for read-only code display (chat messages, diffs).
- **Prism.js**: Lightweight, good for smaller code blocks
- **highlight.js**: Broad language support, simpler than Shiki

**Recommendation**: Use Monaco's built-in highlighting for the editor, Shiki for rendering code in chat/diff views (since it uses the same grammars as VS Code).

---

## 4. File System Integration from Tauri Rust Backend

### File Watching with notify

**Crate**: `notify` v9.x (https://github.com/notify-rs/notify)
**Debouncing**: `notify-debouncer-mini` or `notify-debouncer-full`

The `notify` crate is the standard for cross-platform file watching in Rust. Used by alacritty, cargo watch, deno, rust-analyzer, and watchexec.

**Architecture**:
```rust
use notify::{Watcher, RecursiveMode, Event};
use notify_debouncer_full::{new_debouncer, DebouncedEvent};
use std::time::Duration;
use std::path::Path;

fn watch_directory(path: &Path) -> notify::Result<()> {
    let (tx, rx) = std::sync::mpsc::channel();
    
    let mut debouncer = new_debouncer(
        Duration::from_millis(200), // debounce delay
        None, // tick rate
        tx,
    )?;
    
    debouncer.watch(path, RecursiveMode::Recursive)?;
    
    // Process events in a loop
    for result in rx {
        match result {
            Ok(events) => {
                for event in events {
                    // Forward to frontend via Tauri events
                    // app.emit("fs-change", &event).unwrap();
                }
            }
            Err(errors) => {
                for error in errors {
                    eprintln!("Watch error: {:?}", error);
                }
            }
        }
    }
    
    Ok(())
}
```

**Performance considerations for large projects**:
- File systems are noisy: a single save generates multiple events within milliseconds. Always use debouncing.
- `notify-debouncer-full` collapses duplicates and provides file-level granularity
- Recursive watching counts each file/folder toward OS limits (e.g., `fs.inotify.max_user_watches` on Linux, default 8192-65536)
- For very large projects, use `PollWatcher` as fallback (no inotify limits, but higher latency)
- Use `.gitignore` patterns to exclude `node_modules`, `.git`, `target`, etc. from watching
- Tauri's built-in fs-watch plugin uses `notify-debouncer-full` with `.taurignore` files

**Tauri fs-watch plugin alternative**: `@tauri-apps/plugin-fs` provides `watch` and `watchImmediate` functions for watching paths from the frontend.

### Efficient File Tree Building

Strategy for large codebases:

```rust
use std::path::{Path, PathBuf};
use serde::Serialize;
use ignore::WalkBuilder; // From the 'ignore' crate (same as ripgrep)

#[derive(Serialize)]
struct FileNode {
    name: String,
    path: PathBuf,
    is_dir: bool,
    children: Option<Vec<FileNode>>,
}

fn build_file_tree(root: &Path, depth: usize) -> FileNode {
    // Use the 'ignore' crate to respect .gitignore automatically
    let walker = WalkBuilder::new(root)
        .max_depth(Some(depth))
        .hidden(false)  // show hidden files
        .git_ignore(true)
        .git_global(true)
        .build();
    
    // Build tree from flat walk results...
    // Lazy-load children on expansion for large trees
    todo!()
}
```

**Key libraries**:
- `ignore` crate: Same walker as ripgrep, respects .gitignore, .ignore, and global gitignore
- `walkdir`: Simple recursive directory walking
- `rayon`: Parallel file operations for large trees

**Best practice**: Lazy-load the file tree. Send only the first 1-2 levels on initial load, then expand on demand. This avoids scanning massive `node_modules` trees.

### Large File Handling

- Use streaming reads (`tokio::fs::File` + `Channel`) for files > 1 MB
- For binary files, detect and show hex view or "binary file" placeholder
- Memory-map large files with `memmap2` crate for read-only viewing
- Send file chunks to frontend:

```rust
use tauri::ipc::Channel;

#[tauri::command]
async fn read_large_file(path: String, channel: Channel<Vec<u8>>) -> Result<(), String> {
    let mut file = tokio::fs::File::open(&path).await.map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 64 * 1024]; // 64KB chunks
    loop {
        let n = file.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 { break; }
        channel.send(buf[..n].to_vec()).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

### Git Integration from Rust

Three options, in order of recommendation:

#### Option 1: gitoxide (gix) -- Pure Rust, Modern

**Crate**: `gix` (https://github.com/GitoxideLabs/gitoxide)

Pure Rust implementation. Fast, safe, no C dependencies. Actively developed; used by cargo for registry operations.

Pros:
- No libgit2 C dependency (simpler cross-compilation)
- Thread-safe by design
- Idiomatic Rust API
- Full configuration support including HTTP auth

Cons:
- Not 100% feature-complete vs git CLI (but covers common operations)
- API still evolving

#### Option 2: git2 -- libgit2 Bindings

**Crate**: `git2` (https://crates.io/crates/git2)

Mature Rust bindings to libgit2. Thread-safe and memory-safe. Used by cargo itself.

Pros:
- Very mature and well-tested
- Comprehensive API
- Good documentation

Cons:
- C dependency (libgit2) complicates builds
- Some advanced operations not supported
- Missing some newer git features

#### Option 3: Shell Out to git CLI

Simplest approach. Call `git` via `std::process::Command`.

Pros:
- 100% feature parity with git
- No additional dependencies
- Handles edge cases git libraries may miss

Cons:
- Requires git installed on user's machine
- Slower for many operations (process spawn overhead)
- Output parsing is fragile

**Recommendation for Vantage**: Use a hybrid approach:
- `gix` or `git2` for high-frequency operations (status, diff, blame -- things that need to be fast)
- Shell out to `git` for complex operations (rebase, merge, push/pull) where correctness matters more than speed
- SideX uses native Rust git commands for 17 operations, proving the approach works

---

## 5. Tauri v2 IPC Patterns

### Three Communication Primitives

#### 1. Commands (Frontend -> Rust)

The primary mechanism. Functions decorated with `#[tauri::command]` are callable from JavaScript via `invoke()`.

```rust
// Rust side
#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| e.to_string())
}

// Register
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![read_file])
```

```typescript
// Frontend side
import { invoke } from '@tauri-apps/api/core';

const content = await invoke<string>('read_file', { path: '/some/file.txt' });
```

**Key details**:
- Arguments and return values must be JSON-serializable (serde)
- Async commands prevent UI blocking
- Use `tauri::ipc::Response` for large binary data (avoids JSON serialization)
- Access managed state via `tauri::State<T>` parameter

#### 2. Events (Bidirectional, Fire-and-Forget)

Both frontend and Rust can emit events. Best for notifications and small state changes.

```rust
// Rust emitting to frontend
use tauri::Emitter;

app.emit("file-changed", &payload).unwrap();

// Target specific webview
app.emit_to("main", "file-changed", &payload).unwrap();
```

```typescript
// Frontend listening
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen('file-changed', (event) => {
  console.log('File changed:', event.payload);
});
```

**Limitations**:
- No strong type support
- Payloads are always JSON strings
- Evaluates JavaScript directly -- not suitable for large data
- **Not designed for low-latency or high-throughput scenarios**

#### 3. Channels (Rust -> Frontend Streaming)

**The recommended mechanism for streaming data**. Used internally by Tauri for download progress, child process output, and WebSocket messages.

```rust
use tauri::ipc::Channel;
use serde::Serialize;

#[derive(Clone, Serialize)]
enum TerminalEvent {
    Output(String),
    Exit(i32),
    Error(String),
}

#[tauri::command]
async fn start_terminal(
    shell: String,
    on_event: Channel<TerminalEvent>,
) -> Result<u32, String> {
    // Spawn PTY, stream output through channel
    let pty = spawn_pty(&shell)?;
    
    tokio::spawn(async move {
        loop {
            match pty.read_output().await {
                Ok(data) => {
                    on_event.send(TerminalEvent::Output(data)).unwrap();
                }
                Err(_) => {
                    on_event.send(TerminalEvent::Exit(0)).unwrap();
                    break;
                }
            }
        }
    });
    
    Ok(pty.id())
}
```

```typescript
// Frontend
import { invoke, Channel } from '@tauri-apps/api/core';

const onEvent = new Channel<TerminalEvent>();
onEvent.onmessage = (event) => {
  switch (event.type) {
    case 'Output':
      terminal.write(event.data);
      break;
    case 'Exit':
      console.log('Terminal exited');
      break;
  }
};

const termId = await invoke('start_terminal', { shell: 'powershell.exe', onEvent });
```

**Channel performance characteristics**:
- Guaranteed message ordering (index-based system)
- Designed for high-throughput streaming
- v2 uses custom protocols (like HTTP) instead of v1's string serialization
- Significantly faster than the event system for large volumes of data
- No JSON.parse overhead for binary data when using `Response`

### IPC Performance Summary

| Primitive | Direction | Typing | Throughput | Use Case |
|---|---|---|---|---|
| Commands | Frontend -> Rust | Strong (serde) | Medium | RPC-style calls |
| Events | Bidirectional | Weak (JSON strings) | Low | Notifications, state changes |
| Channels | Rust -> Frontend | Strong (serde) | **High** | Streaming (terminal, files, progress) |

### Type Safety: tauri-specta

**Crate**: `tauri-specta` v2 (https://github.com/specta-rs/tauri-specta)

Generates TypeScript bindings from Rust command signatures at build time. Eliminates type mismatches between frontend and backend.

```rust
// Rust: Define commands with specta
use specta::Type;
use tauri_specta::{collect_commands, Builder};

#[derive(Serialize, Type)]
struct FileInfo {
    name: String,
    size: u64,
    is_directory: bool,
}

#[tauri::command]
#[specta::specta]
async fn list_files(path: String) -> Result<Vec<FileInfo>, String> {
    // ...
}

// In main.rs
let builder = Builder::<tauri::Wry>::new()
    .commands(collect_commands![list_files]);

// Generate TypeScript bindings (dev only)
#[cfg(debug_assertions)]
builder.export(specta_typescript::Typescript::default(), "../src/bindings.ts")
    .expect("Failed to export bindings");
```

```typescript
// Generated bindings.ts provides fully typed invoke functions
import { commands } from './bindings';

const files = await commands.listFiles({ path: '/some/dir' });
// files is typed as FileInfo[]
```

**Recommendation**: Use tauri-specta for all Tauri commands. The dannysmith/tauri-template includes this setup already.

### Patterns for Heavy Bidirectional Communication

For Vantage's use cases (terminal streams, file watches, LSP messages):

1. **Terminal I/O**: Use Channels for output streaming (Rust -> Frontend). Use Commands for input writing (Frontend -> Rust via `invoke('write_to_terminal', { id, data })`).

2. **File Watches**: Use Events for file change notifications (low frequency, small payloads). Consider Channels if watching many files with high change rates.

3. **LSP Messages**: Use Commands for request/response (Frontend -> Rust -> LSP Server -> Rust -> Frontend via Channel). The Channel carries server-initiated notifications (diagnostics, progress).

4. **Claude Code Output**: Use Channels for streaming Claude Code CLI output. Commands for sending input/prompts.

---

## 6. Tauri v2 vs Electron in 2025/2026

### Current Consensus (April 2026)

Tauri v2 has seen significant adoption growth since its stable release on October 2, 2024, with adoption up 35% year-over-year. The consensus among developers building new desktop apps is:

**Choose Tauri v2 for**:
- New projects, especially with Rust backend needs
- Performance-sensitive applications
- Small-to-medium complexity apps
- When binary size matters (distribution bandwidth)
- When memory efficiency matters (running alongside other tools)
- Security-conscious applications (Rust backend, ACL permissions)

**Choose Electron for**:
- Complex multi-window applications (more mature windowing)
- Heavy reliance on Node.js ecosystem
- Teams without Rust experience who need to ship quickly
- When cross-platform consistency is paramount (same Chromium everywhere)
- When you need mature testing infrastructure

### Benchmarks (Aggregated from Multiple Sources)

| Metric | Tauri v2 | Electron 33+ |
|---|---|---|
| Idle Memory | 30-52 MB | 184-300 MB |
| Cold Startup | 0.4-0.8s | 1.0-2.1s |
| Binary Size (installer) | 5-18 MB | 100-200 MB |
| Terminal Latency | ~12ms | ~18ms |
| PTY Throughput | ~40% faster (Rust) | Baseline (Node.js) |

**Caveat**: Some benchmarks have been questioned (tauri-apps/tauri#5889). Electron's memory numbers may include shared memory that would be used by the system anyway. Real-world differences are significant but may be smaller than commonly claimed.

### Migration Experiences

**DoltHub (November 2025)**: Evaluated Tauri for their database workbench. Found Tauri's frontend-framework agnostic approach positive but noted:
- Windows packaging limited to .exe and .msi only
- macOS universal binary codesigning issues
- Sidecar complexity for Node.js applications
- Stuck with Electron pending resolution of distribution limitations

**Bhagya Rana**: Reported 10x performance boost and 97% bundle size reduction after migrating from Electron to Tauri.

**General migration timeline**: Full rewrite takes 3-12 months depending on complexity; incremental migrations can show value in weeks.

### Key Advantages of Tauri v2 for Vantage

1. **Rust backend**: Natural for PTY management, file system operations, and Claude Code CLI integration
2. **Memory efficiency**: IDE will run alongside Claude Code, other tools -- lower baseline matters
3. **Security model**: ACL-based permissions system is good for an app that executes code
4. **Binary size**: Users download faster, updates are smaller
5. **Performance**: Native Rust for file watching, git operations, terminal management
6. **Active development**: Strong community, frequent updates, growing plugin ecosystem

### Risks of Choosing Tauri v2 for Vantage

1. **WebView inconsistencies**: Different rendering on Windows (WebView2/Chromium) vs macOS (WebKit) vs Linux (WebKitGTK). Test on all platforms.
2. **Smaller ecosystem**: Fewer ready-made components vs Electron
3. **Rust learning curve**: Team needs Rust competency for backend features
4. **WebView2 distribution**: Must handle cases where WebView2 isn't installed (rare on Windows 11, more common on older Windows 10)
5. **Testing gaps**: macOS WebDriver testing not natively supported (workaround available)
6. **Less mature multi-window**: Complex windowing scenarios may need more custom work

---

## 7. Split Pane / Panel Layout Libraries for React

### react-resizable-panels (Recommended)

**Package**: `react-resizable-panels` v4.9.0
**Author**: Brian Vaughn (React core team contributor)
**Stars**: 5.2k | **Downloads**: 108M+ total
**License**: MIT

The gold standard for IDE-like layouts in React. Used by shadcn/ui's Resizable component.

**Key features**:
- Horizontal and vertical panel groups
- Nested groups (for complex IDE layouts)
- Collapsible panels with custom collapsed sizes
- Persistent layouts between sessions
- Pixel, percentage, em, rem, vh/vw size units
- Keyboard accessible (WAI-ARIA separator role)
- Imperative API (collapse, expand, resize programmatically)
- Double-click resize handle to reset

**API**:
```tsx
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

function IDELayout() {
  return (
    <PanelGroup direction="horizontal">
      {/* File Explorer */}
      <Panel defaultSize={20} minSize={15} collapsible collapsedSize={0}>
        <FileExplorer />
      </Panel>
      <PanelResizeHandle />
      
      {/* Main Content */}
      <Panel defaultSize={60} minSize={30}>
        <PanelGroup direction="vertical">
          {/* Editor */}
          <Panel defaultSize={70} minSize={30}>
            <CodeEditor />
          </Panel>
          <PanelResizeHandle />
          {/* Terminal / Output */}
          <Panel defaultSize={30} minSize={10} collapsible>
            <TerminalPanel />
          </Panel>
        </PanelGroup>
      </Panel>
      <PanelResizeHandle />
      
      {/* Right Sidebar (Claude Chat) */}
      <Panel defaultSize={20} minSize={15} collapsible>
        <ClaudeChatPanel />
      </Panel>
    </PanelGroup>
  );
}
```

**Why it works for IDE layouts**: Handles measurement across React 18/19 rendering patterns, supports layout persistence (save/restore user's panel arrangement), and the shadcn/ui Resizable wrapper gives VS Code-style resize handles out of the box.

### Allotment

**Package**: `allotment` v1.x
**Stars**: 1k+

Derived from the same codebase as VS Code's split view implementation. Provides industry-standard look and feel.

Pros:
- VS Code's actual split view behavior
- Straightforward API
- Snapping and sash (resize handle) support

Cons:
- Less actively maintained than react-resizable-panels
- Fewer features (no pixel units, less flexible persistence)
- React/React-DOM peer dependencies

### react-mosaic

**Package**: `react-mosaic-component` v7.0.0-beta
**Stars**: 3.6k+

Full tiling window manager for React. Uses n-ary tree structure for layouts.

Pros:
- Drag-and-drop tile rearrangement
- Tab stacking (multiple views in one tile)
- Serializable JSON layout (save/restore)
- Controlled and uncontrolled modes
- Most IDE-like layout model

Cons:
- More complex API
- Heavier (tiling engine + drag-and-drop)
- Beta status for v7
- Overkill if you don't need drag-and-drop rearrangement

### Comparison Matrix

| Feature | react-resizable-panels | allotment | react-mosaic |
|---|---|---|---|
| Nested layouts | Yes | Yes | Yes (tree) |
| Collapsible panels | Yes | Partial | No |
| Drag-and-drop | No | No | Yes |
| Tab stacking | No (DIY) | No | Yes |
| Persistent layouts | Yes | Manual | Yes (JSON) |
| Accessibility | Excellent | Good | Good |
| Bundle size | Small | Small | Medium |
| Maintenance | Active | Low | Active |
| shadcn integration | Yes | No | No |

### Recommendation for Vantage

**Primary**: `react-resizable-panels` -- best maintained, smallest, excellent accessibility, shadcn integration. Build tab management separately (react-tabs or custom).

**Alternative**: `react-mosaic` if you want drag-and-drop panel rearrangement from day one (think VS Code's drag-a-tab-to-create-split behavior). More complex but more feature-complete for IDE UX.

---

## 8. Tauri v2 + React Starter Templates

### dannysmith/tauri-template (Most Comprehensive)

**Repository**: https://github.com/dannysmith/tauri-template
**Stars**: 212 | **Tech**: Tauri v2 + React 19 + TypeScript + Vite 7 + shadcn/ui v4

This is the most production-ready template, specifically designed for complex apps:

**Tech Stack**:
- React 19 with React Compiler (automatic memoization)
- Vite 7
- shadcn/ui v4 + Tailwind CSS v4 + Lucide React icons
- Zustand v5 (global state) + TanStack Query v5 (persistent data)
- tauri-specta (type-safe Rust<->TS bridge)
- Vitest v4 + Testing Library
- ESLint + Prettier + ast-grep + knip + jscpd + Clippy

**Built-in features**:
- Command Palette (Cmd+K)
- Quick Pane floating window with global shortcut
- Platform-aware keyboard shortcuts + native menus
- Settings dialog with Rust-side persistence
- Collapsible sidebars via resizable panels
- Light/dark theme with system detection
- Toast + native notifications
- Auto-updater via GitHub Releases
- Structured logging (Rust + TypeScript)
- Crash recovery with emergency data persistence
- Multi-window support
- Platform-specific title bars (macOS vibrancy, Windows custom, Linux native)
- i18n with RTL support

**Tauri plugins included**: single-instance, window-state, fs, dialog, notification, clipboard-manager, global-shortcut, updater, opener, tauri-nspanel (macOS)

**Why this is ideal for Vantage**: Includes nearly every pattern an IDE needs -- just add terminal, editor, and Claude Code integration.

### kitlib/tauri-app-template

**Repository**: https://github.com/kitlib/tauri-app-template
**Tech**: Tauri v2 + React 19 + TypeScript + shadcn/ui

Lighter alternative with multi-window management, system tray, global shortcuts, and auto-updates.

### Official Tauri Starter

```bash
npm create tauri-app@latest -- --template react-ts
```

Minimal starting point. Good if you want to build from scratch.

### MrLightful/create-tauri-react

**Repository**: https://github.com/MrLightful/create-tauri-react
**Tech**: Vite + React + TypeScript + Tailwind CSS + shadcn/ui

Architecture based on bulletproof-react patterns. Includes Biome for linting, Husky for pre-commits.

### Recommendation for Vantage

Start with **dannysmith/tauri-template** and extend it. It provides:
- The exact tech stack we want (Tauri v2 + React 19 + TS + shadcn)
- Type-safe IPC via tauri-specta
- All the desktop app features (updater, settings, window state, etc.)
- Quality tooling (testing, linting, formatting)
- Documentation optimized for AI-assisted development

---

## 9. Tauri v2 Plugins for IDE Development

### Essential Plugins (Official)

| Plugin | Package | Purpose for Vantage |
|---|---|---|
| **Shell** | `@tauri-apps/plugin-shell` | Spawn Claude Code CLI, git, language servers |
| **File System** | `@tauri-apps/plugin-fs` | File read/write/watch from frontend |
| **Dialog** | `@tauri-apps/plugin-dialog` | Open/save file dialogs |
| **Clipboard** | `@tauri-apps/plugin-clipboard-manager` | Copy/paste code snippets |
| **Updater** | `@tauri-apps/plugin-updater` | Auto-updates via GitHub Releases |
| **Notification** | `@tauri-apps/plugin-notification` | System notifications (build complete, etc.) |
| **Global Shortcut** | `@tauri-apps/plugin-global-shortcut` | System-wide shortcuts (Quick Panel) |
| **Single Instance** | `@tauri-apps/plugin-single-instance` | Prevent multiple app instances |
| **Window State** | `@tauri-apps/plugin-window-state` | Remember window position/size |
| **Store** | `@tauri-apps/plugin-store` | Persistent key-value storage (settings) |
| **Deep Linking** | `@tauri-apps/plugin-deep-link` | `vantage://` URL scheme for file opening |
| **Opener** | `@tauri-apps/plugin-opener` | Open files in external editors |
| **Logging** | `@tauri-apps/plugin-log` | Structured logging (Rust + JS) |
| **HTTP Client** | `@tauri-apps/plugin-http` | API calls (Claude API, GitHub, etc.) |
| **WebSocket** | `@tauri-apps/plugin-websocket` | Real-time connections |
| **OS Info** | `@tauri-apps/plugin-os` | Platform detection for UI adaptation |
| **Process** | `@tauri-apps/plugin-process` | Current process info, exit handling |
| **CLI** | `@tauri-apps/plugin-cli` | Parse CLI arguments (open file from terminal) |

### Community Plugins

| Plugin | Purpose |
|---|---|
| `tauri-plugin-pty` | PTY management for terminal emulation |
| `tauri-plugin-clipboard` (CrossCopy) | Enhanced clipboard with file/RTF/HTML support |
| `tauri-plugin-sql` | SQLite/MySQL/Postgres from frontend |

### Security: Permissions Configuration

Tauri v2 uses an ACL-based security model. Create capability files in `src-tauri/capabilities/`:

```json
// src-tauri/capabilities/main-window.json
{
  "identifier": "main-window",
  "description": "Permissions for the main IDE window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-spawn",
    "shell:allow-stdin-write",
    "shell:allow-kill",
    "fs:allow-read",
    "fs:allow-write",
    "fs:allow-exists",
    "fs:allow-mkdir",
    "fs:allow-remove",
    "fs:allow-rename",
    "fs:allow-watch",
    "dialog:allow-open",
    "dialog:allow-save",
    "clipboard-manager:allow-write",
    "clipboard-manager:allow-read",
    "notification:allow-notify",
    "global-shortcut:allow-register",
    "window-state:allow-restore-state",
    "window-state:allow-save-state",
    "store:allow-get",
    "store:allow-set",
    "updater:default",
    "deep-link:default",
    "opener:default",
    "log:default",
    "os:default",
    "process:default"
  ]
}
```

**Scope restrictions**: Can limit file system access to specific directories:
```json
{
  "identifier": "fs:allow-read",
  "allow": [
    { "path": "$HOME/projects/**" },
    { "path": "$APPDATA/**" }
  ]
}
```

### Auto-Updater Setup

The updater plugin works with GitHub Releases:

1. Generate signing keys: `npx @tauri-apps/cli signer generate -w ~/.tauri/myapp.key`
2. Configure in `tauri.conf.json`:
```json
{
  "plugins": {
    "updater": {
      "pubkey": "dW50cnVzdGVkIGNv...",
      "endpoints": [
        "https://github.com/YOUR_USER/vantage/releases/latest/download/latest.json"
      ]
    }
  }
}
```
3. Set `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in CI
4. Use `tauri-action` in GitHub Actions with `includeUpdaterJson: true`
5. Check for updates in frontend:
```typescript
import { check } from '@tauri-apps/plugin-updater';

const update = await check();
if (update?.available) {
  await update.downloadAndInstall();
}
```

---

## 10. Existing Claude Code GUI Projects

Understanding what already exists helps inform Vantage's architecture:

### Opcode (formerly Claudia)
- **Tech**: Tauri 2 + React 18 + TypeScript + Tailwind CSS + shadcn/ui + SQLite
- **Focus**: Session management, custom agents, analytics, MCP management
- **Approach**: Wraps Claude Code CLI, reads `~/.claude` directory
- **Key features**: Timeline/checkpoints, diff viewer, CLAUDE.md editor

### Solo IDE
- **Tech**: React 19 + Zustand + Tauri 2 + Rust + Node.js (Claude Agent SDK sidecar)
- **Focus**: AI-powered IDE experience
- **Approach**: Uses Claude Agent SDK as a Node.js sidecar process

### tauri-claude-code-runner
- **Repository**: https://github.com/owayo/tauri-claude-code-runner
- **Focus**: Simple runner for Claude Code within Tauri

### Key Architectural Insight

The "plan -> approve -> apply" cycle is emphasized across all these projects, reflecting Anthropic's guidance on human-in-the-loop autonomy. Vantage should make approval/review UX a first-class concern.

---

## 11. Architecture Recommendations for Vantage

### Recommended Tech Stack

```
Frontend:
  - React 19 + TypeScript
  - Vite 7 (bundler)
  - shadcn/ui v4 + Tailwind CSS v4 (UI components)
  - Zustand v5 (global UI state)
  - TanStack Query v5 (async data/cache)
  - react-resizable-panels (IDE layout)
  - Monaco Editor (code editing)
  - xterm.js + @xterm/addon-webgl (terminal)
  - Shiki (code highlighting in chat/diffs)
  - tauri-specta bindings (type-safe IPC)

Backend (Rust):
  - Tauri v2
  - portable-pty / tauri-plugin-pty (terminal PTY)
  - notify + notify-debouncer-full (file watching)
  - gix or git2 (git operations)
  - ignore (gitignore-aware file walking)
  - rusqlite (local storage/history)
  - tokio (async runtime)
  - serde + serde_json (serialization)
  - tauri-specta (TypeScript binding generation)
  - tower-lsp (optional: custom language server)

Sidecar:
  - Claude Code CLI (spawned as child process)
  - Language servers (typescript-language-server, etc.)

Template Base:
  - dannysmith/tauri-template (modify and extend)
```

### High-Level Architecture

```
+------------------------------------------------------------------+
|                        Vantage Desktop App                        |
|                                                                   |
|  +----------------------------+  +-----------------------------+  |
|  |     React Frontend         |  |      Rust Backend           |  |
|  |  (WebView2 / WebKit)       |  |      (Tauri Core)           |  |
|  |                            |  |                             |  |
|  |  +-------+ +----------+   |  |  +--------+ +----------+   |  |
|  |  |Monaco | |xterm.js  |   |  |  |PTY Mgr | |File Watch|   |  |
|  |  |Editor | |Terminal  |   |  |  |(port-   | |(notify)  |   |  |
|  |  +-------+ +----------+   |  |  | pty)    | +----------+   |  |
|  |  +-------+ +----------+   |  |  +--------+ +----------+   |  |
|  |  |Panel  | |Chat      |   |  |  |Git Ops | |Settings  |   |  |
|  |  |Layout | |Interface |   |  |  |(gix)   | |(SQLite)  |   |  |
|  |  +-------+ +----------+   |  |  +--------+ +----------+   |  |
|  |                            |  |  +--------+ +----------+   |  |
|  |  <-- IPC (Commands) -->    |  |  |Process | |LSP Bridge|   |  |
|  |  <-- IPC (Channels) <--   |  |  |Manager | |(stdio)   |   |  |
|  |  <-- IPC (Events)   <->   |  |  +--------+ +----------+   |  |
|  +----------------------------+  +-----------------------------+  |
|                                          |                        |
|                                  +-------+--------+              |
|                                  |  Child Processes|              |
|                                  |  - Claude Code  |              |
|                                  |  - LSP Servers   |              |
|                                  |  - git CLI       |              |
|                                  +-----------------+              |
+------------------------------------------------------------------+
```

### IPC Strategy for Vantage

| Data Flow | Mechanism | Rationale |
|---|---|---|
| Terminal output (PTY -> UI) | **Channel** | High throughput, ordered streaming |
| Terminal input (UI -> PTY) | **Command** | Simple invoke per keystroke batch |
| Claude Code output | **Channel** | Streaming responses |
| Claude Code input | **Command** | User-initiated prompts |
| File change notifications | **Event** | Low frequency, multiple listeners |
| File tree data | **Command** | Request/response pattern |
| File read/write | **Command** | Request/response with large data via `Response` |
| Git status/diff | **Command** | On-demand requests |
| Settings changes | **Event** | Broadcast to all components |
| LSP diagnostics | **Channel** | Server-push streaming |
| LSP requests | **Command** | Request/response |

### Critical Pitfalls to Avoid

1. **Don't use Events for terminal output**: Events evaluate JavaScript directly and are not designed for high throughput. Use Channels.

2. **Don't block the main thread**: All file I/O, git operations, and process management must be async. Use `tokio::spawn` and `tokio::task::spawn_blocking`.

3. **Handle PTY reader blocking**: Each PTY instance needs its own reader thread/task. PTY reads are blocking -- wrap in `spawn_blocking`.

4. **Debounce file system events**: Raw notify events are extremely noisy. Always use `notify-debouncer-full`.

5. **Lazy-load the file tree**: Don't scan entire project trees upfront. Load top-level, expand on demand.

6. **Clean up child processes**: Tauri does not auto-kill sidecar processes. Implement process lifecycle management in Rust:
   ```rust
   // On app exit, kill all child processes
   app.on_window_event(|window, event| {
       if let tauri::WindowEvent::Destroyed = event {
           // Kill all PTY processes, language servers, etc.
       }
   });
   ```

7. **Configure WebView2 headers early**: If Monaco needs SharedArrayBuffer or web workers with specific headers, configure COOP/COEP in both `tauri.conf.json` (production) and Vite dev server.

8. **Test on all platforms early**: WebView2 (Windows), WebKit (macOS), and WebKitGTK (Linux) have different quirks. Don't leave cross-platform testing until the end.

9. **Plan for offline**: Claude Code may need API access, but the IDE should be usable offline for editing, terminal, and git operations.

10. **Handle WebView2 not installed**: On Windows 10, WebView2 may not be present. Tauri's installer handles this, but test the flow.

---

## Sources

### Tauri v2 Case Studies
- [SideX - VS Code rebuilt on Tauri](https://github.com/Sidenai/sidex)
- [SideX blog post](https://dev.to/kendallbooker/i-rebuilt-vs-code-on-tauri-instead-of-electron-and-just-open-sourced-it-53ao)
- [Agents UI - Tauri vs Electron for Developer Tools](https://agents-ui.com/blog/tauri-vs-electron-for-developer-tools/)
- [Opcode - Claude Code GUI](https://github.com/winfunc/opcode)
- [Desktop AI App with Tauri v2 + React 19](https://dev.to/purpledoubled/how-i-built-a-desktop-ai-app-with-tauri-v2-react-19-in-2026-1g47)

### Terminal Emulation
- [xterm.js](https://xtermjs.org/)
- [xterm.js WebGL addon](https://github.com/xtermjs/xterm.js/tree/master/addons/addon-webgl)
- [tauri-plugin-pty](https://crates.io/crates/tauri-plugin-pty)
- [tauri-terminal example](https://github.com/marc2332/tauri-terminal)
- [portable-pty](https://docs.rs/portable-pty)
- [pseudoterminal crate](https://github.com/michaelvanstraten/pseudoterminal)

### Code Editor
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [CodeMirror 6](https://codemirror.net/)
- [Sourcegraph: Migrating Monaco to CodeMirror](https://sourcegraph.com/blog/migrating-monaco-codemirror)
- [Replit: Betting on CodeMirror](https://blog.replit.com/codemirror)
- [monaco-languageclient](https://github.com/TypeFox/monaco-languageclient)
- [tower-lsp](https://github.com/ebkalderon/tower-lsp)

### File System & Git
- [notify crate](https://github.com/notify-rs/notify)
- [notify 9.0 RC](https://cargo-run.news/p/notify-9-0-rc-enhances-filesystem-watching-with-robust-debouncing)
- [gitoxide (gix)](https://github.com/GitoxideLabs/gitoxide)
- [git2 crate](https://crates.io/crates/git2)

### Tauri v2 IPC
- [Tauri IPC Concepts](https://v2.tauri.app/concept/inter-process-communication/)
- [Calling Frontend from Rust](https://v2.tauri.app/develop/calling-frontend/)
- [Calling Rust from Frontend](https://v2.tauri.app/develop/calling-rust/)
- [tauri-specta](https://github.com/specta-rs/tauri-specta)
- [IPC Improvements Discussion](https://github.com/tauri-apps/tauri/discussions/5690)

### Tauri vs Electron
- [DoltHub: Electron vs Tauri](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/)
- [RaftLabs Comparison 2025](https://www.raftlabs.com/blog/tauri-vs-electron-pros-cons/)
- [Gethopp: Real Trade-offs](https://www.gethopp.app/blog/tauri-vs-electron)
- [Tauri vs Electron Developer's Guide 2026](https://blog.nishikanta.in/tauri-vs-electron-the-complete-developers-guide-2026)
- [10x Faster Desktop App Migration](https://medium.com/@bhagyarana80/why-i-switched-from-electron-to-tauri-for-a-10x-faster-desktop-app-a796fc337292)

### Layout Libraries
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)
- [allotment](https://github.com/johnwalley/allotment)
- [react-mosaic](https://github.com/nomcopter/react-mosaic)
- [shadcn/ui Resizable](https://ui.shadcn.com/docs/components/radix/resizable)

### Templates
- [dannysmith/tauri-template](https://github.com/dannysmith/tauri-template)
- [kitlib/tauri-app-template](https://github.com/kitlib/tauri-app-template)
- [MrLightful/create-tauri-react](https://github.com/MrLightful/create-tauri-react)

### Tauri v2 Plugins & Security
- [Tauri v2 Plugins Directory](https://v2.tauri.app/plugin/)
- [Tauri v2 Permissions](https://v2.tauri.app/security/permissions/)
- [Tauri v2 Capabilities](https://v2.tauri.app/security/capabilities/)
- [Tauri v2 Updater](https://v2.tauri.app/plugin/updater/)
- [Tauri v2 HTTP Headers](https://v2.tauri.app/security/http-headers/)
- [Tauri v2 State Management](https://v2.tauri.app/develop/state-management/)
- [Tauri v2 Sidecar (Node.js)](https://v2.tauri.app/learn/sidecar-nodejs/)
- [Tauri v2 WebDriver Testing](https://v2.tauri.app/develop/tests/webdriver/)
- [Tauri v2 WebView Versions](https://v2.tauri.app/reference/webview-versions/)
