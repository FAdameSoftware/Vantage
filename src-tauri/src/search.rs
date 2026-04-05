use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SearchMatch {
    /// Absolute path to the file
    pub file_path: String,
    /// 1-based line number
    pub line_number: u32,
    /// The full line text (trimmed of trailing newline)
    pub line_text: String,
    /// Column offset of the match start (0-based)
    pub column_start: u32,
    /// Length of the match
    pub match_length: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SearchResult {
    /// Grouped matches by file
    pub files: Vec<SearchFileResult>,
    /// Total match count across all files
    pub total_matches: u32,
    /// Whether the search was truncated (hit the limit)
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SearchFileResult {
    pub file_path: String,
    pub matches: Vec<SearchMatch>,
}

/// Main entry point: tries ripgrep first, falls back to ignore-crate walk.
pub fn search_project(
    root: &str,
    query: &str,
    is_regex: bool,
    case_sensitive: bool,
    glob_filter: Option<&str>,
    max_results: u32,
) -> Result<SearchResult, String> {
    if query.is_empty() {
        return Ok(SearchResult {
            files: vec![],
            total_matches: 0,
            truncated: false,
        });
    }

    // Try ripgrep first
    match search_with_ripgrep(root, query, is_regex, case_sensitive, glob_filter, max_results) {
        Ok(result) => Ok(result),
        Err(_) => {
            // Fallback to ignore crate walk
            search_with_ignore_crate(root, query, is_regex, case_sensitive, glob_filter, max_results)
        }
    }
}

/// Search using ripgrep (`rg --json`).
fn search_with_ripgrep(
    root: &str,
    query: &str,
    is_regex: bool,
    case_sensitive: bool,
    glob_filter: Option<&str>,
    max_results: u32,
) -> Result<SearchResult, String> {
    let mut cmd = Command::new("rg");

    cmd.arg("--json")
        .arg("--max-count")
        .arg("100")
        .arg("--max-columns")
        .arg("500");

    if !is_regex {
        cmd.arg("--fixed-strings");
    }

    if !case_sensitive {
        cmd.arg("--ignore-case");
    }

    if let Some(glob) = glob_filter {
        // Support comma-separated globs like "*.ts, *.tsx"
        for g in glob.split(',') {
            let g = g.trim();
            if !g.is_empty() {
                cmd.arg("--glob").arg(g);
            }
        }
    }

    cmd.arg("--").arg(query).arg(root);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run ripgrep: {}", e))?;

    // rg exit codes: 0 = matches found, 1 = no matches, 2 = error
    if output.status.code() == Some(2) {
        return Err(format!(
            "ripgrep error: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_ripgrep_json(&stdout, max_results)
}

/// Parse ripgrep NDJSON output into SearchResult.
fn parse_ripgrep_json(json_output: &str, max_results: u32) -> Result<SearchResult, String> {
    let mut file_matches: HashMap<String, Vec<SearchMatch>> = HashMap::new();
    let mut total: u32 = 0;
    let mut truncated = false;

    for line in json_output.lines() {
        if line.is_empty() {
            continue;
        }

        let parsed: serde_json::Value =
            serde_json::from_str(line).map_err(|e| format!("JSON parse error: {}", e))?;

        let msg_type = parsed["type"].as_str().unwrap_or("");
        if msg_type != "match" {
            continue;
        }

        let data = &parsed["data"];
        let file_path = data["path"]["text"]
            .as_str()
            .unwrap_or("")
            .replace('\\', "/");
        let line_number = data["line_number"].as_u64().unwrap_or(0) as u32;
        let line_text = data["lines"]["text"]
            .as_str()
            .unwrap_or("")
            .trim_end_matches('\n')
            .trim_end_matches('\r')
            .to_string();

        // Process each submatch
        let submatches = data["submatches"].as_array();
        if let Some(subs) = submatches {
            for sub in subs {
                if total >= max_results {
                    truncated = true;
                    break;
                }

                let start = sub["start"].as_u64().unwrap_or(0) as u32;
                let end = sub["end"].as_u64().unwrap_or(0) as u32;
                let length = end.saturating_sub(start);

                let m = SearchMatch {
                    file_path: file_path.clone(),
                    line_number,
                    line_text: line_text.clone(),
                    column_start: start,
                    match_length: length,
                };

                file_matches
                    .entry(file_path.clone())
                    .or_default()
                    .push(m);

                total += 1;
            }
        }

        if truncated {
            break;
        }
    }

    let files: Vec<SearchFileResult> = file_matches
        .into_iter()
        .map(|(path, matches)| SearchFileResult {
            file_path: path,
            matches,
        })
        .collect();

    Ok(SearchResult {
        files,
        total_matches: total,
        truncated,
    })
}

/// Fallback search using the `ignore` crate's WalkBuilder + simple string/regex matching.
fn search_with_ignore_crate(
    root: &str,
    query: &str,
    is_regex: bool,
    case_sensitive: bool,
    glob_filter: Option<&str>,
    max_results: u32,
) -> Result<SearchResult, String> {
    use ignore::WalkBuilder;

    let mut builder = WalkBuilder::new(root);
    builder.hidden(true).git_ignore(true).git_global(true);

    // Apply glob filter if provided
    if let Some(glob) = glob_filter {
        let mut types_builder = ignore::types::TypesBuilder::new();
        for g in glob.split(',') {
            let g = g.trim();
            if !g.is_empty() {
                types_builder
                    .add("custom", g)
                    .map_err(|e| format!("Invalid glob pattern '{}': {}", g, e))?;
            }
        }
        types_builder.select("custom");
        let types = types_builder
            .build()
            .map_err(|e| format!("Failed to build glob filter: {}", e))?;
        builder.types(types);
    }

    // Compile the search pattern
    let compiled_regex = if is_regex {
        if case_sensitive {
            regex::Regex::new(query)
        } else {
            regex::RegexBuilder::new(query)
                .case_insensitive(true)
                .build()
        }
        .map_err(|e| format!("Invalid regex: {}", e))?
    } else {
        // Escape the query for literal matching
        let escaped = regex::escape(query);
        if case_sensitive {
            regex::Regex::new(&escaped)
        } else {
            regex::RegexBuilder::new(&escaped)
                .case_insensitive(true)
                .build()
        }
        .map_err(|e| format!("Failed to build search pattern: {}", e))?
    };

    let mut file_matches: HashMap<String, Vec<SearchMatch>> = HashMap::new();
    let mut total: u32 = 0;
    let mut truncated = false;

    for entry in builder.build().flatten() {
        if truncated {
            break;
        }

        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        // Try to read as UTF-8, skip binary files
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let file_path = path
            .to_string_lossy()
            .replace('\\', "/");

        for (line_idx, line) in content.lines().enumerate() {
            if truncated {
                break;
            }

            for mat in compiled_regex.find_iter(line) {
                if total >= max_results {
                    truncated = true;
                    break;
                }

                let m = SearchMatch {
                    file_path: file_path.clone(),
                    line_number: (line_idx + 1) as u32,
                    line_text: line.to_string(),
                    column_start: mat.start() as u32,
                    match_length: (mat.end() - mat.start()) as u32,
                };

                file_matches
                    .entry(file_path.clone())
                    .or_default()
                    .push(m);

                total += 1;
            }
        }
    }

    let files: Vec<SearchFileResult> = file_matches
        .into_iter()
        .map(|(path, matches)| SearchFileResult {
            file_path: path,
            matches,
        })
        .collect();

    Ok(SearchResult {
        files,
        total_matches: total,
        truncated,
    })
}

// ── Replace in Files ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ReplaceResult {
    /// Total number of replacements made
    pub replacements: u32,
    /// Number of files modified
    pub files_modified: u32,
}

/// Replace matching text across files in a project directory.
///
/// Walks the directory respecting .gitignore, finds matches, and writes replacements.
/// Returns the total number of replacements and files modified.
pub fn replace_in_files(
    root: &str,
    search: &str,
    replace: &str,
    is_regex: bool,
    case_sensitive: bool,
    glob_filter: Option<&str>,
) -> Result<ReplaceResult, String> {
    use ignore::WalkBuilder;

    if search.is_empty() {
        return Err("Search pattern must not be empty".to_string());
    }

    // Validate that root path doesn't contain traversal
    let root_path = std::path::Path::new(root);
    if !root_path.exists() || !root_path.is_dir() {
        return Err(format!("Root path '{}' is not a valid directory", root));
    }
    let root_normalized = root.replace('\\', "/");
    for component in root_normalized.split('/') {
        if component == ".." {
            return Err("Root path contains directory traversal (..) which is not allowed".to_string());
        }
    }

    // Compile the search pattern
    let compiled_regex = if is_regex {
        if case_sensitive {
            regex::Regex::new(search)
        } else {
            regex::RegexBuilder::new(search)
                .case_insensitive(true)
                .build()
        }
        .map_err(|e| format!("Invalid regex: {}", e))?
    } else {
        let escaped = regex::escape(search);
        if case_sensitive {
            regex::Regex::new(&escaped)
        } else {
            regex::RegexBuilder::new(&escaped)
                .case_insensitive(true)
                .build()
        }
        .map_err(|e| format!("Failed to build search pattern: {}", e))?
    };

    let mut builder = WalkBuilder::new(root);
    builder.hidden(true).git_ignore(true).git_global(true);

    // Apply glob filter if provided
    if let Some(glob) = glob_filter {
        let mut types_builder = ignore::types::TypesBuilder::new();
        for g in glob.split(',') {
            let g = g.trim();
            if !g.is_empty() {
                types_builder
                    .add("custom", g)
                    .map_err(|e| format!("Invalid glob pattern '{}': {}", g, e))?;
            }
        }
        types_builder.select("custom");
        let types = types_builder
            .build()
            .map_err(|e| format!("Failed to build glob filter: {}", e))?;
        builder.types(types);
    }

    let mut total_replacements: u32 = 0;
    let mut files_modified: u32 = 0;

    for entry in builder.build().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        // Try to read as UTF-8, skip binary files
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // Check if the file has any matches before doing replacement
        if !compiled_regex.is_match(&content) {
            continue;
        }

        // Count matches in this file
        let match_count = compiled_regex.find_iter(&content).count() as u32;

        // Perform the replacement
        let replaced = compiled_regex.replace_all(&content, replace).to_string();

        // Only write if content actually changed
        if replaced != content {
            std::fs::write(path, &replaced)
                .map_err(|e| format!("Failed to write file '{}': {}", path.display(), e))?;
            total_replacements += match_count;
            files_modified += 1;
        }
    }

    Ok(ReplaceResult {
        replacements: total_replacements,
        files_modified,
    })
}
