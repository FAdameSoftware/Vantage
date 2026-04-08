use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

// ── MCP Server Configuration Types ────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// Whether the server is enabled (defaults to true if not present)
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct McpConfig {
    #[serde(default)]
    pub mcp_servers: HashMap<String, McpServerConfig>,
}

/// Represents an MCP server entry returned to the frontend,
/// enriched with scope and name info.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct McpServerEntry {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub enabled: bool,
    /// "user" or "project"
    pub scope: String,
    /// Security warnings (e.g., unpinned package versions)
    #[serde(default)]
    pub warnings: Vec<String>,
}

// ── Version pinning checks ────────────────────────────────────────

/// SEC-014: Check MCP server args for unpinned npm-style package versions.
/// Returns a list of warning strings for any detected issues.
fn check_unpinned_versions(args: &[String]) -> Vec<String> {
    use regex::Regex;

    let mut warnings = Vec::new();

    // Match npm-style package specifiers: @scope/pkg@version or pkg@version
    // We look for args that look like npm package references
    let pkg_re = Regex::new(r"^(@[a-zA-Z0-9_-]+/)?[a-zA-Z0-9_-]+(@.*)?$").unwrap();

    for arg in args {
        // Skip flags and non-package args
        if arg.starts_with('-') || arg.starts_with('/') {
            continue;
        }

        // Check for @latest (explicit unpinned)
        if arg.contains("@latest") {
            warnings.push(format!(
                "Package '{}' uses @latest — pin to a specific version for security",
                arg
            ));
            continue;
        }

        // Check for npm-style package names without version specifier
        // e.g. "some-package" with no @version suffix
        if pkg_re.is_match(arg) && !arg.contains('@') && !arg.contains('.') {
            // Looks like a bare package name (no version, no file path)
            // Only flag if it appears after "npx" or similar in the args list
            warnings.push(format!(
                "Package '{}' has no version specifier — consider pinning (e.g., {}@1.0.0)",
                arg, arg
            ));
        }
    }

    warnings
}

// ── Config file paths ──────────────────────────────────────────────

fn user_mcp_config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".claude").join("mcp-config.json"))
}

fn project_mcp_config_path(project_root: &str) -> PathBuf {
    PathBuf::from(project_root).join(".mcp.json")
}

// ── Read MCP config ────────────────────────────────────────────────

fn read_config_file(path: &PathBuf) -> McpConfig {
    match fs::read_to_string(path) {
        Ok(content) => {
            // Try parsing as { mcpServers: { ... } }
            match serde_json::from_str::<McpConfig>(&content) {
                Ok(config) => config,
                Err(e) => {
                    // SEC-015: Log parse errors instead of silently dropping them
                    eprintln!(
                        "[mcp] WARNING: Failed to parse MCP config at {}: {}",
                        path.display(),
                        e
                    );
                    McpConfig {
                        mcp_servers: HashMap::new(),
                    }
                }
            }
        }
        Err(_) => McpConfig {
            mcp_servers: HashMap::new(),
        },
    }
}

/// Read both user-level and project-level MCP configs, returning all servers.
pub fn read_mcp_config(project_root: Option<&str>) -> Result<Vec<McpServerEntry>, String> {
    let mut entries = Vec::new();

    // User-level config: ~/.claude/mcp-config.json
    let user_path = user_mcp_config_path()?;
    let user_config = read_config_file(&user_path);
    for (name, server) in user_config.mcp_servers {
        let warnings = check_unpinned_versions(&server.args);
        entries.push(McpServerEntry {
            name,
            command: server.command,
            args: server.args,
            env: server.env,
            enabled: server.enabled,
            scope: "user".to_string(),
            warnings,
        });
    }

    // Project-level config: <project_root>/.mcp.json
    if let Some(root) = project_root {
        let project_path = project_mcp_config_path(root);
        let project_config = read_config_file(&project_path);
        for (name, server) in project_config.mcp_servers {
            let warnings = check_unpinned_versions(&server.args);
            entries.push(McpServerEntry {
                name,
                command: server.command,
                args: server.args,
                env: server.env,
                enabled: server.enabled,
                scope: "project".to_string(),
                warnings,
            });
        }
    }

    Ok(entries)
}

/// Write an MCP config to the appropriate scope file.
/// `scope` is either "user" or "project".
pub fn write_mcp_config(
    scope: &str,
    servers: HashMap<String, McpServerConfig>,
    project_root: Option<&str>,
) -> Result<(), String> {
    let path = match scope {
        "user" => user_mcp_config_path()?,
        "project" => {
            let root = project_root.ok_or("Project root is required for project-scope config")?;
            project_mcp_config_path(root)
        }
        _ => return Err(format!("Invalid scope: {}", scope)),
    };

    let config = McpConfig {
        mcp_servers: servers,
    };

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&path, json).map_err(|e| format!("Failed to write config file: {}", e))?;

    Ok(())
}
