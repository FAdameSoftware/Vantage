/**
 * Shared Tauri IPC helpers.
 *
 * Consolidates repeated invoke("write_file", ...) calls that appear
 * in 8+ files across the codebase.
 */

import { invoke } from "@tauri-apps/api/core";

/** Write content to a file via the Tauri backend. */
export async function saveFile(path: string, content: string): Promise<void> {
  await invoke("write_file", { path, content });
}
