import { useEffect } from "react";
import {
  loadCustomTheme,
  applyCustomTheme,
  removeCustomTheme,
} from "@/lib/themeCustomization";
import { useSettingsStore } from "@/stores/settings";

/**
 * Loads the custom theme from ~/.vantage/theme.json on startup
 * and re-applies it whenever the base theme changes.
 */
export function useCustomTheme() {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    let cancelled = false;

    async function apply() {
      const customization = await loadCustomTheme();
      if (cancelled) return;

      if (customization) {
        applyCustomTheme(customization);
      } else {
        removeCustomTheme();
      }
    }

    apply();

    return () => {
      cancelled = true;
    };
  }, [theme]);
}
