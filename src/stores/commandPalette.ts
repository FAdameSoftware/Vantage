import { create } from "zustand";

export type PaletteMode = "commands" | "files" | "goto";

export interface CommandPaletteState {
  isOpen: boolean;
  mode: PaletteMode;
  /** The raw search input text */
  searchText: string;
  open: (mode?: PaletteMode) => void;
  close: () => void;
  setMode: (mode: PaletteMode) => void;
  setSearchText: (text: string) => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>()((set) => ({
  isOpen: false,
  mode: "commands",
  searchText: "",

  open: (mode = "commands") =>
    set({ isOpen: true, mode, searchText: mode === "commands" ? ">" : "" }),

  close: () => set({ isOpen: false, searchText: "" }),

  setMode: (mode) => set({ mode }),

  setSearchText: (text) => {
    // Auto-detect mode from prefix
    if (text.startsWith(">")) {
      set({ searchText: text, mode: "commands" });
    } else if (text.startsWith(":")) {
      set({ searchText: text, mode: "goto" });
    } else {
      set({ searchText: text, mode: "files" });
    }
  },
}));
