import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "vantage-dark";

export interface SettingsState {
  theme: ThemeName;
  fontSizeEditor: number;
  fontSizeUI: number;
  fontFamily: string;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  terminalFontSize: number;
  terminalScrollback: number;
  setTheme: (theme: ThemeName) => void;
  setFontSizeEditor: (size: number) => void;
  setFontSizeUI: (size: number) => void;
  setFontFamily: (family: string) => void;
  setTabSize: (size: number) => void;
  setInsertSpaces: (value: boolean) => void;
  setWordWrap: (value: boolean) => void;
  setMinimap: (value: boolean) => void;
  setLineNumbers: (value: boolean) => void;
  setTerminalFontSize: (size: number) => void;
  setTerminalScrollback: (size: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
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
      setTheme: (theme) => set({ theme }),
      setFontSizeEditor: (size) => set({ fontSizeEditor: Math.max(8, Math.min(32, size)) }),
      setFontSizeUI: (size) => set({ fontSizeUI: Math.max(10, Math.min(24, size)) }),
      setFontFamily: (family) => set({ fontFamily: family }),
      setTabSize: (size) => set({ tabSize: Math.max(1, Math.min(8, size)) }),
      setInsertSpaces: (value) => set({ insertSpaces: value }),
      setWordWrap: (value) => set({ wordWrap: value }),
      setMinimap: (value) => set({ minimap: value }),
      setLineNumbers: (value) => set({ lineNumbers: value }),
      setTerminalFontSize: (size) => set({ terminalFontSize: Math.max(8, Math.min(32, size)) }),
      setTerminalScrollback: (size) => set({ terminalScrollback: Math.max(1000, Math.min(100000, size)) }),
    }),
    {
      name: "vantage-settings",
      partialize: (state) => ({
        theme: state.theme,
        fontSizeEditor: state.fontSizeEditor,
        fontSizeUI: state.fontSizeUI,
        fontFamily: state.fontFamily,
        tabSize: state.tabSize,
        insertSpaces: state.insertSpaces,
        wordWrap: state.wordWrap,
        minimap: state.minimap,
        lineNumbers: state.lineNumbers,
        terminalFontSize: state.terminalFontSize,
        terminalScrollback: state.terminalScrollback,
      }),
    }
  )
);
