import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── IMPROVE-020: Inline style objects ──────────────────────────────────────
//
// As of 2026-04-07 there are ~1,356 `style={{ ... }}` occurrences across
// 112 component files. Most use CSS custom properties (e.g. var(--color-*))
// which cannot be expressed in Tailwind classes without a custom plugin.
//
// Migration path (multi-sprint effort):
//  1. Add Tailwind arbitrary-value classes for the most common color patterns
//     e.g. `text-[var(--color-text)]`, `bg-[var(--color-surface-0)]`
//  2. Create a Tailwind plugin that maps --color-* variables to utilities
//  3. Migrate files in batches, starting with the simplest components
//
// Tracked as IMPROVE-020 in the backlog. Do not attempt all-at-once migration.
