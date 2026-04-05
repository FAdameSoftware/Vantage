/**
 * Workspace Storage — File I/O utilities for workspace persistence.
 *
 * All file operations go through Tauri IPC commands (read_workspace_file,
 * write_workspace_file, list_workspace_files) to access the filesystem.
 *
 * Storage location: ~/.vantage/workspaces/<base64url(projectPath)>.json
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  WorkspaceFile,
  RecentProjectsFile,
  RecentProject,
} from "./workspaceTypes";
import { createDefaultWorkspaceFile } from "./workspaceTypes";

// ─── Path utilities ────────────────────────────────────────────────

/**
 * Normalize a project path: forward slashes, lowercase drive letter on Windows.
 */
function normalizePath(projectPath: string): string {
  let normalized = projectPath.replace(/\\/g, "/");
  // Lowercase the drive letter on Windows paths like C:/...
  if (/^[A-Z]:\//.test(normalized)) {
    normalized = normalized[0].toLowerCase() + normalized.slice(1);
  }
  return normalized;
}

/**
 * Encode a project path into a filesystem-safe filename.
 * Uses base64url encoding of the UTF-8 path bytes.
 */
export function encodeWorkspacePath(projectPath: string): string {
  const normalized = normalizePath(projectPath);
  return btoa(normalized)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Get the full path to a workspace JSON file for the given project.
 * Returns the path under ~/.vantage/workspaces/.
 */
export function getWorkspaceFileName(projectPath: string): string {
  return `${encodeWorkspacePath(projectPath)}.json`;
}

// ─── Workspace file I/O ────────────────────────────────────────────

/**
 * Load a workspace state from disk. Returns null if the file doesn't exist.
 */
export async function loadWorkspace(
  projectPath: string,
): Promise<WorkspaceFile | null> {
  const fileName = getWorkspaceFileName(projectPath);
  try {
    const content = await invoke<string | null>("read_workspace_file", {
      fileName,
    });
    if (content === null) return null;
    const parsed = JSON.parse(content) as WorkspaceFile;
    // Basic version check
    if (parsed.version !== 1) {
      console.warn(
        `Workspace file has unsupported version ${parsed.version}, using defaults`,
      );
      return null;
    }
    // Validate that the stored projectPath matches the requested project
    if (parsed.projectPath !== normalizePath(projectPath)) {
      console.warn(
        `Workspace file projectPath mismatch: expected "${normalizePath(projectPath)}", got "${parsed.projectPath}", using defaults`,
      );
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn("Failed to load workspace file:", err);
    return null;
  }
}

/**
 * Save a workspace state to disk. Creates directories as needed.
 */
export async function saveWorkspace(
  projectPath: string,
  state: WorkspaceFile,
): Promise<void> {
  const fileName = getWorkspaceFileName(projectPath);
  const content = JSON.stringify(state, null, 2);
  await invoke("write_workspace_file", { fileName, content });
}

/**
 * Load a workspace from disk, or create a default if none exists.
 */
export async function loadOrCreateWorkspace(
  projectPath: string,
): Promise<WorkspaceFile> {
  const existing = await loadWorkspace(projectPath);
  if (existing) return existing;
  return createDefaultWorkspaceFile(normalizePath(projectPath));
}

// ─── Recent projects I/O ───────────────────────────────────────────

const RECENT_PROJECTS_FILE = "recent-projects.json";
const MAX_RECENT_PROJECTS = 20;

/**
 * Load the recent projects list from disk.
 */
export async function loadRecentProjects(): Promise<RecentProject[]> {
  try {
    const content = await invoke<string | null>("read_workspace_file", {
      fileName: RECENT_PROJECTS_FILE,
    });
    if (content === null) return [];
    const parsed = JSON.parse(content) as RecentProjectsFile;
    if (parsed.version !== 1) return [];
    return parsed.projects;
  } catch {
    return [];
  }
}

/**
 * Save the recent projects list to disk.
 */
export async function saveRecentProjects(
  projects: RecentProject[],
): Promise<void> {
  const file: RecentProjectsFile = {
    version: 1,
    projects: projects.slice(0, MAX_RECENT_PROJECTS),
  };
  const content = JSON.stringify(file, null, 2);
  await invoke("write_workspace_file", {
    fileName: RECENT_PROJECTS_FILE,
    content,
  });
}

/**
 * Add or update a project in the recent projects list (moves to top).
 */
export async function touchRecentProject(
  projectPath: string,
  name: string,
): Promise<RecentProject[]> {
  const normalizedPath = normalizePath(projectPath);
  const projects = await loadRecentProjects();

  // Remove existing entry if present
  const filtered = projects.filter((p) => normalizePath(p.path) !== normalizedPath);

  // Add to top
  const updated: RecentProject[] = [
    {
      path: normalizedPath,
      name,
      lastOpenedAt: new Date().toISOString(),
      pinned: projects.find((p) => normalizePath(p.path) === normalizedPath)?.pinned ?? false,
    },
    ...filtered,
  ].slice(0, MAX_RECENT_PROJECTS);

  await saveRecentProjects(updated);
  return updated;
}

/**
 * List all workspace filenames in the workspaces directory.
 */
export async function listWorkspaceFiles(): Promise<string[]> {
  try {
    return await invoke<string[]>("list_workspace_files");
  } catch {
    return [];
  }
}
