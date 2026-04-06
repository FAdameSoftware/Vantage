/**
 * Shared animation constants for framer-motion.
 *
 * Centralises values that were previously duplicated across components
 * (ThinkingIndicator, PermissionDialog, UsagePanel, etc.).
 */

export const expandVariants = {
  collapsed: { opacity: 0, height: 0 },
  expanded: { opacity: 1, height: "auto" },
};

export const expandTransition = {
  duration: 0.15,
  ease: [0.4, 0, 0.2, 1] as const,
};

export const EASE_SMOOTH = [0.4, 0, 0.2, 1] as const;
export const DURATION_FAST = 0.15;
