import { useEffect, type RefObject } from "react";

/**
 * Shared hook that invokes `handler` when a mousedown event occurs outside the
 * element referenced by `ref`.  Pass `enabled = false` to temporarily disable
 * the listener (e.g. when a dropdown is closed).
 *
 * `delayMs` adds a brief timeout before attaching the listener, which prevents
 * the click that opened a dropdown from immediately closing it.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  handler: () => void,
  enabled = true,
  delayMs = 0,
) {
  useEffect(() => {
    if (!enabled) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    }
    if (delayMs > 0) {
      const timer = setTimeout(() => {
        document.addEventListener("mousedown", onMouseDown);
      }, delayMs);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("mousedown", onMouseDown);
      };
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [ref, handler, enabled, delayMs]);
}
