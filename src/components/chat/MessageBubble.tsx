import { useState, useCallback, useMemo, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { User, Brain, Copy, Check, Pencil, RefreshCw, ChevronsUpDown, ChevronsDownUp, FileCode2, Pin } from "lucide-react";
import type { ConversationMessage } from "@/stores/conversation";
import { useConversationStore } from "@/stores/conversation";
import { CodeBlock } from "./CodeBlock";
import { ToolCallCard } from "./ToolCallCard";
import { TokenBadge } from "./TokenBadge";

// ─── Timestamp formatting ───────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${period}`;
}

// ─── Image extraction helpers ──────────────────────────────────────────────

/** Regex to match base64 data URL images in message text */
const DATA_URL_IMAGE_REGEX = /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g;

interface ExtractedImage {
  alt: string;
  dataUrl: string;
}

/** Extract base64 images from message text, returning images and cleaned text */
function extractImages(text: string): { cleanText: string; images: ExtractedImage[] } {
  const images: ExtractedImage[] = [];
  // Also remove the "[Attached image: ...]" prefix lines
  let cleanText = text.replace(/\[Attached image: [^\]]*\]\n?/g, "");
  let match: RegExpExecArray | null;
  const regex = new RegExp(DATA_URL_IMAGE_REGEX.source, "g");
  while ((match = regex.exec(cleanText)) !== null) {
    images.push({ alt: match[1], dataUrl: match[2] });
  }
  // Remove the image markdown from the text so it doesn't render as broken content
  cleanText = cleanText.replace(DATA_URL_IMAGE_REGEX, "").trim();
  return { cleanText, images };
}

// ─── Inline image display ──────────────────────────────────────────────────

function InlineImage({ image }: { image: ExtractedImage }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <button
        type="button"
        className="rounded overflow-hidden border my-1 cursor-pointer hover:opacity-90 transition-opacity block"
        style={{
          borderColor: "var(--color-surface-1)",
          maxWidth: expanded ? "100%" : 200,
        }}
        onClick={() => setExpanded((e) => !e)}
        aria-label={expanded ? "Collapse image" : "Expand image"}
      >
        <img
          src={image.dataUrl}
          alt={image.alt}
          className="block"
          style={{
            maxWidth: "100%",
            maxHeight: expanded ? 600 : 120,
            objectFit: "contain",
          }}
          draggable={false}
        />
      </button>
      {expanded && (
        <span
          className="text-[10px] block mb-1"
          style={{ color: "var(--color-overlay-0)" }}
        >
          {image.alt || "Pasted image"} — click to collapse
        </span>
      )}
    </>
  );
}

// ─── Markdown code renderer ─────────────────────────────────────────────────

interface CodeProps {
  children?: React.ReactNode;
  className?: string;
}

function MarkdownCode({ children, className }: CodeProps) {
  // Detect fenced code block via language-* className
  const match = className ? /language-(\w+)/.exec(className) : null;

  if (match) {
    // Fenced code block — route to CodeBlock
    const language = match[1];
    const code = String(children).replace(/\n$/, "");
    return <CodeBlock code={code} language={language} />;
  }

  // Inline code
  return (
    <code
      className="px-1 py-0.5 rounded text-xs"
      style={{
        fontFamily: "var(--font-mono)",
        backgroundColor: "var(--color-surface-0)",
        color: "var(--color-mauve)",
      }}
    >
      {children}
    </code>
  );
}

// ─── User message bubble ────────────────────────────────────────────────────

function UserBubble({
  message,
  isGroupFirst,
  onEdit,
  isPinned,
  onTogglePin,
}: {
  message: ConversationMessage;
  isGroupFirst: boolean;
  onEdit?: (text: string) => void;
  isPinned: boolean;
  onTogglePin: () => void;
}) {
  const { cleanText, images } = useMemo(
    () => extractImages(message.text),
    [message.text],
  );

  return (
    <div className="flex justify-end mb-3 group/user">
      <div className="flex items-start gap-2 max-w-[85%]">
        {/* Pin button — appears on hover */}
        <button
          type="button"
          onClick={onTogglePin}
          className="p-1 rounded opacity-0 group-hover/user:opacity-100 transition-opacity self-center"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: isPinned ? "var(--color-yellow)" : "var(--color-overlay-1)",
          }}
          aria-label={isPinned ? "Unpin message" : "Pin message"}
          title={isPinned ? "Unpin message" : "Pin message"}
        >
          <Pin size={11} />
        </button>
        {/* Edit button — appears on hover */}
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(message.text)}
            className="p-1 rounded opacity-0 group-hover/user:opacity-100 transition-opacity self-center"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-overlay-1)",
            }}
            aria-label="Edit message"
            title="Edit and re-send"
          >
            <Pencil size={11} />
          </button>
        )}
        <div className="flex flex-col items-end gap-0.5">
          <div
            className="rounded-lg px-3 py-2 text-xs whitespace-pre-wrap break-words"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-text)",
              borderLeft: isPinned ? "2px solid var(--color-yellow)" : undefined,
            }}
          >
            {/* Inline images */}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {images.map((img, i) => (
                  <InlineImage key={i} image={img} />
                ))}
              </div>
            )}
            {cleanText}
          </div>
          {/* Timestamp — always visible on first message of a group, hover-only otherwise */}
          <span
            className={`text-[10px] px-1 transition-opacity ${isGroupFirst ? "opacity-100" : "opacity-0 group-hover/user:opacity-100"}`}
            style={{ color: "var(--color-overlay-0)" }}
          >
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
        <div
          className="flex items-center justify-center w-6 h-6 rounded-full shrink-0 mt-0.5"
          style={{ backgroundColor: "var(--color-surface-0)" }}
        >
          <User size={12} style={{ color: "var(--color-blue)" }} />
        </div>
      </div>
    </div>
  );
}

// ─── Assistant message bubble ───────────────────────────────────────────────

function AssistantBubble({
  message,
  isGroupFirst,
  isForked,
  showRegenerate,
  onRegenerate,
  isPinned,
  onTogglePin,
}: {
  message: ConversationMessage;
  isGroupFirst: boolean;
  isForked?: boolean;
  showRegenerate?: boolean;
  onRegenerate?: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
}) {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  // null = per-card state, true = all expanded, false = all collapsed
  const [forceExpanded, setForceExpanded] = useState<boolean | null>(null);

  // ── Copy plain text ──
  const handleCopy = useCallback(() => {
    const textToCopy = message.text || message.thinking || "";
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch((err) => {
      console.error("Failed to copy message:", err);
    });
  }, [message.text, message.thinking]);

  // ── Copy as Markdown (Feature 6) ──
  const handleCopyMarkdown = useCallback(() => {
    // Build proper markdown including thinking section and tool call summaries
    let md = "";
    if (message.thinking) {
      md += `> **Thought process**\n>\n`;
      const thoughtLines = message.thinking.split("\n");
      for (const line of thoughtLines) {
        md += `> ${line}\n`;
      }
      md += "\n";
    }
    if (message.text) {
      md += message.text;
    }
    if (message.toolCalls.length > 0) {
      md += "\n\n";
      for (const tc of message.toolCalls) {
        md += `**Tool: ${tc.name}**\n`;
        if (tc.output) {
          md += "```\n" + tc.output.slice(0, 500) + (tc.output.length > 500 ? "\n... (truncated)" : "") + "\n```\n";
        }
      }
    }
    navigator.clipboard.writeText(md.trim()).then(() => {
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2000);
    }).catch((err) => {
      console.error("Failed to copy markdown:", err);
    });
  }, [message.text, message.thinking, message.toolCalls]);

  const hasToolCalls = message.toolCalls.length > 0;

  return (
    <div className="flex justify-start mb-3 group/msg">
      <div
        className="max-w-[95%] w-full relative"
        style={{
          borderLeft: isPinned ? "2px solid var(--color-yellow)" : undefined,
          paddingLeft: isPinned ? "8px" : undefined,
        }}
      >
        {/* Action buttons — appear on hover */}
        <div
          className="absolute top-0 right-0 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity z-10"
        >
          {/* Pin button */}
          <button
            type="button"
            onClick={onTogglePin}
            className="p-1 rounded transition-colors hover:bg-[var(--color-surface-1)]"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: isPinned ? "var(--color-yellow)" : "var(--color-overlay-1)",
            }}
            aria-label={isPinned ? "Unpin message" : "Pin message"}
            title={isPinned ? "Unpin message" : "Pin message"}
          >
            <Pin size={12} />
          </button>
          {/* Copy as Markdown button */}
          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors hover:bg-[var(--color-surface-1)]"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: copiedMarkdown ? "var(--color-green)" : "var(--color-overlay-1)",
            }}
            aria-label="Copy as Markdown"
            title="Copy as Markdown"
          >
            {copiedMarkdown ? <Check size={11} /> : <FileCode2 size={11} />}
            <span>{copiedMarkdown ? "Copied!" : "MD"}</span>
          </button>
          {/* Copy plain text button */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded transition-colors hover:bg-[var(--color-surface-1)]"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: copied ? "var(--color-green)" : "var(--color-overlay-1)",
            }}
            aria-label="Copy message"
            title="Copy message text"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>

        {/* Fork label (Feature 2) */}
        {isForked && (
          <div
            className="flex items-center gap-1 mb-1 text-[10px]"
            style={{ color: "var(--color-mauve)" }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: "var(--color-mauve)" }}
              aria-hidden="true"
            />
            Regenerated
          </div>
        )}

        {/* Thinking section (collapsible) */}
        {message.thinking && (
          <div className="mb-2">
            <button
              type="button"
              className="flex items-center gap-2 text-xs italic cursor-pointer bg-transparent border-none p-0 mb-1"
              style={{ color: "var(--color-overlay-1)" }}
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
              aria-expanded={thinkingExpanded}
            >
              <Brain size={12} style={{ color: "var(--color-mauve)" }} />
              <span>Thought process</span>
              <span>{thinkingExpanded ? "(hide)" : "(show)"}</span>
            </button>
            {thinkingExpanded && (
              <div
                className="text-xs italic pl-3 whitespace-pre-wrap break-words"
                style={{
                  color: "var(--color-overlay-1)",
                  borderLeft: "2px solid var(--color-mauve)",
                }}
              >
                {message.thinking}
              </div>
            )}
          </div>
        )}

        {/* Text content — rendered as markdown */}
        {message.text && (
          <div
            className="prose-chat text-xs leading-relaxed"
            style={{ color: "var(--color-text)" }}
            data-allow-select="true"
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: MarkdownCode,
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                    style={{ color: "var(--color-blue)" }}
                  >
                    {children}
                  </a>
                ),
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => (
                  <ul className="mb-2 ml-4 list-disc">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-2 ml-4 list-decimal">{children}</ol>
                ),
                li: ({ children }) => <li className="mb-0.5">{children}</li>,
                h1: ({ children }) => (
                  <h1
                    className="text-sm font-semibold mb-2 mt-3"
                    style={{ color: "var(--color-text)" }}
                  >
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2
                    className="text-xs font-semibold mb-2 mt-3"
                    style={{ color: "var(--color-text)" }}
                  >
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3
                    className="text-xs font-semibold mb-1 mt-2"
                    style={{ color: "var(--color-text)" }}
                  >
                    {children}
                  </h3>
                ),
                blockquote: ({ children }) => (
                  <blockquote
                    className="pl-3 my-2 italic"
                    style={{
                      borderLeft: "3px solid var(--color-surface-1)",
                      color: "var(--color-subtext-0)",
                    }}
                  >
                    {children}
                  </blockquote>
                ),
                hr: () => (
                  <hr
                    className="my-3 border-none h-px"
                    style={{ backgroundColor: "var(--color-surface-0)" }}
                  />
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto my-2">
                    <table
                      className="text-xs border-collapse w-full"
                      style={{ border: "1px solid var(--color-surface-0)" }}
                    >
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th
                    className="px-2 py-1 text-left font-medium"
                    style={{
                      borderBottom: "1px solid var(--color-surface-0)",
                      backgroundColor: "var(--color-surface-0)",
                      color: "var(--color-text)",
                    }}
                  >
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td
                    className="px-2 py-1"
                    style={{
                      borderBottom: "1px solid var(--color-surface-0)",
                      color: "var(--color-text)",
                    }}
                  >
                    {children}
                  </td>
                ),
                pre: ({ children }) => <>{children}</>,
              }}
            >
              {message.text}
            </ReactMarkdown>
          </div>
        )}

        {/* Tool call cards (Feature 5) */}
        {hasToolCalls && (
          <div className="mt-2">
            {/* Expand All / Collapse All controls */}
            <div
              className="flex items-center gap-2 mb-1"
            >
              <span
                className="text-[10px]"
                style={{ color: "var(--color-overlay-0)" }}
              >
                {message.toolCalls.length} tool call{message.toolCalls.length !== 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={() => setForceExpanded((prev) => (prev === true ? null : true))}
                className="flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded hover:bg-[var(--color-surface-0)] transition-colors"
                style={{ color: "var(--color-overlay-1)" }}
                title="Expand all tool calls"
                aria-label="Expand all tool calls"
              >
                <ChevronsUpDown size={10} />
                Expand all
              </button>
              <button
                type="button"
                onClick={() => setForceExpanded((prev) => (prev === false ? null : false))}
                className="flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded hover:bg-[var(--color-surface-0)] transition-colors"
                style={{ color: "var(--color-overlay-1)" }}
                title="Collapse all tool calls"
                aria-label="Collapse all tool calls"
              >
                <ChevronsDownUp size={10} />
                Collapse all
              </button>
            </div>
            {message.toolCalls.map((tc) => (
              <ToolCallCard
                key={tc.id}
                toolCall={tc}
                forceExpanded={forceExpanded !== null ? forceExpanded : undefined}
              />
            ))}
          </div>
        )}

        {/* Metadata footer: timestamp + token attribution + regenerate */}
        <div
          className="flex items-center gap-2 mt-1 text-xs"
          style={{ color: "var(--color-overlay-0)" }}
        >
          {/* Timestamp (Feature 1) */}
          <span
            className={`text-[10px] transition-opacity ${isGroupFirst ? "opacity-100" : "opacity-0 group-hover/msg:opacity-100"}`}
            style={{ color: "var(--color-overlay-0)" }}
          >
            {formatTimestamp(message.timestamp)}
          </span>
          <TokenBadge message={message} />
          {showRegenerate && onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors hover:bg-[var(--color-surface-0)] ml-auto"
              style={{ color: "var(--color-overlay-1)" }}
              aria-label="Regenerate response"
              title="Regenerate response"
            >
              <RefreshCw size={11} />
              <span className="text-[10px]">Regenerate</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MessageBubble (router) ─────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ConversationMessage;
  /** Whether this is the first message in a same-role group (for timestamp display) */
  isGroupFirst?: boolean;
  /** Whether this assistant message is a regenerated/forked response */
  isForked?: boolean;
  /** Callback when user clicks "Edit" on a user message */
  onEdit?: (text: string) => void;
  /** Whether to show the "Regenerate" button (only on last assistant message) */
  showRegenerate?: boolean;
  /** Callback when user clicks "Regenerate" on an assistant message */
  onRegenerate?: () => void;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isGroupFirst = true,
  isForked = false,
  onEdit,
  showRegenerate,
  onRegenerate,
}: MessageBubbleProps) {
  const isPinned = useConversationStore((s) => s.pinnedMessageIds.has(message.id));
  const togglePin = useConversationStore((s) => s.togglePinMessage);
  const handleTogglePin = useCallback(() => togglePin(message.id), [togglePin, message.id]);

  if (message.role === "user") {
    return (
      <UserBubble
        message={message}
        isGroupFirst={isGroupFirst}
        onEdit={onEdit}
        isPinned={isPinned}
        onTogglePin={handleTogglePin}
      />
    );
  }

  if (message.role === "assistant") {
    return (
      <AssistantBubble
        message={message}
        isGroupFirst={isGroupFirst}
        isForked={isForked}
        showRegenerate={showRegenerate}
        onRegenerate={onRegenerate}
        isPinned={isPinned}
        onTogglePin={handleTogglePin}
      />
    );
  }

  // System or result messages rendered as a subtle divider
  if (message.text) {
    return (
      <div className="flex justify-center mb-3">
        <span
          className="text-xs px-3 py-1 rounded-full"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-overlay-1)",
          }}
        >
          {message.text}
        </span>
      </div>
    );
  }

  return null;
});
