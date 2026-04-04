import type { ITheme } from "@xterm/xterm";

/**
 * Catppuccin Mocha theme for xterm.js.
 * Matches the CSS custom properties defined in index.css.
 */
export const catppuccinMochaTerminalTheme: ITheme = {
  background: "#1e1e2e", // base
  foreground: "#cdd6f4", // text
  cursor: "#f5e0dc", // rosewater
  cursorAccent: "#1e1e2e", // base
  selectionBackground: "#45475a80", // surface-1 + alpha
  selectionForeground: undefined, // use default
  selectionInactiveBackground: "#45475a40",

  // Normal colors (0-7)
  black: "#45475a", // surface-1
  red: "#f38ba8", // red
  green: "#a6e3a1", // green
  yellow: "#f9e2af", // yellow
  blue: "#89b4fa", // blue
  magenta: "#f5c2e7", // pink
  cyan: "#94e2d5", // teal
  white: "#bac2de", // subtext-1

  // Bright colors (8-15)
  brightBlack: "#585b70", // surface-2
  brightRed: "#f38ba8", // red
  brightGreen: "#a6e3a1", // green
  brightYellow: "#f9e2af", // yellow
  brightBlue: "#89b4fa", // blue
  brightMagenta: "#f5c2e7", // pink
  brightCyan: "#94e2d5", // teal
  brightWhite: "#a6adc8", // subtext-0
};
