import { useConversationStore } from "@/stores/conversation";

export function StreamingPreview() {
  const activeBlocks = useConversationStore((s) => s.activeBlocks);

  // Collect text from all active text blocks
  let previewText = "";
  const sorted = [...activeBlocks.values()].sort((a, b) => a.index - b.index);
  for (const block of sorted) {
    if (block.type === "text" && !block.isComplete) {
      previewText += block.text;
    }
  }

  if (!previewText) return null;

  return (
    <div
      className="text-xs leading-relaxed whitespace-pre-wrap break-words mb-3"
      style={{ color: "var(--color-text)" }}
      data-allow-select="true"
    >
      {previewText}
      <span
        className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse rounded-sm"
        style={{ backgroundColor: "var(--color-blue)" }}
      />
    </div>
  );
}
