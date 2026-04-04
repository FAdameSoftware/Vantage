import { describe, it, expect, beforeEach } from "vitest";
import { useQuickQuestionStore } from "../quickQuestion";

describe("quickQuestionStore", () => {
  beforeEach(() => {
    useQuickQuestionStore.setState({
      isOpen: false,
      question: "",
      response: "",
      isLoading: false,
      error: null,
    });
  });

  it("has correct default values", () => {
    const state = useQuickQuestionStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.question).toBe("");
    expect(state.response).toBe("");
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("open sets isOpen to true", () => {
    useQuickQuestionStore.getState().open();
    expect(useQuickQuestionStore.getState().isOpen).toBe(true);
  });

  it("close sets isOpen to false", () => {
    useQuickQuestionStore.getState().open();
    useQuickQuestionStore.getState().close();
    expect(useQuickQuestionStore.getState().isOpen).toBe(false);
  });

  it("ask sets question, clears response, starts loading, and opens overlay", () => {
    useQuickQuestionStore.getState().ask("What is Tauri?");

    const state = useQuickQuestionStore.getState();
    expect(state.question).toBe("What is Tauri?");
    expect(state.response).toBe("");
    expect(state.isLoading).toBe(true);
    expect(state.error).toBeNull();
    expect(state.isOpen).toBe(true);
  });

  it("appendResponse concatenates text to response", () => {
    useQuickQuestionStore.getState().ask("Test?");
    useQuickQuestionStore.getState().appendResponse("Hello ");
    useQuickQuestionStore.getState().appendResponse("world!");

    expect(useQuickQuestionStore.getState().response).toBe("Hello world!");
  });

  it("setLoading updates the loading flag", () => {
    useQuickQuestionStore.getState().setLoading(true);
    expect(useQuickQuestionStore.getState().isLoading).toBe(true);

    useQuickQuestionStore.getState().setLoading(false);
    expect(useQuickQuestionStore.getState().isLoading).toBe(false);
  });

  it("setError sets the error and stops loading", () => {
    useQuickQuestionStore.getState().setLoading(true);
    useQuickQuestionStore.getState().setError("Network failure");

    const state = useQuickQuestionStore.getState();
    expect(state.error).toBe("Network failure");
    expect(state.isLoading).toBe(false);
  });

  it("setError with null clears the error", () => {
    useQuickQuestionStore.getState().setError("Some error");
    useQuickQuestionStore.getState().setError(null);

    expect(useQuickQuestionStore.getState().error).toBeNull();
  });

  it("reset returns all state to defaults", () => {
    const store = useQuickQuestionStore.getState();
    store.ask("A question");
    store.appendResponse("Some response");

    useQuickQuestionStore.getState().reset();

    const state = useQuickQuestionStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.question).toBe("");
    expect(state.response).toBe("");
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });
});
