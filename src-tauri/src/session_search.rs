use serde::{Deserialize, Serialize};
use specta::Type;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SessionSearchResult {
    pub session_id: String,
    pub file_path: String,
    /// First 200 chars of matching message (or first user message if no query)
    pub snippet: String,
    pub message_count: u32,
    /// ISO 8601 date string
    pub modified_at: String,
    pub total_cost_usd: f64,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ProjectUsage {
    /// Latest session ID (file stem of the most recent JSONL)
    pub session_id: String,
    /// Total cost in USD for the latest session
    pub session_cost: f64,
    /// Total input tokens for the latest session
    pub session_input_tokens: u64,
    /// Total output tokens for the latest session
    pub session_output_tokens: u64,
    /// Total cache creation tokens for the latest session
    pub session_cache_tokens: u64,
    /// Model used in the latest session
    pub model: Option<String>,
    /// Number of result messages in the latest session (turn count)
    pub session_turn_count: u32,
    /// ISO 8601 timestamp of the latest session's last modification
    pub last_activity: String,
    /// Aggregate cost across ALL sessions for this project
    pub all_time_cost: f64,
    /// Aggregate total tokens (input + output) across ALL sessions
    pub all_time_tokens: u64,
    /// Number of session files found
    pub session_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SessionStats {
    pub message_count: u32,
    pub total_cost_usd: f64,
    pub models: Vec<String>,
    pub first_message_at: Option<String>,
    pub last_message_at: Option<String>,
    pub duration_ms: Option<u64>,
}

/// Search through JSONL session files in `~/.claude/projects/`.
/// If `cwd` is provided, only search files under the encoded project path.
/// If `query` is empty, returns all sessions (limited to 50).
pub fn search_sessions(
    query: &str,
    cwd: Option<&str>,
) -> Result<Vec<SessionSearchResult>, String> {
    let projects_dir = get_claude_projects_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;

    if !projects_dir.exists() {
        return Ok(Vec::new());
    }

    let query_lower = query.to_lowercase();
    let has_query = !query_lower.is_empty();
    let mut results = Vec::new();

    // Determine which directories to scan
    let dirs_to_scan: Vec<PathBuf> = if let Some(cwd_path) = cwd {
        let encoded = encode_cwd(cwd_path);
        let specific_dir = projects_dir.join(&encoded);
        if specific_dir.exists() {
            vec![specific_dir]
        } else {
            return Ok(Vec::new());
        }
    } else {
        // Scan all project directories
        match std::fs::read_dir(&projects_dir) {
            Ok(entries) => entries
                .flatten()
                .filter(|e| e.path().is_dir())
                .map(|e| e.path())
                .collect(),
            Err(_) => return Ok(Vec::new()),
        }
    };

    for dir in dirs_to_scan {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }

            if results.len() >= 50 {
                break;
            }

            let file_name = match path.file_stem().and_then(|s| s.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };

            let metadata = match std::fs::metadata(&path) {
                Ok(m) => m,
                Err(_) => continue,
            };

            let modified_at = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| {
                    // Convert to ISO 8601
                    let secs = d.as_secs();
                    // Simple ISO 8601 formatting
                    let dt = time_from_unix_secs(secs);
                    dt
                })
                .unwrap_or_default();

            // Parse the JSONL file
            let parse_result = parse_session_for_search(&path, if has_query { Some(&query_lower) } else { None });

            match parse_result {
                Some(parsed) => {
                    // If we have a query but no match was found, skip
                    if has_query && parsed.match_snippet.is_none() {
                        continue;
                    }

                    let snippet = parsed
                        .match_snippet
                        .or(parsed.first_message)
                        .unwrap_or_else(|| "(empty session)".to_string());

                    results.push(SessionSearchResult {
                        session_id: file_name,
                        file_path: path.to_string_lossy().to_string(),
                        snippet,
                        message_count: parsed.message_count,
                        modified_at,
                        total_cost_usd: parsed.total_cost,
                        model: parsed.model,
                    });
                }
                None => continue,
            }
        }
    }

    // Sort by modified_at descending (newest first)
    results.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    Ok(results)
}

/// Get detailed stats for a single session JSONL file.
/// Only allows reading files within `~/.claude/projects/` to prevent
/// arbitrary file reads via path traversal.
pub fn get_session_stats(session_path: &str) -> Result<SessionStats, String> {
    let path = PathBuf::from(session_path);

    // Validate the path is within ~/.claude/projects/
    let projects_dir = get_claude_projects_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;
    let canonical_projects = projects_dir.canonicalize().unwrap_or(projects_dir.clone());
    let canonical_path = path
        .canonicalize()
        .map_err(|e| format!("Invalid session path: {}", e))?;
    if !canonical_path.starts_with(&canonical_projects) {
        return Err("Session path must be within ~/.claude/projects/".to_string());
    }

    if !path.exists() {
        return Err(format!("Session file not found: {}", session_path));
    }

    let file = std::fs::File::open(&path)
        .map_err(|e| format!("Failed to open session file: {}", e))?;

    let reader = BufReader::new(file);
    let mut message_count: u32 = 0;
    let mut total_cost: f64 = 0.0;
    let mut models: Vec<String> = Vec::new();
    let mut first_message_at: Option<String> = None;
    let mut last_message_at: Option<String> = None;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
            message_count += 1;

            // Extract timestamp
            if let Some(ts) = val.get("timestamp").and_then(|t| t.as_str()) {
                let ts_string = ts.to_string();
                if first_message_at.is_none() {
                    first_message_at = Some(ts_string.clone());
                }
                last_message_at = Some(ts_string);
            }

            // Extract cost from result messages
            if val.get("type").and_then(|t| t.as_str()) == Some("result") {
                if let Some(cost) = val
                    .get("cost_usd")
                    .or_else(|| val.get("costUsd"))
                    .and_then(|c| c.as_f64())
                {
                    total_cost += cost;
                }
            }

            // Extract model
            if let Some(model) = val.get("model").and_then(|m| m.as_str()) {
                let model_str = model.to_string();
                if !models.contains(&model_str) {
                    models.push(model_str);
                }
            }
        }
    }

    let duration_ms = match (&first_message_at, &last_message_at) {
        (Some(_first), Some(_last)) => None, // Would need proper date parsing
        _ => None,
    };

    Ok(SessionStats {
        message_count,
        total_cost_usd: total_cost,
        models,
        first_message_at,
        last_message_at,
        duration_ms,
    })
}

/// Read usage data from session JSONL files for a given project CWD.
/// Returns aggregate usage for the latest session and all-time totals.
pub fn get_project_usage(cwd: &str) -> Result<ProjectUsage, String> {
    let projects_dir = get_claude_projects_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;

    let encoded = encode_cwd(cwd);
    let project_dir = projects_dir.join(&encoded);

    if !project_dir.exists() {
        return Err(format!(
            "No session directory found for project: {}",
            project_dir.display()
        ));
    }

    // Collect all JSONL files with their modification times
    let mut jsonl_files: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();

    let entries = std::fs::read_dir(&project_dir)
        .map_err(|e| format!("Failed to read session directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        if let Ok(meta) = std::fs::metadata(&path) {
            if let Ok(modified) = meta.modified() {
                jsonl_files.push((path, modified));
            }
        }
    }

    if jsonl_files.is_empty() {
        return Err("No session files found for this project".to_string());
    }

    // Sort by modification time descending (newest first)
    jsonl_files.sort_by(|a, b| b.1.cmp(&a.1));

    let session_count = jsonl_files.len() as u32;

    // Parse the latest session in detail
    let (latest_path, latest_modified) = &jsonl_files[0];
    let latest_parsed = parse_session_for_usage(latest_path);

    let latest_session_id = latest_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    let last_activity = latest_modified
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| time_from_unix_secs(d.as_secs()))
        .unwrap_or_default();

    // Aggregate all-time totals across all sessions
    let mut all_time_cost: f64 = 0.0;
    let mut all_time_tokens: u64 = 0;

    // Latest session is already parsed, add its totals
    all_time_cost += latest_parsed.total_cost;
    all_time_tokens += latest_parsed.input_tokens + latest_parsed.output_tokens;

    // Parse remaining sessions (just cost + tokens, lighter scan)
    for (path, _) in jsonl_files.iter().skip(1) {
        let parsed = parse_session_for_usage(path);
        all_time_cost += parsed.total_cost;
        all_time_tokens += parsed.input_tokens + parsed.output_tokens;
    }

    Ok(ProjectUsage {
        session_id: latest_session_id,
        session_cost: latest_parsed.total_cost,
        session_input_tokens: latest_parsed.input_tokens,
        session_output_tokens: latest_parsed.output_tokens,
        session_cache_tokens: latest_parsed.cache_creation_tokens,
        model: latest_parsed.model,
        session_turn_count: latest_parsed.turn_count,
        last_activity,
        all_time_cost,
        all_time_tokens,
        session_count,
    })
}

// ── Internal helpers ─────────────────────────────────────────────────

struct ParsedSessionUsage {
    total_cost: f64,
    input_tokens: u64,
    output_tokens: u64,
    cache_creation_tokens: u64,
    model: Option<String>,
    turn_count: u32,
}

/// Parse a JSONL session file to extract usage data (cost, tokens).
fn parse_session_for_usage(path: &PathBuf) -> ParsedSessionUsage {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => {
            return ParsedSessionUsage {
                total_cost: 0.0,
                input_tokens: 0,
                output_tokens: 0,
                cache_creation_tokens: 0,
                model: None,
                turn_count: 0,
            }
        }
    };

    let reader = BufReader::new(file);
    let mut total_cost: f64 = 0.0;
    let mut input_tokens: u64 = 0;
    let mut output_tokens: u64 = 0;
    let mut cache_creation_tokens: u64 = 0;
    let mut model: Option<String> = None;
    let mut turn_count: u32 = 0;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
            let msg_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");

            if msg_type == "result" {
                turn_count += 1;

                if let Some(cost) = val
                    .get("cost_usd")
                    .or_else(|| val.get("costUsd"))
                    .and_then(|c| c.as_f64())
                {
                    total_cost += cost;
                }

                // Token usage from result messages
                if let Some(usage) = val.get("usage") {
                    if let Some(inp) = usage.get("input_tokens").and_then(|t| t.as_u64()) {
                        input_tokens += inp;
                    }
                    if let Some(out) = usage.get("output_tokens").and_then(|t| t.as_u64()) {
                        output_tokens += out;
                    }
                    if let Some(cache) = usage
                        .get("cache_creation_input_tokens")
                        .and_then(|t| t.as_u64())
                    {
                        cache_creation_tokens += cache;
                    }
                }

                // Also check top-level token fields (some formats put them here)
                if let Some(inp) = val.get("input_tokens").and_then(|t| t.as_u64()) {
                    if val.get("usage").is_none() {
                        input_tokens += inp;
                    }
                }
                if let Some(out) = val.get("output_tokens").and_then(|t| t.as_u64()) {
                    if val.get("usage").is_none() {
                        output_tokens += out;
                    }
                }
                if let Some(cache) = val.get("cache_creation_input_tokens").and_then(|t| t.as_u64()) {
                    if val.get("usage").is_none() {
                        cache_creation_tokens += cache;
                    }
                }
            }

            // Extract model from any message that has it
            if model.is_none() {
                if let Some(m) = val.get("model").and_then(|m| m.as_str()) {
                    model = Some(m.to_string());
                }
            }
        }
    }

    ParsedSessionUsage {
        total_cost,
        input_tokens,
        output_tokens,
        cache_creation_tokens,
        model,
        turn_count,
    }
}

struct ParsedSession {
    message_count: u32,
    first_message: Option<String>,
    match_snippet: Option<String>,
    total_cost: f64,
    model: Option<String>,
}

/// Parse a JSONL session file, optionally searching for a query string.
fn parse_session_for_search(path: &PathBuf, query: Option<&str>) -> Option<ParsedSession> {
    let file = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(file);

    let mut message_count: u32 = 0;
    let mut first_message: Option<String> = None;
    let mut match_snippet: Option<String> = None;
    let mut total_cost: f64 = 0.0;
    let mut model: Option<String> = None;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        message_count += 1;

        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
            let msg_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");

            // Extract content text for user/assistant messages
            let content_text = extract_message_content(&val);

            // Capture first user message
            if first_message.is_none() && msg_type == "user" {
                if let Some(ref text) = content_text {
                    first_message = Some(truncate_str(text, 200));
                }
            }

            // Search for query match
            if let Some(q) = query {
                if match_snippet.is_none() {
                    if let Some(ref text) = content_text {
                        if text.to_lowercase().contains(q) {
                            match_snippet = Some(truncate_str(text, 200));
                        }
                    }
                }
            }

            // Extract cost from result messages
            if msg_type == "result" {
                if let Some(cost) = val
                    .get("cost_usd")
                    .or_else(|| val.get("costUsd"))
                    .and_then(|c| c.as_f64())
                {
                    total_cost += cost;
                }
            }

            // Extract model
            if model.is_none() {
                if let Some(m) = val.get("model").and_then(|m| m.as_str()) {
                    model = Some(m.to_string());
                }
            }
        }
    }

    Some(ParsedSession {
        message_count,
        first_message,
        match_snippet,
        total_cost,
        model,
    })
}

/// Extract message content text from a JSONL line value.
fn extract_message_content(val: &serde_json::Value) -> Option<String> {
    // Try message.content (string)
    if let Some(content) = val
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
    {
        return Some(content.to_string());
    }

    // Try message.content as array of blocks
    if let Some(blocks) = val
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_array())
    {
        let mut text_parts = Vec::new();
        for block in blocks {
            if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                text_parts.push(text.to_string());
            }
        }
        if !text_parts.is_empty() {
            return Some(text_parts.join(" "));
        }
    }

    None
}

fn truncate_str(s: &str, max_len: usize) -> String {
    if s.len() > max_len {
        format!("{}...", &s[..max_len])
    } else {
        s.to_string()
    }
}

fn encode_cwd(cwd: &str) -> String {
    cwd.chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect()
}

fn get_claude_projects_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("projects"))
}

/// Simple Unix timestamp to ISO 8601 string conversion.
fn time_from_unix_secs(secs: u64) -> String {
    // Basic conversion without external crate
    let days_since_epoch = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Calculate year/month/day from days since epoch (1970-01-01)
    let mut remaining_days = days_since_epoch as i64;
    let mut year: i64 = 1970;

    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        year += 1;
    }

    let days_in_months: [i64; 12] = if is_leap_year(year) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };

    let mut month = 1;
    for &days_in_month in &days_in_months {
        if remaining_days < days_in_month {
            break;
        }
        remaining_days -= days_in_month;
        month += 1;
    }
    let day = remaining_days + 1;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, minutes, seconds
    )
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

// ── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── SEC-007: path validation tests ───────────────────────────────

    #[test]
    fn session_stats_rejects_path_outside_projects_dir() {
        // Any path that doesn't live under ~/.claude/projects/ should be rejected.
        // We use a concrete tmp file so canonicalize succeeds — the guard should
        // still reject it because it isn't under the real projects dir.
        let tmp = tempfile::NamedTempFile::new().expect("create temp file");
        let path_str = tmp.path().to_string_lossy().to_string();

        let result = get_session_stats(&path_str);
        assert!(result.is_err(), "should reject path outside projects dir");
        let err = result.unwrap_err();
        assert!(
            err.contains("must be within") || err.contains("Invalid session path"),
            "unexpected error message: {}",
            err
        );
    }

    #[test]
    fn session_stats_rejects_traversal_attack() {
        // A path that tries to escape via `..` segments.
        let result = get_session_stats("/../../../etc/passwd");
        assert!(result.is_err(), "should reject traversal path");
    }

    #[test]
    fn session_stats_rejects_nonexistent_file() {
        let result = get_session_stats("/nonexistent/path/session.jsonl");
        assert!(result.is_err(), "should reject nonexistent file");
    }

    // ── Functional tests ─────────────────────────────────────────────

    #[test]
    fn encode_cwd_replaces_special_chars() {
        assert_eq!(encode_cwd("/home/user/project"), "-home-user-project");
        assert_eq!(
            encode_cwd("C:\\Users\\user\\project"),
            "C--Users-user-project"
        );
    }

    #[test]
    fn time_from_unix_secs_epoch() {
        assert_eq!(time_from_unix_secs(0), "1970-01-01T00:00:00Z");
    }

    #[test]
    fn time_from_unix_secs_known_date() {
        // 2024-01-01 00:00:00 UTC = 1704067200
        assert_eq!(time_from_unix_secs(1704067200), "2024-01-01T00:00:00Z");
    }

    #[test]
    fn truncate_str_short() {
        assert_eq!(truncate_str("hello", 10), "hello");
    }

    #[test]
    fn truncate_str_exact() {
        assert_eq!(truncate_str("hello", 5), "hello");
    }

    #[test]
    fn truncate_str_long() {
        assert_eq!(truncate_str("hello world", 5), "hello...");
    }

    #[test]
    fn get_claude_projects_dir_returns_some() {
        // Should always resolve to *something* on a machine with a home dir
        let dir = get_claude_projects_dir();
        assert!(dir.is_some());
        let path = dir.unwrap();
        assert!(path.ends_with(".claude/projects") || path.ends_with(".claude\\projects"));
    }
}
