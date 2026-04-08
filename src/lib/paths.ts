/** Normalize a file path to forward slashes (Windows → Unix style) */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Extract the basename (filename) from a path */
export function basename(path: string): string {
  return normalizePath(path).split("/").pop() ?? path;
}

/** Compute a path relative to a root directory */
export function relativePath(filePath: string, rootPath: string): string {
  const normFile = normalizePath(filePath);
  const normRoot = normalizePath(rootPath);
  if (normFile.startsWith(normRoot)) {
    return normFile.slice(normRoot.length).replace(/^\//, "");
  }
  return normFile;
}

/**
 * SEC-016: Compare two file paths for equality, handling platform differences.
 * On Windows, paths are compared case-insensitively since the filesystem is
 * case-insensitive. On other platforms, comparison is case-sensitive.
 * Both paths are normalized to forward slashes before comparison.
 */
export function pathsEqual(a: string, b: string): boolean {
  const normA = normalizePath(a);
  const normB = normalizePath(b);

  // Detect Windows: navigator.platform, or common Tauri window indicators.
  // In Tauri on Windows, paths will typically start with a drive letter (e.g., C:/).
  const isWindows =
    typeof navigator !== "undefined"
      ? navigator.platform?.startsWith("Win") ||
        navigator.userAgent?.includes("Windows")
      : // Fallback heuristic: if either path has a Windows drive letter
        /^[A-Za-z]:/.test(normA) || /^[A-Za-z]:/.test(normB);

  if (isWindows) {
    return normA.toLowerCase() === normB.toLowerCase();
  }
  return normA === normB;
}
