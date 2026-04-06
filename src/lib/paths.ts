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
