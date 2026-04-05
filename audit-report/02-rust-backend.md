# Rust Backend Audit Report

**Auditor**: Agent 2 — Senior Rust/Tauri Engineer
**Scope**: All src-tauri/ modules (~5,895 LOC across 26 Rust files)
**Overall Risk Level**: CRITICAL (security) / MEDIUM (stability)

---

## Executive Summary

Solid foundational architecture with proper async patterns, but contains **multiple security vulnerabilities** (path traversal, command injection, git injection) and incomplete implementations typical of rapid development. **Not suitable for production release** until injection vectors are addressed.

---

## 1. Tauri Commands (lib.rs)

| Severity | Finding | Location |
|----------|---------|----------|
| MEDIUM | `.expect("error while running Vantage")` panics on startup failure instead of graceful shutdown | lib.rs:599-620 |
| LOW | Debug-only `.expect()` for TypeScript bindings export | lib.rs:599 |

---

## 2. Claude Integration (claude/)

### Process Management (process.rs)

| Severity | Finding | Location |
|----------|---------|----------|
| CRITICAL | Unsafe `libc::kill()` — PID reuse attack risk, no validation that child PID is still valid | process.rs:299-301 |
| HIGH | Parse errors in stream readers logged but not propagated to frontend events | process.rs:163-233 |
| HIGH | Unbounded `eprintln!()` for all stderr output — potential log spam | process.rs:247 |
| MEDIUM | Spawn failure only differentiates `NotFound`; generic message for other errors | process.rs:111-119 |

### Protocol Parsing (protocol.rs)

| Severity | Finding | Location |
|----------|---------|----------|
| HIGH | No validation that required fields are present; `Option<T>` used everywhere | All message structs |
| MEDIUM | `#[serde(flatten)]` catch-all `extra: Value` fields hide breaking protocol changes | Lines 137, 154, 232, 277, 289 |

### Session Management (session.rs)

| Severity | Finding | Location |
|----------|---------|----------|
| MEDIUM | No crash detection — returns session ID before verifying Claude CLI actually started | session.rs:41-63 |
| MEDIUM | Session state in memory not persisted; restarting Vantage loses all active sessions | Entire module |
| LOW | Can't map from Claude's session ID back to internal ID (no reverse lookup) | session.rs:40-62 |

---

## 3. File Operations (files/)

| Severity | Finding | Location |
|----------|---------|----------|
| **CRITICAL** | **No path traversal protection** — no canonicalization, no symlink checks, `../../` paths accepted | All of operations.rs |
| HIGH | `fs::remove_dir_all()` silently deletes entire trees with no confirmation or audit trail | operations.rs:156-167 |
| HIGH | Direct `fs::write()` can corrupt files on crash mid-write — no atomic writes | operations.rs:82-94 |
| MEDIUM | File watcher stores only one debouncer; second `start_watching()` call replaces the first | watcher.rs:99-114 |
| MEDIUM | No rate limiting on watcher events — could emit 1000+ events/sec on bulk operations | watcher.rs:69-90 |
| MEDIUM | Symlinks followed by `WalkBuilder`, causing potential infinite cycles in tree | tree.rs:74 |

---

## 4. Git Operations (git.rs)

| Severity | Finding | Location |
|----------|---------|----------|
| **CRITICAL** | **Git injection via file paths** — unsanitized paths in `git show {}:{}` | git.rs:96-118 |
| **CRITICAL** | **Git injection via hash** — no validation that hash matches `^[0-9a-f]{7,40}$` | git.rs:322-345 |
| MEDIUM | Generic error messages hide actual git problems (not a repo, corrupted, permissions) | Throughout git.rs |
| MEDIUM | Assumes `git status --porcelain=v1` format exactly; fragile across git versions | git.rs:145-169 |
| LOW | Blame parser is a brittle state machine without validation | git.rs:259-319 |

---

## 5. Worktree Operations (worktree.rs)

| Severity | Finding | Location |
|----------|---------|----------|
| HIGH | Race condition: `create_dir_all()` then `git worktree add` — intermediate states leave orphaned dirs | worktree.rs:82-108 |
| HIGH | No branch name validation — could inject git options (mitigated by Command::new escaping) | worktree.rs:75-134 |
| MEDIUM | Recursive disk usage walk without depth limit or size cap | worktree.rs:227-268 |
| MEDIUM | `.worktreeinclude` path traversal — `../../secrets.json` copies from outside project | worktree.rs:338-369 |

---

## 6. Merge Queue (merge_queue.rs)

| Severity | Finding | Location |
|----------|---------|----------|
| **CRITICAL** | **Shell command injection** — user input passed directly to `cmd /C` or `sh -c` | merge_queue.rs:22-55 |
| MEDIUM | No timeout on quality gate commands — could hang indefinitely | merge_queue.rs:22-55 |
| MEDIUM | Only detects npm scripts; misses Make, Gradle, Cargo build systems | merge_queue.rs:67-100 |

---

## 7. Search & Indexing (search.rs, indexer.rs)

| Severity | Finding | Location |
|----------|---------|----------|
| MEDIUM | Silently falls back from ripgrep without logging | search.rs:53-61 |
| MEDIUM | Unbounded JSON output parsing from ripgrep — no limit on results | search.rs:122-178 |
| MEDIUM | 1MB file limit for line counting; large codebases underreport LOC | indexer.rs:100-107 |

---

## 8. Plugins (plugins.rs)

| Severity | Finding | Location |
|----------|---------|----------|
| HIGH | `.unwrap()` in `toggle_plugin` could panic despite earlier type check | plugins.rs:384 |
| MEDIUM | Custom YAML parser without schema validation — malformed SKILL.md causes silent field loss | plugins.rs:131-175 |

---

## 9. Other Modules

| Module | Severity | Finding | Location |
|--------|----------|---------|----------|
| prerequisites.rs | HIGH | Windows-only implementation; Unix systems see all checks fail | Entire module |
| terminal/pty_manager.rs | MEDIUM | Empty PTY manager — only shell detection, no actual PTY creation | Entire module |
| checkpoint.rs | MEDIUM | Duplicated ISO8601 conversion also exists in git.rs | checkpoint.rs:34-79 |
| mcp.rs | LOW | No validation that configured MCP command exists on PATH | mcp.rs:59-71 |

---

## Critical Security Vulnerabilities Summary

1. **Path Traversal** (files/operations.rs) — No canonicalization allows `../../` escapes
2. **Git Injection** (git.rs) — Unsanitized paths and hashes in git commands
3. **Shell Injection** (merge_queue.rs) — Direct shell execution of user input
4. **Unsafe Signal Handling** (process.rs) — PID reuse vulnerability in SIGINT

---

## Architectural Recommendations

1. **Create path validation layer** — Canonicalize and verify all paths are within project root
2. **Add command injection prevention** — Use `shlex::parse()` for shell commands, validate git refs
3. **Replace `Result<T, String>` with typed errors** — Custom error enum with specific variants
4. **Implement session persistence** — Checkpoint state to survive restarts
5. **Add resource limits** — Max 10K search results, 100MB file index, 60s gate timeout

**Recommendation: Delay production release until path traversal and injection risks are addressed.**
