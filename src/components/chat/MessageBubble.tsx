import { useState, useCallback, useMemo, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { User, Brain, Copy, Check, Pencil, RefreshCw } from "lucide-react";
import type { ConversationMessage } from "@/stores/conversation";
import { CodeBlock } from "./CodeBlock";
import { ToolCallCard } from "./ToolCallCard";
import { TokenBadge } from "./TokenBadge";

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
  onEdit,
}: {
  message: ConversationMessage;
  onEdit?: (text: string) => void;
}) {
  const { cleanText, images } = useMemo(
    () => extractImages(message.text),
    [message.text],
  );

  return (
    <div className="flex justify-end mb-3 group/user">
      <div className="flex items-start gap-2 max-w-[85%]">
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
        <div
          className="rounded-lg px-3 py-2 text-xs whitespace-pre-wrap break-words"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-text)",
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
        <div
          className="flex items-center justify-center w-6 h-6 rounded-full shrink-0"
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
  showRegenerate,
  onRegenerate,
}: {
  message: ConversationMessage;
  showRegenerate?: boolean;
  onRegenerate?: () => void;
}) {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const textToCopy = message.text || message.thinking || "";
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch((err) => {
      console.error("Failed to copy message:", err);
    });
  }, [message.text, message.thinking]);

  return (
    <div className="flex justify-start mb-3 group/msg">
      <div className="max-w-[95%] w-full relative">
        {/* Copy button — appears on hover */}
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-0 right-0 p-1 rounded opacity-0 group-hover/msg:opacity-100 transition-opacity z-10"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: copied ? "var(--color-green)" : "var(--color-overlay-1)",
          }}
          aria-label="Copy message"
          title="Copy message text"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>

        {/* Thinking section (collapsible) */}
        {message.thinking && (
          <div className="mb-2">
            <button
              type="button"
              className="flex items-center gap-2 text-xs italic cursor-pointer bg-transparent border-none p-0 mb-1"
              style={{ color: "var(--color-overlay-1)" }}
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
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

        {/* Tool call cards */}
        {message.toolCalls.length > 0 && (
          <div className="mt-2">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Metadata footer: token attribution + regenerate */}
        <div
          className="flex items-center gap-2 mt-1 text-xs"
          style={{ color: "var(--color-overlay-0)" }}
        >
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
  /** Callback when user clicks "Edit" on a user message */
  onEdit?: (text: string) => void;
  /** Whether to show the "Regenerate" button (only on last assistant message) */
  showRegenerate?: boolean;
  /** Callback when user clicks "Regenerate" on an assistant message */
  onRegenerate?: () => void;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  onEdit,
  showRegenerate,
  onRegenerate,
}: MessageBubbleProps) {
  if (message.role === "user") {
    return <UserBubble message={message} onEdit={onEdit} />;
  }

  if (message.role === "assistant") {
    return (
      <AssistantBubble
        message={message}
        showRegenerate={showRegenerate}
        onRegenerate={onRegenerate}
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
