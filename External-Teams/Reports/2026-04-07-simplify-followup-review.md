# Simplify Audit Follow-Up Review

> **Date:** 2026-04-07
> **Scope:** Verification of 5 remediation commits against 67 original findings
> **Prior audit:** `2026-04-06-full-codebase-simplify-audit.md`
> **Reviewer:** Claude Code (automated, 3 parallel agents)

---

## Remediation Commits Reviewed

| Commit | Message |
|--------|---------|
| `52d11da` | perf: optimize editor selectors to avoid keystroke re-renders |
| `90d8850` | perf: add polling guards, regex validation, filter debounce, PTY cleanup |
| `43ed518` | refactor: split CommandPalette into registry + sub-views |
| `6b0ef56` | refactor: split StatusBar into focused sub-components |
| `e8a7e58` | refactor: split ChatPanel into focused sub-components |
| `8f95fd2` | perf: throttle StreamingPreview to 60fps during streaming |

---

## Scorecard

| Category | FIXED | PARTIALLY FIXED | NOT FIXED | Total |
|----------|-------|-----------------|-----------|-------|
| Reuse (23 findings) | 5 | 7 | 11 | 23 |
| Quality (19 findings) | 5 | 3 | 10 | 18* |
| Efficiency (23 findings) | 9 | 2 | 12 | 23 |
| **Overall** | **19** | **12** | **33** | **64*** |

*\*1 quality finding not verified, 3 findings overlap across categories*

**Overall fix rate: 30% fixed, 19% partially fixed, 51% not fixed.**

---

## What Was Fixed Well

### God-component splits (Quality 1-3) -- all FIXED
The three largest components were split cleanly:

| Component | Before | After | Extracted |
|-----------|--------|-------|-----------|
| StatusBar.tsx | 1,136 lines | 122 lines | 6 sub-components in `status-bar/` |
| CommandPalette.tsx | 1,070 lines | 258 lines | registry + 3 sub-views in `palette/` |
| ChatPanel.tsx | 890 lines | 352 lines | 5 extracted files |

### Streaming performance (Efficiency 3-4) -- FIXED
- `StreamingPreview` now throttles to 60fps via `requestAnimationFrame` instead of re-rendering on every delta
- `activeBlocks` Map no longer cloned on every `content_block_delta` -- mutations happen in-place with a version counter bump

### Polling guards (Efficiency 9, 16, 19, 20) -- FIXED
- `useGitStatus`: `lastRefreshRef` prevents poll within 3s of event-driven refresh; branch + status calls parallelized with `Promise.all`
- `filterTree`: debounced at 150ms instead of running on every keystroke
- `WorkspaceMetadata` port detection: `JSON.stringify` comparison before setState

### Targeted fixes
- `TitleBar` dirty-tabs check returns a primitive boolean -- no re-render on content changes (Eff. 2)
- Agent timeline events capped at 200 via `.slice(-200)` (Eff. 6)
- Sequential agent worktree/branch calls parallelized with `Promise.all` (Eff. 8)
- `stripModelDate` consolidated to single `normalizeModelName` export (Reuse 2)
- `formatDuration`, `formatTimestamp`, `formatRelativeTime` consolidated in `formatters.ts` (Reuse 14-15)
- `MotionConfig reducedMotion="user"` added at app root (Reuse 23)
- `role="application"` removed from root container (Quality 19)

---

## Systemic Issue: Utilities Created but Not Wired Up

The most notable pattern in the partially-fixed findings: **shared utility files were created but never imported by consumers.**

| Utility | File Created | Exports | Importers | Inline Duplicates Remaining |
|---------|-------------|---------|-----------|----------------------------|
| `paths.ts` | Yes | `normalizePath`, `basename`, `relativePath` | **0** | 38 (`.replace(/\\/g, "/")`) + 11 (`.split("/").pop()`) + 6 (`getRelativePath`) |
| `animations.ts` | Yes | `expandVariants`, `expandTransition`, `EASE_SMOOTH`, `DURATION_FAST` | **1** (ThinkingIndicator) | 9 hardcoded easing curves |
| `useClickOutside.ts` | Yes | `useClickOutside` | **3** | 8 inline mousedown implementations |

These represent the highest-ROI follow-up work -- the libraries exist, they just need consumers migrated.

---

## Remaining HIGH-Severity Findings

### Reuse

| # | Finding | Status | Impact |
|---|---------|--------|--------|
| R1 | `paths.ts` created but 0 imports (38+ inline remain) | PARTIALLY | Highest-volume duplication in codebase |
| R4 | `generateId()` still in 3 files, no `id.ts` | NOT FIXED | Inconsistent ID strategies |
| R5 | Stream protocol still duplicated (conversation.ts vs useClaude.ts) | NOT FIXED | Largest single duplication |

### Quality

| # | Finding | Status | Impact |
|---|---------|--------|--------|
| Q4 | `conversation.ts` still 692 lines (god store) | NOT FIXED | Stream logic not extracted |
| Q5 | Cost/tokens triple-tracked across 3 stores | NOT FIXED | Data integrity risk |
| Q6 | Model lists in 2 places, now **inconsistent** (Haiku 4.5 vs 3.5) | NOT FIXED | **Active bug** -- ChatHeader and SessionInfo offer different Haiku versions |
| Q12 | `useClaude.ts` grew from 935 to **1,017 lines** | NOT FIXED | Became worse |

### Efficiency

| # | Finding | Status | Impact |
|---|---------|--------|--------|
| E1 | EditorTabs still subscribes to full `tabs` array | PARTIAL | `useTabsMeta` stabilizes children but host still re-renders per keystroke |
| E5 | Agents store copies entire Map on every mutation (13 actions) | NOT FIXED | GC pressure with many agents |
| E7 | Monaco namespace imported in CommandPalette, commandRegistry, EditorInfo | NOT FIXED | ~3MB pulled into eager-load path |
| E17 | Conversation messages unbounded in-memory | NOT FIXED | Memory growth in long sessions |

---

## New Issue Discovered

### Model list inconsistency (upgraded from NOT FIXED to ACTIVE BUG)

The model list duplication (originally finding Q6) has become **worse** after the refactoring:

- `ChatHeader.tsx:22` -- `CLAUDE_MODELS` includes `claude-haiku-4-5`
- `status-bar/SessionInfo.tsx:14` -- `AVAILABLE_MODELS` includes `claude-haiku-3-5`

Users switching models via the chat header will see Haiku 4.5, while the status bar model selector shows Haiku 3.5. These are different models with different capabilities and pricing.

---

## Recommended Next Steps (Priority Order)

### Immediate (fix the bug)
1. **Unify model lists** -- extract `AVAILABLE_MODELS` to `src/lib/models.ts`, import in both ChatHeader and SessionInfo. Fix the Haiku version discrepancy.

### High-ROI follow-up (wire up existing utilities)
2. **Migrate consumers to `paths.ts`** -- replace 38+ inline `.replace(/\\/g, "/")` calls with `normalizePath()`, 11 `.split("/").pop()` calls with `basename()`, 6 `getRelativePath` implementations with `relativePath()`. The library already exists.
3. **Migrate consumers to `animations.ts`** -- replace 9 hardcoded `[0.4, 0, 0.2, 1]` easing curves with `EASE_SMOOTH` import.
4. **Migrate consumers to `useClickOutside`** -- replace 8 remaining inline mousedown implementations.

### Structural improvements
5. **Extract stream protocol** to `src/lib/streamProtocol.ts` -- deduplicate `assembleMessage`, `extractFromAssistantMessage`, `handleStreamEvent` between conversation.ts and useClaude.ts
6. **Extract `generateId`** to `src/lib/id.ts`
7. **Cap in-memory messages array** in conversation.ts
8. **Replace Monaco namespace imports** in commandRegistry.ts and EditorInfo.tsx with lightweight keybinding constants
9. **Add no-op guard** to StatusBar `fetchDiffStat` polling
10. **Consolidate elapsed time** into a shared `useElapsedTime(startTime)` hook

---

## Metrics

| Metric | Before (Apr 6) | After (Apr 7) | Delta |
|--------|----------------|---------------|-------|
| StatusBar.tsx lines | 1,136 | 122 | -89% |
| CommandPalette.tsx lines | 1,070 | 258 | -76% |
| ChatPanel.tsx lines | 890 | 352 | -60% |
| useClaude.ts lines | 935 | 1,017 | **+9%** |
| conversation.ts lines | 686 | 692 | +1% |
| MenuBar.tsx lines | 828 | 828 | 0% |
| Inline path normalizations | 38+ | 38+ | 0% |
| Streaming re-renders/sec | hundreds | ~60 (throttled) | -90%+ |
| Git poll double-refreshes | yes | guarded | fixed |
