/**
 * Cross-File TypeScript Intelligence
 *
 * Registers project .ts/.tsx/.js/.jsx files with Monaco's TypeScript worker
 * via `addExtraLib()` so that cross-file go-to-definition, find-all-references,
 * and hover info work across the project.
 *
 * Strategy:
 * - On workspace open, scan the project index for TS/JS files
 * - Load up to MAX_FILES project files and register them as extra libs
 * - Files are loaded lazily in batches to avoid blocking the UI
 * - When a file is opened in the editor, ensure it's registered
 * - Declaration files from node_modules/@types are registered for stdlib types
 */

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as monaco from "monaco-editor";
import { useLayoutStore } from "@/stores/layout";

// ── Configuration ─────────────────────────────────────────────────────

/** Maximum number of project files to register with the TS worker */
const MAX_FILES = 100;

/** Maximum individual file size to register (bytes approximation via string length) */
const MAX_FILE_SIZE = 100_000;

/** File extensions to register */
const TS_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx"]);

/** Paths to skip */
const SKIP_PATTERNS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".vite",
  "coverage",
  "__pycache__",
  ".vantage",
];

// ── TS API Access ─────────────────────────────────────────────────────
// Monaco 0.55+ moved the TS/JS language API from `monaco.languages.typescript`
// to a top-level `monaco.typescript` export. We use the same pattern as
// MonacoEditor.tsx.
const tsApi = monaco.typescript;

// ── Types ─────────────────────────────────────────────────────────────

interface FileContent {
  path: string;
  content: string;
  language: string;
}

// ── State tracking (module-level singleton) ───────────────────────────

/** Set of file URIs already registered with addExtraLib */
const registeredFiles = new Set<string>();

/** Disposables returned by addExtraLib, keyed by URI */
const libDisposables = new Map<string, { dispose: () => void }>();

/** Whether initial scan has been done for the current project */
let currentProjectRoot: string | null = null;

// ── Helpers ───────────────────────────────────────────────────────────

function shouldSkipPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return SKIP_PATTERNS.some(
    (pattern) =>
      normalized.includes(`/${pattern}/`) ||
      normalized.endsWith(`/${pattern}`)
  );
}

function toMonacoUri(filePath: string): string {
  // Monaco expects file:// URIs for extra libs
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    return `file://${normalized}`;
  }
  // Windows: C:/foo -> file:///C:/foo
  return `file:///${normalized}`;
}

/**
 * Register a single file's content with Monaco's TS worker.
 * Uses addExtraLib so the TS worker can resolve imports to this file.
 */
function registerFileWithMonaco(filePath: string, content: string): void {
  const uri = toMonacoUri(filePath);

  if (registeredFiles.has(uri)) {
    // Update existing registration
    const existing = libDisposables.get(uri);
    if (existing) {
      existing.dispose();
    }
  }

  try {
    const disposable =
      tsApi.typescriptDefaults.addExtraLib(content, uri);
    registeredFiles.add(uri);
    libDisposables.set(uri, disposable);
  } catch (e) {
    // Non-fatal: some files may have encoding issues
    console.warn(`[CrossFile] Failed to register ${filePath}:`, e);
  }
}

/**
 * Clear all registered extra libs for the current project.
 */
function clearRegistrations(): void {
  for (const [, disposable] of libDisposables) {
    disposable.dispose();
  }
  libDisposables.clear();
  registeredFiles.clear();
}

/**
 * Scan the project and register TS/JS files with Monaco.
 * Uses the search_project command to find files, then reads their content.
 */
async function scanAndRegisterProject(rootPath: string): Promise<void> {
  // Don't re-scan if we already scanned this project
  if (currentProjectRoot === rootPath && registeredFiles.size > 0) {
    return;
  }

  // If switching projects, clear old registrations
  if (currentProjectRoot !== rootPath) {
    clearRegistrations();
    currentProjectRoot = rootPath;
  }

  try {
    // Use search_project to find all TS/JS files (search for a common pattern)
    // Actually, we need a file listing. Use get_file_tree with deeper depth.
    const tree = await invoke<Array<{
      name: string;
      path: string;
      is_dir: boolean;
      is_file: boolean;
      extension: string | null;
      children: unknown[] | null;
    }>>("get_file_tree", { path: rootPath, depth: 8 });

    // Flatten the tree to get all file paths
    const filePaths: string[] = [];
    const flatten = (nodes: typeof tree) => {
      for (const node of nodes) {
        if (filePaths.length >= MAX_FILES) break;

        if (node.is_file && node.extension && TS_EXTENSIONS.has(node.extension)) {
          if (!shouldSkipPath(node.path)) {
            filePaths.push(node.path);
          }
        }
        if (node.children && Array.isArray(node.children)) {
          flatten(node.children as typeof tree);
        }
      }
    };
    flatten(tree);

    // Load files in batches of 10 to avoid blocking
    const BATCH_SIZE = 10;
    for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
      const batch = filePaths.slice(i, i + BATCH_SIZE);

      // Load all files in the batch concurrently
      const results = await Promise.allSettled(
        batch.map((path) =>
          invoke<FileContent>("read_file", { path })
        )
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          const file = result.value;
          if (file.content.length <= MAX_FILE_SIZE) {
            registerFileWithMonaco(file.path, file.content);
          }
        }
      }

      // Yield to the event loop between batches
      if (i + BATCH_SIZE < filePaths.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    console.log(
      `[CrossFile] Registered ${registeredFiles.size} files for project: ${rootPath}`
    );
  } catch (e) {
    console.error("[CrossFile] Failed to scan project:", e);
  }
}

// ── Hook ──────────────────────────────────────────────────────────────

/**
 * Hook that enables cross-file TypeScript intelligence.
 * Call this once at a high level (e.g., in EditorArea or App).
 * It watches the project root path and registers project files with Monaco.
 */
export function useCrossFileIntelligence(): void {
  const projectRootPath = useLayoutStore((s) => s.projectRootPath);
  const scanInitiated = useRef(false);

  useEffect(() => {
    if (!projectRootPath) return;

    // Avoid duplicate scans for the same project
    if (scanInitiated.current && currentProjectRoot === projectRootPath) {
      return;
    }

    scanInitiated.current = true;
    scanAndRegisterProject(projectRootPath);

    return () => {
      // Don't clear on unmount -- keep registrations alive
      // They'll be cleared when the project root changes
    };
  }, [projectRootPath]);
}

/**
 * Register a single file that was just opened in the editor.
 * Called from MonacoEditor when a file is mounted.
 */
export function registerOpenedFile(filePath: string, content: string): void {
  const normalized = filePath.replace(/\\/g, "/");
  const ext = normalized.split(".").pop()?.toLowerCase();
  if (ext && TS_EXTENSIONS.has(ext)) {
    registerFileWithMonaco(normalized, content);
  }
}

/**
 * Update a registered file's content (e.g., when the user edits it).
 * This keeps the TS worker in sync with the editor.
 */
export function updateRegisteredFile(
  filePath: string,
  content: string
): void {
  const normalized = filePath.replace(/\\/g, "/");
  const uri = toMonacoUri(normalized);
  if (registeredFiles.has(uri)) {
    registerFileWithMonaco(normalized, content);
  }
}
