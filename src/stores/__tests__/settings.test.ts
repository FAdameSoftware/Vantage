import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "../settings";

beforeEach(() => {
  useSettingsStore.setState({
    theme: "vantage-dark",
    fontSizeEditor: 14,
    fontSizeUI: 13,
    fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
    tabSize: 2,
    insertSpaces: true,
    wordWrap: false,
    minimap: true,
    lineNumbers: true,
    terminalFontSize: 14,
    terminalScrollback: 10000,
  });
});

describe("Settings Store", () => {
  it("has correct defaults", () => {
    const state = useSettingsStore.getState();
    expect(state.theme).toBe("vantage-dark");
    expect(state.fontSizeEditor).toBe(14);
    expect(state.fontSizeUI).toBe(13);
    expect(state.fontFamily).toBe('"JetBrains Mono", "Cascadia Code", "Fira Code", monospace');
    expect(state.tabSize).toBe(2);
    expect(state.insertSpaces).toBe(true);
    expect(state.wordWrap).toBe(false);
    expect(state.minimap).toBe(true);
    expect(state.lineNumbers).toBe(true);
    expect(state.terminalFontSize).toBe(14);
    expect(state.terminalScrollback).toBe(10000);
  });

  it("clamps editor font size within [8, 32]", () => {
    const { setFontSizeEditor } = useSettingsStore.getState();
    setFontSizeEditor(5);
    expect(useSettingsStore.getState().fontSizeEditor).toBe(8);
    setFontSizeEditor(50);
    expect(useSettingsStore.getState().fontSizeEditor).toBe(32);
    setFontSizeEditor(16);
    expect(useSettingsStore.getState().fontSizeEditor).toBe(16);
  });

  it("clamps tab size within [1, 8]", () => {
    const { setTabSize } = useSettingsStore.getState();
    setTabSize(0);
    expect(useSettingsStore.getState().tabSize).toBe(1);
    setTabSize(10);
    expect(useSettingsStore.getState().tabSize).toBe(8);
    setTabSize(4);
    expect(useSettingsStore.getState().tabSize).toBe(4);
  });

  it("toggles boolean settings", () => {
    const { setWordWrap, setMinimap, setLineNumbers, setInsertSpaces } =
      useSettingsStore.getState();

    setWordWrap(true);
    expect(useSettingsStore.getState().wordWrap).toBe(true);

    setMinimap(false);
    expect(useSettingsStore.getState().minimap).toBe(false);

    setLineNumbers(false);
    expect(useSettingsStore.getState().lineNumbers).toBe(false);

    setInsertSpaces(false);
    expect(useSettingsStore.getState().insertSpaces).toBe(false);
  });
});
