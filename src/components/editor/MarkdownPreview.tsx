import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./markdownPreview.css";

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div
      className="h-full overflow-y-auto p-6"
      style={{
        backgroundColor: "var(--color-base)",
        color: "var(--color-text)",
      }}
    >
      <article className="max-w-none markdown-preview">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
