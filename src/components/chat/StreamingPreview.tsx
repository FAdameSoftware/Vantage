import { useState, useEffect, useRef } from "react";
import { useConversationStore } from "@/stores/conversation";

function computePreviewText(): string {
  const activeBlocks = useConversationStore.getState().activeBlocks;
  const sorted = [...activeBlocks.values()].sort((a, b) => a.index - b.index);
  let text = "";
  for (const block of sorted) {
    if (block.type === "text" && !block.isComplete) {
      text += block.text;
    }
  }
  return text;
}

export function StreamingPreview() {
  const [displayText, setDisplayText] = useState("");
  const rafRef = useRef<number | null>(null);
  const prevVersionRef = useRef(0);

  useEffect(() => {
    // Subscribe to store changes but throttle display updates to ~60fps
    // using requestAnimationFrame. During streaming, content_block_delta
    // events fire hundreds of times per second — this ensures we only
    // re-render at the display refresh rate.
    const unsub = useConversationStore.subscribe((state, prevState) => {
      // When streaming stops, clear display immediately
      if (prevState.isStreaming && !state.isStreaming) {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setDisplayText("");
        prevVersionRef.current = state.activeBlocksVersion;
        return;
      }

      // Only react to activeBlocksVersion changes during streaming
      const version = state.activeBlocksVersion;
      if (version === prevVersionRef.current) return;
      prevVersionRef.current = version;

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setDisplayText(computePreviewText());
        });
      }
    });

    // Initialize with current state
    const initial = computePreviewText();
    if (initial) {
      setDisplayText(initial);
    }

    return () => {
      unsub();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  if (!displayText) return null;

  return (
    <div
      className="text-xs leading-relaxed whitespace-pre-wrap break-words mb-3"
      style={{ color: "var(--color-text)" }}
      data-allow-select="true"
    >
      {displayText}
      <span
        className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse rounded-sm"
        style={{ backgroundColor: "var(--color-blue)" }}
      />
    </div>
  );
}
