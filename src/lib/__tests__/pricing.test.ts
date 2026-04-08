import { describe, it, expect } from "vitest";
import {
  getModelPricing,
  normalizeModelName,
  MODEL_PRICING,
  calculateCost,
  formatTokenCount,
  formatCost,
} from "../pricing";

describe("pricing", () => {
  describe("normalizeModelName", () => {
    it("strips date suffix from model name", () => {
      expect(normalizeModelName("claude-sonnet-4-20250514")).toBe(
        "claude-sonnet-4",
      );
      expect(normalizeModelName("claude-haiku-4-5-20250301")).toBe(
        "claude-haiku-4-5",
      );
    });

    it("leaves model name without date suffix unchanged", () => {
      expect(normalizeModelName("claude-sonnet-4")).toBe("claude-sonnet-4");
      expect(normalizeModelName("claude-haiku-4-5")).toBe("claude-haiku-4-5");
    });
  });

  describe("getModelPricing", () => {
    it("returns Haiku pricing for claude-haiku-4-5 (BUG-004)", () => {
      const pricing = getModelPricing("claude-haiku-4-5");
      expect(pricing.inputPerMillion).toBe(0.8);
      expect(pricing.outputPerMillion).toBe(4);
      expect(pricing.cacheWritePerMillion).toBe(1);
      expect(pricing.cacheReadPerMillion).toBe(0.08);
    });

    it("returns Haiku pricing for claude-haiku-4-5 with date suffix", () => {
      const pricing = getModelPricing("claude-haiku-4-5-20250301");
      expect(pricing.inputPerMillion).toBe(0.8);
      expect(pricing.outputPerMillion).toBe(4);
    });

    it("returns Opus 4.6 pricing for claude-opus-4-6", () => {
      const pricing = getModelPricing("claude-opus-4-6");
      expect(pricing.inputPerMillion).toBe(15);
      expect(pricing.outputPerMillion).toBe(75);
      expect(pricing.cacheWritePerMillion).toBe(18.75);
      expect(pricing.cacheReadPerMillion).toBe(1.5);
    });

    it("returns Sonnet 4.6 pricing for claude-sonnet-4-6", () => {
      const pricing = getModelPricing("claude-sonnet-4-6");
      expect(pricing.inputPerMillion).toBe(3);
      expect(pricing.outputPerMillion).toBe(15);
      expect(pricing.cacheWritePerMillion).toBe(3.75);
      expect(pricing.cacheReadPerMillion).toBe(0.3);
    });

    it("returns Sonnet 4 pricing for claude-sonnet-4", () => {
      const pricing = getModelPricing("claude-sonnet-4");
      expect(pricing.inputPerMillion).toBe(3);
      expect(pricing.outputPerMillion).toBe(15);
    });

    it("returns Opus 4 pricing for claude-opus-4", () => {
      const pricing = getModelPricing("claude-opus-4");
      expect(pricing.inputPerMillion).toBe(15);
      expect(pricing.outputPerMillion).toBe(75);
    });

    it("returns default pricing for unknown models", () => {
      const pricing = getModelPricing("unknown-model-xyz");
      expect(pricing.inputPerMillion).toBe(3);
      expect(pricing.outputPerMillion).toBe(15);
    });

    it("returns default pricing when model is undefined", () => {
      const pricing = getModelPricing(undefined);
      expect(pricing.inputPerMillion).toBe(3);
      expect(pricing.outputPerMillion).toBe(15);
    });

    it("handles date-suffixed Opus 4.6 model", () => {
      const pricing = getModelPricing("claude-opus-4-6-20260401");
      expect(pricing.inputPerMillion).toBe(15);
      expect(pricing.outputPerMillion).toBe(75);
    });

    it("handles date-suffixed Sonnet 4.6 model", () => {
      const pricing = getModelPricing("claude-sonnet-4-6-20260401");
      expect(pricing.inputPerMillion).toBe(3);
      expect(pricing.outputPerMillion).toBe(15);
    });

    it("returns legacy Haiku 3 pricing", () => {
      const pricing = getModelPricing("claude-3-haiku");
      expect(pricing.inputPerMillion).toBe(0.25);
      expect(pricing.outputPerMillion).toBe(1.25);
    });

    it("returns legacy Haiku 3.5 pricing", () => {
      const pricing = getModelPricing("claude-3-5-haiku");
      expect(pricing.inputPerMillion).toBe(0.8);
      expect(pricing.outputPerMillion).toBe(4);
    });
  });

  describe("calculateCost", () => {
    it("calculates cost correctly for Haiku model", () => {
      const cost = calculateCost(
        {
          input_tokens: 1_000_000,
          output_tokens: 1_000_000,
          cache_creation_input_tokens: 1_000_000,
          cache_read_input_tokens: 1_000_000,
        },
        "claude-haiku-4-5",
      );
      expect(cost.inputCost).toBe(0.8);
      expect(cost.outputCost).toBe(4);
      expect(cost.cacheWriteCost).toBe(1);
      expect(cost.cacheReadCost).toBe(0.08);
      expect(cost.totalCost).toBeCloseTo(5.88);
    });
  });

  describe("formatTokenCount", () => {
    it("formats millions", () => {
      expect(formatTokenCount(1_500_000)).toBe("1.5M");
    });

    it("formats thousands", () => {
      expect(formatTokenCount(1_500)).toBe("1.5k");
    });

    it("formats small numbers as-is", () => {
      expect(formatTokenCount(123)).toBe("123");
    });
  });

  describe("formatCost", () => {
    it("formats zero", () => {
      expect(formatCost(0)).toBe("$0");
    });

    it("formats small costs", () => {
      expect(formatCost(0.0005)).toBe("$0.0005");
    });

    it("formats dollar amounts", () => {
      expect(formatCost(1.5)).toBe("$1.50");
    });
  });
});
