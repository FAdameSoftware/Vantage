/**
 * Single source of truth for available Claude models.
 *
 * Every model selector UI in Vantage must import from here instead of
 * maintaining its own hardcoded list.
 */

export const AVAILABLE_MODELS = [
  { id: "claude-opus-4-6", label: "Opus 4.6", family: "opus" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", family: "sonnet" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", family: "haiku" },
] as const;

export type ModelId = (typeof AVAILABLE_MODELS)[number]["id"];

export const DEFAULT_MODEL: ModelId = "claude-sonnet-4-6";
export const DEFAULT_MODEL_ID = DEFAULT_MODEL;
