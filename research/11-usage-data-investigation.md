# Usage & Session Data Investigation: How Claude Code Exposes Usage Information

**Date**: 2026-04-04
**Purpose**: Document every mechanism by which Claude Code CLI, Claude Code Desktop, and third-party wrappers obtain real-time usage and session data. No assumptions -- only verified mechanisms.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Mechanism 1: Bootstrap State (Internal CLI)](#2-mechanism-1-bootstrap-state-internal-cli)
3. [Mechanism 2: stream-json Protocol Messages](#3-mechanism-2-stream-json-protocol-messages)
4. [Mechanism 3: The Statusline JSON Contract](#4-mechanism-3-the-statusline-json-contract)
5. [Mechanism 4: The /usage Interactive Command](#5-mechanism-4-the-usage-interactive-command)
6. [Mechanism 5: OAuth Usage API Endpoint](#6-mechanism-5-oauth-usage-api-endpoint)
7. [Mechanism 6: Anthropic API Rate Limit Headers](#7-mechanism-6-anthropic-api-rate-limit-headers)
8. [Mechanism 7: JSONL Session File Parsing](#8-mechanism-7-jsonl-session-file-parsing)
9. [Mechanism 8: Agent SDK Methods](#9-mechanism-8-agent-sdk-methods)
10. [Mechanism 9: Usage & Cost Admin API](#10-mechanism-9-usage--cost-admin-api)
11. [Mechanism 10: Claude Code Analytics API](#11-mechanism-10-claude-code-analytics-api)
12. [What Does NOT Exist (Yet)](#12-what-does-not-exist-yet)
13. [How Other Wrappers Get This Data](#13-how-other-wrappers-get-this-data)
14. [Implications for Vantage](#14-implications-for-vantage)

---

## 1. Executive Summary

There are **10 distinct mechanisms** for obtaining usage data from Claude Code, each with different capabilities:

| Mechanism | Scope | Real-Time | Plan Limits | Per-Session Cost | Auth Required | Available to Wrappers |
|-----------|-------|-----------|-------------|------------------|---------------|----------------------|
| Bootstrap State | Internal only | Yes | No | Yes | N/A | No (internal) |
| stream-json messages | Per-turn | Yes | No | Yes (on `result`) | Session | **Yes** |
| Statusline JSON | Per-session | Yes | **Yes** (since v1.2.80) | Yes | Session | **Partially** (CLI-internal) |
| /usage command | Interactive | Yes | **Yes** | Yes | OAuth | No (interactive only) |
| OAuth Usage API | Account-wide | Near-real-time | **Yes** | No | OAuth token | **Yes** (if you have token) |
| API Rate Limit Headers | Per-request | Yes | **Yes** (API key users) | No | API key | **Yes** (if direct API) |
| JSONL Session Files | Historical | No (post-hoc) | No | Yes | Filesystem | **Yes** |
| Agent SDK methods | Per-session | Yes | Partial | Yes | SDK session | **Yes** |
| Usage & Cost Admin API | Organization | 5-min delay | No | Yes | Admin API key | Org admins only |
| Claude Code Analytics API | Organization | Delayed | No | No (aggregate) | Admin API key | Org admins only |

**Bottom line for Vantage**: The primary real-time usage data comes from **stream-json `result` messages** (per-turn tokens and cost). Plan-level usage limits (5-hour and 7-day windows) are available through the **OAuth Usage API** (`/api/oauth/usage`) if you have the OAuth token, or through the **statusline JSON** contract if running within a Claude Code session.

---

## 2. Mechanism 1: Bootstrap State (Internal CLI)

### What It Is

Claude Code's terminal UI uses an internal singleton at `src/bootstrap/state.ts` (1,758 lines) that accumulates session metadata and API costs in real-time.

### How It Works

- Every API response updates `input_tokens`, `output_tokens`, and `cache_creation_input_tokens` counters
- USD cost is calculated using model-specific pricing tables
- The `<StatsProvider>` React context makes this data available to the `<PromptInputFooter>` component
- The footer renders cost, token count, and session duration in the terminal UI

### What Data Is Tracked

- Per-session: input/output/cache tokens, USD cost, turn count, duration
- Agent state: agent ID, team, parent session
- Context window: current usage vs. limit
- Rate limit state: received from API response headers internally

### Can Vantage Use This?

**No.** This is internal to the Claude Code process. Wrappers cannot access this state directly. However, the same data is exposed via the stream-json protocol and the statusline contract.

---

## 3. Mechanism 2: stream-json Protocol Messages

### What It Is

When Claude Code runs with `--output-format stream-json`, every message includes usage data. This is the primary mechanism for wrappers.

### Exact Fields Available

#### 3.1 `system/init` Message (session start)

```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "d8af951f-13ac-4a41-9748-7a7b9a6cfc00",
  "tools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
  "mcp_servers": [{"name": "playwright", "status": "connected"}],
  "model": "claude-opus-4-6-20250415",
  "permissionMode": "default",
  "apiKeySource": "anthropic_api_key",
  "claude_code_version": "2.1.88",
  "cwd": "/Users/me/project",
  "slash_commands": ["/commit", "/review"],
  "agents": ["explore", "plan"],
  "skills": ["commit", "review-pr"],
  "plugins": [],
  "output_style": "concise",
  "betas": []
}
```

**Usage-relevant fields**: `model`, `apiKeySource` (tells you if OAuth or API key).

**Does NOT contain**: Plan info, usage limits, remaining quota, cost data.

#### 3.2 `assistant` Message (per-turn)

```json
{
  "type": "assistant",
  "message": {
    "usage": {
      "input_tokens": 1500,
      "output_tokens": 350,
      "cache_creation_input_tokens": 0,
      "cache_read_input_tokens": 1200
    }
  }
}
```

**Usage-relevant fields**: Per-turn token breakdown including cache tokens. Available on every assistant turn.

#### 3.3 `stream_event` / `message_delta` (streaming)

```json
{
  "type": "stream_event",
  "event": {
    "type": "message_delta",
    "delta": {"stop_reason": "tool_use"},
    "usage": {"output_tokens": 350}
  }
}
```

**Usage-relevant fields**: Running output token count during streaming.

#### 3.4 `result` Message (session/query complete) -- **RICHEST USAGE DATA**

```json
{
  "type": "result",
  "subtype": "success",
  "duration_ms": 45000,
  "duration_api_ms": 38000,
  "is_error": false,
  "num_turns": 5,
  "total_cost_usd": 0.0234,
  "usage": {
    "input_tokens": 15000,
    "output_tokens": 3500,
    "cache_creation_input_tokens": 5000,
    "cache_read_input_tokens": 8000
  },
  "modelUsage": {
    "claude-opus-4-6-20250415": {
      "input_tokens": 15000,
      "output_tokens": 3500
    }
  },
  "permission_denials": []
}
```

**Usage-relevant fields**:
- `total_cost_usd` -- USD cost for the entire query
- `usage` -- Cumulative token breakdown (input, output, cache creation, cache read)
- `modelUsage` -- Per-model token breakdown (critical for multi-model sessions)
- `duration_ms` -- Wall clock time
- `duration_api_ms` -- API time only (excludes tool execution)
- `num_turns` -- Number of agentic turns

**Does NOT contain**: Plan limits, remaining quota, 5-hour/7-day window usage.

#### 3.5 `system/api_retry` (rate limit events)

```json
{
  "type": "system",
  "subtype": "api_retry",
  "attempt": 1,
  "max_retries": 10,
  "retry_delay_ms": 5000,
  "error_status": 429,
  "error": "rate_limit"
}
```

**Usage-relevant fields**: Indicates rate limiting is occurring. `error_status: 429` means you've hit a limit.

#### 3.6 `auth_status` (authentication state)

Emitted when authentication status changes. Contains auth state but not plan details.

### Can Vantage Use This?

**Yes -- this is the primary real-time data source.** Vantage already accumulates this in `src/stores/usage.ts` via `addTurnUsage()`.

---

## 4. Mechanism 3: The Statusline JSON Contract

### What It Is

Claude Code's statusline feature (configurable via `settings.json`) pipes a JSON object to a user-specified script via stdin on every state change. This JSON contract is the most complete real-time data surface.

### How to Configure

In `~/.claude/settings.json`:
```json
{
  "statusLine": "/path/to/statusline-script.sh"
}
```

The script receives the JSON on stdin and prints formatted output to stdout.

### Complete JSON Schema (as of v2.1.x)

```json
{
  "model": {
    "id": "claude-opus-4-6-20250415",
    "display_name": "Claude Opus 4.6"
  },
  "context_window": {
    "used_percentage": 12.4,
    "context_window_size": 200000,
    "total_input_tokens": 45000,
    "total_output_tokens": 12000
  },
  "current_usage": {
    "input_tokens": 1500,
    "output_tokens": 350,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 1200
  },
  "cost": {
    "total_cost_usd": 0.04,
    "total_lines_added": 42,
    "total_lines_removed": 7,
    "total_duration_ms": 3600000
  },
  "workspace": {
    "current_dir": "/Users/me/project"
  },
  "worktree": {
    "name": "my-feature-branch"
  },
  "session_id": "d8af951f-...",
  "rate_limits": {
    "five_hour": {
      "used_percentage": 42,
      "resets_at": 1742651200
    },
    "seven_day": {
      "used_percentage": 18,
      "resets_at": 1743120000
    }
  }
}
```

### Key Fields Explained

| Field | Description | When Available |
|-------|-------------|----------------|
| `model.id` / `model.display_name` | Current model | Always |
| `context_window.used_percentage` | Context fill % (input tokens only) | After first API call |
| `context_window.context_window_size` | Max context tokens | Always |
| `current_usage.*` | Token breakdown for current turn | After first API call; `null` before |
| `cost.total_cost_usd` | Session cost in USD | After first API call |
| `cost.total_lines_added/removed` | Code change metrics | After edits |
| `cost.total_duration_ms` | Session wall time | Always |
| `session_id` | Session UUID | Always |
| `rate_limits.five_hour` | 5-hour rolling window usage | **OAuth subscribers only** (Pro/Max) |
| `rate_limits.seven_day` | 7-day rolling window usage | **OAuth subscribers only** (Pro/Max) |

### Critical Notes

1. `used_percentage` in `context_window` is calculated from input tokens only: `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` (does NOT include output_tokens)
2. `current_usage` is `null` before the first API call in a session
3. `rate_limits` is **only present for Claude.ai subscribers** (Pro/Max). API key users do NOT get this field
4. `rate_limits` was added in Claude Code v1.2.80 (late 2025)

### Can Vantage Use This?

**Partially.** The statusline contract is designed for scripts running inside the Claude Code process. A wrapper like Vantage cannot directly read this JSON -- it's piped to the statusline script, not to stream-json output. However, Vantage could:
- Configure a statusline script that writes the JSON to a file that Vantage watches
- Or call the same underlying `/api/oauth/usage` endpoint directly (see Mechanism 5)

---

## 5. Mechanism 4: The /usage Interactive Command

### What It Is

The `/usage` command is an interactive command available within Claude Code's terminal UI. It renders a visual panel showing plan usage.

### What It Shows

- Current session usage percentage
- 5-hour rolling window usage percentage + reset time
- 7-day rolling window usage percentage + reset time
- Per-model usage breakdown (e.g., separate Opus/Sonnet quotas)
- Visual usage bars

### How It Gets Data

Internally, `/usage` calls the OAuth Usage API endpoint (`https://api.anthropic.com/api/oauth/usage`) using the stored OAuth token. It does NOT calculate this locally -- it fetches from Anthropic's backend.

### Can Vantage Use This?

**No directly.** The `/usage` command is interactive-only. It renders in the terminal UI and is not available via `--output-format stream-json` or any CLI flag. There is no `claude /usage` or `claude --usage` standalone command.

However, Vantage can call the same API endpoint directly (see Mechanism 5).

---

## 6. Mechanism 5: OAuth Usage API Endpoint

### What It Is

This is the **actual HTTP API endpoint** that Claude Code calls internally to get plan-level usage data.

### Endpoint

```
GET https://api.anthropic.com/api/oauth/usage
```

### Request

```http
GET /api/oauth/usage HTTP/1.1
Host: api.anthropic.com
Accept: application/json
Content-Type: application/json
Authorization: Bearer sk-ant-oat01-...
User-Agent: claude-code/2.1.88
anthropic-beta: oauth-2025-04-20
```

### Response

```json
{
  "five_hour": {
    "utilization": 6.0,
    "resets_at": "2025-11-04T04:59:59.943648+00:00"
  },
  "seven_day": {
    "utilization": 35.0,
    "resets_at": "2025-11-06T03:59:59.943679+00:00"
  },
  "seven_day_oauth_apps": null,
  "seven_day_opus": {
    "utilization": 0.0,
    "resets_at": null
  },
  "iguana_necktie": null
}
```

### Field Descriptions

| Field | Description |
|-------|-------------|
| `five_hour.utilization` | Percentage (0-100) of 5-hour rolling window used |
| `five_hour.resets_at` | ISO 8601 timestamp when the 5-hour window resets |
| `seven_day.utilization` | Percentage (0-100) of 7-day rolling window used |
| `seven_day.resets_at` | ISO 8601 timestamp when the 7-day window resets |
| `seven_day_oauth_apps` | Usage by OAuth apps (null if not applicable) |
| `seven_day_opus` | Separate usage tracking for Opus model (has its own quota) |
| `iguana_necktie` | Internal/unknown field (null in observed responses) |

### Authentication

Requires an **OAuth Bearer token** (`sk-ant-oat01-...`), NOT an API key. This token is obtained through Claude Code's OAuth login flow and stored:
- **macOS**: System Keychain under service name "Claude Code-credentials"
- **Other platforms**: `~/.claude/.credentials.json`

The credentials JSON contains:
```json
{
  "accessToken": "sk-ant-oat01-...",
  "refreshToken": "...",
  "expiresAt": "2027-02-18T07:00:00.000Z"
}
```

### Rate Limits on This Endpoint

The endpoint itself is rate-limited. Issue #31021 reports persistent 429 errors. Poll no more than once per minute.

### Who Can Use This

- **Pro/Max subscribers**: Yes (they have OAuth tokens)
- **API key users**: No (this endpoint requires OAuth, not API keys)
- **Team/Enterprise users**: Yes (they authenticate via OAuth)

### Can Vantage Use This?

**Yes, if the user has an OAuth token.** Vantage would need to:
1. Read the OAuth token from `~/.claude/.credentials.json` (or macOS Keychain)
2. Call `GET https://api.anthropic.com/api/oauth/usage` with the token
3. Poll periodically (no more than once per minute)
4. Handle 429 errors gracefully

**This is the ONLY way to get plan-level usage limits programmatically for subscription users.**

---

## 7. Mechanism 6: Anthropic API Rate Limit Headers

### What They Are

Every Anthropic Messages API response includes rate limit headers. These are for **API key users**, not OAuth subscribers.

### Complete Header List

| Header | Description |
|--------|-------------|
| `anthropic-ratelimit-requests-limit` | Maximum requests per minute |
| `anthropic-ratelimit-requests-remaining` | Requests remaining in current window |
| `anthropic-ratelimit-requests-reset` | ISO 8601 timestamp when request limit resets |
| `anthropic-ratelimit-tokens-limit` | Maximum tokens per minute (most restrictive) |
| `anthropic-ratelimit-tokens-remaining` | Tokens remaining in current window |
| `anthropic-ratelimit-tokens-reset` | ISO 8601 timestamp when token limit resets |
| `anthropic-ratelimit-input-tokens-limit` | Input token limit |
| `anthropic-ratelimit-input-tokens-remaining` | Input tokens remaining |
| `anthropic-ratelimit-output-tokens-limit` | Output token limit |
| `anthropic-ratelimit-output-tokens-remaining` | Output tokens remaining |
| `retry-after` | Seconds to wait (only on 429 responses) |

### Critical Notes

1. The `anthropic-ratelimit-tokens-*` headers show the **most restrictive limit** currently in effect
2. These headers appear on **both successful and failed** responses
3. For Workspace users, if Workspace per-minute limits are hit, headers show Workspace limits; otherwise, they show total limits
4. **These headers are NOT exposed by Claude Code to wrappers** -- Claude Code consumes the API internally and does not forward response headers

### Can Vantage Use This?

**Not directly.** Claude Code makes the API calls, not Vantage. The response headers are consumed internally by the CLI and not exposed through stream-json output.

There is an active feature request (Issue #33820) to expose these headers to hooks and statusline scripts, but as of April 2026 this has not been implemented.

If Vantage were to call the Anthropic API directly (bypassing Claude Code), it would get these headers. But that defeats the purpose of wrapping Claude Code.

---

## 8. Mechanism 7: JSONL Session File Parsing

### What It Is

Claude Code writes session transcripts as JSONL files to disk. These can be parsed retrospectively.

### Location

```
~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl
```

Where `<encoded-cwd>` replaces every non-alphanumeric character with `-`:
- `/Users/me/project` becomes `-Users-me-project`
- `C:\Users\me\project` becomes `C--Users-me-project`

### What Each JSONL Record Contains

Each line is a JSON object with these fields:

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"user"`, `"assistant"`, `"tool_result"`, `"summary"` |
| `uuid` | string | Unique record ID |
| `parentUuid` | string | null | Previous record (linked list) |
| `message` | object | Anthropic API message format |
| `message.usage` | object | Token breakdown for this turn |
| `timestamp` | string | ISO 8601 timestamp |
| `isSynthetic` | boolean | Whether this is a synthetic/injected message |
| `cacheStats` | object | null | Cache hit/miss details |

### Token Data in JSONL

Each `assistant` type record includes `message.usage`:
```json
{
  "input_tokens": 1500,
  "output_tokens": 350,
  "cache_creation_input_tokens": 0,
  "cache_read_input_tokens": 1200
}
```

### How Third-Party Tools Parse This

**ccusage** (`npx ccusage`) is the most popular tool:
- Reads `~/.claude/projects/*/sessions/*.jsonl` files line-by-line
- Sums `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`
- Calculates cost using model pricing tables
- Provides daily, monthly, session, and 5-hour block reports

**claude-devtools** extracts 7 context categories and provides per-turn token attribution.

### What This Does NOT Contain

- Plan-level usage limits (5-hour/7-day percentages)
- Rate limit state
- Account information
- Subscription type

### Can Vantage Use This?

**Yes.** Vantage already has `get_project_usage` Rust command that parses JSONL files. This provides historical/retrospective usage data. Good for the usage dashboard, not for real-time plan limits.

---

## 9. Mechanism 8: Agent SDK Methods

### What It Is

The Claude Agent SDK TypeScript package (`@anthropic-ai/claude-agent-sdk`) provides methods on the `Query` object for querying runtime state.

### Available Methods

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  // Usage-relevant methods:
  accountInfo(): Promise<AccountInfo>;
  supportedModels(): Promise<ModelInfo[]>;
  mcpServerStatus(): Promise<McpServerStatus[]>;
  initializationResult(): Promise<SDKControlInitializeResponse>;
}
```

### `accountInfo()` Method

Returns a `Promise<AccountInfo>`. The exact interface is not fully documented in public docs, but based on source analysis it likely returns:
- Account type (API key vs. OAuth subscription)
- Possibly plan tier (Pro/Max/Team/Enterprise)
- Possibly available models

**Important caveat**: The specifics of `AccountInfo` are not well-documented. The Agent SDK is still pre-1.0 (v0.2.x), and the interface may change.

### `SDKRateLimitEvent` Message Type

The SDK message union includes `SDKRateLimitEvent`, suggesting rate limit events can be received as messages during streaming. This is likely emitted when the API returns 429 or when rate limit headers indicate approaching limits.

### Cost Data from SDK Messages

The SDK's `SDKResultMessage` includes:
- `total_cost_usd: number` -- USD cost for the query
- `usage: NonNullableUsage` -- Cumulative token breakdown
- `modelUsage: { [modelName: string]: ModelUsage }` -- Per-model breakdown

**Deduplication warning**: Parallel tool calls produce multiple `assistant` messages sharing the same `message.id` and identical `usage`. Always deduplicate by ID.

### Can Vantage Use This?

**Yes, if using the Agent SDK sidecar pattern.** The SDK provides the same data as stream-json but with typed interfaces. The `accountInfo()` method is an additional data source not available through raw stream-json.

---

## 10. Mechanism 9: Usage & Cost Admin API

### What It Is

An Admin API endpoint for organizations to track API usage and costs.

### Endpoint

```
GET /v1/organizations/usage_report/messages
```

### Requirements

- **Admin API key** (starts with `sk-ant-admin...`)
- Only available to organization members with admin role
- Provisioned through Claude Console

### What It Returns

- Token consumption breakdown by model, workspace, service tier
- Uncached input, cached input, cache creation, and output tokens
- Filtering/grouping by API key, workspace, model, service tier, context window, data residency, speed
- Server-side tool usage (e.g., web search)

### Limitations

- Data typically appears within 5 minutes of API request completion
- Rate-limited to once per minute polling
- **Only for organization/Console users, not individual subscribers**

### Can Vantage Use This?

**Only for enterprise/team users.** Not applicable to individual Pro/Max subscribers.

---

## 11. Mechanism 10: Claude Code Analytics API

### What It Is

A separate API for organizations to track Claude Code-specific productivity metrics.

### Endpoint

```
GET /v1/organizations/usage_report/claude_code
```

### What It Returns

- Activity metrics (sessions, duration)
- Suggestion accept rate
- Lines of code accepted
- Spend/adoption data
- Developer-level breakdowns

### Requirements

- Team, Enterprise, or Console accounts
- Admin API key

### Can Vantage Use This?

**Only for enterprise/team users.** Not applicable to individual users.

---

## 12. What Does NOT Exist (Yet)

These mechanisms have been **requested by the community but do NOT exist** as of April 2026:

### No `claude usage --json` CLI Command

There is no standalone CLI command to get usage data without starting a session. The `/usage` command only works in interactive mode.

**Relevant issues:**
- Issue #24459: "Expose /usage plan usage data programmatically (hooks, CLI, or local file)"
- Issue #32796: "Expose Max plan usage limits via Claude Code API/SDK"
- Issue #38380: "Expose usage/rate limit data via CLI flag or hook event"

### No Usage Data in Hook Inputs

Hooks (PreToolUse, PostToolUse, SessionEnd, etc.) do not receive usage data in their input.

**Relevant issues:**
- Issue #11008: "Expose token usage and cost data in hook inputs"
- Issue #38344: "Expose account usage % to hooks and CLI"

### No Local Usage Cache File

Claude Code does not write a `~/.claude/usage.json` or similar file with current plan status.

**Relevant issue:**
- Issue #21943: "Expose subscription usage data via local file or API"

### No Rate Limit Headers in stream-json

The Anthropic API returns `anthropic-ratelimit-*` headers on every response, but Claude Code does NOT forward these to the stream-json output.

**Relevant issue:**
- Issue #33820: "Expose API rate-limit response headers to hooks and statusline scripts"

### No Plan Info in system/init

The `system/init` message does not include plan type, subscription tier, or usage limits.

**Relevant issue:**
- Issue #26219: "Expose Plan Quota/Usage Data to StatusLine"

---

## 13. How Other Wrappers Get This Data

### Opcode (21.3k stars) -- Filesystem Reading

- Reads `~/.claude/projects/` JSONL files for session history
- Parses token counts from JSONL records
- Calculates cost using model pricing tables
- **Cannot** get plan-level limits (5-hour/7-day windows)
- **Cannot** show real-time usage of active sessions

### claude-devtools (2.9k stars) -- Passive JSONL Parsing

- Reads `~/.claude/projects/<encoded-cwd>/*.jsonl` files
- Reconstructs full execution trace
- Per-turn token attribution across 7 context categories
- Pairs tool invocations with results
- Resolves subagent sessions from Task tool calls
- SSH remote reading via SFTP for remote machines
- **Cannot** get plan-level limits
- **Cannot** interact with running sessions

### Companion (2.3k stars) -- WebSocket Protocol

- Uses `--sdk-url` WebSocket flag (undocumented)
- Receives all stream-json messages over WebSocket
- Gets per-turn usage from `assistant` messages and `result` messages
- Records raw protocol messages to `~/.companion/recordings/`
- **Does NOT** access plan-level limits (no OAuth usage endpoint integration found)

### Kanna (459 stars) -- Agent SDK

- Uses `@anthropic-ai/claude-agent-sdk` directly
- Gets typed `SDKResultMessage` with `total_cost_usd` and `usage`
- Event sourcing pattern accumulates all usage data
- **Likely** does not access plan-level limits

### CodePilot (5.0k stars) -- Agent SDK + JSONL Import

- Uses `@anthropic-ai/claude-agent-sdk ^0.2.62` for live sessions
- Can import Claude Code CLI JSONL session files
- Gets per-session cost from SDK result messages
- **Unclear** if it accesses plan-level limits

### cmux (12.5k stars) -- Pure Terminal

- **Cannot** access Claude Code's internal state at all
- No token/cost visibility (confirmed limitation in their docs)
- Pure PTY/terminal approach means no data interception

### Caudex -- Terminal + Session Monitoring

- Monitors context usage and costs (likely from session files or terminal parsing)
- Provides "context and cost monitoring overlay"
- **Unclear** exact mechanism -- closed source

### ccusage (Community Tool) -- JSONL Analysis

- Pure post-hoc analysis of `~/.claude/projects/*/sessions/*.jsonl`
- Sums tokens and calculates costs from JSONL records
- Provides daily, monthly, session, and 5-hour block views
- The "blocks" command estimates 5-hour billing window consumption from local data
- **Does NOT** query the OAuth usage API -- it estimates from token counts

---

## 14. Implications for Vantage

### What Vantage Already Has

The `src/stores/usage.ts` store accumulates per-turn usage from stream-json messages:
- `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`
- `totalCostUsd`
- `turnCount`
- `rateLimitInfo` (placeholder -- not populated from actual data yet)
- Project-level historical usage via `get_project_usage` Rust command

### What Vantage Should Add

#### Priority 1: Rich stream-json Usage Extraction

The `result` message contains the richest data. Ensure Vantage extracts ALL fields:
- `total_cost_usd` (already handled)
- `modelUsage` (per-model breakdown -- NOT currently extracted)
- `duration_ms` and `duration_api_ms` (wall vs. API time)
- `num_turns` (already handled as `turnCount`)
- Deduplicate parallel tool call `assistant` messages by `message.id`

#### Priority 2: OAuth Usage API Integration

For subscription users (Pro/Max), implement:

```rust
// In src-tauri/src/claude/ or a new usage.rs module
async fn get_plan_usage() -> Result<PlanUsage> {
    // 1. Read OAuth token from ~/.claude/.credentials.json
    // 2. GET https://api.anthropic.com/api/oauth/usage
    //    Authorization: Bearer <token>
    //    anthropic-beta: oauth-2025-04-20
    // 3. Parse response into PlanUsage struct
    // 4. Cache result for 60 seconds (don't poll more than 1/min)
}

struct PlanUsage {
    five_hour_utilization: f64,      // 0-100
    five_hour_resets_at: Option<String>,  // ISO 8601
    seven_day_utilization: f64,      // 0-100
    seven_day_resets_at: Option<String>,
    seven_day_opus_utilization: Option<f64>,
    seven_day_opus_resets_at: Option<String>,
}
```

This gives Vantage the same data the `/usage` command shows, without requiring an active CLI session.

#### Priority 3: Detect Auth Type

Check `apiKeySource` from the `system/init` message:
- If `"anthropic_api_key"` -- user has API key, no plan limits available
- If OAuth-based -- user has subscription, plan limits available via OAuth API

Show different UI for each:
- API key users: Show per-request rate limit info (from `api_retry` events)
- OAuth users: Show 5-hour and 7-day usage bars

#### Priority 4: Populate rateLimitInfo

The `UsageState.rateLimitInfo` field is defined but never populated. Fill it from:
- `system/api_retry` events (when rate limits are hit)
- The OAuth usage API response (for plan-level limits)

#### Priority 5: JSONL Historical Dashboard

The `get_project_usage` Rust command already parses JSONL files. Extend to:
- Per-session breakdown (cost, tokens, model, duration)
- Daily/weekly aggregation
- Model distribution (pie chart data)
- This data feeds the `UsageDashboard`, `CostChart`, `ModelDistribution`, `SessionsPerDay` components

### Architecture Summary

```
┌─────────────────────────────────────────┐
│              React Frontend             │
│  ┌──────────┐  ┌──────────┐  ┌───────┐ │
│  │ StatusBar│  │Usage Dash│  │Session│ │
│  │ (live)   │  │(historic)│  │Detail │ │
│  └────┬─────┘  └────┬─────┘  └───┬───┘ │
│       │              │            │     │
│  ┌────┴──────────────┴────────────┴───┐ │
│  │         Zustand: useUsageStore     │ │
│  └────┬───────────────┬───────────────┘ │
│       │               │                 │
│  Tauri IPC        Tauri IPC             │
├───────┼───────────────┼─────────────────┤
│       │               │   Rust Backend  │
│  ┌────┴────┐    ┌─────┴──────┐          │
│  │ Claude  │    │ Usage API  │          │
│  │ Process │    │ Poller     │          │
│  │ Manager │    │ (1/min)    │          │
│  └────┬────┘    └─────┬──────┘          │
│       │               │                 │
│  stream-json    GET /api/oauth/usage    │
│  (per-turn)     (plan limits)           │
│       │               │                 │
│  ┌────┴────┐    ┌─────┴──────┐          │
│  │ Claude  │    │ Anthropic  │          │
│  │ Code CLI│    │ API        │          │
│  └─────────┘    └────────────┘          │
│                                         │
│  ┌──────────────────┐                   │
│  │ JSONL Parser     │ (historical)      │
│  │ ~/.claude/       │                   │
│  └──────────────────┘                   │
└─────────────────────────────────────────┘
```

Three data flows:
1. **Real-time session data**: stream-json `assistant` and `result` messages -> usage store
2. **Plan-level limits**: OAuth usage API polling (1/min) -> plan usage store
3. **Historical data**: JSONL file parsing on demand -> usage dashboard

---

## Sources

### Official Documentation
- [Customize your status line - Claude Code Docs](https://code.claude.com/docs/en/statusline)
- [Manage costs effectively - Claude Code Docs](https://code.claude.com/docs/en/costs)
- [Track cost and usage - Claude Agent SDK Docs](https://platform.claude.com/docs/en/agent-sdk/cost-tracking)
- [Rate limits - Anthropic API Docs](https://platform.claude.com/docs/en/api/rate-limits)
- [Usage and Cost API - Anthropic API Docs](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api)
- [Claude Code Analytics API - Anthropic API Docs](https://platform.claude.com/docs/en/build-with-claude/claude-code-analytics-api)
- [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Authentication - Claude Code Docs](https://code.claude.com/docs/en/authentication)

### Community Feature Requests (Claude Code GitHub)
- [Issue #32796: Expose Max plan usage limits via API/SDK](https://github.com/anthropics/claude-code/issues/32796)
- [Issue #38344: Expose account usage % to hooks and CLI](https://github.com/anthropics/claude-code/issues/38344)
- [Issue #24459: Expose /usage plan usage data programmatically](https://github.com/anthropics/claude-code/issues/24459)
- [Issue #33820: Expose API rate-limit response headers to hooks and statusline](https://github.com/anthropics/claude-code/issues/33820)
- [Issue #26219: Expose Plan Quota/Usage Data to StatusLine](https://github.com/anthropics/claude-code/issues/26219)
- [Issue #38380: Expose usage/rate limit data via CLI flag or hook event](https://github.com/anthropics/claude-code/issues/38380)
- [Issue #11008: Expose token usage and cost data in hook inputs](https://github.com/anthropics/claude-code/issues/11008)

### Community Tools and Analysis
- [ccusage - CLI tool for analyzing Claude Code usage from JSONL files](https://github.com/ryoppippi/ccusage)
- [Claude Code Usage Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor)
- [claude-code-usage-bar - Real-time statusline](https://github.com/leeguooooo/claude-code-usage-bar)
- [How to Show Claude Code Usage Limits in Your Statusline](https://codelynx.dev/posts/claude-code-usage-limits-statusline)
- [Building a Custom Claude Code Statusline](https://www.dandoescode.com/blog/claude-code-custom-statusline)

### Pricing and Plans
- [Claude Code Pricing in 2026 - SSD Nodes](https://www.ssdnodes.com/blog/claude-code-pricing-in-2026-every-plan-explained-pro-max-api-teams/)
- [OpenClaw + Claude Code Costs 2026](https://www.shareuhack.com/en/posts/openclaw-claude-code-oauth-cost)
