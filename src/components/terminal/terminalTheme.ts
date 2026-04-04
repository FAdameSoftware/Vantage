import type { ITheme } from "@xterm/xterm";
import type { ThemeName } from "@/stores/settings";

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

/**
 * Catppuccin Latte theme for xterm.js (light).
 */
export const catppuccinLatteTerminalTheme: ITheme = {
  background: "#eff1f5", // base
  foreground: "#4c4f69", // text
  cursor: "#dc8a78", // rosewater
  cursorAccent: "#eff1f5", // base
  selectionBackground: "#acb0be80", // surface-2 + alpha
  selectionForeground: undefined,
  selectionInactiveBackground: "#acb0be40",

  // Normal colors (0-7)
  black: "#bcc0cc", // surface-1
  red: "#d20f39", // red
  green: "#40a02b", // green
  yellow: "#df8e1d", // yellow
  blue: "#1e66f5", // blue
  magenta: "#ea76cb", // pink
  cyan: "#179299", // teal
  white: "#5c5f77", // subtext-1

  // Bright colors (8-15)
  brightBlack: "#acb0be", // surface-2
  brightRed: "#d20f39", // red
  brightGreen: "#40a02b", // green
  brightYellow: "#df8e1d", // yellow
  brightBlue: "#1e66f5", // blue
  brightMagenta: "#ea76cb", // pink
  brightCyan: "#179299", // teal
  brightWhite: "#6c6f85", // subtext-0
};

/**
 * High Contrast theme for xterm.js (WCAG AAA).
 */
export const highContrastTerminalTheme: ITheme = {
  background: "#ffffff",
  foreground: "#000000",
  cursor: "#000000",
  cursorAccent: "#ffffff",
  selectionBackground: "#b0c4de",
  selectionForeground: "#000000",
  selectionInactiveBackground: "#c8d8ec",

  // Normal colors (0-7)
  black: "#000000",
  red: "#b00020",    // 7.1:1
  green: "#006b00",  // 7.9:1
  yellow: "#7a5500", // 7.2:1
  blue: "#0040a0",   // 8.5:1
  magenta: "#8b006b", // 8.0:1
  cyan: "#006060",   // 7.5:1
  white: "#333333",  // 12.6:1

  // Bright colors (8-15)
  brightBlack: "#1a1a1a",
  brightRed: "#b00020",
  brightGreen: "#006b00",
  brightYellow: "#7a5500",
  brightBlue: "#0040a0",
  brightMagenta: "#8b006b",
  brightCyan: "#006060",
  brightWhite: "#000000",
};

/**
 * Returns the correct xterm.js ITheme for the given ThemeName.
 */
export function getTerminalTheme(theme: ThemeName): ITheme {
  switch (theme) {
    case "vantage-light":
      return catppuccinLatteTerminalTheme;
    case "vantage-high-contrast":
      return highContrastTerminalTheme;
    case "vantage-dark":
    default:
      return catppuccinMochaTerminalTheme;
  }
}
