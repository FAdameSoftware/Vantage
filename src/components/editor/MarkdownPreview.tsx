import { useRef, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./markdownPreview.css";

interface MarkdownPreviewProps {
  content: string;
  /** When provided, sync-scroll from the editor's scroll fraction (0..1). */
  scrollFraction?: number;
  /** Called when the preview is scrolled by the user. Reports scroll fraction 0..1. */
  onScroll?: (fraction: number) => void;
}

export function MarkdownPreview({ content, scrollFraction, onScroll }: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  /** Guard to prevent feedback loops between editor and preview scroll syncing. */
  const isSyncingRef = useRef(false);

  // When the editor scrolls, update the preview position
  useEffect(() => {
    const el = containerRef.current;
    if (!el || scrollFraction === undefined) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) return;

    isSyncingRef.current = true;
    el.scrollTop = scrollFraction * maxScroll;
    // Release the guard after the browser processes the scroll
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, [scrollFraction]);

  const handleScroll = useCallback(() => {
    if (isSyncingRef.current) return;
    const el = containerRef.current;
    if (!el || !onScroll) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) return;
    onScroll(el.scrollTop / maxScroll);
  }, [onScroll]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto p-6"
      style={{
        backgroundColor: "var(--color-base)",
        color: "var(--color-text)",
      }}
      onScroll={handleScroll}
    >
      <article className="max-w-none markdown-preview">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
