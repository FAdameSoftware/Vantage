import { describe, it, expect } from "vitest";
import { AVAILABLE_MODELS, DEFAULT_MODEL } from "../models";
import type { ModelId } from "../models";

describe("models", () => {
  it("exports a non-empty list of available models", () => {
    expect(AVAILABLE_MODELS.length).toBeGreaterThanOrEqual(1);
  });

  it("every model has required fields", () => {
    for (const m of AVAILABLE_MODELS) {
      expect(m.id).toBeTruthy();
      expect(m.label).toBeTruthy();
      expect(m.family).toBeTruthy();
    }
  });

  it("DEFAULT_MODEL is one of the available model ids", () => {
    const ids = AVAILABLE_MODELS.map((m) => m.id);
    expect(ids).toContain(DEFAULT_MODEL);
  });

  it("DEFAULT_MODEL is claude-sonnet-4-6", () => {
    expect(DEFAULT_MODEL).toBe("claude-sonnet-4-6");
  });

  it("model ids are unique", () => {
    const ids = AVAILABLE_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ModelId type matches available model ids", () => {
    // This is a compile-time check — if this compiles, the type is correct
    const validId: ModelId = "claude-sonnet-4-6";
    expect(validId).toBeTruthy();
  });
});
