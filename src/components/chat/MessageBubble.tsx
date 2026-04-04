import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { User, Brain } from "lucide-react";
import type { ConversationMessage } from "@/stores/conversation";
import { CodeBlock } from "./CodeBlock";
import { ToolCallCard } from "./ToolCallCard";

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

function UserBubble({ message }: { message: ConversationMessage }) {
  return (
    <div className="flex justify-end mb-3">
      <div className="flex items-start gap-2 max-w-[85%]">
        <div
          className="rounded-lg px-3 py-2 text-xs whitespace-pre-wrap break-words"
          style={{
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-text)",
          }}
        >
          {message.text}
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

function AssistantBubble({ message }: { message: ConversationMessage }) {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);

  const totalTokens = message.usage
    ? message.usage.input_tokens + message.usage.output_tokens
    : null;

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[95%] w-full">
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

        {/* Metadata footer */}
        {totalTokens !== null && (
          <div
            className="flex items-center gap-2 mt-1 text-xs"
            style={{ color: "var(--color-overlay-0)" }}
          >
            <span>{totalTokens.toLocaleString()} tokens</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MessageBubble (router) ─────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ConversationMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "user") {
    return <UserBubble message={message} />;
  }

  if (message.role === "assistant") {
    return <AssistantBubble message={message} />;
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
}
