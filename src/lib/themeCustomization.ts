import { invoke } from "@tauri-apps/api/core";

/**
 * User theme customization file schema.
 * Located at ~/.vantage/theme.json
 *
 * Any key in `colors` is a CSS custom property name (without --).
 * Values are CSS color strings.
 */
export interface ThemeCustomization {
  /** Display name for this custom theme */
  name?: string;
  /** Base theme to customize on top of */
  base?: "vantage-dark" | "vantage-light" | "vantage-high-contrast";
  /** CSS variable overrides, e.g. { "color-base": "#1a1b26" } */
  colors?: Record<string, string>;
}

// Track which CSS variables we have set, so we can clean up
let appliedOverrides: string[] = [];

/**
 * Load the custom theme from ~/.vantage/theme.json via Tauri invoke.
 * Returns null if the file does not exist or is invalid JSON.
 */
export async function loadCustomTheme(): Promise<ThemeCustomization | null> {
  try {
    const content = await invoke<string | null>("read_theme_file");
    if (!content) return null;
    return JSON.parse(content) as ThemeCustomization;
  } catch {
    return null;
  }
}

/**
 * Apply custom theme color overrides as CSS custom properties on :root.
 */
export function applyCustomTheme(customization: ThemeCustomization): void {
  // First remove any previously applied overrides
  removeCustomTheme();

  if (!customization.colors) return;

  const root = document.documentElement;
  const overrides: string[] = [];

  for (const [key, value] of Object.entries(customization.colors)) {
    const cssVar = key.startsWith("--") ? key : `--${key}`;
    root.style.setProperty(cssVar, value);
    overrides.push(cssVar);
  }

  appliedOverrides = overrides;
}

/**
 * Remove all custom CSS variable overrides (resets to base theme).
 */
export function removeCustomTheme(): void {
  const root = document.documentElement;
  for (const cssVar of appliedOverrides) {
    root.style.removeProperty(cssVar);
  }
  appliedOverrides = [];
}

/**
 * Returns the absolute path to ~/.vantage/theme.json.
 */
export async function getThemeFilePath(): Promise<string> {
  return invoke<string>("get_theme_file_path");
}
