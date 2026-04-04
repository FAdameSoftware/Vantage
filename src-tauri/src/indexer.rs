use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read as IoRead};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIndex {
    /// Root path that was indexed
    pub root_path: String,
    /// When the index was generated (epoch ms)
    pub indexed_at: u64,
    /// Total number of files (excluding gitignored)
    pub total_files: u32,
    /// Total number of directories
    pub total_dirs: u32,
    /// Approximate total lines of code
    pub total_lines: u64,
    /// File count grouped by extension
    pub files_by_extension: HashMap<String, u32>,
    /// Directory tree (limited depth)
    pub directory_tree: String,
    /// Key files detected at the root
    pub key_files: Vec<KeyFile>,
    /// Dependencies extracted from manifest files
    pub dependencies: Vec<Dependency>,
    /// Top-level languages detected (sorted by file count)
    pub languages: Vec<LanguageInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct KeyFile {
    pub name: String,
    /// "config", "readme", "manifest", "ci", "lock", "dockerfile"
    pub category: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    pub name: String,
    pub version: String,
    /// "npm", "cargo", "pip", "go"
    pub ecosystem: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LanguageInfo {
    pub name: String,
    pub extension: String,
    pub file_count: u32,
    pub percentage: f32,
}

/// Main indexing function — walks the project tree and collects stats.
pub fn index_project(root_path: &str) -> Result<ProjectIndex, String> {
    let root = Path::new(root_path);
    if !root.exists() {
        return Err(format!("Path does not exist: {}", root_path));
    }

    let mut total_files: u32 = 0;
    let mut total_dirs: u32 = 0;
    let mut total_lines: u64 = 0;
    let mut files_by_extension: HashMap<String, u32> = HashMap::new();

    let walker = ignore::WalkBuilder::new(root_path)
        .hidden(false)
        .git_ignore(true)
        .build();

    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();

        // Skip the root itself
        if path == root {
            continue;
        }

        if path.is_dir() {
            total_dirs += 1;
        } else if path.is_file() {
            total_files += 1;

            // Count by extension
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                *files_by_extension.entry(ext.to_lowercase()).or_insert(0) += 1;
            }

            // Count lines for files < 1MB that aren't binary
            if let Ok(metadata) = path.metadata() {
                if metadata.len() < 1_048_576 {
                    if let Ok(lines) = count_lines_if_text(path) {
                        total_lines += lines as u64;
                    }
                }
            }
        }
    }

    // Build directory tree (depth-limited)
    let directory_tree = build_directory_tree(root_path, 3)?;

    // Detect key files
    let key_files = detect_key_files(root_path);

    // Parse dependencies
    let dependencies = parse_dependencies(root_path);

    // Build languages from extension counts
    let languages = build_language_list(&files_by_extension, total_files);

    let indexed_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Ok(ProjectIndex {
        root_path: root_path.to_string(),
        indexed_at,
        total_files,
        total_dirs,
        total_lines,
        files_by_extension,
        directory_tree,
        key_files,
        dependencies,
        languages,
    })
}

/// Returns the number of lines in a file, or an error if the file appears to be binary.
fn count_lines_if_text(path: &Path) -> Result<usize, ()> {
    let file = fs::File::open(path).map_err(|_| ())?;
    let mut reader = BufReader::new(file);

    // Check first 512 bytes for null byte (binary indicator)
    let mut header = [0u8; 512];
    let n = reader.read(&mut header).map_err(|_| ())?;
    if header[..n].contains(&0) {
        return Err(());
    }

    // Count newlines in header
    let mut count = header[..n].iter().filter(|&&b| b == b'\n').count();

    // Count remaining lines
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) => count += 1,
            Err(_) => break,
        }
    }

    Ok(count)
}

/// Builds a text representation of the directory tree, limited to `max_depth` levels.
fn build_directory_tree(root_path: &str, max_depth: usize) -> Result<String, String> {
    let root = Path::new(root_path);
    let root_name = root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(".");

    let mut output = String::new();
    output.push_str(root_name);
    output.push('\n');

    let mut dir_count = 0;
    build_tree_recursive(root, "", max_depth, 0, &mut output, &mut dir_count)?;

    Ok(output)
}

fn build_tree_recursive(
    dir: &Path,
    prefix: &str,
    max_depth: usize,
    current_depth: usize,
    output: &mut String,
    dir_count: &mut usize,
) -> Result<(), String> {
    if current_depth >= max_depth || *dir_count >= 100 {
        return Ok(());
    }

    // Collect and sort subdirectories
    let mut entries: Vec<_> = match fs::read_dir(dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path().is_dir()
                    && e.file_name()
                        .to_str()
                        .map(|n| !n.starts_with('.') && n != "node_modules" && n != "target" && n != "__pycache__" && n != "dist" && n != "build")
                        .unwrap_or(false)
            })
            .collect(),
        Err(_) => return Ok(()),
    };
    entries.sort_by(|a, b| a.file_name().cmp(&b.file_name()));

    let total = entries.len();
    for (i, entry) in entries.iter().enumerate() {
        if *dir_count >= 100 {
            break;
        }
        *dir_count += 1;

        let name = entry.file_name();
        let name_str = name.to_str().unwrap_or("?");
        let is_last = i == total - 1;
        let connector = if is_last { "`-- " } else { "|-- " };
        let child_prefix = if is_last { "    " } else { "|   " };

        output.push_str(prefix);
        output.push_str(connector);
        output.push_str(name_str);
        output.push('\n');

        let new_prefix = format!("{}{}", prefix, child_prefix);
        build_tree_recursive(
            &entry.path(),
            &new_prefix,
            max_depth,
            current_depth + 1,
            output,
            dir_count,
        )?;
    }

    Ok(())
}

/// Detects common key files in the project root.
fn detect_key_files(root_path: &str) -> Vec<KeyFile> {
    let root = Path::new(root_path);
    let checks: Vec<(&str, &str)> = vec![
        ("package.json", "manifest"),
        ("Cargo.toml", "manifest"),
        ("pyproject.toml", "manifest"),
        ("go.mod", "manifest"),
        ("README.md", "readme"),
        ("CLAUDE.md", "readme"),
        ("tsconfig.json", "config"),
        ("vite.config.ts", "config"),
        ("vite.config.js", "config"),
        ("next.config.js", "config"),
        ("next.config.ts", "config"),
        (".env.example", "config"),
        ("Makefile", "config"),
        ("Dockerfile", "dockerfile"),
        ("docker-compose.yml", "dockerfile"),
        ("docker-compose.yaml", "dockerfile"),
    ];

    let mut found = Vec::new();

    for (name, category) in &checks {
        let path = root.join(name);
        if path.exists() {
            found.push(KeyFile {
                name: name.to_string(),
                category: category.to_string(),
                path: path.to_string_lossy().to_string(),
            });
        }
    }

    // Check for .github directory
    let github_dir = root.join(".github");
    if github_dir.is_dir() {
        found.push(KeyFile {
            name: ".github/".to_string(),
            category: "ci".to_string(),
            path: github_dir.to_string_lossy().to_string(),
        });
    }

    found
}

/// Parses dependencies from manifest files.
fn parse_dependencies(root_path: &str) -> Vec<Dependency> {
    let root = Path::new(root_path);
    let mut deps = Vec::new();

    // Parse package.json
    let pkg_json_path = root.join("package.json");
    if pkg_json_path.exists() {
        if let Ok(contents) = fs::read_to_string(&pkg_json_path) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&contents) {
                for section in ["dependencies", "devDependencies"] {
                    if let Some(obj) = parsed.get(section).and_then(|v| v.as_object()) {
                        for (name, version) in obj {
                            if deps.len() >= 50 {
                                break;
                            }
                            deps.push(Dependency {
                                name: name.clone(),
                                version: version.as_str().unwrap_or("*").to_string(),
                                ecosystem: "npm".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    // Parse Cargo.toml
    let cargo_toml_path = root.join("Cargo.toml");
    if cargo_toml_path.exists() {
        if let Ok(contents) = fs::read_to_string(&cargo_toml_path) {
            parse_cargo_dependencies(&contents, &mut deps);
        }
    }

    deps
}

/// Simple Cargo.toml dependency parser.
fn parse_cargo_dependencies(contents: &str, deps: &mut Vec<Dependency>) {
    let mut in_deps_section = false;

    for line in contents.lines() {
        let trimmed = line.trim();

        // Detect section headers
        if trimmed.starts_with('[') {
            in_deps_section = trimmed == "[dependencies]"
                || trimmed == "[dev-dependencies]"
                || trimmed == "[build-dependencies]";
            continue;
        }

        if !in_deps_section {
            continue;
        }

        if deps.len() >= 50 {
            break;
        }

        // Parse `name = "version"` or `name = { version = "..." }`
        if let Some(eq_pos) = trimmed.find('=') {
            let name = trimmed[..eq_pos].trim().to_string();
            if name.is_empty() || name.starts_with('#') {
                continue;
            }
            let value = trimmed[eq_pos + 1..].trim();

            let version = if value.starts_with('"') {
                // Simple string version
                value.trim_matches('"').to_string()
            } else if value.starts_with('{') {
                // Inline table — extract version field
                extract_version_from_inline_table(value)
            } else {
                continue;
            };

            deps.push(Dependency {
                name,
                version,
                ecosystem: "cargo".to_string(),
            });
        }
    }
}

fn extract_version_from_inline_table(table: &str) -> String {
    // Look for version = "..." inside the braces
    if let Some(ver_pos) = table.find("version") {
        let after_key = &table[ver_pos + 7..];
        if let Some(eq) = after_key.find('=') {
            let after_eq = after_key[eq + 1..].trim();
            if after_eq.starts_with('"') {
                if let Some(end) = after_eq[1..].find('"') {
                    return after_eq[1..1 + end].to_string();
                }
            }
        }
    }
    "*".to_string()
}

/// Maps file extensions to language names and builds a sorted list.
fn build_language_list(
    ext_counts: &HashMap<String, u32>,
    total_files: u32,
) -> Vec<LanguageInfo> {
    let ext_to_lang: HashMap<&str, &str> = HashMap::from([
        ("ts", "TypeScript"),
        ("tsx", "TypeScript"),
        ("js", "JavaScript"),
        ("jsx", "JavaScript"),
        ("rs", "Rust"),
        ("py", "Python"),
        ("go", "Go"),
        ("java", "Java"),
        ("c", "C"),
        ("cpp", "C++"),
        ("h", "C"),
        ("hpp", "C++"),
        ("cs", "C#"),
        ("rb", "Ruby"),
        ("php", "PHP"),
        ("swift", "Swift"),
        ("kt", "Kotlin"),
        ("lua", "Lua"),
        ("r", "R"),
        ("html", "HTML"),
        ("css", "CSS"),
        ("scss", "CSS"),
        ("less", "CSS"),
        ("json", "JSON"),
        ("toml", "TOML"),
        ("yaml", "YAML"),
        ("yml", "YAML"),
        ("md", "Markdown"),
        ("sql", "SQL"),
        ("sh", "Shell"),
        ("bash", "Shell"),
        ("zsh", "Shell"),
        ("ps1", "PowerShell"),
        ("dockerfile", "Dockerfile"),
    ]);

    // Aggregate by language name
    let mut lang_counts: HashMap<String, (String, u32)> = HashMap::new();
    for (ext, &count) in ext_counts {
        if let Some(&lang_name) = ext_to_lang.get(ext.as_str()) {
            let entry = lang_counts
                .entry(lang_name.to_string())
                .or_insert_with(|| (ext.clone(), 0));
            entry.1 += count;
        }
    }

    let mut languages: Vec<LanguageInfo> = lang_counts
        .into_iter()
        .map(|(name, (extension, file_count))| {
            let percentage = if total_files > 0 {
                (file_count as f32 / total_files as f32) * 100.0
            } else {
                0.0
            };
            LanguageInfo {
                name,
                extension,
                file_count,
                percentage,
            }
        })
        .collect();

    languages.sort_by(|a, b| b.file_count.cmp(&a.file_count));
    languages.truncate(10);
    languages
}

/// Reads a cached index from `.vantage/project-index.json` if it exists and is fresh.
pub fn get_cached_index(root_path: &str) -> Result<Option<ProjectIndex>, String> {
    let cache_path = Path::new(root_path)
        .join(".vantage")
        .join("project-index.json");

    if !cache_path.exists() {
        return Ok(None);
    }

    // Check if cache is less than 5 minutes old
    let metadata = fs::metadata(&cache_path).map_err(|e| e.to_string())?;
    let modified = metadata.modified().map_err(|e| e.to_string())?;
    let age = SystemTime::now()
        .duration_since(modified)
        .unwrap_or_default();

    if age.as_secs() > 300 {
        return Ok(None);
    }

    let contents = fs::read_to_string(&cache_path).map_err(|e| e.to_string())?;
    let index: ProjectIndex =
        serde_json::from_str(&contents).map_err(|e| e.to_string())?;

    Ok(Some(index))
}

/// Saves the index as JSON to `.vantage/project-index.json`.
pub fn save_index(root_path: &str, index: &ProjectIndex) -> Result<(), String> {
    let vantage_dir = Path::new(root_path).join(".vantage");
    if !vantage_dir.exists() {
        fs::create_dir_all(&vantage_dir).map_err(|e| e.to_string())?;
    }

    let cache_path = vantage_dir.join("project-index.json");
    let json = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    fs::write(&cache_path, json).map_err(|e| e.to_string())?;

    Ok(())
}

/// Public entry point: returns cached index if available, otherwise indexes and caches.
pub fn index_project_cached(root_path: &str, force: bool) -> Result<ProjectIndex, String> {
    if !force {
        if let Some(cached) = get_cached_index(root_path)? {
            return Ok(cached);
        }
    }

    let index = index_project(root_path)?;
    save_index(root_path, &index)?;
    Ok(index)
}
