/**
 * useRecentFiles — track and retrieve recently opened files (up to MAX_RECENT).
 *
 * Stored in localStorage under "vantage-recent-files" as an array of
 * RecentFile objects ordered from most- to least-recently opened.
 */

export interface RecentFile {
  /** Full normalized file path */
  path: string;
  /** Display name (filename) */
  name: string;
  /** Monaco language ID */
  language: string;
  /** ISO timestamp of when the file was last opened */
  lastOpenedAt: string;
}

const RECENT_FILES_KEY = "vantage-recent-files";
const MAX_RECENT = 20;

export function getRecentFiles(): RecentFile[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentFile =>
        typeof item === "object" &&
        item !== null &&
        typeof item.path === "string" &&
        typeof item.name === "string" &&
        typeof item.language === "string" &&
        typeof item.lastOpenedAt === "string",
    );
  } catch {
    return [];
  }
}

export function addRecentFile(file: Omit<RecentFile, "lastOpenedAt">): void {
  const current = getRecentFiles().filter((f) => f.path !== file.path);
  const next: RecentFile[] = [
    { ...file, lastOpenedAt: new Date().toISOString() },
    ...current,
  ];
  if (next.length > MAX_RECENT) next.length = MAX_RECENT;
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(next));
  } catch {
    // localStorage full or blocked — ignore
  }
}

export function clearRecentFiles(): void {
  try {
    localStorage.removeItem(RECENT_FILES_KEY);
  } catch {
    // ignore
  }
}
