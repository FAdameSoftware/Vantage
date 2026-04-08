/**
 * Shared ID generation utility.
 *
 * Consolidates the duplicated generateId() helper that was defined
 * independently in useClaude.ts, conversation.ts, and useImagePaste.ts.
 */

/** Generate a simple unique ID based on timestamp + random suffix. */
export function generateId(prefix?: string): string {
  const base = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return prefix ? `${prefix}-${base}` : base;
}
