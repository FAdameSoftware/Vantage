/**
 * Shared formatting utilities.
 *
 * Consolidates the duplicated formatRelativeTime, formatDuration,
 * and formatTimestamp helpers that were scattered across the codebase.
 */

// ── Relative time ────────────────────────────────────────────────────────────

/**
 * Format a relative time string from a timestamp.
 *
 * Accepts either an ISO 8601 date string or a numeric epoch-ms value.
 * Returns human-readable strings like "just now", "5m ago", "3d ago", etc.
 */
export function formatRelativeTime(timestamp: string | number): string {
  const date = typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) return "just now";

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;

  return date.toLocaleDateString();
}

// ── Duration ─────────────────────────────────────────────────────────────────

/**
 * Format a duration given in milliseconds into a compact human-readable string.
 *
 * Examples: "450ms", "2.3s", "3m 12s", "1h 5m".
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) {
    const sec = ms / 1000;
    return ms % 1000 === 0 ? `${totalSec}s` : `${sec.toFixed(1)}s`;
  }

  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return `${min}m ${sec}s`;

  const hr = Math.floor(min / 60);
  const rem = min % 60;
  return `${hr}h ${rem}m`;
}

// ── Timestamp ────────────────────────────────────────────────────────────────

/**
 * Format an epoch-ms timestamp as a 12-hour time string (e.g. "2:05 PM").
 */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${period}`;
}

/**
 * Format an epoch-ms timestamp as a 24-hour time string with seconds
 * (e.g. "14:05:09").
 */
export function formatTimestamp24(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
