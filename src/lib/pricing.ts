// ─── Model pricing constants ─────────────────────────────────────────────────
// Prices are per million tokens (USD)

export interface ModelPricing {
  /** Cost per million input tokens */
  inputPerMillion: number;
  /** Cost per million output tokens */
  outputPerMillion: number;
  /** Cost per million cache write tokens (if applicable) */
  cacheWritePerMillion?: number;
  /** Cost per million cache read tokens (if applicable) */
  cacheReadPerMillion?: number;
}

/**
 * Pricing table for Claude models.
 * Keys are normalized model prefixes (date suffixes are stripped).
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Sonnet 4
  "claude-sonnet-4": {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  // Opus 4
  "claude-opus-4": {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheWritePerMillion: 18.75,
    cacheReadPerMillion: 1.5,
  },
  // Haiku 3.5
  "claude-3-5-haiku": {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheWritePerMillion: 1,
    cacheReadPerMillion: 0.08,
  },
  // Sonnet 3.5
  "claude-3-5-sonnet": {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  // Sonnet 3 (legacy)
  "claude-3-sonnet": {
    inputPerMillion: 3,
    outputPerMillion: 15,
  },
  // Opus 3 (legacy)
  "claude-3-opus": {
    inputPerMillion: 15,
    outputPerMillion: 75,
  },
  // Haiku 3 (legacy)
  "claude-3-haiku": {
    inputPerMillion: 0.25,
    outputPerMillion: 1.25,
  },
};

/** Default pricing if model is not recognized */
const DEFAULT_PRICING: ModelPricing = {
  inputPerMillion: 3,
  outputPerMillion: 15,
  cacheWritePerMillion: 3.75,
  cacheReadPerMillion: 0.3,
};

/**
 * Strip date suffix from model name: "claude-sonnet-4-20250514" -> "claude-sonnet-4"
 */
export function normalizeModelName(model: string): string {
  return model.replace(/-\d{8}$/, "");
}

/**
 * Look up pricing for a model. Falls back to default (Sonnet 4) pricing.
 */
export function getModelPricing(model?: string): ModelPricing {
  if (!model) return DEFAULT_PRICING;

  const normalized = normalizeModelName(model);

  // Try exact match first
  if (MODEL_PRICING[normalized]) {
    return MODEL_PRICING[normalized];
  }

  // Try prefix match (e.g., "claude-sonnet-4-..." matches "claude-sonnet-4")
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (normalized.startsWith(key)) {
      return pricing;
    }
  }

  return DEFAULT_PRICING;
}

// ─── Cost calculation ────────────────────────────────────────────────────────

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface CostBreakdown {
  /** Cost from regular input tokens */
  inputCost: number;
  /** Cost from output tokens */
  outputCost: number;
  /** Cost from cache write tokens */
  cacheWriteCost: number;
  /** Cost from cache read tokens */
  cacheReadCost: number;
  /** Total cost */
  totalCost: number;
}

/**
 * Calculate cost breakdown for a set of token usage data.
 */
export function calculateCost(
  usage: TokenUsage,
  model?: string,
): CostBreakdown {
  const pricing = getModelPricing(model);

  const inputCost = (usage.input_tokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost =
    (usage.output_tokens / 1_000_000) * pricing.outputPerMillion;
  const cacheWriteCost = usage.cache_creation_input_tokens
    ? (usage.cache_creation_input_tokens / 1_000_000) *
      (pricing.cacheWritePerMillion ?? 0)
    : 0;
  const cacheReadCost = usage.cache_read_input_tokens
    ? (usage.cache_read_input_tokens / 1_000_000) *
      (pricing.cacheReadPerMillion ?? 0)
    : 0;

  return {
    inputCost,
    outputCost,
    cacheWriteCost,
    cacheReadCost,
    totalCost: inputCost + outputCost + cacheWriteCost + cacheReadCost,
  };
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

/**
 * Format a token count for display: 1234 -> "1.2k", 123 -> "123"
 */
export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`;
  }
  return String(count);
}

/**
 * Format a cost for display: 0.003 -> "$0.003", 1.50 -> "$1.50"
 */
export function formatCost(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 0.001) return `$${cost.toFixed(4)}`;
  if (cost < 0.01) return `$${cost.toFixed(3)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}
