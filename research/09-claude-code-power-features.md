# Claude Code Power Features for Vantage Integration

Source: Community analysis of official Claude Code documentation (2026-04-04)

These are features from Claude Code's docs that most users don't know about. Vantage should surface ALL of them as first-class UI elements.

## 1. ultrathink — Maximum reasoning budget
- Add "ultrathink" anywhere in prompt to allocate max thinking budget
- **Vantage UI**: "Deep Think" toggle button on chat input bar. When enabled, prepends "ultrathink" to the message.
- Also consider an effort level dropdown (low/medium/high/ultrathink)

## 2. /btw — Zero-context-cost side questions
- `/btw <question>` answers in a dismissible overlay, never enters conversation history
- **Vantage UI**: Separate "Quick Question" panel/overlay. Keyboard shortcut (Ctrl+Shift+Q?). Response appears in a popup, not the main chat. Context window untouched.

## 3. Plan Mode + Ctrl+G — Edit plan before execution
- `claude --permission-mode plan` creates plan without touching files
- Ctrl+G opens plan in editor for modification
- **Vantage UI**: "Plan Mode" toggle. When enabled, Claude creates a plan shown in an editable editor tab. User edits, then clicks "Execute Plan" to proceed.

## 4. AskUserQuestion interview mode
- Prompt Claude to interview you before building, extracting requirements
- **Vantage UI**: "Interview Me" quick action in chat. Template prompt that starts the interview flow. Could be a special message type that shows Q&A format.

## 5. Subagents for investigation
- Subagents explore codebase in separate context, report back summary only
- **Vantage UI**: "Investigate" button on files/folders in explorer. Right-click → "Ask Claude to investigate this". Spawns subagent, shows summary in a panel.

## 6. .worktreeinclude — Env files follow worktrees
- Files listed in `.worktreeinclude` auto-copy to new worktrees
- **Vantage UI**: When creating agent worktrees, respect this file. Also show a "Worktree Config" in settings to manage the include list.

## 7. /compact Focus on X — Targeted summarization
- `/compact Focus on the API changes` preserves specific context
- **Vantage UI**: "Compact" button in chat toolbar with an input field: "What to preserve:". Much better than losing everything with /clear.

## 8. CLAUDE_CODE_EFFORT_LEVEL — Default effort level
- Environment variable sets default effort for all sessions
- **Vantage UI**: Settings → "Default Effort Level" dropdown. Per-project and global options. Applied to every session automatically.

## 9. Writer/Reviewer pattern — Two-session code quality
- Session A writes, Session B reviews with fresh context
- **Vantage UI**: "Build & Review" workflow button. Automatically creates two agents: builder and reviewer. Builder writes, reviewer evaluates with fresh context. This maps perfectly to Vantage's existing coordinator/specialist/verifier hierarchy.

## 10. --from-pr — Resume PR context
- `claude --from-pr 247` loads the session that created a PR
- **Vantage UI**: "Resume from PR" button in git panel. Shows list of PRs, click one to load its original session with full context.

## Implementation Priority

P0 (must have — these change daily workflow):
- Effort level setting (8)
- Ultrathink toggle (1)
- /btw side questions (2)
- Targeted compact (7)

P1 (should have — significant value):
- Plan Mode (3)
- Writer/Reviewer workflow (9)
- Subagent investigation (5)
- --from-pr resume (10)

P2 (nice to have):
- Interview mode template (4)
- .worktreeinclude (6)
