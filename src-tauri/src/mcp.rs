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
            serde_json::from_str::<McpConfig>(&content).unwrap_or(McpConfig {
                mcp_servers: HashMap::new(),
            })
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
        entries.push(McpServerEntry {
            name,
            command: server.command,
            args: server.args,
            env: server.env,
            enabled: server.enabled,
            scope: "user".to_string(),
        });
    }

    // Project-level config: <project_root>/.mcp.json
    if let Some(root) = project_root {
        let project_path = project_mcp_config_path(root);
        let project_config = read_config_file(&project_path);
        for (name, server) in project_config.mcp_servers {
            entries.push(McpServerEntry {
                name,
                command: server.command,
                args: server.args,
                env: server.env,
                enabled: server.enabled,
                scope: "project".to_string(),
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
