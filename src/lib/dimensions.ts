/**
 * Shared dimension tokens for consistent sizing across the UI.
 * Keeps hardcoded pixel values in one place rather than scattered across components.
 */
export const DIMENSIONS = {
  /** Chat input textarea maxHeight */
  chatInput: { maxHeight: 240 },
  /** Common maxHeight values for dropdown / overlay panels */
  dropdown: {
    /** Small panels: autocomplete, tooltips */
    sm: 200,
    /** Medium panels: mention picker, slash autocomplete, activity trail */
    md: 300,
    /** Large panels: session selector, quick-question overlay */
    lg: 320,
    /** Notification center */
    xl: 420,
  },
  /** Lucide icon sizes — pass as the `size` prop */
  icon: {
    /** Tight inline icons (10-12px) */
    xs: 12,
    /** Small UI icons (14px) */
    sm: 14,
    /** Default UI icons (16px) */
    md: 16,
    /** Large / prominent icons (20px) */
    lg: 20,
  },
} as const;
