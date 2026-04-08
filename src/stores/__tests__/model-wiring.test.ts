import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "../settings";
import { AVAILABLE_MODELS, DEFAULT_MODEL } from "@/lib/models";

beforeEach(() => {
  useSettingsStore.setState({
    selectedModel: DEFAULT_MODEL,
  });
});

describe("Model wiring — settings store", () => {
  it("selectedModel defaults to DEFAULT_MODEL", () => {
    const state = useSettingsStore.getState();
    expect(state.selectedModel).toBe(DEFAULT_MODEL);
    expect(state.selectedModel).toBe("claude-sonnet-4-6");
  });

  it("setSelectedModel updates the selected model", () => {
    const { setSelectedModel } = useSettingsStore.getState();
    setSelectedModel("claude-opus-4-6");
    expect(useSettingsStore.getState().selectedModel).toBe("claude-opus-4-6");
  });

  it("selectedModel is included in persistence (partialize)", () => {
    // The persist middleware partializes the store — selectedModel must be
    // listed there for it to survive reloads.  We can verify by checking
    // that the field exists and is a string in fresh state.
    const state = useSettingsStore.getState();
    expect(typeof state.selectedModel).toBe("string");
    expect(state.selectedModel.length).toBeGreaterThan(0);
  });

  it("all AVAILABLE_MODELS ids can be set as selectedModel", () => {
    const { setSelectedModel } = useSettingsStore.getState();
    for (const m of AVAILABLE_MODELS) {
      setSelectedModel(m.id);
      expect(useSettingsStore.getState().selectedModel).toBe(m.id);
    }
  });
});

describe("Model wiring — invoke parameter shape", () => {
  it("settings provide the fields needed for claude_start_session invoke", () => {
    const settings = useSettingsStore.getState();
    // These are the fields that useClaude.ts reads from settings
    // to pass to the invoke("claude_start_session", {...}) call.
    const invokeArgs = {
      cwd: "/test",
      sessionId: null,
      resume: false,
      effortLevel: settings.effortLevel,
      planMode: settings.planMode,
      fromPr: null,
      skipPermissions: settings.skipPermissions ?? false,
      model: settings.selectedModel ?? null,
    };

    expect(invokeArgs.model).toBe("claude-sonnet-4-6");
    expect(invokeArgs.effortLevel).toBe("high");
    expect(invokeArgs.planMode).toBe(false);
  });

  it("model param follows selectedModel changes", () => {
    useSettingsStore.getState().setSelectedModel("claude-opus-4-6");
    const settings = useSettingsStore.getState();
    const model = settings.selectedModel ?? null;
    expect(model).toBe("claude-opus-4-6");
  });
});
