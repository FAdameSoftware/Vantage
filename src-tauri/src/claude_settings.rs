use std::fs;
use std::path::PathBuf;

/// Read/write ~/.claude/settings.json as an opaque JSON value.
/// We pass the entire file to avoid losing unknown keys.

fn settings_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".claude").join("settings.json"))
}

/// Read ~/.claude/settings.json and return its contents as a JSON string.
/// Returns "{}" if the file does not exist.
pub fn read_claude_settings() -> Result<String, String> {
    let path = settings_path()?;

    if !path.exists() {
        return Ok("{}".to_string());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read settings.json: {}", e))?;

    // Validate it's valid JSON before returning
    let _: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("settings.json is not valid JSON: {}", e))?;

    Ok(content)
}

/// Write content to ~/.claude/settings.json.
/// The content must be valid JSON.
pub fn write_claude_settings(content: &str) -> Result<(), String> {
    // Validate that the content is valid JSON
    let value: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| format!("Content is not valid JSON: {}", e))?;

    let path = settings_path()?;

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    // Pretty-print for human readability
    let json = serde_json::to_string_pretty(&value)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&path, json)
        .map_err(|e| format!("Failed to write settings.json: {}", e))?;

    Ok(())
}
