use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

// ── Types ──────────────────────────────────────────────────────────

/// Represents a single Claude Code plugin discovered on disk
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    /// Directory path of the plugin
    pub path: String,
    /// Whether the plugin is enabled in settings.json
    pub enabled: bool,
    /// List of skill names this plugin provides
    pub skills: Vec<String>,
    /// List of command names (slash commands) this plugin provides
    pub commands: Vec<String>,
    /// List of hook event types this plugin registers
    pub hooks: Vec<String>,
    /// List of MCP server names this plugin configures
    pub mcp_servers: Vec<String>,
    /// List of agent names this plugin provides
    pub agents: Vec<String>,
}

/// Represents a skill discovered from ~/.claude/skills/ or from a plugin
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub when_to_use: String,
    /// "built-in", "user", or plugin name
    pub source: String,
    /// Whether the skill can be invoked by user (vs model-only)
    pub user_invocable: bool,
    /// Argument hint string if the skill takes arguments
    pub argument_hint: Option<String>,
    /// Path to the SKILL.md file
    pub path: String,
}

/// Raw plugin.json structure (flexible parsing)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginManifest {
    #[serde(default)]
    name: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    author: String,
    #[serde(default)]
    skills: Vec<serde_json::Value>,
    #[serde(default)]
    commands: Vec<serde_json::Value>,
    #[serde(default)]
    hooks: Vec<serde_json::Value>,
    #[serde(default, rename = "mcpServers")]
    mcp_servers: Vec<serde_json::Value>,
    #[serde(default)]
    agents: Vec<serde_json::Value>,
}

/// Raw SKILL.md YAML frontmatter fields (parsed manually to avoid yaml dep)
struct SkillFrontmatter {
    name: Option<String>,
    description: Option<String>,
    when_to_use: Option<String>,
    user_invocable: Option<bool>,
    argument_hint: Option<String>,
}

// ── Path helpers ───────────────────────────────────────────────────

fn plugins_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".claude").join("plugins"))
}

fn skills_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".claude").join("skills"))
}

fn settings_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".claude").join("settings.json"))
}

// ── Settings helpers ───────────────────────────────────────────────

fn read_disabled_plugins() -> Vec<String> {
    let path = match settings_path() {
        Ok(p) => p,
        Err(_) => return vec![],
    };

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    let value: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    value
        .get("disabledPlugins")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

// ── Frontmatter parser ─────────────────────────────────────────────

/// Parse simple YAML frontmatter from a SKILL.md file.
/// Handles `---\nkey: value\n---` blocks without adding a yaml dependency.
fn parse_skill_frontmatter(content: &str) -> Option<SkillFrontmatter> {
    if !content.starts_with("---") {
        return None;
    }

    // Find the closing ---
    let rest = &content[3..];
    // Skip a possible newline right after the opening ---
    let rest = rest.trim_start_matches('\n').trim_start_matches('\r');
    let end = rest.find("\n---").or_else(|| rest.find("\r\n---"))?;
    let frontmatter = &rest[..end];

    let mut fm = SkillFrontmatter {
        name: None,
        description: None,
        when_to_use: None,
        user_invocable: None,
        argument_hint: None,
    };

    for line in frontmatter.lines() {
        // Split on the first ': '
        if let Some(colon_pos) = line.find(": ") {
            let key = line[..colon_pos].trim();
            let value = line[colon_pos + 2..].trim().to_string();
            match key {
                "name" => fm.name = Some(value),
                "description" => fm.description = Some(value),
                "when-to-use" | "when_to_use" | "whenToUse" => fm.when_to_use = Some(value),
                "user-invocable" | "user_invocable" | "userInvocable" => {
                    fm.user_invocable = Some(value.eq_ignore_ascii_case("true"))
                }
                "argument-hint" | "argument_hint" | "argumentHint" => {
                    fm.argument_hint = Some(value)
                }
                _ => {}
            }
        } else if let Some(colon_pos) = line.find(':') {
            // key: (no value) — ignore
            let _ = &line[..colon_pos];
        }
    }

    Some(fm)
}

// ── Name extraction from plugin manifest arrays ────────────────────

/// Extract a string name from a JSON value that may be a plain string
/// or an object with a `"name"` field.
fn extract_name(val: &serde_json::Value) -> Option<String> {
    match val {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Object(obj) => obj
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        _ => None,
    }
}

fn extract_names(values: &[serde_json::Value]) -> Vec<String> {
    values.iter().filter_map(extract_name).collect()
}

// ── Public API ─────────────────────────────────────────────────────

/// Scan ~/.claude/plugins/ and return info for every installed plugin.
pub fn list_installed_plugins() -> Result<Vec<PluginInfo>, String> {
    let dir = plugins_dir()?;
    let disabled = read_disabled_plugins();

    if !dir.exists() {
        return Ok(vec![]);
    }

    let entries = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read plugins directory: {}", e))?;

    let mut plugins: Vec<PluginInfo> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let manifest_path = path.join("plugin.json");
        if !manifest_path.exists() {
            continue;
        }

        let content = match fs::read_to_string(&manifest_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let manifest: PluginManifest = match serde_json::from_str(&content) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let dir_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let name = if manifest.name.is_empty() {
            dir_name.clone()
        } else {
            manifest.name.clone()
        };

        let enabled = !disabled.contains(&name);

        plugins.push(PluginInfo {
            name,
            version: manifest.version,
            description: manifest.description,
            author: manifest.author,
            path: path.to_string_lossy().to_string(),
            enabled,
            skills: extract_names(&manifest.skills),
            commands: extract_names(&manifest.commands),
            hooks: extract_names(&manifest.hooks),
            mcp_servers: extract_names(&manifest.mcp_servers),
            agents: extract_names(&manifest.agents),
        });
    }

    plugins.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(plugins)
}

/// Scan ~/.claude/skills/ and all plugins for installed skills.
pub fn list_installed_skills() -> Result<Vec<SkillInfo>, String> {
    let dir = skills_dir()?;
    let mut skills: Vec<SkillInfo> = Vec::new();

    // User skills from ~/.claude/skills/
    if dir.exists() {
        let entries = fs::read_dir(&dir)
            .map_err(|e| format!("Failed to read skills directory: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let skill_md = path.join("SKILL.md");
            if !skill_md.exists() {
                continue;
            }

            let content = match fs::read_to_string(&skill_md) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let dir_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            let fm = parse_skill_frontmatter(&content);

            let name = fm
                .as_ref()
                .and_then(|f| f.name.clone())
                .unwrap_or_else(|| dir_name.clone());

            let description = fm
                .as_ref()
                .and_then(|f| f.description.clone())
                .unwrap_or_default();

            let when_to_use = fm
                .as_ref()
                .and_then(|f| f.when_to_use.clone())
                .unwrap_or_default();

            let user_invocable = fm
                .as_ref()
                .and_then(|f| f.user_invocable)
                .unwrap_or(true);

            let argument_hint = fm.as_ref().and_then(|f| f.argument_hint.clone());

            skills.push(SkillInfo {
                name,
                description,
                when_to_use,
                source: "user".to_string(),
                user_invocable,
                argument_hint,
                path: skill_md.to_string_lossy().to_string(),
            });
        }
    }

    // Plugin skills from installed plugins
    if let Ok(plugin_list) = list_installed_plugins() {
        for plugin in plugin_list {
            for skill_name in &plugin.skills {
                // Avoid duplicating user skills that share names
                if skills.iter().any(|s| &s.name == skill_name) {
                    continue;
                }
                skills.push(SkillInfo {
                    name: skill_name.clone(),
                    description: String::new(),
                    when_to_use: String::new(),
                    source: plugin.name.clone(),
                    user_invocable: true,
                    argument_hint: None,
                    path: plugin.path.clone(),
                });
            }
        }
    }

    skills.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(skills)
}

/// Find a single plugin by name.
pub fn get_plugin_config(plugin_name: &str) -> Result<PluginInfo, String> {
    let plugins = list_installed_plugins()?;
    plugins
        .into_iter()
        .find(|p| p.name == plugin_name)
        .ok_or_else(|| format!("Plugin '{}' not found", plugin_name))
}

/// Enable or disable a plugin by updating the disabledPlugins list in
/// ~/.claude/settings.json.
pub fn toggle_plugin(plugin_name: &str, enabled: bool) -> Result<(), String> {
    let path = settings_path()?;

    // Read existing settings or start with an empty object
    let content = fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string());
    let mut value: serde_json::Value =
        serde_json::from_str(&content).unwrap_or(serde_json::Value::Object(Default::default()));

    // Ensure it's an object
    if !value.is_object() {
        value = serde_json::Value::Object(Default::default());
    }

    // Get or create the disabledPlugins array
    let obj = value.as_object_mut().unwrap();
    let arr = obj
        .entry("disabledPlugins")
        .or_insert_with(|| serde_json::Value::Array(vec![]));

    if let serde_json::Value::Array(ref mut list) = arr {
        let plugin_val = serde_json::Value::String(plugin_name.to_string());
        if enabled {
            // Remove from disabled list
            list.retain(|v| v != &plugin_val);
        } else {
            // Add to disabled list (avoid duplicates)
            if !list.contains(&plugin_val) {
                list.push(plugin_val);
            }
        }
    }

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let json = serde_json::to_string_pretty(&value)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&path, json).map_err(|e| format!("Failed to write settings.json: {}", e))?;

    Ok(())
}

/// Install a plugin by running `claude plugins add <name>`.
/// Returns the stdout output on success, or an error with stderr.
pub fn install_plugin(name: &str) -> Result<String, String> {
    // Validate the name to prevent command injection
    if name.is_empty() || name.contains(|c: char| c.is_whitespace() || c == ';' || c == '|' || c == '&') {
        return Err(format!("Invalid plugin name: {}", name));
    }

    let output = Command::new("claude")
        .args(["plugins", "add", name])
        .output()
        .map_err(|e| format!("Failed to run claude: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Plugin install failed: {}", stderr.trim()))
    }
}
