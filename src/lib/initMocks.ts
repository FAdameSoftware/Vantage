/**
 * Mock initialization — patches Tauri internals BEFORE React renders.
 *
 * This module is imported synchronously at the top of main.tsx.
 * It checks whether we are running inside Tauri and, if not,
 * installs mock objects on `window` so that every `@tauri-apps/*`
 * import resolves without errors.
 */

import { isTauri, setupMocks } from "./tauriMock";

if (!isTauri) {
  setupMocks();
}
