use serde::{Deserialize, Serialize};
use specta::Type;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

// ── Security: Input Validation ─────────────────────────────────────

/// Validate an agent ID for use in git tag names.
/// Allows alphanumeric, `-`, `_`, `.`, `/`.
fn validate_agent_id(agent_id: &str) -> Result<(), String> {
    if agent_id.is_empty() {
        return Err("Agent ID must not be empty".to_string());
    }
    if agent_id.len() > 128 {
        return Err("Agent ID is too long (max 128 characters)".to_string());
    }
    let valid = agent_id
        .chars()
        .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | '/'));
    if !valid {
        return Err(format!(
            "Invalid agent ID '{}': only alphanumeric, '-', '_', '.', '/' characters are allowed",
            agent_id
        ));
    }
    if agent_id.contains("..") {
        return Err(format!("Invalid agent ID '{}': '..' is not allowed", agent_id));
    }
    Ok(())
}

/// Validate a checkpoint tag name.
/// Must start with "vantage-checkpoint/" and contain only safe characters.
fn validate_tag_name(tag_name: &str) -> Result<(), String> {
    if tag_name.is_empty() {
        return Err("Tag name must not be empty".to_string());
    }
    if !tag_name.starts_with("vantage-checkpoint/") {
        return Err(format!(
            "Invalid checkpoint tag '{}': must start with 'vantage-checkpoint/'",
            tag_name
        ));
    }
    let valid = tag_name
        .chars()
        .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | '/'));
    if !valid {
        return Err(format!(
            "Invalid tag name '{}': only alphanumeric, '-', '_', '.', '/' characters are allowed",
            tag_name
        ));
    }
    if tag_name.contains("..") {
        return Err(format!("Invalid tag name '{}': '..' is not allowed", tag_name));
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Checkpoint {
    pub tag_name: String,
    pub commit_hash: String,
    pub created_at: String, // ISO 8601
    pub agent_id: String,
    pub agent_name: String,
}

/// Get the current HEAD commit hash.
fn get_head_hash(cwd: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to get HEAD hash: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git rev-parse HEAD failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Get the current time as an ISO 8601 string (UTC).
fn now_iso8601() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Convert to date-time components
    let days_since_epoch = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

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

/// Format a compact timestamp for the tag name (YYYYMMDD-HHMMSS).
fn now_compact() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let days_since_epoch = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

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
        "{:04}{:02}{:02}-{:02}{:02}{:02}",
        year, month, day, hours, minutes, seconds
    )
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

/// Create a checkpoint tag before an agent starts.
/// Tag name: vantage-checkpoint/<agent_id>/<timestamp>
pub fn create_checkpoint(
    cwd: &str,
    agent_id: &str,
    agent_name: &str,
) -> Result<Checkpoint, String> {
    // Security: validate agent_id before using in tag name
    validate_agent_id(agent_id)?;

    let hash = get_head_hash(cwd)?;
    let timestamp = now_compact();
    let created_at = now_iso8601();

    let tag_name = format!("vantage-checkpoint/{}/{}", agent_id, timestamp);

    let output = Command::new("git")
        .args(["tag", &tag_name, &hash])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to create checkpoint tag: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git tag failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(Checkpoint {
        tag_name,
        commit_hash: hash,
        created_at,
        agent_id: agent_id.to_string(),
        agent_name: agent_name.to_string(),
    })
}

/// List all vantage checkpoints, optionally filtered by agent_id.
pub fn list_checkpoints(
    cwd: &str,
    agent_id: Option<&str>,
) -> Result<Vec<Checkpoint>, String> {
    // Security: validate agent_id if provided
    if let Some(id) = agent_id {
        validate_agent_id(id)?;
    }

    let pattern = match agent_id {
        Some(id) => format!("vantage-checkpoint/{}/*", id),
        None => "vantage-checkpoint/*".to_string(),
    };

    let output = Command::new("git")
        .args(["tag", "-l", &pattern])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to list checkpoints: {}", e))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut checkpoints = Vec::new();

    for tag_name in stdout.lines() {
        let tag_name = tag_name.trim();
        if tag_name.is_empty() {
            continue;
        }

        // Resolve the commit hash for this tag
        let hash_output = Command::new("git")
            .args(["rev-parse", tag_name])
            .current_dir(cwd)
            .output()
            .ok();

        let commit_hash = hash_output
            .as_ref()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        // Parse agent_id and timestamp from tag name
        // Format: vantage-checkpoint/<agent_id>/<timestamp>
        let parts: Vec<&str> = tag_name.splitn(3, '/').collect();
        let (parsed_agent_id, _timestamp) = if parts.len() == 3 {
            (parts[1].to_string(), parts[2].to_string())
        } else {
            ("unknown".to_string(), "unknown".to_string())
        };

        // Get the tag creation date from the commit
        let date_output = Command::new("git")
            .args(["log", "-1", "--format=%aI", &commit_hash])
            .current_dir(cwd)
            .output()
            .ok();

        let created_at = date_output
            .as_ref()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        checkpoints.push(Checkpoint {
            tag_name: tag_name.to_string(),
            commit_hash,
            created_at,
            agent_id: parsed_agent_id,
            agent_name: String::new(), // Not stored in the tag
        });
    }

    // Sort by tag name descending (most recent first due to timestamp format)
    checkpoints.sort_by(|a, b| b.tag_name.cmp(&a.tag_name));

    Ok(checkpoints)
}

/// Restore working tree to a checkpoint.
/// Uses `git checkout <tag> -- .` to restore files without changing HEAD.
pub fn restore_checkpoint(cwd: &str, tag_name: &str) -> Result<(), String> {
    // Security: validate tag name
    validate_tag_name(tag_name)?;

    let output = Command::new("git")
        .args(["checkout", tag_name, "--", "."])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to restore checkpoint: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git checkout failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

/// Delete a checkpoint tag.
pub fn delete_checkpoint(cwd: &str, tag_name: &str) -> Result<(), String> {
    // Security: validate tag name
    validate_tag_name(tag_name)?;

    let output = Command::new("git")
        .args(["tag", "-d", tag_name])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to delete checkpoint: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "git tag -d failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}
