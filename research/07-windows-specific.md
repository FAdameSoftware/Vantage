# Vantage Research -- Windows-Specific Deep Dive

> Research compiled April 2026 for the Vantage project.
> Vantage is a Tauri v2 + React desktop app on **Windows 11** that wraps Claude Code CLI.
> Windows is the primary (and currently only) target platform.

---

## Table of Contents

1. [ConPTY (Windows Pseudo Console API)](#1-conpty-windows-pseudo-console-api)
2. [WebView2 on Windows 11](#2-webview2-on-windows-11)
3. [File System Considerations on Windows](#3-file-system-considerations-on-windows)
4. [Git on Windows](#4-git-on-windows)
5. [Claude Code on Windows](#5-claude-code-on-windows)
6. [Tauri v2 on Windows](#6-tauri-v2-on-windows)
7. [Windows Terminal Integration](#7-windows-terminal-integration)
8. [Critical Gotchas Summary](#8-critical-gotchas-summary)
9. [Recommendations for Vantage](#9-recommendations-for-vantage)

---

## 1. ConPTY (Windows Pseudo Console API)

### 1.1 Architecture Overview

ConPTY (introduced in Windows 10 version 1809, October 2018) is Windows' answer to Unix PTY. It provides a standardized mechanism for creating virtualized terminal communication channels without the old "console scraping" approach.

**Core components:**

```
Terminal App (Vantage)
    |
    |-- Creates two pipe pairs (input + output)
    |-- Calls CreatePseudoConsole()
    |
    v
ConHost Instance (invisible, spawned automatically)
    |
    |-- VT Interactivity module: converts incoming UTF-8/VT -> INPUT_RECORD
    |-- VT Renderer: converts output buffer changes -> UTF-8/VT sequences
    |
    v
Command-Line App (e.g., bash.exe, powershell.exe, Claude Code)
    |-- Calls traditional Windows Console APIs (WriteConsoleOutput, etc.)
    |-- Receives input as if typed by user
```

**The three-part model:**
1. **Terminal/Console Application** creates pipes and calls ConPTY API
2. **ConHost Instance** translates between Windows Console APIs and UTF-8/VT sequences
3. **Command-Line Application** runs unchanged, calling traditional Console APIs

This allows legacy applications to work without modification while externally "speaking" text/VT format.

### 1.2 ConPTY API Functions

| Function | Purpose | Notes |
|----------|---------|-------|
| `CreatePseudoConsole(size, hInput, hOutput, dwFlags, phPC)` | Create a new pseudo console | Input/output handles must be synchronous I/O |
| `ResizePseudoConsole(hPC, size)` | Adjust buffer dimensions | Must be called when terminal window resizes |
| `ClosePseudoConsole(hPC)` | Terminate the ConPTY | Also terminates all attached client apps |

**Official CreatePseudoConsole flags (per Microsoft docs):**

| Flag | Value | Purpose | Min Version |
|------|-------|---------|-------------|
| `PSEUDOCONSOLE_INHERIT_CURSOR` | 0x1 | Inherit cursor position from parent console | Windows 10 1809 |
| `PSEUDOCONSOLE_RESIZE_QUIRK` | 0x2 | Fix resize artifacts | Undocumented in public API, used internally |
| `PSEUDOCONSOLE_WIN32_INPUT_MODE` | 0x4 | Enable Win32 structured input mode | Undocumented in public API |
| `PSEUDOCONSOLE_PASSTHROUGH_MODE` | 0x8 | Relay VT sequences directly without ConHost rendering | Windows 11 22H2+, experimental |

**IMPORTANT**: The official Microsoft documentation for `CreatePseudoConsole` only documents `PSEUDOCONSOLE_INHERIT_CURSOR` (value 1). The other flags (0x2, 0x4, 0x8) are used internally by Windows Terminal and other Microsoft products but are **not publicly documented in the Win32 API reference**. They are, however, defined in Windows SDK headers and used by WezTerm's `portable-pty` crate.

### 1.3 How ConPTY Differs from Unix PTY

| Aspect | Unix PTY | Windows ConPTY |
|--------|----------|----------------|
| **Kernel-level** | PTY is a kernel device (`/dev/pts/*`) | ConPTY is a user-mode ConHost process |
| **Complexity** | Simple pipe-like interface | ConHost is essentially its own terminal emulator sitting between the terminal and the app |
| **State management** | Stateless relay | ConPTY **caches terminal grid state** and tracks cursor position |
| **VT sequences** | Passed through transparently | May be filtered, reordered, or swallowed |
| **Legacy support** | Not needed (all Unix apps use VT) | Must translate between Win32 Console API and VT for legacy apps |
| **Signal handling** | Supports SIGINT, SIGTERM, SIGKILL, etc. | **No signal support** -- process termination only |
| **Process model** | Single kernel module | Spawns a separate ConHost helper process per PTY |
| **Character encoding** | Configurable per locale | Forces UTF-8 output regardless of app's OEM codepage setting |

### 1.4 Known ConPTY Issues and Limitations

#### Escape Sequence Filtering
ConPTY does not forward all VT escape sequences. It actively filters or swallows unrecognized sequences, including custom Device Control Strings (DCS). Warp's engineering team discovered this firsthand:
- ConPTY was swallowing DCS messages from the shell, so custom terminal features that rely on DCS never received them.
- ConPTY didn't forward any unrecognized DCS codes to the terminal.

#### Out-of-Order Message Delivery
When using Operating System Commands (OSC) instead of DCS, messages can arrive out of sequence relative to other terminal output. For example, `START_OSC, hello world, END_OSC` could be received as `START_OSC, hell, END_OSC, o world`.

#### Terminal Grid Caching
ConPTY maintains its own state -- a terminal grid with cursor position tracking. This causes:
- Spacing issues for terminals with non-standard grid layouts
- Stale state if the terminal and ConPTY get out of sync
- Need for periodic "reset" commands to clear cached state

#### Race Conditions
When ConPTY is started with `PSEUDOCONSOLE_INHERIT_CURSOR`, there's a race condition that can cause hangs when closing panes. The calling app must handle cursor state requests asynchronously on a background thread.

#### Exit Code Handling
`GetExitCodeProcess()` on the process handle does not always reflect the actual exit code of the shell running inside ConPTY.

#### ANSI Code Injection
Characters read from process output contain unexpected additional ANSI codes that must be filtered by the terminal emulator.

#### Thread Safety
ConPTY instances must not be shared across threads. Use a separate instance per thread.

### 1.5 How Terminal Emulators Use ConPTY

**Windows Terminal** (Microsoft's official terminal):
- The primary consumer of ConPTY
- Uses all undocumented flags internally
- Contributed back passthrough mode and win32-input-mode
- Shell integration features since v1.15 Preview

**Warp** (cross-platform terminal):
- Had to create a custom fork of ConPTY handling
- Developed workarounds: custom OSC codes with forced immediate flushing, periodic "Reset" commands
- Collaborated with Microsoft Terminal team on fixes
- Blog post: "Bringing Warp to Windows: Eng Learnings" (January 2025)

**Alacritty** (GPU-accelerated terminal):
- Added ConPTY support via PR #1762
- Simpler terminal model meant fewer conflicts with ConPTY's caching

**WezTerm** (Rust-based terminal):
- Author of `portable-pty` crate
- Most comprehensive ConPTY flag support in a Rust crate
- Spawns a helper process to manage PTY on Windows

### 1.6 Integration with Tauri via portable-pty / tauri-plugin-pty

#### portable-pty (from WezTerm)
- Cross-platform PTY abstraction layer for Rust
- On Windows: uses ConPTY (Windows 10 1809+)
- **GOTCHA**: The upstream crate does not pass modern ConPTY creation flags (RESIZE_QUIRK, WIN32_INPUT_MODE, PASSTHROUGH_MODE). The `portable-pty-psmux` crate is a patched version that adds these flags.
- WezTerm's own `portable-pty` may have these flags in newer versions, but third-party users of the crate need to verify.

#### tauri-plugin-pty
- Official Tauri plugin for PTY integration
- Spawns shells like `powershell.exe` and transports data between terminal and PTY
- Basic usage:

```javascript
import { Terminal } from "@xterm/xterm";
import { spawn } from "tauri-pty";

const term = new Terminal();
term.open(document.getElementById("terminal"));

const pty = spawn("powershell.exe", [], {
  cols: term.cols,
  rows: term.rows,
});

pty.onData(data => term.write(data));
term.onData(data => pty.write(data));
```

- **Alternative**: `tauri-terminal` project demonstrates xterm.js + portable-pty in Tauri

#### Known Issues with portable-pty on Windows
- A cmd window may flash briefly when ConPTY is initialized (wezterm issue #6946)
- Window flashing caused by `AllocConsole()` during ConPTY setup
- Workaround: Use `DETACHED_PROCESS` or `CREATE_NO_WINDOW` flags when spawning

### 1.7 ConPTY and Node.js / Claude Code

**node-pty** (used by VS Code, and indirectly relevant to Claude Code):
- Windows implementation uses `WindowsPtyAgent` mediator class
- Uses socket-based communication (not direct file descriptors)
- Signal handling is **not supported** on Windows -- `kill()` throws when signal parameter is used
- Resize is supported but mechanism differs from Unix
- Anti-virus software can cause `ConnectNamedPipe failed: Windows error 232`
- Missing `SystemRoot` env var causes "Internal Windows PowerShell error 8009001d"
- `clearBuffer()` is a no-op except on Windows/ConPTY (used for state sync)
- WinPTY support has been removed; ConPTY is the only backend (Windows 10 1809+)

---

## 2. WebView2 on Windows 11

### 2.1 Current State

WebView2 comes **preinstalled on Windows 11** and is based on Microsoft Edge (Chromium). It auto-updates via the "Evergreen" distribution model, so the Chromium engine version stays relatively current.

**Key facts:**
- Based on Edge/Chromium source code
- Shares processes across WebView2 apps using the same user data folder
- GPU-accelerated rendering by default via DirectX
- Auto-updates independently of Edge browser updates
- Available on Windows 10 (v1803+) and Windows 11

### 2.2 Capabilities vs. Full Chromium (Electron)

| Feature | WebView2 (Tauri) | Electron |
|---------|-------------------|----------|
| **Rendering engine** | Chromium (via Edge) | Bundled Chromium |
| **Version control** | Evergreen (auto-updates) or Fixed | Pinned to specific version |
| **Node.js access** | No (use Rust backend) | Full Node.js integration |
| **Bundle size** | ~6-18 MB (app only) | ~142-400 MB (includes Chromium) |
| **Idle memory** | ~52 MB | ~184 MB |
| **Cold startup** | ~0.8s | ~2.1s |
| **Process sharing** | Shared non-renderer processes | Independent per app |
| **Memory management** | Adapts to system memory pressure | Fixed allocation |
| **Web feature support** | Current Chromium (auto-updated) | Fixed to bundled version |
| **Cross-platform** | Windows only (macOS/Linux planned) | Windows, macOS, Linux |
| **DevTools** | Full Edge DevTools | Full Chromium DevTools |

### 2.3 GPU Acceleration

- Enabled by default; critical for performance
- Renders via DirectX through the Chromium GPU process
- **GPU fallback issue**: If GPU driver is outdated, misconfigured, or blocked by policy, rendering falls back to software mode, causing:
  - CPU usage spikes
  - Slow animations and UI redraws
  - Sluggish scrolling in terminal emulator (xterm.js)
- **Graphics corruption**: Reported in WebView2 feedback issue #2421 across apps using WebView2
- **Workaround**: Do not use the `--disable-gpu` flag unless actively debugging
- **xterm.js WebGL renderer**: Works with WebView2's GPU acceleration; provides the best terminal rendering performance

### 2.4 Debugging Tools

- **Edge DevTools**: Press `Ctrl+Shift+I` or right-click and "Inspect"
- **Programmatic access**: `OpenDevToolsWindow` API
- **Visual Studio debugging**: Attach to WebView2 process for combined native + web debugging
- **Remote debugging**: Edge DevTools Protocol for external debugging tools
- **Performance profiling**: Standard Chromium Performance tab works
- **Console**: Standard browser console available

### 2.5 Auto-Update Behavior

**Evergreen mode (default for Tauri):**
- WebView2 Runtime (`msedgewebview2.exe`) updates automatically
- Microsoft controls update timing
- You cannot predict which Chromium version users will have
- **Risk**: New Chromium features may break your app if you rely on bleeding-edge APIs
- **Mitigation**: Test against multiple WebView2 versions; use feature detection

**Fixed version mode:**
- Bundle a specific WebView2 runtime (~180 MB added to installer)
- Full control over version
- Must manually update to get security patches
- **GOTCHA**: Tauri has a known issue where `GetAvailableBrowserVersionString` may not detect fixed versions properly (issue #13817)

### 2.6 Version Uncertainty

The major limitation vs. Electron: you don't know which browser version the user has. Mitigations:
- Use `caniuse.com` to verify feature availability across versions
- Set a minimum WebView2 version in your NSIS installer config
- Feature-detect rather than version-detect
- The Tauri NSIS installer can trigger automatic WebView2 updates if the installed version is too old

### 2.7 Windows 11 Specific Benefits

- WebView2 is always present (no bootstrapper needed)
- Latest stable Chromium features typically available
- Better DirectComposition integration for smoother rendering
- Shared Edge process pool reduces total system memory usage when multiple WebView2 apps run

---

## 3. File System Considerations on Windows

### 3.1 Path Handling

#### Backslash vs. Forward Slash

| Context | Expected Format | Notes |
|---------|----------------|-------|
| Windows API calls | `C:\Users\Name\project` | Native format |
| PowerShell | `C:\Users\Name\project` | Also accepts `/` |
| CMD | `C:\Users\Name\project` | Does NOT accept `/` in all contexts |
| Git Bash | `/c/Users/Name/project` | POSIX-style; auto-translates to Windows |
| WSL | `/mnt/c/Users/Name/project` | Mounted drive prefix |
| Rust `std::path::Path` | `C:\Users\Name\project` | Uses OS-native separator |
| Web URLs / JavaScript | `C:/Users/Name/project` | Forward slashes work in most Rust/TS APIs |
| Claude Code internal | Unix-style paths | Generates Unix commands; Git Bash translates |

**CRITICAL GOTCHA for Vantage**: Claude Code's file tools (Edit, Write, Read) require Windows native paths with backslashes. But Claude Code's Bash tool internally uses Git Bash which expects POSIX paths. Vantage must be aware of which path format each IPC call expects.

#### UNC Paths
- Format: `\\server\share\path\file`
- Some Rust crates don't handle UNC paths correctly
- Tauri's file dialog returns extended-length paths `\\?\C:\...` in some cases
- Extended-length paths bypass the MAX_PATH limit but not all APIs accept them

#### Long Paths (> 260 characters)
- Traditional `MAX_PATH` limit of 260 characters
- Windows 11 supports long paths if enabled:
  - Group Policy: `Computer Configuration > Administrative Templates > System > Filesystem > Enable NTFS long paths`
  - Registry: `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled = 1`
- Rust's `std::path` handles long paths correctly on Windows when the system setting is enabled
- **GOTCHA**: Many third-party tools and npm packages still fail with paths > 260 chars
- `node_modules` nested paths are notorious for hitting this limit

### 3.2 File Watching (the `notify` crate)

The `notify` crate (used by Tauri for file watching) uses `ReadDirectoryChangesW` on Windows.

#### ReadDirectoryChangesW Limitations

**Buffer overflow / event loss:**
- When rapid file changes occur (e.g., bulk copy, git checkout), the notification buffer can overflow
- When buffer overflows, `ReadDirectoryChangesW` returns true but `lpBytesReturned` is zero
- ALL pending notifications are lost (not just the overflow portion)
- The caller receives no indication that events were lost (other than lpBytesReturned=0)

**Network drive restrictions:**
- Buffer length cannot exceed 64 KB on network drives (ERROR_INVALID_PARAMETER)
- SMB protocol limitation forces smaller buffers that overflow more easily
- **Vantage impact**: If users work on mapped drives, file watching will be unreliable

**Handle limits:**
- Maximum of 64 wait objects when using I/O completion ports
- Watching more than 64 directories requires multiple threads organized in a tree
- The `notify` crate handles this internally but performance degrades

**Antivirus interference:**
- Real-time scanning can delay or drop file system notifications
- Windows Defender and other AV products hook into filesystem operations
- No workaround other than AV exclusions

#### notify Crate Specific Issues on Windows

| Issue | Impact | Workaround |
|-------|--------|------------|
| Event duplication | Single file edit may report event twice | Use debouncer |
| Rename handling imprecise | Reports `Any` variant instead of specific `RenameFrom`/`RenameTo` | Filter by event kind loosely |
| Rapid creation loss | Creating many files quickly drops later events | Watch directories, not files |
| WSL filesystem events lost | Fewer events when watching `/mnt/c/` from WSL | Store projects on native filesystem |
| Panic with Rust 1.81+ | Debouncer loop panic on comparison function | Update to latest notify version |
| Large-scale watching (500+ files) | Events dropped silently | Watch parent directories instead; use PollWatcher for certainty |

**Recommendation for Vantage**: Use directory-level watching with debouncing. Never watch individual files. Accept that some events will be missed and use polling as a fallback for critical operations.

### 3.3 File Locking

**Windows uses mandatory file locking** (unlike Unix's advisory locks):
- When a file is opened, other processes are denied access by default
- This is the opposite of Unix, where multiple processes can read/write the same file unless they explicitly lock it

**Rust's cross-platform compromise:**
- By default, Rust sets `share_mode = FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE`
- This mimics Unix behavior by allowing other processes to read, write, and delete/rename
- However, applications that don't use Rust's defaults (e.g., native Windows apps, editors) may hold exclusive locks

**Impact on Vantage:**
- If a user has a file open in Visual Studio or another editor that holds exclusive locks, Vantage's file operations may fail
- Claude Code's file tools may fail when another process holds a lock
- Git operations can fail when antivirus locks `.git` files
- **Workaround**: Implement retry logic with exponential backoff for file operations; surface clear error messages when lock conflicts occur

### 3.4 Case Sensitivity

**NTFS is case-preserving but case-insensitive by default:**
- `File.txt` and `file.txt` are the SAME file
- This can cause issues with projects that have case-sensitive file names (common in Unix-originated codebases)

**Per-directory case sensitivity (Windows 10 build 17107+):**
- Enable with: `fsutil.exe file SetCaseSensitiveInfo <path> enable`
- New directories created inside a case-sensitive directory inherit the flag
- Only works on local NTFS volumes (not network drives)
- WSL directories created from Linux side are automatically case-sensitive

**Impact on Vantage:**
- Projects with case-conflicting filenames (e.g., `Component.tsx` and `component.tsx`) will cause issues unless case sensitivity is enabled
- Git can become confused if case sensitivity differs between contributors
- **Recommendation**: Detect and warn users about case-sensitivity-related issues

---

## 4. Git on Windows

### 4.1 Git for Windows

Git for Windows bundles:
- `git.exe` -- the main Git executable
- `bash.exe` -- Git Bash (MinGW-based Unix shell)
- Standard Unix utilities (ls, grep, find, sed, awk, etc.)
- OpenSSH
- GNU core utilities

**Performance characteristics:**
- Git operations are generally 2-5x slower than native Linux
- `git status` on large repos is notably slower due to NTFS metadata overhead
- Git 2.37+ added `fsmonitor` daemon that significantly speeds up operations
- Running `git config core.fsmonitor true` enables the filesystem monitor

**Git for Windows vs. WSL Git:**

| Aspect | Git for Windows | WSL Git |
|--------|----------------|---------|
| Filesystem performance | Native NTFS, moderate | VolFS (fast) or DrvFS (2-10x slower) |
| Path handling | Windows native | Linux paths; `/mnt/c/` for Windows files |
| Symlink support | Limited (requires Developer Mode or admin) | Full native Linux symlinks |
| Line endings | Configurable (core.autocrlf) | Native LF |
| Best for | Windows-native projects | Linux/Unix-originated projects |
| Memory usage | Lighter | Requires full WSL2 instance (~40% more) |

### 4.2 Line Ending Handling (CRLF vs LF)

**The core problem:** Windows uses `\r\n` (CRLF), Unix uses `\n` (LF).

**Git configuration:**

| Setting | Value | Behavior |
|---------|-------|----------|
| `core.autocrlf` | `true` | Convert LF to CRLF on checkout, CRLF to LF on commit |
| `core.autocrlf` | `input` | Convert CRLF to LF on commit only |
| `core.autocrlf` | `false` | No conversion |
| `.gitattributes` | `* text=auto` | Let Git detect and normalize (recommended) |

**Impact on Vantage:**
- Diff displays may show phantom changes if line endings aren't normalized
- Claude Code generates LF line endings; Vantage must handle this consistently
- The `git2`/`libgit2` crate has a known issue where files appear modified due to CRLF processing mismatch -- the "old" file OID uses LF but the "new" uses CRLF (GitHub: libgit2/libgit2#6410)
- **Recommendation**: Use `.gitattributes` with `* text=auto eol=lf` in Vantage-managed projects

### 4.3 Symlink Support

**Windows symlinks are restricted:**
- Requires "Developer Mode" enabled, OR
- Requires administrator privileges ("Create symbolic links" policy)
- Git for Windows defaults to `core.symlinks=false` in many installations
- Without symlink support, Git creates plain text files containing the target path

**gix/gitoxide issue:** `gix clone` ignores the global `core.symlinks=false` setting on Windows (GitoxideLabs/gitoxide#1353), potentially creating broken symlinks.

**CVE-2025-48384**: Critical Git vulnerability exploiting line endings and symlink manipulation on Windows. Ensure Git for Windows is up to date.

**Impact on Vantage:**
- Git worktrees don't use symlinks (they use separate checkouts), so this is less critical for worktree-based agent isolation
- If Vantage ever needs to follow symlinks in the project tree, verify Developer Mode status first

### 4.4 Git Worktrees on Windows

**Worktrees are the consensus mechanism for multi-agent isolation** (see research doc 04).

**Windows-specific considerations:**
- Worktrees use hardlinks for shared `.git` data where possible
- NTFS hardlinks work within the same volume only
- Worktree paths cannot be on different drives from the main repo
- Performance overhead: each worktree needs its own working directory
- Disk space: a 2GB codebase can use 9.82 GB in a 20-minute multi-agent session with automatic worktree creation

**Database isolation gap:**
- Worktrees share the same local database, Docker daemon, and cache directories
- Two agents modifying database state simultaneously causes race conditions
- This is a known limitation with no current fix from Claude Code

### 4.5 The git2 / gix Crates on Windows

**git2-rs (libgit2 wrapper):**
- Generally stable on Windows
- Known CRLF issue: files detected as modified due to OID computation mismatch between bash and PowerShell environments
- Requires libgit2 1.9.0+ for current compatibility
- Build requires Visual Studio Build Tools (same as Tauri)
- Performance: adequate for status/diff/log operations but slower than native `git.exe` for large operations

**gix (gitoxide, pure Rust):**
- Faster than git2-rs for many operations
- Still has Windows-specific bugs (e.g., symlink handling, #1353)
- Better CRLF handling than git2-rs in recent versions
- Growing adoption but less battle-tested on Windows than git2-rs

**Recommendation for Vantage**: Use `git2-rs` for proven stability, or shell out to `git.exe` for operations where performance or correctness is critical. Consider `gix` for status-check-only operations where its performance advantage matters.

---

## 5. Claude Code on Windows

### 5.1 Shell Selection and Execution Model

Claude Code on native Windows **requires Git for Windows** because it uses Git Bash internally to execute all shell commands, even when launched from PowerShell or CMD.

**How commands are executed:**
1. User sends a prompt to Claude Code
2. Claude Code's model generates Unix-style shell commands
3. Commands are dispatched to Git Bash (`bash.exe` from Git for Windows)
4. Git Bash automatically translates Unix paths to Windows paths
5. Results are returned through the same channel

**Shell detection order:**
1. `CLAUDE_CODE_GIT_BASH_PATH` environment variable (if set)
2. Standard Git for Windows installation paths (`C:\Program Files\Git\bin\bash.exe`)
3. `where.exe git` to find Git installation, then derive `bash.exe` path

**Configuration in `settings.json`:**
```json
{
  "env": {
    "CLAUDE_CODE_GIT_BASH_PATH": "C:\\Program Files\\Git\\bin\\bash.exe"
  }
}
```

### 5.2 Known Windows-Specific Issues

#### Path Handling Bugs

| Issue | Description | Status |
|-------|-------------|--------|
| WSL-style paths on native Windows (#9580) | Claude Code uses `/mnt/c/` prefix instead of `C:\` on native Windows | Closed NOT_PLANNED (Jan 2026) |
| Path rewriting (#38890) | Claude silently rewrites user-provided relative path into fabricated absolute Windows path | Active |
| Double Unix drive prefix (#5401) | Path normalization creates doubled prefix | Fixed |
| Extra "c" character (#6578) | Windows path parsing adds extra character | Fixed |
| PATH inheritance regression | Git Bash PATH not inherited properly | Fixed in v2.1.78+ |

#### Sandbox Bash Issues

| Issue | Description | Status |
|-------|-------------|--------|
| Sandbox ignores CLAUDE_CODE_SHELL (#28880) | Bundled sandbox bash (linux-gnu) used instead of configured Git Bash | Closed as duplicate |
| Missing Unix utilities in sandbox | `ls`, `grep`, `head`, `tail`, `awk`, `sed`, `cat`, `find`, `which` not available in sandbox bash | Known limitation |
| Console window flashing | Brief cmd window appears during operations | Fixed in recent versions |

#### The Sandbox Bash Problem (Critical for Vantage)

Claude Code v2.1.59+ uses a bundled sandbox bash on Windows that:
- Is a linux-gnu build of bash (not Git for Windows bash)
- Lacks standard Unix utilities
- Ignores `CLAUDE_CODE_SHELL` environment variable
- Ignores `sandbox.enabled: false` in settings
- Core Windows tools (cargo, git) work because they're Windows .exe on PATH
- Standard Unix tools that Claude Code relies on (grep, find, sed) fail silently

**Implication for Vantage**: If Vantage spawns Claude Code and it uses the sandbox bash, many commands will fail. Vantage should:
1. Ensure Git for Windows is installed and on PATH
2. Set `CLAUDE_CODE_GIT_BASH_PATH` explicitly in the environment
3. Monitor Claude Code updates for sandbox behavior changes
4. Consider using the SDK/API mode rather than wrapping the CLI

### 5.3 Installation on Windows

**Official installation methods:**
1. `winget install Anthropic.ClaudeCode` (recommended)
2. PowerShell: `irm https://claude.ai/install.ps1 | iex`
3. CMD: `curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd`
4. npm: `npm install -g @anthropic-ai/claude-code` (deprecated but still works)

**Common installation gotchas:**
- PATH not updated until terminal is restarted
- Claude Desktop app may override `claude` CLI command (WindowsApps takes PATH priority)
- TLS 1.2 must be enabled for PowerShell installer: `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12`
- `where.exe claude` to check for multiple installations

**Required dependencies:**
- Git for Windows (mandatory)
- Node.js (for npm method only; native installer doesn't need it)
- 4 GB RAM minimum
- Active internet connection

### 5.4 Agent Teams on Windows

Agent Teams (introduced v2.1.32, February 2026) use Git worktrees for isolation.

**Windows-specific limitations:**
- All agents run the same model (Opus 4.6 required)
- `/ide` command fails to recognize worktrees ("No available IDEs detected")
- Disk space consumption is high (9.82 GB for 20-min session with ~2GB codebase)
- Database isolation doesn't exist -- shared local DB, Docker daemon, caches
- Worktrees must be on the same drive/volume as the main repo
- NTFS performance overhead for simultaneous file operations across worktrees

**Worktree flag:** `--worktree (-w)` or `claude -w feature-name`

### 5.5 Community Workarounds

**claude-windows-shell** (GitHub: nicoforclaude/claude-windows-shell):
A Claude Code skill/plugin that addresses Windows-specific command failures:
- Mandatory quoting of paths with backslashes or spaces
- Correct output redirection (`nul` instead of `/dev/null`)
- Fix pipe patterns that break after `cd` commands
- Shell selection guidance (Bash for git/npm, PowerShell for Windows/.NET tasks)
- Activates proactively on Windows without manual intervention

**windows-path-troubleshooting** skill (available on skill registries):
- Resolves file path issues between Windows and Unix formats
- Handles drive letter detection and path normalization

---

## 6. Tauri v2 on Windows

### 6.1 Build Requirements

**Mandatory prerequisites:**

| Requirement | Details |
|-------------|---------|
| Microsoft C++ Build Tools | "Desktop development with C++" workload from Visual Studio Installer |
| WebView2 | Preinstalled on Windows 11; auto-installed by Tauri installer on older versions |
| Rust toolchain | MSVC target: `x86_64-pc-windows-msvc` (must be default) |
| VBSCRIPT feature | Only required if building .msi packages (WiX) |

**Additional for ARM64:**
- Visual Studio "C++ ARM64 build tools" (MSVC v143)
- `rustup target add aarch64-pc-windows-msvc`

**Additional for 32-bit:**
- `rustup target add i686-pc-windows-msvc`
- Install 32-bit Windows toolchain

**Rust toolchain setup:**
```powershell
# Verify correct default
rustup default stable-msvc

# Or install via winget
winget install --id Rustlang.Rustup
```

### 6.2 NSIS vs WiX Installer

| Feature | NSIS (.exe) | WiX (.msi) |
|---------|------------|------------|
| **Format** | Setup executable (-setup.exe) | Microsoft Installer (.msi) |
| **Build platform** | Windows, Linux, macOS | Windows only |
| **ARM64 support** | Yes | No |
| **Windows 7 support** | Yes (with bootstrapper) | Limited |
| **Enterprise deployment** | Basic | Full (Group Policy, SCCM) |
| **Customization** | NSIS scripting, 4 hook points | WiX fragments, locale files |
| **Learning curve** | Lower | Higher |
| **Installer hooks** | PREINSTALL, POSTINSTALL, PREUNINSTALL, POSTUNINSTALL | Fragment-based |
| **Multi-language** | Built-in (single installer, all languages) | XML localization files |
| **Silent install** | `/passive`, `/quiet`, `/silent` flags | Standard MSI flags |
| **Updater compatibility** | Full (recommended) | Full |

**Recommendation for Vantage**: Use NSIS. It supports ARM64, can be cross-compiled, has better updater integration, and is the Tauri community's preferred choice for 2025-2026.

**NSIS installation modes:**
- **Current User** (default): No admin required
- **Per Machine**: System-wide, requires admin
- **Both**: User chooses during install

### 6.3 WebView2 Bootstrapping in Installer

| Method | Internet Required | Size Increase | Recommendation |
|--------|------------------|---------------|----------------|
| Downloaded Bootstrapper | Yes | 0 MB | Default; good for Windows 11 |
| Embedded Bootstrapper | Yes | ~1.8 MB | Better Win7 compat |
| Offline Installer | No | ~127 MB | Air-gapped environments |
| Fixed Version | No | ~180 MB | Version control needed |
| Skip | No | 0 MB | NOT recommended |

**For Vantage (Windows 11 only target):** Downloaded Bootstrapper is fine since WebView2 is preinstalled. Include the embedded bootstrapper as a fallback for edge cases.

### 6.4 Code Signing for Windows

**Certificate types:**

| Type | Cost | SmartScreen | Recommended |
|------|------|-------------|-------------|
| OV (Organization Validated) | Lower | Warning until reputation builds | For early development |
| EV (Extended Validation) | Higher | Immediate trust | For production release |

**Note:** OV certificates purchased after June 1, 2023 follow different procedures.

**Configuration in `tauri.conf.json`:**
```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "YOUR_40_CHAR_HEX_THUMBPRINT",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.comodoca.com"
    }
  }
}
```

**Azure Key Vault integration (for EV certs):**
```json
{
  "bundle": {
    "windows": {
      "signCommand": "relic sign --file %1 --key azure --config relic.conf"
    }
  }
}
```

Required env vars: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`

**Azure Code Signing (modern approach):**
```json
{
  "bundle": {
    "windows": {
      "signCommand": "trusted-signing-cli -e https://wus2.codesigning.azure.net -a Account -c Profile -d AppName %1"
    }
  }
}
```

**GOTCHA**: There's a known bug where EV certificate custom signing commands don't pick up `%1` properly (tauri-apps/tauri#11754).

### 6.5 Auto-Update via Tauri Updater Plugin

**How it works:**
1. App checks an endpoint URL for update info
2. Endpoint returns version, download URL, and cryptographic signature
3. App downloads the installer (NSIS .exe or WiX .msi)
4. App verifies the signature against the public key
5. App launches the installer

**Update signing (separate from code signing):**
- Generate keys: `tauri signer generate`
- Public key goes in `tauri.conf.json`
- Private key via `TAURI_SIGNING_PRIVATE_KEY` env var (NOT .env files)
- Signatures cannot be disabled

**Windows-specific behavior:**
- App is **automatically exited** when the install step executes (Windows installer limitation)
- Use `on_before_exit` hook for cleanup tasks
- NSIS install modes: passive (progress bar, no interaction), basicUi (user interaction), quiet (no UI, requires admin)
- **GOTCHA**: NSIS passive mode has had issues requiring user interaction despite configuration (tauri-apps/tauri#6955)
- **GOTCHA**: NSIS quiet update doesn't restart the app (tauri-apps/tauri#7560)

**Endpoint URL variables:**
- `{{current_version}}` -- app's current version
- `{{target}}` -- `windows` (or `linux`, `darwin`)
- `{{arch}}` -- `x86_64`, `aarch64`, `i686`, `armv7`

**Static JSON endpoint example:**
```json
{
  "version": "1.2.0",
  "notes": "Bug fixes and improvements",
  "pub_date": "2026-04-01T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "url": "https://example.com/vantage-1.2.0-setup.exe",
      "signature": "BASE64_SIGNATURE_HERE"
    }
  }
}
```

### 6.6 Windows-Specific Tauri Gotchas

| Issue | Details | Workaround |
|-------|---------|------------|
| Administrator Protection elevation | Bugs with UAC elevation in certain Windows builds | Test across Windows versions |
| No .appx/.msix support | Cannot create Microsoft Store packages natively | Use third-party tooling if needed |
| Fixed WebView2 detection | `GetAvailableBrowserVersionString` doesn't detect fixed runtime (#13817) | Use Evergreen mode |
| FIPS compliance | WiX builds need `TAURI_BUNDLER_WIX_FIPS_COMPLIANT=true` | Set env var before build |
| WebView2 creation with fixed version | Shows "Could not find WebView2 Runtime" on Windows 7/10 without Evergreen | Use Evergreen on Win11 |

---

## 7. Windows Terminal Integration

### 7.1 Can Vantage Embed Windows Terminal?

**Short answer: No, not directly.**

Windows Terminal does not expose an embeddable component or control API. The feature has been requested (microsoft/terminal#57) but is not implemented.

**Alternatives:**
1. **xterm.js + ConPTY via portable-pty** (recommended): Full control, proven in VS Code, SideX, and many Tauri apps
2. **Windows Terminal Fragment Extensions**: Register Vantage as a profile in Windows Terminal (opens externally)
3. **Shell out to `wt.exe`**: Launch Windows Terminal with specific profiles from Vantage

### 7.2 Shell Profile Detection

**Windows Terminal auto-detects installed shells:**
- PowerShell (Windows PowerShell 5.1 and PowerShell 7+)
- Command Prompt (cmd.exe)
- Git Bash (if Git for Windows installed)
- WSL distributions (auto-enumerated)
- Azure Cloud Shell

**Detection mechanism:**
Windows Terminal uses "Dynamic Profile Generators" that scan for installed shells. Profiles are stored in `settings.json` at:
`%LOCALAPPDATA%\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json`

**For Vantage shell detection**, scan for:
```
# PowerShell 7+
C:\Program Files\PowerShell\7\pwsh.exe

# Windows PowerShell 5.1
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe

# CMD
C:\Windows\System32\cmd.exe

# Git Bash
C:\Program Files\Git\bin\bash.exe
C:\Program Files\Git\usr\bin\bash.exe

# WSL
wsl.exe --list --quiet  (enumerate distributions)
```

### 7.3 Fragment Extensions (Register Vantage Profile)

Vantage can register a profile in Windows Terminal by placing a JSON fragment at:
```
%LOCALAPPDATA%\Microsoft\Windows Terminal\Fragments\Vantage\vantage.json
```

```json
{
  "profiles": [
    {
      "guid": "{unique-guid-here}",
      "name": "Vantage Terminal",
      "commandline": "C:\\path\\to\\vantage-shell.exe",
      "icon": "C:\\path\\to\\vantage-icon.png",
      "startingDirectory": "%USERPROFILE%"
    }
  ]
}
```

This allows users to open a Vantage-configured shell from within Windows Terminal.

### 7.4 Environment Variable Inheritance

**How Windows environment variables propagate:**
1. **Machine scope** (HKLM): System-wide, set by admin
2. **User scope** (HKCU): Per-user, persists across sessions
3. **Process scope**: Inherited snapshot from parent process

**Key behaviors:**
- Child processes inherit a **snapshot** of the parent's environment at creation time
- Subsequent parent changes do NOT propagate to children
- PATH is constructed: Machine PATH + User PATH + Process additions
- Changes to User/Machine PATH require a new process to take effect

**Impact on Vantage:**
- Vantage must read the current PATH and ensure Claude Code's dependencies are available
- If a user installs Git for Windows AFTER launching Vantage, Vantage won't see it until restarted
- Vantage should detect missing dependencies at startup and prompt the user

**PowerShell profile loading:**
- `$PROFILE` paths: `~\Documents\PowerShell\Microsoft.PowerShell_profile.ps1` (PS7) or `~\Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1` (PS5.1)
- PowerShell profiles can modify PATH and environment variables
- If Vantage spawns PowerShell, it should consider whether to load profiles (`-NoProfile` flag skips them)

---

## 8. Critical Gotchas Summary

This section collects the highest-priority Windows-specific issues that Vantage development must address.

### Must-Fix Before MVP

1. **ConPTY escape sequence filtering**: Custom terminal features (shell integration marks, custom DCS/OSC) will be swallowed by ConPTY. Plan for OSC-based communication with forced flushing and state reset.

2. **Claude Code sandbox bash**: The bundled sandbox bash lacks Unix utilities. Vantage must ensure Git Bash is properly configured and `CLAUDE_CODE_GIT_BASH_PATH` is set.

3. **Path format chaos**: Claude Code generates Unix paths internally, file tools expect Windows paths, Git Bash translates between them. Vantage must normalize paths at every IPC boundary.

4. **File locking**: Windows mandatory locks will cause sporadic failures. Implement retry logic with clear error messages.

5. **WebView2 version uncertainty**: Test against multiple WebView2 versions. Use feature detection, not version detection.

### Must-Handle for Stability

6. **File watching event loss**: The `notify` crate / `ReadDirectoryChangesW` drops events under load. Use directory-level watching with debouncing; implement polling fallback.

7. **Git line endings**: CRLF/LF mismatches cause phantom diffs. Ship a `.gitattributes` template and configure Git correctly.

8. **ConPTY window flash**: A brief cmd window may appear when initializing ConPTY. Use `CREATE_NO_WINDOW` flag.

9. **SmartScreen warnings**: Until the code signing certificate builds reputation, users will see warnings. Start with OV cert, upgrade to EV for production.

10. **Long paths**: Enable long path support detection and warn users if disabled.

### Good-to-Know

11. **Antivirus interference**: AV can block ConPTY connections, delay file watching, and lock `.git` files. Document AV exclusion recommendations.

12. **Agent Teams disk space**: Worktrees consume significant disk space. Monitor and warn users.

13. **WSL vs native**: Don't try to support both WSL and native Windows simultaneously in the same Vantage instance. Pick native Windows as the primary path.

14. **Git for Windows performance**: Large repos benefit from `core.fsmonitor=true`. Consider recommending this in Vantage setup.

---

## 9. Recommendations for Vantage

### 9.1 Terminal Emulation Stack

```
xterm.js (WebGL renderer)
    |
    v
tauri-plugin-pty (or custom portable-pty integration)
    |
    v
ConPTY (Windows 10 1809+)
    |
    v
Git Bash / PowerShell / cmd.exe
```

- Use xterm.js with the WebGL renderer for best performance in WebView2
- Use `tauri-plugin-pty` for the Tauri <-> PTY bridge
- Consider forking or patching portable-pty to pass modern ConPTY flags (RESIZE_QUIRK, WIN32_INPUT_MODE)
- Implement periodic ConPTY state resets if custom terminal features are needed
- Handle ConPTY's UTF-8 forcing (this is actually beneficial for modern apps)

### 9.2 File System Strategy

- **Path handling**: Create a Rust utility module that normalizes between Windows, POSIX, and UNC paths. Every IPC call should go through this module.
- **File watching**: Use `notify` crate with debouncer at the directory level. Supplement with polling for `.git` directory changes.
- **File operations**: Wrap all file I/O in retry logic (3 attempts, 100ms/500ms/2000ms delays) to handle transient locks.
- **Case sensitivity**: Detect and warn at project setup time. Don't enable per-directory case sensitivity automatically.

### 9.3 Git Integration

- Shell out to `git.exe` for most operations (proven, fast, handles CRLF correctly)
- Use `git2-rs` only for read operations where shelling out is inconvenient (e.g., quick status checks)
- Configure `.gitattributes` with `* text=auto eol=lf` for new Vantage projects
- Enable `core.fsmonitor` for repos managed by Vantage
- For worktrees: verify same-volume requirement before creation; track disk usage

### 9.4 Claude Code Integration

- **Prefer SDK/API mode** (`--sdk-url` WebSocket or Agent SDK) over raw CLI wrapping
- Set `CLAUDE_CODE_GIT_BASH_PATH` explicitly in the spawned environment
- Ensure `PATH` includes Git for Windows binaries
- Handle the sandbox bash limitation by verifying shell availability at startup
- Implement path normalization for all paths passing between Vantage and Claude Code

### 9.5 Distribution Strategy

- **Installer**: NSIS (cross-platform build support, ARM64 ready)
- **WebView2**: Downloaded bootstrapper (Windows 11 has it preinstalled)
- **Code signing**: Start with OV cert during development/beta; upgrade to EV for public release
- **Auto-update**: Tauri updater plugin with NSIS passive mode; use `on_before_exit` for cleanup
- **SmartScreen**: Submit to Microsoft for manual review to accelerate reputation building

### 9.6 Prerequisites Check at First Launch

Vantage should verify at startup:

```
1. Git for Windows installed?
   -> If not: prompt to install (winget install Git.Git)

2. Git Bash accessible?
   -> Locate bash.exe, set CLAUDE_CODE_GIT_BASH_PATH

3. Claude Code installed?
   -> If not: prompt to install (winget install Anthropic.ClaudeCode)

4. Claude Code on PATH?
   -> Verify with 'claude --version'

5. Long paths enabled?
   -> Check registry LongPathsEnabled
   -> Warn if disabled

6. WebView2 version adequate?
   -> Check via registry or API
   -> Minimum version for features we need

7. Git configuration?
   -> Check core.autocrlf and recommend settings
   -> Check core.fsmonitor and recommend enabling
```

---

## Sources

### ConPTY
- [Windows Command-Line: Introducing the Windows Pseudo Console (ConPTY)](https://devblogs.microsoft.com/commandline/windows-command-line-introducing-the-windows-pseudo-console-conpty/)
- [CreatePseudoConsole function - Windows Console | Microsoft Learn](https://learn.microsoft.com/en-us/windows/console/createpseudoconsole)
- [Warp: Bringing Warp to Windows: Eng Learnings](https://www.warp.dev/blog/building-warp-on-windows)
- [ConPTY Passthrough mode (microsoft/terminal#1985)](https://github.com/microsoft/terminal/issues/1985)
- [WinPTY Support | microsoft/node-pty | DeepWiki](https://deepwiki.com/microsoft/node-pty/4.5-winpty-support)
- [PTY and Process Management | wezterm/wezterm | DeepWiki](https://deepwiki.com/wezterm/wezterm/4.5-pty-and-process-management)
- [Taming Windows Terminal's win32-input-mode in Go ConPTY Applications](https://dev.to/andylbrummer/taming-windows-terminals-win32-input-mode-in-go-conpty-applications-7gg)
- [tauri-plugin-pty on crates.io](https://crates.io/crates/tauri-plugin-pty)
- [tauri uses portable_pty with cmd window (wezterm#6946)](https://github.com/wezterm/wezterm/issues/6946)

### WebView2
- [WebView2 and Electron | Electron](https://www.electronjs.org/blog/webview2)
- [Electron vs WebView2 in 2025 | AppNize](https://applicationize.me/electron-vs-webview2-in-2025-key-differences-performance-and-which-framework-to-choose/)
- [Performance best practices for WebView2 apps | Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance)
- [Debug WebView2 apps with Microsoft Edge DevTools | Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/debug-devtools)
- [Graphics corruption in WebView2 (WebView2Feedback#2421)](https://github.com/MicrosoftEdge/WebView2Feedback/issues/2421)
- [Evergreen vs. fixed version of WebView2 Runtime | Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/evergreen-vs-fixed-version)
- [Webview Versions | Tauri](https://v2.tauri.app/reference/webview-versions/)

### File System
- [How to get notifications about file system changes on Windows | Medium](https://medium.com/tresorit-engineering/how-to-get-notifications-about-file-system-changes-on-windows-519dd8c4fb01)
- [ReadDirectoryChangesW function | Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-readdirectorychangesw)
- [Large scale watching of paths drops events (notify-rs#412)](https://github.com/notify-rs/notify/issues/412)
- [notify crate docs](https://docs.rs/notify)
- [Rust RFC 1252: Open Options (file sharing modes)](https://rust-lang.github.io/rfcs/1252-open-options.html)
- [Per-directory case sensitivity and WSL | Microsoft](https://devblogs.microsoft.com/commandline/per-directory-case-sensitivity-and-wsl/)
- [Enable long file path names in Windows 11](https://www.elevenforum.com/t/enable-long-file-path-names-in-windows-11.28659/)

### Git on Windows
- [Files detected as modified on Windows due to CRLF processing (libgit2#6410)](https://github.com/libgit2/libgit2/issues/6410)
- [gix clone ignores global core.symlinks on Windows (gitoxide#1353)](https://github.com/GitoxideLabs/gitoxide/issues/1353)
- [CVE-2025-48384: Critical Git Vulnerability | Windows Forum](https://windowsforum.com/threads/cve-2025-48384-critical-git-vulnerability-exploiting-line-endings-symlink-manipulation.372743/)
- [Configuring Git to handle line endings | GitHub Docs](https://docs.github.com/en/get-started/git-basics/configuring-git-to-handle-line-endings)
- [Git worktrees for parallel AI coding agents | Upsun](https://devcenter.upsun.com/posts/git-worktrees-for-parallel-ai-coding-agents/)

### Claude Code on Windows
- [Troubleshooting - Claude Code Docs](https://code.claude.com/docs/en/troubleshooting)
- [Claude Code Uses Git Bash on Windows](https://lzwjava.github.io/claude-code-git-bash-en)
- [claude-windows-shell (GitHub)](https://github.com/nicoforclaude/claude-windows-shell)
- [BUG: WSL-style paths on native Windows (#9580)](https://github.com/anthropics/claude-code/issues/9580)
- [BUG: Sandbox bash ignores CLAUDE_CODE_SHELL (#28880)](https://github.com/anthropics/claude-code/issues/28880)
- [BUG: PATH not added by installer (#21365)](https://github.com/anthropics/claude-code/issues/21365)
- [Claude Code Installation Guide for Windows 2026 | DEV](https://dev.to/xujfcn/claude-code-installation-guide-for-windows-git-path-environment-variables-powershell-wsl-and-1lag)

### Tauri v2 on Windows
- [Prerequisites | Tauri](https://v2.tauri.app/start/prerequisites/)
- [Windows Installer | Tauri](https://v2.tauri.app/distribute/windows-installer/)
- [Windows Code Signing | Tauri](https://v2.tauri.app/distribute/sign/windows/)
- [Updater | Tauri](https://v2.tauri.app/plugin/updater/)
- [NSIS auto updater passive mode bug (tauri#6955)](https://github.com/tauri-apps/tauri/issues/6955)
- [NSIS quiet update doesn't restart app (tauri#7560)](https://github.com/tauri-apps/tauri/issues/7560)
- [EV certificate signCommand bug (tauri#11754)](https://github.com/tauri-apps/tauri/issues/11754)
- [Fixed WebView2 detection bug (tauri#13817)](https://github.com/tauri-apps/tauri/issues/13817)
- [Ship Your Tauri v2 App: Code Signing for Windows | DEV](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-code-signing-for-macos-and-windows-part-12-3o9n)

### Windows Terminal
- [Windows Terminal JSON Fragment Extensions | Microsoft Learn](https://learn.microsoft.com/en-us/windows/terminal/json-fragment-extensions)
- [Shell integration in Windows Terminal | Microsoft Learn](https://learn.microsoft.com/en-us/windows/terminal/tutorials/shell-integration)
- [Windows Terminal Dynamic Profiles | Microsoft Learn](https://learn.microsoft.com/en-us/windows/terminal/dynamic-profiles)
- [Official API to create a third-party console host (terminal#57)](https://github.com/microsoft/terminal/issues/57)
- [Environment variable inheritance | Old New Thing](https://devblogs.microsoft.com/oldnewthing/20150915-00/?p=91591)
