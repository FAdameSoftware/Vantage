use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DailyCost {
    pub date: String, // "2026-04-01"
    pub total_cost_usd: f64,
    pub session_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ModelUsage {
    pub model: String,
    pub total_cost_usd: f64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub session_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AnalyticsSummary {
    pub daily_costs: Vec<DailyCost>,
    pub model_usage: Vec<ModelUsage>,
    pub total_cost_usd: f64,
    pub total_sessions: u32,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cache_creation_tokens: u64,
    pub total_cache_read_tokens: u64,
    pub avg_cost_per_session: f64,
    pub date_range_start: Option<String>,
    pub date_range_end: Option<String>,
}

/// Aggregate analytics from all session files in ~/.claude/projects/
/// `days` limits to the last N days (0 = all time).
pub fn get_analytics(days: u32) -> Result<AnalyticsSummary, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let projects_dir = home.join(".claude").join("projects");

    if !projects_dir.exists() {
        return Ok(empty_summary());
    }

    let cutoff_secs = if days > 0 {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        now.saturating_sub(days as u64 * 86400)
    } else {
        0
    };

    let mut daily_map: HashMap<String, (f64, u32)> = HashMap::new(); // date -> (cost, session_count)
    // model -> (cost, input, output, cache_creation, cache_read, sessions)
    let mut model_map: HashMap<String, (f64, u64, u64, u64, u64, u32)> = HashMap::new();
    let mut total_cost: f64 = 0.0;
    let mut total_sessions: u32 = 0;
    let mut total_input: u64 = 0;
    let mut total_output: u64 = 0;
    let mut total_cache_creation: u64 = 0;
    let mut total_cache_read: u64 = 0;
    let mut all_dates: Vec<String> = Vec::new();

    // Walk all .jsonl files recursively
    let jsonl_files = find_jsonl_files(&projects_dir);

    for file_path in &jsonl_files {
        let content = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let mut session_cost: f64 = 0.0;
        let mut session_input: u64 = 0;
        let mut session_output: u64 = 0;
        let mut session_cache_creation: u64 = 0;
        let mut session_cache_read: u64 = 0;
        let mut session_model: Option<String> = None;
        let mut session_date: Option<String> = None;
        let mut session_ts: u64 = 0;
        // Deduplication set: track (message_id, request_id) pairs to avoid
        // double-counting usage from duplicate result entries (Opcode pattern)
        let mut seen_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let parsed: serde_json::Value = match serde_json::from_str(line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            // Extract timestamp if present
            if let Some(ts_str) = parsed.get("timestamp").and_then(|t| t.as_str()) {
                if session_date.is_none() {
                    // Extract date part from ISO 8601
                    if ts_str.len() >= 10 {
                        let date = ts_str[..10].to_string();
                        session_date = Some(date);
                    }
                }
                // Parse timestamp to seconds for cutoff filtering
                if let Some(secs) = iso_to_epoch_secs(ts_str) {
                    if session_ts == 0 {
                        session_ts = secs;
                    }
                }
            }

            // Dedup: build a key from message_id + request_id if present
            let msg_id = parsed.get("message_id").and_then(|v| v.as_str()).unwrap_or("");
            let req_id = parsed.get("request_id").and_then(|v| v.as_str()).unwrap_or("");
            if !msg_id.is_empty() || !req_id.is_empty() {
                let dedup_key = format!("{}:{}", msg_id, req_id);
                if !seen_ids.insert(dedup_key) {
                    // Already processed this message — skip to avoid double-counting
                    continue;
                }
            }

            // Look for result messages with cost info
            // Prefer total_cost_usd (stream-json format), fall back to costUSD
            if let Some(cost) = parsed
                .get("total_cost_usd")
                .or_else(|| parsed.get("costUSD"))
                .and_then(|c| c.as_f64())
            {
                session_cost += cost;
            }

            // Check for usage data
            if let Some(usage) = parsed.get("usage") {
                if let Some(input) = usage.get("input_tokens").and_then(|t| t.as_u64()) {
                    session_input += input;
                }
                if let Some(output) = usage.get("output_tokens").and_then(|t| t.as_u64()) {
                    session_output += output;
                }
                if let Some(cache_create) = usage
                    .get("cache_creation_input_tokens")
                    .and_then(|t| t.as_u64())
                {
                    session_cache_creation += cache_create;
                }
                if let Some(cache_rd) = usage
                    .get("cache_read_input_tokens")
                    .and_then(|t| t.as_u64())
                {
                    session_cache_read += cache_rd;
                }
            }

            // Extract model
            if session_model.is_none() {
                if let Some(model) = parsed.get("model").and_then(|m| m.as_str()) {
                    session_model = Some(model.to_string());
                }
            }
        }

        // Apply cutoff filter
        if cutoff_secs > 0 && session_ts > 0 && session_ts < cutoff_secs {
            continue;
        }

        // Skip empty sessions
        if session_cost == 0.0 && session_input == 0 && session_output == 0 {
            continue;
        }

        total_sessions += 1;
        total_cost += session_cost;
        total_input += session_input;
        total_output += session_output;
        total_cache_creation += session_cache_creation;
        total_cache_read += session_cache_read;

        let date = session_date.unwrap_or_else(|| "unknown".to_string());
        if date != "unknown" {
            all_dates.push(date.clone());
        }

        // Aggregate daily cost
        let entry = daily_map.entry(date).or_insert((0.0, 0));
        entry.0 += session_cost;
        entry.1 += 1;

        // Aggregate model usage
        let model = session_model.unwrap_or_else(|| "unknown".to_string());
        let m_entry = model_map.entry(model).or_insert((0.0, 0, 0, 0, 0, 0));
        m_entry.0 += session_cost;
        m_entry.1 += session_input;
        m_entry.2 += session_output;
        m_entry.3 += session_cache_creation;
        m_entry.4 += session_cache_read;
        m_entry.5 += 1;
    }

    // Build daily_costs sorted by date
    let mut daily_costs: Vec<DailyCost> = daily_map
        .into_iter()
        .map(|(date, (cost, count))| DailyCost {
            date,
            total_cost_usd: cost,
            session_count: count,
        })
        .collect();
    daily_costs.sort_by(|a, b| a.date.cmp(&b.date));

    // Build model_usage sorted by cost (descending)
    let mut model_usage: Vec<ModelUsage> = model_map
        .into_iter()
        .map(|(model, (cost, input, output, cache_create, cache_rd, count))| ModelUsage {
            model,
            total_cost_usd: cost,
            input_tokens: input,
            output_tokens: output,
            cache_creation_tokens: cache_create,
            cache_read_tokens: cache_rd,
            session_count: count,
        })
        .collect();
    model_usage.sort_by(|a, b| b.total_cost_usd.partial_cmp(&a.total_cost_usd).unwrap_or(std::cmp::Ordering::Equal));

    all_dates.sort();
    let date_range_start = all_dates.first().cloned();
    let date_range_end = all_dates.last().cloned();

    let avg_cost = if total_sessions > 0 {
        total_cost / total_sessions as f64
    } else {
        0.0
    };

    Ok(AnalyticsSummary {
        daily_costs,
        model_usage,
        total_cost_usd: total_cost,
        total_sessions,
        total_input_tokens: total_input,
        total_output_tokens: total_output,
        total_cache_creation_tokens: total_cache_creation,
        total_cache_read_tokens: total_cache_read,
        avg_cost_per_session: avg_cost,
        date_range_start,
        date_range_end,
    })
}

fn empty_summary() -> AnalyticsSummary {
    AnalyticsSummary {
        daily_costs: Vec::new(),
        model_usage: Vec::new(),
        total_cost_usd: 0.0,
        total_sessions: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cache_creation_tokens: 0,
        total_cache_read_tokens: 0,
        avg_cost_per_session: 0.0,
        date_range_start: None,
        date_range_end: None,
    }
}

fn find_jsonl_files(dir: &PathBuf) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                files.extend(find_jsonl_files(&path));
            } else if path.extension().map_or(false, |ext| ext == "jsonl") {
                files.push(path);
            }
        }
    }
    files
}

/// Very simple ISO 8601 date to epoch seconds converter.
/// Handles "2026-04-01T12:00:00Z" and "2026-04-01T12:00:00+00:00" formats.
fn iso_to_epoch_secs(s: &str) -> Option<u64> {
    // Extract date and time parts
    if s.len() < 19 {
        return None;
    }
    let year: i64 = s[0..4].parse().ok()?;
    let month: u64 = s[5..7].parse().ok()?;
    let day: u64 = s[8..10].parse().ok()?;
    let hour: u64 = s[11..13].parse().ok()?;
    let min: u64 = s[14..16].parse().ok()?;
    let sec: u64 = s[17..19].parse().ok()?;

    // Days from epoch to start of year
    let mut days: i64 = 0;
    for y in 1970..year {
        days += if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 {
            366
        } else {
            365
        };
    }

    let is_leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let month_days: [u64; 12] = if is_leap {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };

    for m in 0..(month.saturating_sub(1) as usize) {
        days += month_days[m] as i64;
    }
    days += (day as i64) - 1;

    Some((days as u64) * 86400 + hour * 3600 + min * 60 + sec)
}
