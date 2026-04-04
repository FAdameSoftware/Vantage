use std::fs;
use std::path::PathBuf;

/// Get the path to ~/.vantage/theme.json
fn theme_file_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".vantage").join("theme.json"))
}

/// Read ~/.vantage/theme.json. Returns None if the file doesn't exist.
pub fn read_theme_file() -> Result<Option<String>, String> {
    let path = theme_file_path()?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("Failed to read theme file: {}", e))
}

/// Write content to ~/.vantage/theme.json, creating the directory if needed.
pub fn write_theme_file(content: &str) -> Result<(), String> {
    let path = theme_file_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .vantage directory: {}", e))?;
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write theme file: {}", e))
}

/// Get the absolute path to the theme file.
pub fn get_theme_file_path() -> Result<String, String> {
    let path = theme_file_path()?;
    Ok(path.to_string_lossy().to_string())
}
