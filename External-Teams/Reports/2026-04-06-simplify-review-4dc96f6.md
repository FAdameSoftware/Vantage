# Simplify Review — Commit `4dc96f6`

> **Commit:** "fix: resolve view transition crashes, MCP bridge, and accessibility issues"
> **Date:** 2026-04-06
> **Scope:** 11 files, +110/-71 lines
> **Reviewer:** Claude Code (automated)

---

## HIGH Severity

### 1. Empty catch blocks silently swallow all PTY errors
**`src/hooks/useTerminal.ts:133,139`**

```ts
try { pty.write(data); } catch { /* PTY handle may be closed */ }
try { pty.resize(cols, rows); } catch { /* PTY handle may be invalid */ }
```

These catch *all* exceptions — not just "handle closed." Type errors, serialization failures, IPC protocol errors are all silently eaten. Combined with StrictMode removal (#3), PTY bugs become nearly impossible to diagnose. At minimum, these should `console.debug` the error.

### 2. `role="application"` on root container harms screen reader users
**`src/components/layout/IDELayout.tsx:236,246`**

`role="application"` tells screen readers to stop intercepting keyboard events for the *entire* app. Users lose standard navigation (arrow keys for reading, h/H for headings, etc.). The WAI-ARIA spec warns against applying this to outermost containers. It should only be on specific widgets that implement custom keyboard nav (Monaco, xterm.js). Also inconsistently missing from the zen mode branch (line 217).

---

## MEDIUM Severity

### 3. StrictMode removal masks cleanup bugs
**`src/main.tsx:11-13`**

StrictMode has **zero production cost** — it only runs in development. Removing it hides the exact double-mount bugs it was designed to surface. The PTY corruption and Monaco lifecycle issues are real bugs that should be fixed, not silenced. The comment says "Re-enable after fixing" but there's no tracking mechanism to ensure that happens.

### 4. Non-memoized handlers in EditorTabs cause unnecessary re-renders
**`src/components/editor/EditorTabs.tsx:565-604`**

Six handler functions (`handleTabClick`, `handleTabClose`, `handleTabDoubleClick`, `handleMiddleClick`, `handleContextMenu`, `handlePopOut`) are plain arrow functions recreated every render. They're passed as props to `SortableTab`, which is **not** wrapped in `React.memo()`. Since `EditorTabs` subscribes to 14 Zustand selectors, any editor store change triggers a full cascade through all tab components. Low impact with <20 tabs, but adds up.

### 5. Duplicated expand/collapse animation pattern
**`src/components/chat/ThinkingIndicator.tsx:42-62`**

The `AnimatePresence > motion.div` with `opacity: 0→1, height: 0→auto, ease: [0.4, 0, 0.2, 1]` is copy-pasted across at least 5 files. `ToolCallCard.tsx` already defines reusable `expandVariants` and `expandTransition` constants. These should be extracted to a shared `src/lib/animations.ts` module.

### 6. `prefers-reduced-motion` CSS doesn't cover framer-motion animations
**`src/index.css:530-537`**

The CSS media query only targets CSS `animation-*` and `transition-*` properties. The 9 files using framer-motion JS animations are **not affected** by this rule (framer-motion uses inline JS transforms). A complete solution needs `<MotionConfig reducedMotion="user">` at the app root, or individual `useReducedMotion()` hooks.

---

## LOW Severity

### 7. Global `button:active` scale conflicts with inline transforms
**`src/index.css:518-521`**

`transform: scale(0.97)` on all buttons is GPU-composited (no layout thrash), but it gets **overridden** by inline transforms on draggable tabs (dnd-kit) and framer-motion `whileTap` buttons — making press feedback invisible/inconsistent on those elements.

### 8. ErrorBoundary repetition in PrimarySidebar uses generic fallback
**`src/components/layout/PrimarySidebar.tsx:176-199`**

All 5 panel branches wrap in `<ErrorBoundary>` with no `fallback` prop. The default "Something went wrong" message gives users no context about which panel crashed. Also, the chained ternary (`activeItem === "x" ? ... : activeItem === "y" ? ...`) could be a `switch` or lookup map for clarity.

---

## NO ISSUES

| Area | Verdict |
|------|---------|
| `withGlobalTauri: true` in tauri.conf.json | Correct, required for MCP bridge |
| Aria attributes in ChatPanel, TitleBar, PermissionDialog | Standard inline approach, consistent with codebase |
| ErrorBoundary runtime overhead | Zero cost in happy path (class component returns `children`) |
| try/catch performance on keystroke handler | V8 optimizes non-throwing try/catch to near-zero; IPC dominates |
| framer-motion bundle impact in ThinkingIndicator | Already imported in 8 other files; zero additional cost |
| `prefers-reduced-motion` `*` selector performance | Evaluated once on media change, not continuously |

---

## Recommended Actions (Priority Order)

1. **Fix PTY cleanup in `useTerminal`** properly, re-enable StrictMode, replace empty catches with `console.debug`
2. **Remove `role="application"` from root** — apply it only to Monaco/xterm containers
3. **Extract shared animation constants** from `ToolCallCard.tsx` to `src/lib/animations.ts`, add `<MotionConfig reducedMotion="user">` at app root
