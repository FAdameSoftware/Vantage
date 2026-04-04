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
pub fn get_session_stats(session_path: &str) -> Result<SessionStats, String> {
    let path = PathBuf::from(session_path);
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

// ── Internal helpers ─────────────────────────────────────────────────

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
