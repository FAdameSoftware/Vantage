# Audit 3: Workspace Model Deep Audit

**Auditor**: Agent 2 — Workspace Specialist
**Scope**: New ~1,100-line workspace feature (4 files + 8 store integrations)
**Overall Rating**: 6.5/10 — Solid architecture, but critical gaps in concurrency and store coverage

---

## Executive Summary

The Workspace Model has well-structured persistence with proper debouncing and recovery patterns. However, it has **4 CRITICAL issues**: missing store reset (agentConversations), no file locking for multi-instance, silent save failures, and a data loss bug with cursor positions.

---

## Ratings by Category

| Category | Rating | Critical | Medium | Key Issue |
|----------|--------|----------|--------|-----------|
| State Correctness | 7/10 | 1 | 3 | Per-tab cursor position shared globally — data loss on restore |
| Security | 8/10 | 1 | 2 | Missing projectPath validation on load; no sensitive data sanitization |
| Memory Management | 9/10 | 0 | 1 | Excellent cleanup patterns; beforeunload is fire-and-forget |
| Error Handling | 6/10 | 1 | 3 | Silent save failures — no user notification |
| Type Safety | 8/10 | 1 | 2 | agentConversations not workspace-scoped despite CLAUDE.md claim |
| Integration | 5/10 | 1 | 3 | agentConversations never reset or persisted; layout scoping unclear |
| Concurrency | 4/10 | 1 | 2 | No file locking — multi-instance will corrupt workspace files |
| Version Migration | 7/10 | 0 | 0 | Version 1 only; no upgrade path for future schema changes |

---

## Critical Findings

### 1. agentConversations Store Not Reset on Project Switch
- **File**: workspace.ts:391-397
- **Issue**: CLAUDE.md claims 8 stores are workspace-scoped including agentConversations, but it's never reset in openProject or closeProject. No resetToDefaults() method exists.
- **Impact**: Agent conversations from Project A leak into Project B
- **Fix**: Add resetToDefaults() to agentConversations store; call in workspace.ts:394 and 459

### 2. No File Locking — Multi-Instance Corruption
- **Files**: workspaceStorage.ts, workspace.rs
- **Issue**: No flock/mutex/exclusive open. Two Vantage windows on same project will overwrite each other's saves (last-write-wins) or corrupt on concurrent writes.
- **Impact**: Silent data loss
- **Fix**: Add file locking in Rust, or document single-instance requirement

### 3. Silent Save Failures — No User Feedback
- **Files**: workspace.ts:384, 438, 487
- **Issue**: All saveWorkspace() calls catch errors and console.error only. Disk full, permission denied, home dir missing — user has no indication.
- **Fix**: Add isSaveError state, show error toast in UI

### 4. Per-Tab Cursor Position Lost
- **File**: workspace.ts:203
- **Issue**: All tabs save the same global cursorPosition. On restore, every tab gets the active tab's cursor position.
- **Fix**: Track cursor per-tab in EditorTab, or accept cursor as transient and don't persist

---

## Medium Findings

### 5. Missing projectPath Validation on Load
- **File**: workspaceStorage.ts:56-79
- **Issue**: No check that parsed.projectPath matches the project being opened. Swapped workspace files load silently.
- **Fix**: Validate `parsed.projectPath === normalizePath(projectPath)`

### 6. safeParseJson Swallows Errors
- **File**: workspace.ts:106-133
- **Issue**: `safeParseJson()` returns `{}` on parse failure. Tool calls with corrupt inputJson execute with empty params.
- **Fix**: Log warnings, mark conversations as partially corrupted

### 7. Restored Session IDs Can't Actually Resume
- **File**: workspace.ts:286-292
- **Issue**: Session IDs are restored for display but Claude backend won't accept old sessions. Creates false impression of resumability.

### 8. agentConversations Never Persisted
- **File**: workspace.ts:173-229 (collectWorkspaceState)
- **Issue**: Agent conversations are never serialized. Only main conversation persists. Contradicts CLAUDE.md documentation.

### 9. beforeunload Handler is Fire-and-Forget
- **File**: App.tsx:60-68
- **Issue**: saveCurrentWorkspace() called in beforeunload but browser may close before async IPC completes. TitleBar.tsx:46-64 does this correctly (awaits saves).

### 10. Race Condition on Project Switch
- **File**: workspace.ts:374-429
- **Issue**: If save in step 1 doesn't complete before reset in step 2, and reset triggers auto-save, saves could interleave. Low risk (await-ed sequence) but architectural concern.

---

## What Works Well

- Base64url path encoding is safe from traversal
- Corrupt workspace files gracefully degrade to defaults
- Message and timeline capping (MAX_PERSISTED_MESSAGES=200, MAX_TIMELINE_EVENTS=200)
- Agent status downgrade on restore (working -> idle) is correct
- Debounce timer cleanup is proper
- Store subscription cleanup is thorough
- Version field exists for future migration

---

## Recommended Fix Priority

### Do First (Critical)
1. Add agentConversations.resetToDefaults() and call on project switch (5 min)
2. Validate projectPath in loadWorkspace (5 min)
3. Add file locking or document single-instance requirement (1-2 hrs)

### Before Next Release (High)
4. Fix cursor position (per-tab or accept transient)
5. Add error toast for save failures
6. Improve error logging with error object context

### Next Sprint (Medium)
7. Implement agentConversations persistence
8. Add migration framework for future schema versions
9. Clarify layout store workspace scoping in docs
