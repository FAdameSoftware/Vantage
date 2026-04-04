# Vantage Phase 1: Application Shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Vantage application shell -- a working Tauri v2 window with IDE layout, dark theme, and essential keybindings.

**Architecture:** Tauri v2 with React 19 frontend, Zustand v5 for state, shadcn/ui v4 for components, react-resizable-panels for split layout. Rust backend provides settings persistence and IPC scaffolding. CSS custom properties power the theme system.

**Tech Stack:** Tauri v2, React 19, TypeScript 5, Vite 7, shadcn/ui v4, Zustand v5, Tailwind CSS v4, react-resizable-panels, tauri-specta, JetBrains Mono font

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json` (via scaffold)
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize git repository**

```bash
cd C:/CursorProjects/Vantage
git init
```

- [ ] **Step 2: Create Tauri v2 project with React TypeScript template**

```bash
cd C:/CursorProjects/Vantage
npm create tauri-app@latest . -- --template react-ts --manager npm
```

Expected: Scaffold creates `package.json`, `src/`, `src-tauri/`, `vite.config.ts`, `tsconfig.json`, `index.html`, `.gitignore`.

- [ ] **Step 3: Install frontend dependencies**

```bash
cd C:/CursorProjects/Vantage
npm install zustand@^5 react-resizable-panels@^4.9 lucide-react@^0.470 sonner@^2 @tauri-apps/plugin-store@^2.2
```

- [ ] **Step 4: Install dev dependencies**

```bash
cd C:/CursorProjects/Vantage
npm install -D @types/node
```

- [ ] **Step 5: Add Rust dependencies to Cargo.toml**

Open `src-tauri/Cargo.toml` and ensure the `[dependencies]` section includes:

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-opener = "2"
tauri-plugin-store = "2"
tauri-specta = { version = "2", features = ["derive", "typescript"] }
specta = { version = "2", features = ["derive"] }
specta-typescript = "0.0.7"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
```

- [ ] **Step 6: Configure tauri.conf.json for Windows**

Replace the contents of `src-tauri/tauri.conf.json` with:

```json
{
  "$schema": "https://raw.githubusercontent.com/nicegui-dev/nicegui-tauri/refs/heads/main/src-tauri/schemas/desktop-schema.json",
  "productName": "Vantage",
  "version": "0.1.0",
  "identifier": "com.vantage.ide",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Vantage",
        "width": 1400,
        "height": 900,
        "minWidth": 800,
        "minHeight": 600,
        "decorations": false,
        "center": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "plugins": {
    "store": {}
  }
}
```

Key settings: `decorations: false` enables a custom title bar on Windows. Window starts at 1400x900 with 800x600 minimum.

- [ ] **Step 7: Set up Tauri plugin registration in Rust**

Replace `src-tauri/src/lib.rs` with:

```rust
use tauri::Manager;

#[tauri::command]
#[specta::specta]
fn greet(name: String) -> String {
    format!("Hello, {}! Welcome to Vantage.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![greet]);

    #[cfg(debug_assertions)]
    builder
        .export(
            specta_typescript::Typescript::default(),
            "../src/bindings.ts",
        )
        .expect("Failed to export TypeScript bindings");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Vantage");
}
```

- [ ] **Step 8: Replace the default App.tsx with a minimal shell**

Replace `src/App.tsx` with:

```tsx
function App() {
  return (
    <div className="h-screen w-screen bg-[#1e1e2e] text-[#cdd6f4] overflow-hidden">
      <p className="p-4 text-sm">Vantage is running.</p>
    </div>
  );
}

export default App;
```

- [ ] **Step 9: Verify the app builds and opens a window**

```bash
cd C:/CursorProjects/Vantage
npm run tauri dev
```

Expected: A 1400x900 window opens with dark background and "Vantage is running." text. The window has no native title bar (custom decorations mode). Close the window to stop the dev server.

- [ ] **Step 10: Create .gitignore additions**

Append to `.gitignore`:

```
# Vantage specific
src/bindings.ts
*.db
*.sqlite
```

- [ ] **Step 11: Commit**

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "feat: scaffold Tauri v2 + React 19 + TypeScript project

Initialize Vantage IDE with Tauri v2 React TypeScript template.
Add Zustand, react-resizable-panels, Lucide icons, Sonner toasts.
Configure tauri-specta for type-safe IPC.
Set decorations:false for custom Windows title bar."
```

---

### Task 2: Tailwind CSS v4 + shadcn/ui Setup

**Files:**
- Modify: `package.json`
- Create: `src/index.css` (modify existing)
- Create: `components.json`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/tabs.tsx`
- Create: `src/components/ui/tooltip.tsx`
- Create: `src/components/ui/context-menu.tsx`
- Create: `src/components/ui/command.tsx`
- Create: `src/components/ui/resizable.tsx`
- Create: `src/components/ui/sonner.tsx`
- Create: `src/lib/utils.ts`

- [ ] **Step 1: Install Tailwind CSS v4**

```bash
cd C:/CursorProjects/Vantage
npm install tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Configure Vite for Tailwind v4**

Replace `vite.config.ts` with:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
```

- [ ] **Step 3: Set up the base CSS with Tailwind v4 import**

Replace the contents of `src/index.css` (or `src/styles.css` depending on scaffold) with:

```css
@import "tailwindcss";
@import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap");

@theme {
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "Cascadia Code", "Fira Code", monospace;
}
```

- [ ] **Step 4: Create utility file for shadcn**

Create `src/lib/utils.ts`:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Install the dependencies:

```bash
cd C:/CursorProjects/Vantage
npm install clsx tailwind-merge
```

- [ ] **Step 5: Initialize shadcn/ui**

```bash
cd C:/CursorProjects/Vantage
npx shadcn@latest init -d
```

When prompted, select: New York style, Zinc color, CSS variables: yes. If the CLI auto-detects and uses defaults, that is fine.

Review the generated `components.json` and ensure `aliases.components` points to `@/components/ui` and `aliases.utils` points to `@/lib/utils`.

- [ ] **Step 6: Add required shadcn components**

```bash
cd C:/CursorProjects/Vantage
npx shadcn@latest add button dialog tabs tooltip context-menu command resizable sonner
```

Expected: Components are created under `src/components/ui/`. Each component is a standalone file.

- [ ] **Step 7: Verify Tailwind and shadcn work**

Temporarily update `src/App.tsx` to:

```tsx
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <div className="h-screen w-screen bg-[#1e1e2e] text-[#cdd6f4] flex items-center justify-center">
      <Button variant="outline" className="border-[#45475a] text-[#cdd6f4]">
        Vantage Shell
      </Button>
      <Toaster />
    </div>
  );
}

export default App;
```

Run `npm run tauri dev` and verify the button renders with the correct styling.

- [ ] **Step 8: Update tsconfig.json paths**

Ensure `tsconfig.json` contains the path alias:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

- [ ] **Step 9: Commit**

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "feat: configure Tailwind CSS v4 and shadcn/ui v4

Set up Tailwind v4 via Vite plugin with @theme configuration.
Initialize shadcn/ui with Button, Dialog, Tabs, Tooltip, ContextMenu,
Command (cmdk), Resizable, and Sonner (toast) components.
Add path alias @/ for clean imports.
Load JetBrains Mono and Inter fonts."
```

---

### Task 3: CSS Custom Properties / Theme System

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Define Catppuccin Mocha theme as CSS custom properties**

Add the following to `src/index.css` after the `@theme` block:

```css
:root {
  /* ===== Catppuccin Mocha Surface Layering ===== */
  --color-base: #1e1e2e;
  --color-mantle: #181825;
  --color-crust: #11111b;
  --color-surface-0: #313244;
  --color-surface-1: #45475a;
  --color-surface-2: #585b70;
  --color-overlay-0: #6c7086;
  --color-overlay-1: #7f849c;
  --color-overlay-2: #9399b2;

  /* ===== Text Hierarchy ===== */
  --color-text: #cdd6f4;
  --color-subtext-1: #bac2de;
  --color-subtext-0: #a6adc8;

  /* ===== Accent Colors ===== */
  --color-rosewater: #f5e0dc;
  --color-flamingo: #f2cdcd;
  --color-pink: #f5c2e7;
  --color-mauve: #cba6f7;
  --color-red: #f38ba8;
  --color-maroon: #eba0ac;
  --color-peach: #fab387;
  --color-yellow: #f9e2af;
  --color-green: #a6e3a1;
  --color-teal: #94e2d5;
  --color-sky: #89dceb;
  --color-sapphire: #74c7ec;
  --color-blue: #89b4fa;
  --color-lavender: #b4befe;

  /* ===== Semantic Aliases ===== */
  --color-primary: var(--color-blue);
  --color-warning: var(--color-peach);
  --color-error: var(--color-red);
  --color-success: var(--color-green);
  --color-info: var(--color-teal);

  /* ===== Borders ===== */
  --color-border: var(--color-surface-0);
  --color-border-focus: var(--color-blue);

  /* ===== Typography ===== */
  --font-mono: "JetBrains Mono", "Cascadia Code", "Fira Code", monospace;
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-size-editor: 14px;
  --font-size-ui: 13px;
  --font-size-small: 12px;
  --line-height-editor: 1.5;

  /* ===== Syntax Highlighting Token Colors ===== */
  --syntax-keyword: var(--color-mauve);
  --syntax-string: var(--color-green);
  --syntax-number: var(--color-peach);
  --syntax-comment: var(--color-overlay-0);
  --syntax-function: var(--color-blue);
  --syntax-type: var(--color-yellow);
  --syntax-variable: var(--color-text);
  --syntax-constant: var(--color-peach);
  --syntax-operator: var(--color-sky);
  --syntax-property: var(--color-lavender);
  --syntax-parameter: var(--color-maroon);
  --syntax-decorator: var(--color-mauve);
  --syntax-tag: var(--color-blue);
  --syntax-attribute: var(--color-yellow);
  --syntax-regex: var(--color-peach);
  --syntax-invalid: var(--color-red);
}

/* ===== Global Styles ===== */
body {
  margin: 0;
  padding: 0;
  background-color: var(--color-base);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--font-size-ui);
  line-height: 1.5;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  user-select: none;
}

/* Allow text selection in editor and terminal areas */
[data-allow-select="true"],
[data-allow-select="true"] * {
  user-select: text;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--color-surface-1);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-surface-2);
}

::-webkit-scrollbar-corner {
  background: transparent;
}

/* Focus ring */
*:focus-visible {
  outline: 1px solid var(--color-blue);
  outline-offset: -1px;
}
```

- [ ] **Step 2: Verify theme renders correctly**

Update `src/App.tsx` temporarily to test the theme:

```tsx
function App() {
  return (
    <div
      className="h-screen w-screen flex flex-col gap-2 p-4"
      style={{ backgroundColor: "var(--color-base)", color: "var(--color-text)" }}
    >
      <div className="flex gap-2">
        <div className="w-16 h-16 rounded" style={{ backgroundColor: "var(--color-crust)" }} title="crust" />
        <div className="w-16 h-16 rounded" style={{ backgroundColor: "var(--color-mantle)" }} title="mantle" />
        <div className="w-16 h-16 rounded" style={{ backgroundColor: "var(--color-base)" }} title="base" />
        <div className="w-16 h-16 rounded" style={{ backgroundColor: "var(--color-surface-0)" }} title="surface-0" />
        <div className="w-16 h-16 rounded" style={{ backgroundColor: "var(--color-surface-1)" }} title="surface-1" />
        <div className="w-16 h-16 rounded" style={{ backgroundColor: "var(--color-surface-2)" }} title="surface-2" />
      </div>
      <div className="flex gap-4 text-sm">
        <span style={{ color: "var(--color-blue)" }}>Blue</span>
        <span style={{ color: "var(--color-green)" }}>Green</span>
        <span style={{ color: "var(--color-red)" }}>Red</span>
        <span style={{ color: "var(--color-yellow)" }}>Yellow</span>
        <span style={{ color: "var(--color-mauve)" }}>Mauve</span>
        <span style={{ color: "var(--color-peach)" }}>Peach</span>
        <span style={{ color: "var(--color-teal)" }}>Teal</span>
        <span style={{ color: "var(--color-lavender)" }}>Lavender</span>
      </div>
      <p style={{ color: "var(--color-text)" }}>Primary text -- color-text</p>
      <p style={{ color: "var(--color-subtext-1)" }}>Secondary text -- color-subtext-1</p>
      <p style={{ color: "var(--color-subtext-0)" }}>Tertiary text -- color-subtext-0</p>
    </div>
  );
}

export default App;
```

Run `npm run tauri dev`. Verify: 6 surface swatches visible in dark gradient, 8 accent colors visible, 3 text hierarchy levels distinct. Close the window.

- [ ] **Step 3: Commit**

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "feat: implement Catppuccin Mocha theme system via CSS custom properties

Define all surface layers (base, mantle, crust, surface-0/1/2, overlay-0/1/2),
text hierarchy (text, subtext-0/1), 14 accent colors, semantic aliases,
syntax highlighting tokens, scrollbar styling, and focus rings.
All components reference CSS variables, never hardcoded hex values."
```

---

### Task 4: Layout Store (Zustand)

**Files:**
- Create: `src/stores/layout.ts`
- Create: `src/stores/__tests__/layout.test.ts`

- [ ] **Step 1: Create the layout store**

Create `src/stores/layout.ts`:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ActivityBarItem =
  | "explorer"
  | "search"
  | "git"
  | "agents"
  | "settings";

export interface LayoutState {
  // Sidebar visibility
  primarySidebarVisible: boolean;
  secondarySidebarVisible: boolean;
  panelVisible: boolean;

  // Active views
  activeActivityBarItem: ActivityBarItem;

  // Panel sizes (percentages)
  primarySidebarSize: number;
  secondarySidebarSize: number;
  panelSize: number;

  // Actions
  togglePrimarySidebar: () => void;
  toggleSecondarySidebar: () => void;
  togglePanel: () => void;
  setActiveActivityBarItem: (item: ActivityBarItem) => void;
  setPrimarySidebarSize: (size: number) => void;
  setSecondarySidebarSize: (size: number) => void;
  setPanelSize: (size: number) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      // Defaults
      primarySidebarVisible: true,
      secondarySidebarVisible: false,
      panelVisible: true,
      activeActivityBarItem: "explorer",
      primarySidebarSize: 20,
      secondarySidebarSize: 25,
      panelSize: 30,

      togglePrimarySidebar: () => {
        const current = get().primarySidebarVisible;
        set({ primarySidebarVisible: !current });
      },

      toggleSecondarySidebar: () => {
        const current = get().secondarySidebarVisible;
        set({ secondarySidebarVisible: !current });
      },

      togglePanel: () => {
        const current = get().panelVisible;
        set({ panelVisible: !current });
      },

      setActiveActivityBarItem: (item: ActivityBarItem) => {
        const current = get();
        if (current.activeActivityBarItem === item && current.primarySidebarVisible) {
          // Clicking the active item collapses the sidebar
          set({ primarySidebarVisible: false });
        } else {
          set({
            activeActivityBarItem: item,
            primarySidebarVisible: true,
          });
        }
      },

      setPrimarySidebarSize: (size: number) => set({ primarySidebarSize: size }),
      setSecondarySidebarSize: (size: number) => set({ secondarySidebarSize: size }),
      setPanelSize: (size: number) => set({ panelSize: size }),
    }),
    {
      name: "vantage-layout",
      partialize: (state) => ({
        primarySidebarVisible: state.primarySidebarVisible,
        secondarySidebarVisible: state.secondarySidebarVisible,
        panelVisible: state.panelVisible,
        activeActivityBarItem: state.activeActivityBarItem,
        primarySidebarSize: state.primarySidebarSize,
        secondarySidebarSize: state.secondarySidebarSize,
        panelSize: state.panelSize,
      }),
    }
  )
);
```

- [ ] **Step 2: Create store tests**

Install test dependencies if not already present:

```bash
cd C:/CursorProjects/Vantage
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Add to `vite.config.ts` (inside the config object):

```ts
  test: {
    environment: "jsdom",
    globals: true,
  },
```

Create `src/stores/__tests__/layout.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useLayoutStore } from "../layout";

describe("layoutStore", () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    useLayoutStore.setState({
      primarySidebarVisible: true,
      secondarySidebarVisible: false,
      panelVisible: true,
      activeActivityBarItem: "explorer",
      primarySidebarSize: 20,
      secondarySidebarSize: 25,
      panelSize: 30,
    });
  });

  it("has correct defaults", () => {
    const state = useLayoutStore.getState();
    expect(state.primarySidebarVisible).toBe(true);
    expect(state.secondarySidebarVisible).toBe(false);
    expect(state.panelVisible).toBe(true);
    expect(state.activeActivityBarItem).toBe("explorer");
  });

  it("toggles primary sidebar", () => {
    const store = useLayoutStore.getState();
    store.togglePrimarySidebar();
    expect(useLayoutStore.getState().primarySidebarVisible).toBe(false);
    useLayoutStore.getState().togglePrimarySidebar();
    expect(useLayoutStore.getState().primarySidebarVisible).toBe(true);
  });

  it("toggles secondary sidebar", () => {
    const store = useLayoutStore.getState();
    store.toggleSecondarySidebar();
    expect(useLayoutStore.getState().secondarySidebarVisible).toBe(true);
    useLayoutStore.getState().toggleSecondarySidebar();
    expect(useLayoutStore.getState().secondarySidebarVisible).toBe(false);
  });

  it("toggles panel", () => {
    const store = useLayoutStore.getState();
    store.togglePanel();
    expect(useLayoutStore.getState().panelVisible).toBe(false);
    useLayoutStore.getState().togglePanel();
    expect(useLayoutStore.getState().panelVisible).toBe(true);
  });

  it("sets active activity bar item and opens sidebar", () => {
    useLayoutStore.setState({ primarySidebarVisible: false });
    useLayoutStore.getState().setActiveActivityBarItem("search");
    const state = useLayoutStore.getState();
    expect(state.activeActivityBarItem).toBe("search");
    expect(state.primarySidebarVisible).toBe(true);
  });

  it("collapses sidebar when clicking the already-active item", () => {
    useLayoutStore.getState().setActiveActivityBarItem("explorer");
    expect(useLayoutStore.getState().primarySidebarVisible).toBe(false);
  });

  it("sets panel sizes", () => {
    useLayoutStore.getState().setPrimarySidebarSize(25);
    expect(useLayoutStore.getState().primarySidebarSize).toBe(25);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd C:/CursorProjects/Vantage
npx vitest run src/stores/__tests__/layout.test.ts
```

Expected: All 7 tests pass.

- [ ] **Step 4: Commit**

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "feat: add layout Zustand store with persistence and tests

Layout store manages sidebar visibility, panel visibility, active
activity bar item, and panel sizes. Persisted to localStorage.
Clicking the active activity bar item toggles the primary sidebar."
```

---

### Task 5: Settings Store (Zustand)

**Files:**
- Create: `src/stores/settings.ts`
- Create: `src/stores/__tests__/settings.test.ts`

- [ ] **Step 1: Create the settings store**

Create `src/stores/settings.ts`:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "vantage-dark";

export interface SettingsState {
  // Appearance
  theme: ThemeName;
  fontSizeEditor: number;
  fontSizeUI: number;
  fontFamily: string;

  // Editor
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;

  // Terminal
  terminalFontSize: number;
  terminalScrollback: number;

  // Actions
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
      // Defaults
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

      // Actions
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
```

- [ ] **Step 2: Create settings store tests**

Create `src/stores/__tests__/settings.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "../settings";

describe("settingsStore", () => {
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

  it("has correct defaults", () => {
    const state = useSettingsStore.getState();
    expect(state.theme).toBe("vantage-dark");
    expect(state.fontSizeEditor).toBe(14);
    expect(state.fontSizeUI).toBe(13);
    expect(state.tabSize).toBe(2);
  });

  it("clamps editor font size to valid range", () => {
    useSettingsStore.getState().setFontSizeEditor(4);
    expect(useSettingsStore.getState().fontSizeEditor).toBe(8);
    useSettingsStore.getState().setFontSizeEditor(50);
    expect(useSettingsStore.getState().fontSizeEditor).toBe(32);
    useSettingsStore.getState().setFontSizeEditor(16);
    expect(useSettingsStore.getState().fontSizeEditor).toBe(16);
  });

  it("clamps tab size to valid range", () => {
    useSettingsStore.getState().setTabSize(0);
    expect(useSettingsStore.getState().tabSize).toBe(1);
    useSettingsStore.getState().setTabSize(10);
    expect(useSettingsStore.getState().tabSize).toBe(8);
  });

  it("toggles boolean settings", () => {
    useSettingsStore.getState().setWordWrap(true);
    expect(useSettingsStore.getState().wordWrap).toBe(true);
    useSettingsStore.getState().setMinimap(false);
    expect(useSettingsStore.getState().minimap).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd C:/CursorProjects/Vantage
npx vitest run src/stores/__tests__/settings.test.ts
```

Expected: All 4 tests pass.

- [ ] **Step 4: Commit**

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "feat: add settings Zustand store with validation and tests

Settings store manages theme, font sizes, editor preferences,
and terminal config. All numeric values are clamped to valid ranges.
Persisted to localStorage. Rust-side persistence deferred to Phase 2."
```

---

### Task 6: Activity Bar Component

**Files:**
- Create: `src/components/layout/ActivityBar.tsx`

- [ ] **Step 1: Create the ActivityBar component**

Create `src/components/layout/ActivityBar.tsx`:

```tsx
import {
  Files,
  Search,
  GitBranch,
  Bot,
  Settings,
  type LucideIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLayoutStore, type ActivityBarItem } from "@/stores/layout";

interface ActivityBarEntry {
  id: ActivityBarItem;
  icon: LucideIcon;
  label: string;
  shortcut: string;
}

const topItems: ActivityBarEntry[] = [
  { id: "explorer", icon: Files, label: "Explorer", shortcut: "Ctrl+Shift+E" },
  { id: "search", icon: Search, label: "Search", shortcut: "Ctrl+Shift+F" },
  { id: "git", icon: GitBranch, label: "Source Control", shortcut: "Ctrl+Shift+G" },
  { id: "agents", icon: Bot, label: "Agents", shortcut: "Ctrl+Shift+A" },
];

const bottomItems: ActivityBarEntry[] = [
  { id: "settings", icon: Settings, label: "Settings", shortcut: "Ctrl+," },
];

function ActivityBarButton({ entry }: { entry: ActivityBarEntry }) {
  const activeItem = useLayoutStore((s) => s.activeActivityBarItem);
  const primarySidebarVisible = useLayoutStore((s) => s.primarySidebarVisible);
  const setActiveItem = useLayoutStore((s) => s.setActiveActivityBarItem);

  const isActive = activeItem === entry.id && primarySidebarVisible;

  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <button
          onClick={() => setActiveItem(entry.id)}
          className={`
            relative flex items-center justify-center w-full h-12
            transition-colors duration-150
            ${isActive
              ? "text-[var(--color-text)]"
              : "text-[var(--color-overlay-1)] hover:text-[var(--color-text)]"
            }
          `}
          aria-label={entry.label}
          aria-pressed={isActive}
        >
          {isActive && (
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 rounded-r"
              style={{ backgroundColor: "var(--color-blue)" }}
            />
          )}
          <entry.icon size={22} strokeWidth={1.5} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        <p className="text-xs">
          {entry.label}{" "}
          <span className="text-[var(--color-overlay-1)]">({entry.shortcut})</span>
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function ActivityBar() {
  return (
    <TooltipProvider>
      <div
        className="flex flex-col justify-between h-full w-12 shrink-0"
        style={{ backgroundColor: "var(--color-crust)" }}
        role="toolbar"
        aria-label="Activity Bar"
      >
        <div className="flex flex-col">
          {topItems.map((entry) => (
            <ActivityBarButton key={entry.id} entry={entry} />
          ))}
        </div>
        <div className="flex flex-col">
          {bottomItems.map((entry) => (
            <ActivityBarButton key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "feat: add ActivityBar component with icon buttons and tooltips

Activity bar with Explorer, Search, Git, Agents (top) and Settings
(bottom). Active item shows blue left border accent. Click toggles
sidebar visibility. Tooltips show label and keyboard shortcut."
```

---

### Task 7: Primary Sidebar Component

**Files:**
- Create: `src/components/layout/PrimarySidebar.tsx`

- [ ] **Step 1: Create the PrimarySidebar component**

Create `src/components/layout/PrimarySidebar.tsx`:

```tsx
import { Files, Search, GitBranch, Bot, Settings } from "lucide-react";
import { useLayoutStore, type ActivityBarItem } from "@/stores/layout";

const panelConfig: Record<ActivityBarItem, { title: string; icon: React.ReactNode; description: string }> = {
  explorer: {
    title: "Explorer",
    icon: <Files size={16} />,
    description: "File tree will appear here in Phase 2.",
  },
  search: {
    title: "Search",
    icon: <Search size={16} />,
    description: "Project-wide search will appear here.",
  },
  git: {
    title: "Source Control",
    icon: <GitBranch size={16} />,
    description: "Git status and changes will appear here.",
  },
  agents: {
    title: "Agents",
    icon: <Bot size={16} />,
    description: "Agent dashboard will appear here.",
  },
  settings: {
    title: "Settings",
    icon: <Settings size={16} />,
    description: "Application settings will appear here.",
  },
};

export function PrimarySidebar() {
  const activeItem = useLayoutStore((s) => s.activeActivityBarItem);
  const config = panelConfig[activeItem];

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-mantle)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 h-9 shrink-0 text-xs font-semibold uppercase tracking-wider"
        style={{
          color: "var(--color-subtext-0)",
          borderBottom: "1px solid var(--color-surface-0)",
        }}
      >
        {config.icon}
        <span>{config.title}</span>
      </div>

      {/* Content placeholder */}
      <div className="flex-1 flex items-center justify-center p-4">
        <p
          className="text-center text-xs leading-relaxed"
          style={{ color: "var(--color-overlay-1)" }}
        >
          {config.description}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "feat: add PrimarySidebar component with panel switching

Primary sidebar shows content based on active activity bar item.
Each panel has a header with icon and title, and a placeholder
description for the content that will be built in later phases."
```

---

### Task 8: Editor Area Component

**Files:**
- Create: `src/components/layout/EditorArea.tsx`

- [ ] **Step 1: Create the EditorArea component**

Create `src/components/layout/EditorArea.tsx`:

```tsx
import { X, FileCode } from "lucide-react";

interface PlaceholderTab {
  id: string;
  label: string;
  isActive: boolean;
  isDirty: boolean;
}

const placeholderTabs: PlaceholderTab[] = [
  { id: "welcome", label: "Welcome", isActive: true, isDirty: false },
];

function TabBar({ tabs }: { tabs: PlaceholderTab[] }) {
  return (
    <div
      className="flex items-center h-9 shrink-0 overflow-x-auto"
      style={{
        backgroundColor: "var(--color-mantle)",
        borderBottom: "1px solid var(--color-surface-0)",
      }}
      role="tablist"
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className="flex items-center gap-2 px-3 h-full text-xs cursor-pointer shrink-0 transition-colors"
          style={{
            backgroundColor: tab.isActive ? "var(--color-base)" : "transparent",
            color: tab.isActive ? "var(--color-text)" : "var(--color-subtext-0)",
            borderRight: "1px solid var(--color-surface-0)",
          }}
          role="tab"
          aria-selected={tab.isActive}
        >
          <FileCode size={14} style={{ color: "var(--color-blue)" }} />
          <span>{tab.label}</span>
          {tab.isDirty && (
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "var(--color-text)" }}
            />
          )}
          <button
            className="p-0.5 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            aria-label={`Close ${tab.label}`}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Breadcrumbs() {
  return (
    <div
      className="flex items-center h-6 px-3 text-xs shrink-0"
      style={{
        backgroundColor: "var(--color-base)",
        color: "var(--color-subtext-0)",
        borderBottom: "1px solid var(--color-surface-0)",
      }}
    >
      <span>Vantage</span>
      <span className="mx-1" style={{ color: "var(--color-overlay-0)" }}>
        /
      </span>
      <span style={{ color: "var(--color-text)" }}>Welcome</span>
    </div>
  );
}

export function EditorArea() {
  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-base)" }}
      data-allow-select="true"
    >
      <TabBar tabs={placeholderTabs} />
      <Breadcrumbs />

      {/* Editor content placeholder */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "var(--color-surface-0)" }}
        >
          <FileCode size={32} style={{ color: "var(--color-blue)" }} />
        </div>
        <div className="text-center">
          <h2
            className="text-lg font-semibold mb-1"
            style={{ color: "var(--color-text)" }}
          >
            Welcome to Vantage
          </h2>
          <p
            className="text-xs max-w-md"
            style={{ color: "var(--color-overlay-1)" }}
          >
            Open a project folder to get started. The code editor will appear here
            in Phase 2 with Monaco Editor, syntax highlighting, and inline diff
            review.
          </p>
        </div>
        <div className="flex gap-3 mt-2">
          <KeyboardHint keys="Ctrl+Shift+P" label="Command Palette" />
          <KeyboardHint keys="Ctrl+Shift+E" label="Explorer" />
          <KeyboardHint keys="Ctrl+`" label="Terminal" />
        </div>
      </div>
    </div>
  );
}

function KeyboardHint({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <kbd
        className="px-1.5 py-0.5 rounded text-xs font-mono"
        style={{
          backgroundColor: "var(--color-surface-0)",
          color: "var(--color-subtext-1)",
          border: "1px solid var(--color-surface-1)",
        }}
      >
        {keys}
      </kbd>
      <span style={{ color: "var(--color-overlay-1)" }}>{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "feat: add EditorArea component with tab bar and welcome screen

Editor area has a tab bar with close buttons and dirty indicators,
breadcrumbs navigation bar, and a welcome screen with keyboard
shortcut hints. Monaco editor integration deferred to Phase 2."
```

---

### Task 9: Secondary Sidebar (Chat Panel Placeholder)

**Files:**
- Create: `src/components/layout/SecondarySidebar.tsx`

- [ ] **Step 1: Create the SecondarySidebar component**

Create `src/components/layout/SecondarySidebar.tsx`:

```tsx
import { MessageSquare, Send, Square } from "lucide-react";

export function SecondarySidebar() {
  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--color-mantle)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 h-9 shrink-0"
        style={{
          borderBottom: "1px solid var(--color-surface-0)",
        }}
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={14} style={{ color: "var(--color-blue)" }} />
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-subtext-0)" }}
          >
            Chat
          </span>
        </div>
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-overlay-1)",
          }}
        >
          Claude
        </span>
      </div>

      {/* Chat messages placeholder */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: "var(--color-surface-0)" }}
          >
            <MessageSquare size={20} style={{ color: "var(--color-mauve)" }} />
          </div>
          <p
            className="text-xs leading-relaxed max-w-48"
            style={{ color: "var(--color-overlay-1)" }}
          >
            Claude Code chat will appear here in Phase 3. Connect via the Agent
            SDK sidecar.
          </p>
        </div>
      </div>

      {/* Chat input placeholder */}
      <div
        className="shrink-0 p-3"
        style={{ borderTop: "1px solid var(--color-surface-0)" }}
      >
        <div
          className="flex items-end gap-2 rounded-lg p-2"
          style={{
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-surface-1)",
          }}
        >
          <textarea
            className="flex-1 bg-transparent text-xs resize-none outline-none placeholder:text-[var(--color-overlay-0)]"
            style={{
              color: "var(--color-text)",
              fontFamily: "var(--font-sans)",
            }}
            placeholder="Ask Claude anything..."
            rows={1}
            disabled
          />
          <button
            className="p-1.5 rounded transition-colors"
            style={{
              color: "var(--color-overlay-0)",
            }}
            disabled
            aria-label="Send message"
          >
            <Send size={14} />
          </button>
        </div>
        <p
          className="text-center mt-2 text-xs"
          style={{ color: "var(--color-overlay-0)" }}
        >
          Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "feat: add SecondarySidebar component as chat panel placeholder

Right-side panel with Chat header, Claude badge, empty message area,
and disabled chat input with send button. Agent SDK integration
deferred to Phase 3."
```

---

### Task 10: Panel Area (Terminal Placeholder)

**Files:**
- Create: `src/components/layout/PanelArea.tsx`

- [ ] **Step 1: Create the PanelArea component**

Create `src/components/layout/PanelArea.tsx`:

```tsx
import { Terminal, Plus, X, Maximize2, Minimize2 } from "lucide-react";
import { useLayoutStore } from "@/stores/layout";

interface PlaceholderTerminalTab {
  id: string;
  label: string;
  shellType: string;
  isActive: boolean;
}

const placeholderTerminalTabs: PlaceholderTerminalTab[] = [
  { id: "term-1", label: "Terminal", shellType: "PowerShell", isActive: true },
];

export function PanelArea() {
  const togglePanel = useLayoutStore((s) => s.togglePanel);

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        backgroundColor: "var(--color-base)",
        borderTop: "1px solid var(--color-surface-0)",
      }}
    >
      {/* Tab bar */}
      <div
        className="flex items-center justify-between h-9 shrink-0 px-2"
        style={{
          backgroundColor: "var(--color-mantle)",
        }}
      >
        {/* Tabs */}
        <div className="flex items-center gap-0.5" role="tablist">
          {placeholderTerminalTabs.map((tab) => (
            <div
              key={tab.id}
              className="flex items-center gap-1.5 px-2.5 h-7 text-xs rounded-t cursor-pointer transition-colors"
              style={{
                backgroundColor: tab.isActive ? "var(--color-base)" : "transparent",
                color: tab.isActive ? "var(--color-text)" : "var(--color-subtext-0)",
              }}
              role="tab"
              aria-selected={tab.isActive}
            >
              <Terminal size={12} />
              <span>{tab.label}</span>
              <span
                className="text-xs"
                style={{ color: "var(--color-overlay-0)" }}
              >
                ({tab.shellType})
              </span>
              <button
                className="p-0.5 rounded hover:bg-[var(--color-surface-1)] transition-colors ml-1"
                style={{ color: "var(--color-overlay-1)" }}
                aria-label={`Close ${tab.label}`}
              >
                <X size={10} />
              </button>
            </div>
          ))}

          {/* New terminal button */}
          <button
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            aria-label="New Terminal (Ctrl+Shift+`)"
            title="New Terminal (Ctrl+Shift+`)"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Panel actions */}
        <div className="flex items-center gap-0.5">
          <button
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            aria-label="Maximize Panel"
          >
            <Maximize2 size={12} />
          </button>
          <button
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--color-surface-1)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            onClick={togglePanel}
            aria-label="Close Panel (Ctrl+J)"
            title="Close Panel (Ctrl+J)"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Terminal content placeholder */}
      <div
        className="flex-1 p-4 font-mono text-sm"
        style={{
          color: "var(--color-text)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--font-size-editor)",
        }}
        data-allow-select="true"
      >
        <p style={{ color: "var(--color-overlay-1)" }}>
          Terminal emulator will appear here in Phase 2.
        </p>
        <p style={{ color: "var(--color-overlay-1)" }}>
          Powered by xterm.js + ConPTY via tauri-plugin-pty.
        </p>
        <p className="mt-4">
          <span style={{ color: "var(--color-green)" }}>user@vantage</span>
          <span style={{ color: "var(--color-overlay-1)" }}>:</span>
          <span style={{ color: "var(--color-blue)" }}>~/project</span>
          <span style={{ color: "var(--color-text)" }}>$ </span>
          <span
            className="inline-block w-2 h-4 animate-pulse"
            style={{ backgroundColor: "var(--color-rosewater)" }}
          />
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "feat: add PanelArea component as terminal placeholder

Bottom panel with terminal tab bar (with close/new/maximize buttons),
placeholder terminal content with fake prompt and blinking cursor.
xterm.js + ConPTY integration deferred to Phase 2."
```

---

### Task 11: Status Bar Component

**Files:**
- Create: `src/components/layout/StatusBar.tsx`

- [ ] **Step 1: Create the StatusBar component**

Create `src/components/layout/StatusBar.tsx`:

```tsx
import {
  GitBranch,
  AlertTriangle,
  XCircle,
  Zap,
  CircleDollarSign,
} from "lucide-react";

export function StatusBar() {
  return (
    <div
      className="flex items-center justify-between h-6 px-2 text-xs shrink-0 select-none"
      style={{
        backgroundColor: "var(--color-crust)",
        color: "var(--color-subtext-0)",
        borderTop: "1px solid var(--color-surface-0)",
      }}
      role="status"
      aria-label="Status Bar"
    >
      {/* Left side - workspace scoped */}
      <div className="flex items-center gap-3">
        {/* Git branch */}
        <button
          className="flex items-center gap-1 hover:text-[var(--color-text)] transition-colors"
          aria-label="Git branch: main"
        >
          <GitBranch size={12} />
          <span>main</span>
        </button>

        {/* Errors and warnings */}
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-0.5 hover:text-[var(--color-text)] transition-colors"
            aria-label="0 errors"
          >
            <XCircle size={12} style={{ color: "var(--color-red)" }} />
            <span>0</span>
          </button>
          <button
            className="flex items-center gap-0.5 hover:text-[var(--color-text)] transition-colors"
            aria-label="0 warnings"
          >
            <AlertTriangle size={12} style={{ color: "var(--color-yellow)" }} />
            <span>0</span>
          </button>
        </div>
      </div>

      {/* Right side - file/session scoped */}
      <div className="flex items-center gap-3">
        {/* Line and column */}
        <span>Ln 1, Col 1</span>

        {/* Language */}
        <button className="hover:text-[var(--color-text)] transition-colors">
          TypeScript
        </button>

        {/* Claude session status */}
        <div className="flex items-center gap-1">
          <Zap size={12} style={{ color: "var(--color-green)" }} />
          <span>Ready</span>
        </div>

        {/* Cost */}
        <div className="flex items-center gap-1">
          <CircleDollarSign size={12} />
          <span>$0.00</span>
        </div>

        {/* Model */}
        <span style={{ color: "var(--color-overlay-1)" }}>claude-opus-4-6</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "feat: add StatusBar component with git, errors, and Claude status

Status bar spans full width. Left side shows git branch and
error/warning counts. Right side shows line/col, language,
Claude connection status, session cost, and model name.
All values are placeholders wired to stores in later phases."
```

---

### Task 12: IDE Layout Assembly

**Files:**
- Create: `src/components/layout/IDELayout.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Create the IDELayout component**

Create `src/components/layout/IDELayout.tsx`:

```tsx
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout";
import { ActivityBar } from "./ActivityBar";
import { PrimarySidebar } from "./PrimarySidebar";
import { EditorArea } from "./EditorArea";
import { SecondarySidebar } from "./SecondarySidebar";
import { PanelArea } from "./PanelArea";
import { StatusBar } from "./StatusBar";
import { TitleBar } from "./TitleBar";

function ResizeHandle({
  direction = "horizontal",
}: {
  direction?: "horizontal" | "vertical";
}) {
  const isHorizontal = direction === "horizontal";
  return (
    <PanelResizeHandle
      className={`
        group relative
        ${isHorizontal ? "w-[1px]" : "h-[1px]"}
        transition-colors duration-150
      `}
      style={{ backgroundColor: "var(--color-surface-0)" }}
    >
      <div
        className={`
          absolute z-10
          ${isHorizontal
            ? "top-0 bottom-0 -left-[1px] -right-[1px] w-[3px] cursor-col-resize"
            : "left-0 right-0 -top-[1px] -bottom-[1px] h-[3px] cursor-row-resize"
          }
          group-hover:bg-[var(--color-blue)] group-active:bg-[var(--color-blue)]
          group-data-[resize-handle-active]:bg-[var(--color-blue)]
          transition-colors duration-150
        `}
      />
    </PanelResizeHandle>
  );
}

export function IDELayout() {
  const primarySidebarVisible = useLayoutStore((s) => s.primarySidebarVisible);
  const secondarySidebarVisible = useLayoutStore((s) => s.secondarySidebarVisible);
  const panelVisible = useLayoutStore((s) => s.panelVisible);
  const setPrimarySidebarSize = useLayoutStore((s) => s.setPrimarySidebarSize);
  const setSecondarySidebarSize = useLayoutStore((s) => s.setSecondarySidebarSize);
  const setPanelSize = useLayoutStore((s) => s.setPanelSize);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {/* Title Bar */}
      <TitleBar />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Activity Bar (fixed width, never resizable) */}
        <ActivityBar />

        {/* Resizable panels */}
        <PanelGroup
          direction="horizontal"
          autoSaveId="vantage-main-horizontal"
          className="flex-1"
        >
          {/* Primary Sidebar */}
          {primarySidebarVisible && (
            <>
              <Panel
                id="primary-sidebar"
                order={1}
                defaultSize={20}
                minSize={12}
                maxSize={40}
                collapsible
                collapsedSize={0}
                onResize={setPrimarySidebarSize}
              >
                <PrimarySidebar />
              </Panel>
              <ResizeHandle direction="horizontal" />
            </>
          )}

          {/* Center area: Editor + Panel stacked vertically */}
          <Panel id="center" order={2} minSize={30}>
            <PanelGroup
              direction="vertical"
              autoSaveId="vantage-center-vertical"
            >
              {/* Editor Area */}
              <Panel id="editor" order={1} minSize={20}>
                <EditorArea />
              </Panel>

              {/* Bottom Panel */}
              {panelVisible && (
                <>
                  <ResizeHandle direction="vertical" />
                  <Panel
                    id="panel"
                    order={2}
                    defaultSize={30}
                    minSize={10}
                    maxSize={70}
                    collapsible
                    collapsedSize={0}
                    onResize={setPanelSize}
                  >
                    <PanelArea />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          {/* Secondary Sidebar (Chat) */}
          {secondarySidebarVisible && (
            <>
              <ResizeHandle direction="horizontal" />
              <Panel
                id="secondary-sidebar"
                order={3}
                defaultSize={25}
                minSize={15}
                maxSize={45}
                collapsible
                collapsedSize={0}
                onResize={setSecondarySidebarSize}
              >
                <SecondarySidebar />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {/* Status Bar */}
      <StatusBar />
    </div>
  );
}
```

- [ ] **Step 2: Create the TitleBar component (placeholder for Task 14)**

Create `src/components/layout/TitleBar.tsx`:

```tsx
export function TitleBar() {
  return (
    <div
      className="flex items-center justify-center h-8 shrink-0 select-none"
      style={{
        backgroundColor: "var(--color-crust)",
        borderBottom: "1px solid var(--color-surface-0)",
      }}
      data-tauri-drag-region
    >
      <span
        className="text-xs font-medium"
        style={{ color: "var(--color-subtext-0)" }}
      >
        Vantage
      </span>
    </div>
  );
}
```

This is a minimal placeholder. Task 14 will add window controls.

- [ ] **Step 3: Create the layout barrel export**

Create `src/components/layout/index.ts`:

```ts
export { IDELayout } from "./IDELayout";
export { ActivityBar } from "./ActivityBar";
export { PrimarySidebar } from "./PrimarySidebar";
export { EditorArea } from "./EditorArea";
export { SecondarySidebar } from "./SecondarySidebar";
export { PanelArea } from "./PanelArea";
export { StatusBar } from "./StatusBar";
export { TitleBar } from "./TitleBar";
```

- [ ] **Step 4: Update App.tsx to use IDELayout**

Replace `src/App.tsx` with:

```tsx
import { IDELayout } from "@/components/layout";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <>
      <IDELayout />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-text)",
            border: "1px solid var(--color-surface-1)",
          },
        }}
      />
    </>
  );
}

export default App;
```

- [ ] **Step 5: Ensure main.tsx imports CSS properly**

Verify `src/main.tsx` imports the CSS file. It should look like:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

If the scaffold uses `styles.css` instead of `index.css`, rename the file or update the import.

- [ ] **Step 6: Verify the full layout renders**

```bash
cd C:/CursorProjects/Vantage
npm run tauri dev
```

Expected: A window opens showing:
- Custom title bar at top with "Vantage" text
- Activity bar on the far left with 5 icons
- Primary sidebar (Explorer) to the right of the activity bar
- Editor area in the center with "Welcome to Vantage" screen
- Bottom panel with terminal placeholder
- Status bar at the very bottom
- All panels use correct Catppuccin Mocha colors
- Resize handles between panels are draggable and turn blue on hover

Click activity bar icons to verify sidebar content switches. Close the window.

- [ ] **Step 7: Commit**

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "feat: assemble complete IDE layout with resizable panels

Compose ActivityBar, PrimarySidebar, EditorArea, SecondarySidebar,
PanelArea, StatusBar, and TitleBar into the IDELayout component.
Uses react-resizable-panels for nested horizontal/vertical splits
with auto-save, min/max sizes, and collapsible panels.
Blue resize handle on hover. Layout persists between sessions."
```

---

### Task 13: Keybinding System

**Files:**
- Create: `src/hooks/useKeybindings.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the keybinding hook**

Create `src/hooks/useKeybindings.ts`:

```ts
import { useEffect, useCallback } from "react";
import { useLayoutStore } from "@/stores/layout";
import { toast } from "sonner";

interface Keybinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

export function useKeybindings() {
  const togglePrimarySidebar = useLayoutStore((s) => s.togglePrimarySidebar);
  const toggleSecondarySidebar = useLayoutStore((s) => s.toggleSecondarySidebar);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const setActiveActivityBarItem = useLayoutStore((s) => s.setActiveActivityBarItem);

  const keybindings: Keybinding[] = [
    // Layout toggles
    {
      key: "b",
      ctrl: true,
      action: togglePrimarySidebar,
      description: "Toggle Primary Sidebar",
    },
    {
      key: "j",
      ctrl: true,
      action: togglePanel,
      description: "Toggle Panel",
    },
    {
      key: "`",
      ctrl: true,
      action: togglePanel,
      description: "Toggle Terminal Panel",
    },
    {
      key: "b",
      ctrl: true,
      shift: true,
      action: toggleSecondarySidebar,
      description: "Toggle Secondary Sidebar (Chat)",
    },

    // Command palette placeholder
    {
      key: "p",
      ctrl: true,
      shift: true,
      action: () => {
        toast("Command Palette", {
          description: "Command palette will be implemented in Phase 2.",
        });
      },
      description: "Open Command Palette",
    },

    // Activity bar focus shortcuts
    {
      key: "e",
      ctrl: true,
      shift: true,
      action: () => setActiveActivityBarItem("explorer"),
      description: "Focus File Explorer",
    },
    {
      key: "f",
      ctrl: true,
      shift: true,
      action: () => setActiveActivityBarItem("search"),
      description: "Focus Search",
    },
    {
      key: "g",
      ctrl: true,
      shift: true,
      action: () => setActiveActivityBarItem("git"),
      description: "Focus Source Control",
    },
    {
      key: "a",
      ctrl: true,
      shift: true,
      action: () => setActiveActivityBarItem("agents"),
      description: "Focus Agents",
    },

    // Settings
    {
      key: ",",
      ctrl: true,
      action: () => {
        setActiveActivityBarItem("settings");
      },
      description: "Open Settings",
    },

    // Tab management placeholders
    {
      key: "w",
      ctrl: true,
      action: () => {
        toast("Close Tab", {
          description: "Tab management will be implemented in Phase 2.",
        });
      },
      description: "Close Active Tab",
    },
    {
      key: "Tab",
      ctrl: true,
      action: () => {
        toast("Next Tab", {
          description: "Tab cycling will be implemented in Phase 2.",
        });
      },
      description: "Next Tab",
    },
    {
      key: "Tab",
      ctrl: true,
      shift: true,
      action: () => {
        toast("Previous Tab", {
          description: "Tab cycling will be implemented in Phase 2.",
        });
      },
      description: "Previous Tab",
    },
  ];

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      for (const binding of keybindings) {
        const ctrlMatch = binding.ctrl ? event.ctrlKey : !event.ctrlKey;
        const shiftMatch = binding.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = binding.alt ? event.altKey : !event.altKey;
        const keyMatch = event.key.toLowerCase() === binding.key.toLowerCase();

        if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
          event.preventDefault();
          event.stopPropagation();
          binding.action();
          return;
        }
      }
    },
    [keybindings]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [handleKeyDown]);
}
```

- [ ] **Step 2: Wire keybindings into App.tsx**

Replace `src/App.tsx` with:

```tsx
import { IDELayout } from "@/components/layout";
import { Toaster } from "@/components/ui/sonner";
import { useKeybindings } from "@/hooks/useKeybindings";

function App() {
  useKeybindings();

  return (
    <>
      <IDELayout />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-text)",
            border: "1px solid var(--color-surface-1)",
          },
        }}
      />
    </>
  );
}

export default App;
```

- [ ] **Step 3: Verify keybindings work**

Run `npm run tauri dev` and test:

1. `Ctrl+B` -- primary sidebar should toggle on/off
2. `Ctrl+J` -- bottom panel should toggle on/off
3. `Ctrl+`` (backtick) -- bottom panel should toggle on/off
4. `Ctrl+Shift+P` -- toast should appear saying "Command Palette"
5. `Ctrl+Shift+E` -- sidebar should switch to Explorer
6. `Ctrl+Shift+G` -- sidebar should switch to Source Control
7. `Ctrl+Shift+B` -- secondary sidebar (chat) should toggle
8. `Ctrl+,` -- sidebar should switch to Settings
9. `Ctrl+W` -- toast should appear saying "Close Tab"
10. `Ctrl+Tab` -- toast should appear saying "Next Tab"

Close the window.

- [ ] **Step 4: Commit**

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "feat: add global keybinding system with Tier 1 shortcuts

Implement useKeybindings hook with Ctrl+B (sidebar), Ctrl+J (panel),
Ctrl+backtick (terminal), Ctrl+Shift+P (command palette placeholder),
Ctrl+Shift+E/F/G/A (activity bar focus), Ctrl+comma (settings),
Ctrl+W (close tab placeholder), Ctrl+Tab (tab cycling placeholder).
Keybindings registered on window with capture phase for priority."
```

---

### Task 14: Window Title Bar (Windows)

**Files:**
- Modify: `src/components/layout/TitleBar.tsx`

- [ ] **Step 1: Replace TitleBar with full Windows custom title bar**

Replace `src/components/layout/TitleBar.tsx` with:

```tsx
import { useState, useEffect } from "react";
import { Minus, Square, X, Copy } from "lucide-react";

// Dynamic import to avoid errors outside Tauri context
let tauriWindow: typeof import("@tauri-apps/api/window") | null = null;

async function loadTauriWindow() {
  try {
    tauriWindow = await import("@tauri-apps/api/window");
  } catch {
    // Not in Tauri context (e.g., running in browser during dev)
  }
}

function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    loadTauriWindow().then(async () => {
      if (tauriWindow) {
        const appWindow = tauriWindow.getCurrentWindow();
        setIsMaximized(await appWindow.isMaximized());

        const unlisten = await appWindow.onResized(async () => {
          setIsMaximized(await appWindow.isMaximized());
        });

        return () => {
          unlisten();
        };
      }
    });
  }, []);

  const handleMinimize = async () => {
    if (tauriWindow) {
      const appWindow = tauriWindow.getCurrentWindow();
      await appWindow.minimize();
    }
  };

  const handleMaximize = async () => {
    if (tauriWindow) {
      const appWindow = tauriWindow.getCurrentWindow();
      await appWindow.toggleMaximize();
    }
  };

  const handleClose = async () => {
    if (tauriWindow) {
      const appWindow = tauriWindow.getCurrentWindow();
      await appWindow.close();
    }
  };

  const buttonBase =
    "flex items-center justify-center w-12 h-full transition-colors";

  return (
    <div className="flex items-center h-full ml-auto">
      {/* Minimize */}
      <button
        className={`${buttonBase} hover:bg-[var(--color-surface-1)]`}
        onClick={handleMinimize}
        aria-label="Minimize"
        style={{ color: "var(--color-subtext-0)" }}
      >
        <Minus size={14} />
      </button>

      {/* Maximize/Restore */}
      <button
        className={`${buttonBase} hover:bg-[var(--color-surface-1)]`}
        onClick={handleMaximize}
        aria-label={isMaximized ? "Restore" : "Maximize"}
        style={{ color: "var(--color-subtext-0)" }}
      >
        {isMaximized ? <Copy size={12} /> : <Square size={12} />}
      </button>

      {/* Close */}
      <button
        className={`${buttonBase} hover:bg-[var(--color-red)] hover:text-white`}
        onClick={handleClose}
        aria-label="Close"
        style={{ color: "var(--color-subtext-0)" }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function TitleBar() {
  return (
    <div
      className="flex items-center h-8 shrink-0 select-none"
      style={{
        backgroundColor: "var(--color-crust)",
        borderBottom: "1px solid var(--color-surface-0)",
      }}
    >
      {/* Drag region - takes all available space */}
      <div
        className="flex items-center flex-1 h-full px-3"
        data-tauri-drag-region
      >
        {/* App icon and title */}
        <span
          className="text-xs font-medium pointer-events-none"
          style={{ color: "var(--color-subtext-0)" }}
          data-tauri-drag-region
        >
          Vantage
        </span>
      </div>

      {/* Window controls (not draggable) */}
      <WindowControls />
    </div>
  );
}
```

- [ ] **Step 2: Add Tauri window permissions**

The default Tauri capabilities should include core window operations. If not, create or update `src-tauri/capabilities/default.json` to include:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default permissions for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "store:default"
  ]
}
```

Note: Tauri v2 scaffold may already have a capabilities file. If one exists (e.g., `src-tauri/capabilities/default.json`), merge the permissions rather than replacing the file. The core:default permission includes window minimize, maximize, and close.

- [ ] **Step 3: Verify the title bar**

Run `npm run tauri dev` and verify:

1. Title bar shows "Vantage" text on the left
2. Three window control buttons on the right: minimize (-), maximize (square), close (X)
3. Dragging the title bar area moves the window
4. Minimize button minimizes to taskbar
5. Maximize button toggles between maximized and windowed (icon changes between square and overlapping squares)
6. Close button has red hover background
7. Close button closes the application

Close the window.

- [ ] **Step 4: Commit**

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "feat: add custom Windows title bar with window controls

Custom title bar replaces native decorations on Windows.
Drag region for window movement, minimize/maximize/close buttons
with proper hover states. Close button turns red on hover.
Maximize icon updates based on window state. Uses Tauri window API."
```

---

### Task 15: Final Integration Test

**Files:**
- No new files.

- [ ] **Step 1: Run all tests**

```bash
cd C:/CursorProjects/Vantage
npx vitest run
```

Expected: All store tests pass (layout and settings).

- [ ] **Step 2: Run the full application and verify every feature**

```bash
cd C:/CursorProjects/Vantage
npm run tauri dev
```

Verify the complete checklist:

**Layout:**
- [ ] Window opens at 1400x900 with custom title bar
- [ ] Activity bar shows 5 icons (Explorer, Search, Git, Agents, Settings)
- [ ] Primary sidebar shows "Explorer" panel by default
- [ ] Editor area shows "Welcome to Vantage" with keyboard hints
- [ ] Bottom panel shows terminal placeholder with fake prompt
- [ ] Status bar shows git branch, errors, line/col, language, Claude status, cost, model

**Resizing:**
- [ ] Primary sidebar resize handle works and turns blue on hover
- [ ] Bottom panel resize handle works and turns blue on hover
- [ ] Minimum panel sizes are enforced (panels cannot be resized below threshold)

**Activity Bar:**
- [ ] Clicking Explorer, Search, Git, Agents switches sidebar content
- [ ] Active icon shows blue left border
- [ ] Clicking the active icon collapses the sidebar
- [ ] Clicking a different icon with sidebar collapsed opens it again
- [ ] Settings icon at the bottom works
- [ ] Tooltips appear on hover showing label and shortcut

**Keybindings:**
- [ ] Ctrl+B toggles primary sidebar
- [ ] Ctrl+J toggles bottom panel
- [ ] Ctrl+` toggles bottom panel
- [ ] Ctrl+Shift+B toggles secondary sidebar (chat)
- [ ] Ctrl+Shift+P shows command palette toast
- [ ] Ctrl+Shift+E focuses Explorer in sidebar
- [ ] Ctrl+Shift+F focuses Search in sidebar
- [ ] Ctrl+Shift+G focuses Git in sidebar
- [ ] Ctrl+Shift+A focuses Agents in sidebar
- [ ] Ctrl+, opens Settings in sidebar
- [ ] Ctrl+W shows close tab toast
- [ ] Ctrl+Tab shows next tab toast

**Theme:**
- [ ] All backgrounds use Catppuccin Mocha dark colors (no pure black, no white)
- [ ] Text has 3 distinct hierarchy levels
- [ ] Accent colors visible (blue active indicator, red close hover, green ready indicator)
- [ ] Scrollbars are styled dark
- [ ] Resize handles turn blue on hover/active

**Title Bar:**
- [ ] Minimize, maximize, close buttons work
- [ ] Window can be dragged by the title bar
- [ ] Close button has red hover state
- [ ] Maximize toggles icon between square and overlapping squares

**Secondary Sidebar (Chat):**
- [ ] Shows "Chat" header with Claude badge
- [ ] Shows placeholder message
- [ ] Shows disabled chat input with send button

- [ ] **Step 3: Verify build succeeds**

```bash
cd C:/CursorProjects/Vantage
npm run tauri build
```

Expected: Build completes and produces an installer in `src-tauri/target/release/bundle/`. Note: The first build takes several minutes due to Rust compilation.

- [ ] **Step 4: Final commit and tag**

```bash
cd C:/CursorProjects/Vantage
git add -A
git commit -m "chore: Phase 1 complete - application shell with IDE layout, theme, and keybindings

Vantage Phase 1 delivers:
- Tauri v2 + React 19 + TypeScript application scaffold
- Catppuccin Mocha dark theme via CSS custom properties
- IDE layout: activity bar, primary sidebar, editor area, secondary sidebar, panel, status bar
- react-resizable-panels for all split/collapsible regions
- Zustand stores for layout and settings with localStorage persistence
- Tier 1 keybindings: sidebar toggles, panel toggles, activity bar focus, command palette placeholder
- Custom Windows title bar with minimize/maximize/close
- shadcn/ui components: Button, Dialog, Tabs, Tooltip, ContextMenu, Command, Resizable, Sonner"

git tag -a phase-1-complete -m "Phase 1: Application shell with IDE layout, theme, and keybindings"
```
