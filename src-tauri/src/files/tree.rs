use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub extension: Option<String>,
    pub children: Option<Vec<FileNode>>,
    pub is_symlink: bool,
}

/// Build a file tree from the given root path, respecting .gitignore.
/// `depth` controls how many levels deep to traverse (1 = immediate children only).
pub fn build_file_tree(root: &str, depth: u32) -> Result<Vec<FileNode>, String> {
    let root_path = PathBuf::from(root);
    if !root_path.exists() {
        return Err(format!("Path does not exist: {}", root));
    }
    if !root_path.is_dir() {
        return Err(format!("Path is not a directory: {}", root));
    }

    let walker = WalkBuilder::new(&root_path)
        .max_depth(Some(depth as usize + 1)) // +1 because root itself is depth 0
        .hidden(false) // show dotfiles (except .gitignored)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .sort_by_file_path(|a, b| {
            // Directories first, then alphabetical (case-insensitive)
            let a_is_dir = a.is_dir();
            let b_is_dir = b.is_dir();
            match (a_is_dir, b_is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.file_name()
                    .unwrap_or_default()
                    .to_ascii_lowercase()
                    .cmp(
                        &b.file_name()
                            .unwrap_or_default()
                            .to_ascii_lowercase(),
                    ),
            }
        })
        .build();

    // Collect all entries into a flat list, excluding the root itself
    let mut entries: Vec<(PathBuf, bool, bool, bool)> = Vec::new();

    for entry in walker {
        let entry = entry.map_err(|e| format!("Walk error: {}", e))?;
        let entry_path = entry.path().to_path_buf();

        // Skip the root directory itself
        if entry_path == root_path {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|e| format!("Metadata error for {:?}: {}", entry_path, e))?;

        entries.push((
            entry_path,
            metadata.is_dir(),
            metadata.is_file(),
            metadata.is_symlink(),
        ));
    }

    // Build the tree structure from the flat list
    build_tree_from_entries(&root_path, &entries)
}

fn build_tree_from_entries(
    root: &Path,
    entries: &[(PathBuf, bool, bool, bool)],
) -> Result<Vec<FileNode>, String> {
    // Group entries by their immediate parent relative to root
    let mut children_map: HashMap<PathBuf, Vec<&(PathBuf, bool, bool, bool)>> = HashMap::new();

    for entry in entries {
        if let Some(parent) = entry.0.parent() {
            children_map
                .entry(parent.to_path_buf())
                .or_default()
                .push(entry);
        }
    }

    fn build_children(
        dir_path: &Path,
        children_map: &HashMap<PathBuf, Vec<&(PathBuf, bool, bool, bool)>>,
    ) -> Vec<FileNode> {
        let empty = Vec::new();
        let children = children_map.get(dir_path).unwrap_or(&empty);

        children
            .iter()
            .map(|(path, is_dir, is_file, is_symlink)| {
                let name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                let extension = if *is_file {
                    path.extension().map(|e| e.to_string_lossy().to_string())
                } else {
                    None
                };

                let node_children = if *is_dir {
                    let sub = build_children(path, children_map);
                    if sub.is_empty() {
                        // Directory exists but has no loaded children at this depth
                        // Return None to signal "expandable but not yet loaded"
                        None
                    } else {
                        Some(sub)
                    }
                } else {
                    None
                };

                // Normalize path separators to forward slashes for consistency
                let normalized_path = path.to_string_lossy().replace('\\', "/");

                FileNode {
                    name,
                    path: normalized_path,
                    is_dir: *is_dir,
                    is_file: *is_file,
                    extension,
                    children: node_children,
                    is_symlink: *is_symlink,
                }
            })
            .collect()
    }

    Ok(build_children(root, &children_map))
}

/// Get children of a specific directory (for lazy loading on expand).
/// Returns only the immediate children (depth=1).
pub fn get_directory_children(dir_path: &str) -> Result<Vec<FileNode>, String> {
    build_file_tree(dir_path, 1)
}
