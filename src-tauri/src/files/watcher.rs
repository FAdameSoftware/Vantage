use notify_debouncer_full::notify::event::ModifyKind;
use notify_debouncer_full::notify::{EventKind, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileChangeEvent {
    pub path: String,
    pub kind: FileChangeKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum FileChangeKind {
    Created,
    Modified,
    Removed,
    Renamed,
    Other,
}

impl From<&EventKind> for FileChangeKind {
    fn from(kind: &EventKind) -> Self {
        match kind {
            EventKind::Create(_) => FileChangeKind::Created,
            EventKind::Modify(ModifyKind::Name(_)) => FileChangeKind::Renamed,
            EventKind::Modify(_) => FileChangeKind::Modified,
            EventKind::Remove(_) => FileChangeKind::Removed,
            _ => FileChangeKind::Other,
        }
    }
}

pub struct FileWatcherState {
    debouncer: Option<Debouncer<notify_debouncer_full::notify::RecommendedWatcher, RecommendedCache>>,
    watched_path: Option<PathBuf>,
}

impl FileWatcherState {
    pub fn new() -> Self {
        Self {
            debouncer: None,
            watched_path: None,
        }
    }
}

/// Start watching a directory for file changes.
/// Emits "file_changed" events to the frontend via Tauri events.
pub fn start_watching(
    app_handle: &AppHandle,
    watcher_state: &Mutex<FileWatcherState>,
    path: &str,
) -> Result<(), String> {
    let watch_path = PathBuf::from(path);
    if !watch_path.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let handle = app_handle.clone();

    let debouncer = new_debouncer(
        Duration::from_millis(500),
        None,
        move |result: DebounceEventResult| {
            match result {
                Ok(events) => {
                    for event in events {
                        let kind = FileChangeKind::from(&event.kind);
                        for path in &event.paths {
                            let normalized = path.to_string_lossy().replace('\\', "/");
                            let change = FileChangeEvent {
                                path: normalized,
                                kind: kind.clone(),
                            };
                            // Emit event to all frontend listeners
                            let _ = handle.emit("file_changed", &change);
                        }
                    }
                }
                Err(errors) => {
                    for error in errors {
                        eprintln!("File watcher error: {:?}", error);
                    }
                }
            }
        },
    )
    .map_err(|e| format!("Failed to create file watcher: {}", e))?;

    let mut state = watcher_state
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    // Stop existing watcher if any
    state.debouncer = None;
    state.watched_path = None;

    // Start the new watcher -- we store the debouncer first, then watch
    state.debouncer = Some(debouncer);
    state.watched_path = Some(watch_path.clone());

    // Get a mutable reference to the debouncer we just stored
    if let Some(ref mut debouncer) = state.debouncer {
        debouncer
            .watch(&watch_path, RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to start watching: {}", e))?;
    }

    Ok(())
}

/// Stop watching the current directory.
pub fn stop_watching(watcher_state: &Mutex<FileWatcherState>) -> Result<(), String> {
    let mut state = watcher_state
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    state.debouncer = None;
    state.watched_path = None;

    Ok(())
}
