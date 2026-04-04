import { describe, it, expect, beforeEach } from "vitest";
import { useCommandPaletteStore } from "../commandPalette";

describe("commandPaletteStore", () => {
  beforeEach(() => {
    useCommandPaletteStore.setState({
      isOpen: false,
      mode: "commands",
      searchText: "",
    });
  });

  it("has correct default values", () => {
    const state = useCommandPaletteStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.mode).toBe("commands");
    expect(state.searchText).toBe("");
  });

  it("open defaults to commands mode with > prefix", () => {
    useCommandPaletteStore.getState().open();

    const state = useCommandPaletteStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.mode).toBe("commands");
    expect(state.searchText).toBe(">");
  });

  it("open with files mode sets empty search text", () => {
    useCommandPaletteStore.getState().open("files");

    const state = useCommandPaletteStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.mode).toBe("files");
    expect(state.searchText).toBe("");
  });

  it("open with goto mode sets empty search text", () => {
    useCommandPaletteStore.getState().open("goto");

    const state = useCommandPaletteStore.getState();
    expect(state.mode).toBe("goto");
    expect(state.searchText).toBe("");
  });

  it("close sets isOpen to false and clears search text", () => {
    useCommandPaletteStore.getState().open();
    useCommandPaletteStore.getState().close();

    const state = useCommandPaletteStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.searchText).toBe("");
  });

  it("setMode changes the mode", () => {
    useCommandPaletteStore.getState().setMode("goto");
    expect(useCommandPaletteStore.getState().mode).toBe("goto");
  });

  it("setSearchText with > prefix auto-detects commands mode", () => {
    useCommandPaletteStore.getState().open("files");
    useCommandPaletteStore.getState().setSearchText(">help");

    const state = useCommandPaletteStore.getState();
    expect(state.searchText).toBe(">help");
    expect(state.mode).toBe("commands");
  });

  it("setSearchText with : prefix auto-detects goto mode", () => {
    useCommandPaletteStore.getState().setSearchText(":42");

    const state = useCommandPaletteStore.getState();
    expect(state.searchText).toBe(":42");
    expect(state.mode).toBe("goto");
  });

  it("setSearchText without prefix auto-detects files mode", () => {
    useCommandPaletteStore.getState().open("commands");
    useCommandPaletteStore.getState().setSearchText("main.ts");

    const state = useCommandPaletteStore.getState();
    expect(state.searchText).toBe("main.ts");
    expect(state.mode).toBe("files");
  });
});
