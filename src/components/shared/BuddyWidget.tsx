import { useConversationStore } from "@/stores/conversation";

// ── Props ──────────────────────────────────────────────────────────

interface BuddyWidgetProps {
  visible: boolean;
}

// ── Idle message pool ──────────────────────────────────────────────

const IDLE_MESSAGES = [
  "ready!",
  "let's go",
  "what's next?",
  "~",
  "here to help",
];

/**
 * BuddyWidget — Inkwell the coding turtle.
 *
 * A tiny companion in the status bar that shows context-sensitive messages
 * based on the current conversation state. Named after the user's real turtle.
 */
export function BuddyWidget({ visible }: BuddyWidgetProps) {
  const isStreaming = useConversationStore((s) => s.isStreaming);
  const isThinking = useConversationStore((s) => s.isThinking);
  const connectionStatus = useConversationStore((s) => s.connectionStatus);

  if (!visible) return null;

  let message: string;

  if (
    connectionStatus === "disconnected" ||
    connectionStatus === "stopped"
  ) {
    message = "zzz...";
  } else if (connectionStatus === "error") {
    message = "oh no...";
  } else if (isThinking) {
    message = "hmm...";
  } else if (isStreaming) {
    message = "writing...";
  } else {
    // Rotate through idle messages once per minute to avoid constant re-renders
    message = IDLE_MESSAGES[Math.floor(Date.now() / 60000) % IDLE_MESSAGES.length];
  }

  return (
    <span
      className="inline-flex items-center gap-1"
      title="Inkwell the coding turtle"
    >
      <span
        style={{ fontSize: "11px", lineHeight: 1 }}
        role="img"
        aria-label="turtle"
      >
        {"\uD83D\uDC22"}
      </span>
      <span
        className="text-[9px] italic"
        style={{ color: "var(--color-overlay-1)" }}
      >
        {message}
      </span>
    </span>
  );
}
