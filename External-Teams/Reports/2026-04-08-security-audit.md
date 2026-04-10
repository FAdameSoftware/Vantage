# Vantage Security Audit Report

**Date:** 2026-04-08
**Scope:** Full codebase -- Rust backend, React frontend, Tauri config, dependencies
**Auditor:** Claude Opus 4.6 (4-agent parallel review)
**Commit:** `d2a0801` (master)
**Previous audit:** `2026-04-07-security-audit.md` (commit `8f95fd2`)

---

## Executive Summary

| Severity | Count | Change vs. 2026-04-07 |
|----------|-------|-----------------------|
| **Critical** | 6 | +3 (was 3) |
| **High** | 12 | +8 (was 4) |
| **Medium** | 14 | +6 (was 8) |
| **Low** | 11 | +3 (was 8) |
| **Pass** | 24 | +6 (was 18) |

**Key changes since last audit:**
- **FIXED:** `unsafe-eval` in CSP (C1) -- now correctly uses `wasm-unsafe-eval`
- **FIXED:** Vite `fs.allow` too broad (M5) -- commit `0a36698` switched to `fs.deny`
- **NEW:** 11 previously undetected findings surfaced by deeper analysis
- **UPGRADED:** 4 findings reclassified to higher severity after deeper review

The codebase has strong defenses in specific areas (git injection, XSS prevention, React rendering) but suffers from a **systemic lack of project-root sandboxing** -- the single most impactful architectural gap. File operations, git commands, search, and Claude sessions all accept arbitrary paths without validating containment within the active project.

---

## Remediation Status (Previous Audit Findings)

| ID | Finding | Status |
|----|---------|--------|
| C1 | `unsafe-eval` in CSP | **FIXED** -- now `wasm-unsafe-eval` |
| C2 | MCP Server Command Execution | **OPEN** -- see SEC-02 |
| C3 | Auto-Updater Disabled | **OPEN** -- see SEC-05 |
| H1 | npm Dependencies with CVEs | **PARTIAL** -- DOMPurify, Monaco still vulnerable |
| H2 | `unsafe-inline` in style-src | **OPEN** -- see SEC-12 |
| H3 | MCP Bridge in Debug Builds | **UPGRADED** to CRITICAL -- see SEC-04 |
| H4 | `--dangerously-skip-permissions` | **OPEN** -- see SEC-06 |
| M1 | Quality Gate Command Parsing | **UPGRADED** to CRITICAL -- see SEC-03 |
| M2 | Workspace Filename Path Traversal | **OPEN** -- see SEC-11 |
| M3 | Unredacted Secrets in stderr | **OPEN** -- see SEC-15 |
| M4 | JSONL Parsing Without Line Limits | **OPEN** -- see SEC-16 |
| M5 | Vite `fs.allow` Too Broad | **FIXED** -- commit `0a36698` (SEC-006) |
| M6 | Broad Tauri Capabilities | **OPEN** -- see SEC-13 |
| M7 | URL Scheme in BrowserPreview | **UPGRADED** to CRITICAL -- see SEC-01 |
| M8 | Source Maps in Production | **OPEN** -- see SEC-19 |

---

## Critical Findings

### SEC-01. No Project Root Sandboxing on File Operations
- **Files:** `src-tauri/src/files/operations.rs` (write_file, create_file, delete_file, rename_path), `src-tauri/src/search.rs` (search_project, replace_in_files), `src-tauri/src/lib.rs` (all git commands)
- **Severity:** CRITICAL
- **Status:** NEW
- **Issue:** File operations use `validate_path()` which rejects `..` traversal and a small blocklist of sensitive paths, but does NOT enforce that paths are within the current project root. Any absolute path is accepted. Similarly, `search_project` accepts any `root` parameter, and all git/Claude commands accept arbitrary `cwd`. The sensitive path blocklist (`SENSITIVE_PATH_PATTERNS`) misses `.npmrc`, `.gitconfig`, `.docker/config.json`, `.kube/config`, `.claude/settings.json`, and many others.
- **Impact:** A compromised frontend (XSS, malicious plugin, MCP bridge) can read, write, or delete any file the user has OS-level permissions for. Git operations can target arbitrary repositories.
- **Attack vector:** `invoke("write_file", {path: "C:/Users/ferpu/.claude/settings.json", content: "<malicious>"})` overwrites Claude Code's settings. `invoke("search_project", {root: "C:/Users/ferpu", query: "password"})` searches the entire home directory.
- **Fix:** Store the active project root in Rust backend state. All file operations, git commands, search, and Claude sessions MUST validate path containment within the project root using `canonicalize()`. Replace the blocklist with an allowlist approach.

### SEC-02. Browser Preview iframe with Insufficient Sandboxing
- **Files:** `src/components/preview/BrowserPreview.tsx:48-58,214-219`, `src/stores/layout.ts:160`, `src/stores/workspace.ts:213`
- **Severity:** CRITICAL
- **Status:** UPGRADED from M7
- **Issue:** The iframe sandbox includes `allow-same-origin` AND `allow-scripts` together, which negates sandboxing for same-origin content. URL validation only auto-prefixes `http://` -- it does NOT reject `javascript:`, `data:`, `file:`, or `blob:` schemes. The `previewUrl` is persisted to workspace files and auto-loaded on project open without validation.
- **Impact:** Loading a malicious URL in the preview gives the embedded page script execution in the WebView context, with access to `window.__TAURI__` IPC (see SEC-07).
- **Attack vector:** A crafted workspace file sets `previewUrl` to a malicious site. When the victim opens the project, the iframe auto-loads the attacker's page, which accesses Tauri IPC to write files, spawn shells, etc.
- **Fix:**
  1. Validate URLs against an allowlist (localhost, 127.0.0.1 only)
  2. Block `javascript:`, `data:`, `file:`, `blob:` URI schemes explicitly
  3. Remove `allow-same-origin` from the sandbox or don't combine with `allow-scripts`
  4. Don't auto-load non-localhost URLs on workspace restore

### SEC-03. Command Injection via Quality Gate Whitelist Bypass
- **File:** `src-tauri/src/merge_queue.rs:105-142`
- **Severity:** CRITICAL
- **Status:** UPGRADED from M1
- **Issue:** The `run_quality_gate` function validates commands against a prefix whitelist (`npm `, `node `, `npx `, `make `, etc.) using `starts_with`. However:
  - On Windows, `Command::new("npm")` resolves via CWD first -- a malicious `npm.bat`/`npm.cmd` in the project directory shadows the real npm
  - `node -e "malicious code"` passes validation (matches `node ` prefix)
  - Any `package.json` script content is executed verbatim by npm
  - `split_whitespace()` tokenization doesn't handle quoting
- **Impact:** Arbitrary code execution when running quality gates on a malicious project.
- **Fix:** Use absolute paths for allowed executables (resolve via `where.exe`/`which` before execution). Restrict allowed arguments. Consider a strict command allowlist (not prefix matching).

### SEC-04. MCP Bridge Capability in Production Capabilities File
- **Files:** `src-tauri/capabilities/default.json:24`, `src-tauri/src/lib.rs:789-795`
- **Severity:** CRITICAL
- **Status:** UPGRADED from H3
- **Issue:** `"mcp-bridge:default"` is declared in the default capabilities file that ships with ALL builds. The Rust plugin is gated behind `#[cfg(debug_assertions)]`, but the capability is unconditionally present. If the debug guard is accidentally removed in a future refactor, the MCP bridge is immediately active in production -- allowing external clients to take screenshots, click elements, read DOM, execute JS, and inspect IPC.
- **Impact:** Full remote control of the application.
- **Fix:** Create a separate `debug.json` capabilities file for MCP bridge. Remove from `default.json`.

### SEC-05. Auto-Updater Disabled -- No Security Patch Distribution
- **File:** `src-tauri/src/lib.rs:784-787`
- **Severity:** CRITICAL
- **Status:** OPEN (from C3)
- **Issue:** The Tauri auto-updater plugin is commented out. Without signed updates, deployed versions cannot receive security patches. Users remain perpetually vulnerable.
- **Fix:** Enable the updater plugin, configure RSA-2048 signing keys, set up a secure update endpoint. Code comment correctly flags this as P0-before-distribution.

### SEC-06. CodeBlock DOM Injection via Shiki HTML Output
- **Files:** `src/components/chat/CodeBlock.tsx:98-118`
- **Severity:** CRITICAL
- **Status:** NEW
- **Issue:** Shiki's `codeToHtml()` output is parsed with `DOMParser` and injected into the DOM via `document.importNode` + `container.appendChild`, bypassing React's DOM abstraction entirely. The input to shiki is Claude's response text (attacker-controllable in adversarial scenarios). If a future shiki version or language grammar has a regression that passes through HTML-like content, this becomes a direct XSS vector. The DOMParser approach imports ALL nodes including potential script tags or event handler attributes without sanitization.
- **Impact:** XSS in the Tauri WebView context, leading to full IPC access.
- **Fix:** Sanitize shiki HTML with DOMPurify before injection. Or use shiki's hast (AST) output mode and render via React to stay within React's safe rendering pipeline.

---

## High Findings

### SEC-07. `withGlobalTauri: true` Exposes IPC to All WebView Code
- **File:** `src-tauri/tauri.conf.json:26`
- **Severity:** HIGH
- **Status:** NEW
- **Issue:** All Tauri APIs are available on `window.__TAURI__`. Any JavaScript running in the WebView (XSS, compromised npm dependency, MCP bridge, injected via preview iframe) can invoke Tauri IPC commands directly, bypassing React/TypeScript layers. This is an amplifier for every other XSS finding.
- **Fix:** Set `withGlobalTauri: false` and use `@tauri-apps/api` module imports. Gate the global setting behind debug builds if needed for MCP bridge.

### SEC-08. Permission Dialog Auto-Approve Bypass
- **Files:** `src/components/permissions/PermissionDialog.tsx:340-346`, `src/stores/settings.ts:32,114,145`
- **Severity:** HIGH
- **Status:** EXPANDED from H4
- **Issue:** Two related problems:
  1. "Allow for Session" stores only the tool name (e.g., "Bash") -- ALL subsequent uses of that tool name are auto-approved regardless of input. If a user allows `Bash: ls`, then `Bash: rm -rf /` is silently auto-approved.
  2. `skipPermissions` is exposed as a simple boolean toggle in settings with no confirmation dialog, warning banner, or audit trail. Once enabled, Claude can execute arbitrary commands without approval.
- **Fix:**
  1. Re-prompt for commands matching destructive patterns even when tool is session-allowed
  2. Add native confirmation dialog and visual warning banner for `skipPermissions`
  3. Auto-revert `skipPermissions` after session ends

### SEC-09. MCP/Hooks Command Injection via Settings UI
- **Files:** `src/components/settings/McpManager.tsx:37-72`, `src/components/settings/HooksEditor.tsx:80-213`, `src-tauri/src/mcp.rs:10-19,50-65`
- **Severity:** HIGH
- **Status:** OPEN (from C2)
- **Issue:** MCP server configs and Claude Code hooks accept arbitrary `command` and `args` values from UI input with zero validation. These commands execute automatically (MCP on session start, hooks on every tool use). Project-level `.mcp.json` files can be checked into git -- a malicious repo auto-configures command execution.
- **Fix:**
  1. Whitelist allowed commands (npx, node, python, uvx)
  2. Block dangerous env vars (`LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`)
  3. Require explicit user confirmation before spawning MCP servers
  4. Warn on project-level `.mcp.json` files
  5. Show warning for hooks containing shell metacharacters

### SEC-10. Markdown/Link Href Not Sanitized -- javascript: URLs
- **Files:** `src/components/chat/MessageBubble.tsx:384-393`, `src/components/editor/MarkdownPreview.tsx`
- **Severity:** HIGH
- **Status:** NEW
- **Issue:** The ReactMarkdown custom `a` component passes `href` directly without sanitizing. While `react-markdown` v9+ strips `javascript:` URLs by default, `data:text/html` URLs and MarkdownPreview (which lacks a custom link component) may not be fully protected. Links are styled to encourage clicking.
- **Fix:** Explicitly validate `href` against an allowlist (`http:`, `https:`, `mailto:` only) in both MessageBubble and MarkdownPreview.

### SEC-11. Workspace Files Deserialized Without Schema Validation
- **Files:** `src/lib/workspaceStorage.ts:63-87`, `src/stores/workspace.ts:305-469`
- **Severity:** HIGH
- **Status:** EXPANDED from M2
- **Issue:** Workspace files are loaded via `JSON.parse(content)` with only a version check. All fields are trusted and applied directly to 8 Zustand stores. No schema validation, no bounds checks. The `file_name` parameter in `write_workspace_file` is also not validated against `../` patterns. Conversation history (up to 200 messages with full tool outputs) is persisted in plain text.
- **Fix:**
  1. Validate workspace files against a Zod schema before applying
  2. Add bounds checks on numeric fields, cap array lengths
  3. Validate `file_name` to reject `/`, `\`, and `..` patterns
  4. Consider encrypting workspace files or stripping sensitive tool outputs

### SEC-12. npx Supply Chain Risk in format_file
- **File:** `src-tauri/src/files/operations.rs:275-309`
- **Severity:** HIGH
- **Status:** NEW
- **Issue:** `format_file` runs `npx prettier --write <path>`. `npx` resolves packages from local/global installs or downloads from npm registry. A malicious `.npmrc` or `package.json` in any ancestor directory could redirect npx to execute arbitrary code.
- **Fix:** Require prettier as a direct project dependency. Use the full absolute path to `node_modules/.bin/prettier` instead of npx.

### SEC-13. MCP Servers Use `@latest` Tags -- Supply Chain Risk
- **File:** `.mcp.json:9,19`
- **Severity:** HIGH
- **Status:** UPGRADED from L4
- **Issue:** `@hypothesi/tauri-mcp-server@latest` and `shadcn@latest` with `npx -y` auto-installs without confirmation. A compromised or typosquatted package at these tags executes arbitrary code.
- **Fix:** Pin to specific versions. Remove `-y` flag.

### SEC-14. Mock Layer Not Tree-Shaken from Production Builds
- **File:** `src/lib/tauriMock.ts:781-783`
- **Severity:** HIGH
- **Status:** NEW
- **Issue:** `mockErrors` is unconditionally assigned to `window.__TAURI_MOCK_ERRORS__` when mocks install. If the `isTauri` check is bypassed (e.g., by deleting `window.__TAURI_INTERNALS__` before check runs), the mock layer activates and all IPC calls become controllable stubs.
- **Fix:** Gate behind `import.meta.env.DEV` so it's tree-shaken from production. Don't expose `mockErrors` on `window`.

### SEC-15. Model/Session ID Parameter Injection in Claude CLI
- **File:** `src-tauri/src/claude/process.rs:77-95`
- **Severity:** HIGH
- **Status:** NEW
- **Issue:** `model` and `resume_session_id` are passed directly as CLI args without validation. A crafted value starting with `--` could be interpreted as an additional CLI flag (e.g., `model: "--dangerously-skip-permissions"` might be misinterpreted by the CLI's arg parser).
- **Fix:** Validate `model` against a whitelist of known model names. Validate `resume_session_id` matches UUID pattern. Reject values starting with `-`.

### SEC-16. `.playwright-mcp/` and `.env*` Not Gitignored
- **Files:** `.gitignore` (missing entries)
- **Severity:** HIGH
- **Status:** NEW
- **Issue:** `.playwright-mcp/` contains 20+ YAML files with page snapshots that could contain sensitive state. `.env*` pattern is incomplete -- only `*.local` is ignored (catches `.env.local` but not `.env` or `.env.production`).
- **Fix:** Add `.playwright-mcp/` and `.env*` to `.gitignore`.

---

## Medium Findings

### SEC-17. Unredacted Secrets in stderr Logging
- **File:** `src-tauri/src/claude/process.rs:258-279`
- **Severity:** MEDIUM
- **Status:** OPEN (from M3)
- **Issue:** Claude CLI stderr is logged verbatim. Error messages containing API keys, tokens, or passwords appear in logs.
- **Fix:** Implement pattern-based redaction (`sk-***`, `Bearer ***`, etc.).

### SEC-18. JSONL Parsing Without Line Length Limits
- **File:** `src-tauri/src/session_search.rs:175-200`
- **Severity:** MEDIUM
- **Status:** OPEN (from M4)
- **Issue:** Session JSONL files parsed line-by-line without length validation. Multi-MB lines cause memory exhaustion.
- **Fix:** Add `MAX_LINE_LENGTH` check (e.g., 1 MB).

### SEC-19. Broad Tauri Capabilities
- **File:** `src-tauri/capabilities/default.json`
- **Severity:** MEDIUM
- **Status:** OPEN (from M6)
- **Issue:** `core:window:*` grants full window control. `pty:default` grants shell access. No window-level scoping.
- **Fix:** Scope capabilities to specific windows. Break `core:window:*` into specific permissions.

### SEC-20. `unsafe-inline` in CSS CSP
- **File:** `src-tauri/tauri.conf.json:28`
- **Severity:** MEDIUM
- **Status:** OPEN (from H2, downgraded -- unavoidable with Tailwind/shadcn)
- **Issue:** `style-src 'self' 'unsafe-inline'` allows inline styles. Required by the current CSS framework stack.
- **Fix:** Largely unavoidable with Tailwind. Low priority unless migrating away from inline styles.

### SEC-21. Source Maps in Production
- **File:** `vite.config.ts`
- **Severity:** MEDIUM
- **Status:** OPEN (from M8)
- **Issue:** No explicit `build: { sourcemap: false }` for production.
- **Fix:** Add `sourcemap: false` to build config.

### SEC-22. Terminal Command Re-run Without Confirmation
- **File:** `src/components/terminal/TerminalInstance.tsx:193-222`
- **Severity:** MEDIUM
- **Status:** NEW
- **Issue:** `handleRerun` and `handleAcceptSuggestion` inject commands directly into PTY without confirmation. ANSI escape sequences in terminal output could alter visible command history, making "re-run" execute a different command than displayed.
- **Fix:** Add confirmation for commands matching destructive patterns. Show exact command before injection.

### SEC-23. CSS Injection via Custom Theme Files
- **File:** `src/lib/themeCustomization.ts:39-55`
- **Severity:** MEDIUM
- **Status:** NEW
- **Issue:** `applyCustomTheme()` reads `~/.vantage/theme.json` and applies every key-value pair as a CSS custom property on `document.documentElement`. No validation of names or values. A crafted theme file could inject `url()` for data exfiltration.
- **Fix:** Validate CSS variable names match `--color-*` pattern. Validate values are valid CSS colors. Reject values containing `url(`, `expression(`.

### SEC-24. Error Messages Leak Internal Paths
- **Files:** Multiple (operations.rs, workspace.rs, hooks/useClaude.ts)
- **Severity:** MEDIUM
- **Status:** NEW
- **Issue:** Error messages include full file paths and Rust error details. Toast errors display `String(err)` which can contain system usernames, filesystem structure, and IPC internals.
- **Fix:** Sanitize error messages before display. Log full errors to console for debugging.

### SEC-25. No Rate Limiting on Claude Session Spawning
- **File:** `src-tauri/src/claude/session.rs:43-65`
- **Severity:** MEDIUM
- **Status:** NEW
- **Issue:** No limit on concurrent sessions. A compromised frontend could spawn hundreds of Claude CLI processes, exhausting system resources.
- **Fix:** Add maximum concurrent session limit (e.g., 10).

### SEC-26. `install_plugin` Executes Arbitrary Plugin Installation
- **File:** `src-tauri/src/plugins.rs:420-438`
- **Severity:** MEDIUM
- **Status:** NEW
- **Issue:** `install_plugin` runs `claude plugins add <name>`. Validation rejects whitespace and `;|&` but allows `@malicious/plugin` to install arbitrary code from the internet.
- **Fix:** Require user confirmation dialog. Validate against known plugins.

### SEC-27. HTML Export Incomplete Escaping
- **File:** `src/lib/slashHandlers.ts:99-162`
- **Severity:** MEDIUM
- **Status:** NEW
- **Issue:** `exportAsHtml()` uses `escapeHtml()` but doesn't escape single quotes. `session?.model` is interpolated without escaping. Tool output truncation at 500 chars could split entity references.
- **Fix:** Escape single quotes. Apply `escapeHtml()` to all dynamic values including `session.model`.

### SEC-28. Streamed Tool Input JSON Accumulation Without Size Limits
- **File:** `src/stores/conversation.ts:219-227`
- **Severity:** MEDIUM
- **Status:** NEW
- **Issue:** `inputJson` accumulates via `input_json_delta` events with no size limit. Malicious Claude response could send megabytes of JSON, causing WebView to freeze or crash.
- **Fix:** Add 1MB size cap on `inputJson` accumulation.

### SEC-29. WebLinksAddon Opens Terminal Links Without Confirmation
- **File:** `src/hooks/useTerminal.ts:69`
- **Severity:** MEDIUM
- **Status:** NEW
- **Issue:** `WebLinksAddon` with default options opens links in the default browser when clicked. Malicious command output containing URLs will be clickable without warning.
- **Fix:** Custom handler that shows confirmation before opening external URLs.

### SEC-30. DOMPurify / Monaco Editor Vulnerabilities (Transitive)
- **File:** `package.json`, `package-lock.json`
- **Severity:** MEDIUM
- **Status:** OPEN (from H1, partially)
- **Issue:** `dompurify <3.3.2` has mutation-XSS CVEs. `monaco-editor` has a moderate vulnerability. Vite CVEs from prior audit may also persist.
- **Fix:** Run `npm audit fix`. Add `overrides` for `dompurify >= 3.3.2`. Update `monaco-editor`.

---

## Low Findings

### SEC-31. Workspace TOCTOU -- Write-Then-Verify
- **File:** `src-tauri/src/workspace.rs:65-92`
- **Severity:** LOW
- **Issue:** `write_workspace_file` writes first, then canonicalizes to verify containment. Temporary window where file exists at unauthorized location via NTFS junctions.
- **Fix:** Canonicalize BEFORE writing.

### SEC-32. File Tree Depth Unbounded
- **File:** `src-tauri/src/lib.rs:33`
- **Severity:** LOW
- **Issue:** `depth: u32` has no upper bound. `u32::MAX` causes excessive recursion.
- **Fix:** Cap at 100.

### SEC-33. Claude stdout Limit Not Enforced
- **File:** `src-tauri/src/claude/process.rs:457-463`
- **Severity:** LOW
- **Issue:** Comment says "max 1 MB" but code does `read_to_end` without limit.
- **Fix:** Use `.take(1_048_576).read_to_end()`.

### SEC-34. `truncate_str` Byte Slicing on UTF-8
- **File:** `src-tauri/src/session_search.rs:582-588`
- **Severity:** LOW
- **Issue:** Slicing at byte position could panic on multi-byte UTF-8.
- **Fix:** Use `s.char_indices()` for safe truncation.

### SEC-35. Git Diff Commit Truncated Empty Tree Hash
- **File:** `src-tauri/src/git.rs:482-493`
- **Severity:** LOW
- **Issue:** Uses 32-char prefix of the 40-char empty tree hash. Could match wrong object in large repos.
- **Fix:** Use full hash `4b825dc642cb6eb9a060e54bf899d69f335e7ba7`.

### SEC-36. Commit Message Over-Validation
- **File:** `src-tauri/src/git.rs:756-774`
- **Severity:** LOW
- **Issue:** Rejects backticks and `$` in commit messages, but `-m` passes the message as a separate arg (no shell interpolation). Unnecessarily restricts legitimate messages.
- **Fix:** Remove shell metacharacter filtering from commit messages since they're passed via `.arg()`.

### SEC-37. ID Generation Uses Math.random()
- **File:** `src/lib/id.ts:9-12`
- **Severity:** LOW
- **Issue:** `Math.random()` is not cryptographically secure. Observable IDs could allow prediction.
- **Fix:** Use `crypto.randomUUID()` (already used in agents store).

### SEC-38. Permission Dialog Keyboard Shortcuts Fire Globally
- **File:** `src/components/permissions/PermissionDialog.tsx:364-386`
- **Severity:** LOW
- **Issue:** Keyboard handler on `window` with `capture: true`. Pressing "Y" in Monaco while permission dialog is open could accidentally approve a permission.
- **Fix:** Only process shortcuts when dialog is focused.

### SEC-39. Command Suggestion Tab Key Fires Globally
- **File:** `src/components/terminal/CommandSuggestion.tsx:298-318`
- **Severity:** LOW
- **Issue:** Tab handler on `window` with `capture: true`. Pressing Tab anywhere injects suggested command.
- **Fix:** Scope to terminal container focus.

### SEC-40. CSP `img-src` Allows All HTTPS Origins
- **File:** `src-tauri/tauri.conf.json:28`
- **Severity:** LOW
- **Issue:** `img-src 'self' data: https:` allows loading images from any HTTPS origin. Enables pixel tracking if XSS is achieved.
- **Fix:** Restrict to known origins if possible.

### SEC-41. Vite Dev Server Binds to TAURI_DEV_HOST
- **File:** `vite.config.ts:19`
- **Severity:** LOW
- **Issue:** When `TAURI_DEV_HOST` is set to `0.0.0.0`, dev server is exposed to local network without auth.
- **Fix:** Document that it should only be `localhost`. Dev-only risk.

---

## Passed Checks (24)

| # | Category | File(s) | Description |
|---|----------|---------|-------------|
| 1 | CSP | `tauri.conf.json` | Uses `wasm-unsafe-eval` (not `unsafe-eval`) -- FIXED since last audit |
| 2 | Vite | `vite.config.ts` | `fs.deny` properly blocks `src-tauri`, `reference-repos`, `.env*` -- FIXED |
| 3 | Command Injection | `git.rs` | Strong input validation (`validate_git_ref`, `validate_commit_hash`, `validate_git_file_path`, `validate_branch_name`) |
| 4 | Command Injection | `search.rs` | Ripgrep queries passed via `.arg()`, no shell interpolation |
| 5 | Command Injection | `files/operations.rs` | Prettier invocation uses separate `.arg()` calls |
| 6 | Path Traversal | `files/operations.rs` | `validate_path()` rejects `..`, sensitive paths, system dirs (though incomplete -- see SEC-01) |
| 7 | Path Traversal | `worktree.rs` | Windows drive volume check enforced |
| 8 | XSS | Frontend | No `dangerouslySetInnerHTML`, `innerHTML`, `eval()`, or `new Function()` in production code |
| 9 | XSS | `MessageBubble.tsx` | `react-markdown` with no `rehype-raw` plugin -- raw HTML stripped |
| 10 | Terminal | `useTerminal.ts` | xterm.js handles ANSI sequences safely |
| 11 | Permissions | `PermissionDialog.tsx` | Cannot be fully bypassed -- session-scoped, queued, risk-assessed |
| 12 | IPC | `useClaude.ts` | Type-checked events, session ID routing, error handling |
| 13 | State | `settings.ts` | No actual secrets in persisted Zustand stores |
| 14 | Upload | `useImagePaste.ts` | 5 image limit, 10 MB cap, MIME whitelist |
| 15 | Links | `MessageBubble.tsx` | `target="_blank" rel="noopener noreferrer"` on external links |
| 16 | Process | `claude/process.rs` | Drop handler cleanup, bounded stderr (100 lines), piped stdio |
| 17 | Git | `lib.rs` | Commit messages as separate args, no shell interpolation |
| 18 | Env | `claude/process.rs` | `CLAUDE_CODE_EFFORT_LEVEL` used as env var (non-injectable) |
| 19 | Symlinks | `files/tree.rs` | File tree includes symlink flag but doesn't follow them |
| 20 | TypeScript | `tsconfig.json` | `strict: true` with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` |
| 21 | Secrets | Full codebase | No hardcoded API keys, tokens, or credentials found |
| 22 | Dependencies | `package-lock.json` | Committed -- deterministic dependency resolution |
| 23 | Prototype Pollution | Frontend | No `Object.assign` with user data, no `__proto__` access patterns |
| 24 | Monaco | `MonacoEditor.tsx` | Read-only diff viewers, no code execution from editor content |

---

## Risk Heat Map

```
                    Impact
            Low         Medium         High         Critical
         +----------+----------+----------+----------+
Trivial  |          | SEC-32   |          |          |
         |          | SEC-35   |          |          |
         +----------+----------+----------+----------+
Easy     | SEC-37   | SEC-21   | SEC-16   | SEC-05   |
Exploit  | SEC-36   | SEC-20   | SEC-14   | SEC-06   |
         | SEC-41   | SEC-29   | SEC-13   | SEC-04   |
         +----------+----------+----------+----------+
Moderate | SEC-38   | SEC-17   | SEC-08   | SEC-01   |
         | SEC-39   | SEC-23   | SEC-09   | SEC-02   |
         | SEC-40   | SEC-24   | SEC-10   |          |
         |          | SEC-25   | SEC-11   |          |
         |          | SEC-27   | SEC-07   |          |
         +----------+----------+----------+----------+
Hard     | SEC-34   | SEC-18   | SEC-15   | SEC-03   |
         | SEC-31   | SEC-28   | SEC-12   |          |
         |          | SEC-22   | SEC-26   |          |
         |          | SEC-30   |          |          |
         +----------+----------+----------+----------+
```

---

## Prioritized Remediation Plan

### Immediate (This Week) -- P0

| # | Finding | Effort | Impact |
|---|---------|--------|--------|
| 1 | SEC-01: Project root sandboxing | Large | Eliminates entire class of path traversal + arbitrary file access |
| 2 | SEC-04: Move MCP bridge to debug-only capability | Small | Prevents accidental production exposure |
| 3 | SEC-16: Add `.playwright-mcp/` and `.env*` to .gitignore | Trivial | Prevents accidental data leaks |
| 4 | SEC-14: Gate mock layer behind `import.meta.env.DEV` | Small | Eliminates IPC takeover in production |
| 5 | SEC-06: Add DOMPurify to CodeBlock shiki output | Small | Closes XSS vector |

### Short-term (2 Weeks) -- P1

| # | Finding | Effort | Impact |
|---|---------|--------|--------|
| 6 | SEC-02: Browser Preview URL validation + sandbox fix | Medium | Closes iframe-based attack chain |
| 7 | SEC-07: Set `withGlobalTauri: false` | Medium | Reduces blast radius of any XSS |
| 8 | SEC-08: Permission auto-approve + skipPermissions guards | Medium | Prevents silent privilege escalation |
| 9 | SEC-09: MCP/Hooks command validation | Medium | Prevents command injection via settings |
| 10 | SEC-11: Workspace schema validation with Zod | Medium | Prevents workspace file injection |
| 11 | SEC-15: Model/session ID parameter validation | Small | Prevents CLI arg injection |
| 12 | SEC-13: Pin MCP server versions | Trivial | Reduces supply chain risk |

### Medium-term (1 Month) -- P2

| # | Finding | Effort | Impact |
|---|---------|--------|--------|
| 13 | SEC-03: Quality gate command hardening | Medium | Prevents command injection |
| 14 | SEC-05: Enable auto-updater | Large | Required before distribution |
| 15 | SEC-10: Link href sanitization | Small | Closes XSS via markdown links |
| 16 | SEC-12: Replace npx with direct prettier path | Small | Reduces supply chain risk |
| 17 | SEC-17: stderr secret redaction | Small | Prevents credential leaks |
| 18 | SEC-21: Disable source maps in production | Trivial | Prevents code exposure |
| 19 | SEC-23: Theme file validation | Small | Prevents CSS injection |
| 20 | SEC-30: npm audit fix | Small | Patches known CVEs |

### Long-term (Before Distribution) -- P3

| # | Finding | Effort | Impact |
|---|---------|--------|--------|
| 21 | SEC-20: Remove `unsafe-inline` from style-src | Large | Requires CSS framework changes |
| 22 | SEC-19: Scope Tauri capabilities per-window | Medium | Defense in depth |
| 23 | SEC-22-29: Terminal, error, and misc hardening | Medium | Various edge case fixes |
| 24 | SEC-31-41: Low-severity items | Small | Cleanup and polish |

---

## Architectural Recommendations

### 1. Project Root Sandbox (Highest Priority)
The single most impactful change: store the active project root in Rust backend state and validate ALL paths against it. This eliminates SEC-01, SEC-02 (partially), SEC-03 (partially), and reduces the blast radius of SEC-07, SEC-08, SEC-09, SEC-11. Estimated effort: 2-3 days. Estimated risk reduction: ~40% of total findings.

### 2. Input Validation Layer
Add a centralized validation module in Rust (`src-tauri/src/validation.rs`) that provides:
- `validate_within_project(path: &str, project_root: &Path) -> Result<PathBuf>`
- `validate_model_name(model: &str) -> Result<String>`
- `validate_session_id(id: &str) -> Result<String>`
- `validate_command(cmd: &str) -> Result<Vec<String>>`
Every IPC command should use these before proceeding.

### 3. Frontend Schema Validation
Add Zod schemas for workspace files, settings, and all IPC responses. Reject malformed data at the boundary rather than trusting `JSON.parse` output. This prevents workspace file injection and state corruption attacks.

### 4. Defense in Depth for XSS
Even though no direct XSS was found, multiple amplifiers exist (withGlobalTauri, mock layer, broad capabilities). The defense strategy should assume XSS will eventually be found and minimize its blast radius:
- `withGlobalTauri: false`
- Gate mocks behind build flags
- Scope capabilities per window
- Add DOMPurify to all DOM injection points

---

*Report generated from 4-agent parallel security analysis of commit `d2a0801` on branch `master`. Total analysis: ~800 seconds across 191 tool calls reading every source file in the project.*
