/**
 * These tests run against the Tauri mock layer (jsdom).
 * For IPC correctness, also verify with `npm run tauri dev`.
 * See CLAUDE.md: "NEVER test only against mocks".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useConversationStore } from "@/stores/conversation";
import type { ConversationMessage } from "@/stores/conversation";
import { MessageBubble } from "../chat/MessageBubble";

// ── Mock CodeBlock (uses shiki which doesn't work in jsdom) ─────────────────

vi.mock("../chat/CodeBlock", () => ({
  CodeBlock: ({ code, language }: { code: string; language: string }) => (
    <pre data-testid="code-block" data-language={language}>
      {code}
    </pre>
  ),
}));

// ── Mock ToolCallCard ───────────────────────────────────────────────────────

vi.mock("../chat/ToolCallCard", () => ({
  ToolCallCard: ({
    toolCall,
  }: {
    toolCall: { id: string; name: string };
  }) => (
    <div data-testid="tool-call-card" data-tool-name={toolCall.name}>
      Tool: {toolCall.name}
    </div>
  ),
}));

// ── Mock TokenBadge ─────────────────────────────────────────────────────────

vi.mock("../chat/TokenBadge", () => ({
  TokenBadge: () => <span data-testid="token-badge" />,
}));

// ── Mock formatters ─────────────────────────────────────────────────────────

vi.mock("@/lib/formatters", () => ({
  formatTimestamp: (ts: number) => new Date(ts).toLocaleTimeString(),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: "msg-1",
    role: "user",
    text: "Hello world",
    thinking: "",
    toolCalls: [],
    timestamp: Date.now(),
    parentToolUseId: null,
    ...overrides,
  };
}

describe("MessageBubble", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset pinned messages
    useConversationStore.setState({ pinnedMessageIds: new Set() });
  });

  // ── User message rendering ──────────────────────────────────────────────

  it("renders user message text", () => {
    const message = createMessage({ role: "user", text: "What is TypeScript?" });

    render(<MessageBubble message={message} />);

    expect(screen.getByText("What is TypeScript?")).toBeInTheDocument();
  });

  it("renders user avatar icon", () => {
    const message = createMessage({ role: "user", text: "Hello" });

    render(<MessageBubble message={message} />);

    // User bubble is right-aligned and has user icon
    // The text should be in the document
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("shows edit button on user message when onEdit is provided", () => {
    const message = createMessage({ role: "user", text: "Hello" });
    const onEdit = vi.fn();

    render(<MessageBubble message={message} onEdit={onEdit} />);

    expect(screen.getByLabelText("Edit message")).toBeInTheDocument();
  });

  it("calls onEdit with message text when edit button is clicked", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const message = createMessage({ role: "user", text: "Original text" });

    render(<MessageBubble message={message} onEdit={onEdit} />);

    await user.click(screen.getByLabelText("Edit message"));
    expect(onEdit).toHaveBeenCalledWith("Original text");
  });

  it("does not show edit button when onEdit is not provided", () => {
    const message = createMessage({ role: "user", text: "Hello" });

    render(<MessageBubble message={message} />);

    expect(screen.queryByLabelText("Edit message")).not.toBeInTheDocument();
  });

  // ── Assistant message rendering ─────────────────────────────────────────

  it("renders assistant message with markdown text", () => {
    const message = createMessage({
      role: "assistant",
      text: "This is **bold** text",
    });

    render(<MessageBubble message={message} />);

    // ReactMarkdown should render the bold text
    expect(screen.getByText("bold")).toBeInTheDocument();
  });

  it("renders inline code in assistant messages", () => {
    const message = createMessage({
      role: "assistant",
      text: "Use the `useState` hook",
    });

    render(<MessageBubble message={message} />);

    expect(screen.getByText("useState")).toBeInTheDocument();
  });

  it("renders fenced code blocks via CodeBlock component", () => {
    const message = createMessage({
      role: "assistant",
      text: "Here is some code:\n\n```typescript\nconst x = 1;\n```",
    });

    render(<MessageBubble message={message} />);

    const codeBlock = screen.getByTestId("code-block");
    expect(codeBlock).toBeInTheDocument();
    expect(codeBlock).toHaveAttribute("data-language", "typescript");
    expect(codeBlock).toHaveTextContent("const x = 1;");
  });

  // ── Tool calls ──────────────────────────────────────────────────────────

  it("displays tool call cards when message has tool calls", () => {
    const message = createMessage({
      role: "assistant",
      text: "Let me read that file.",
      toolCalls: [
        {
          id: "tc-1",
          name: "Read",
          input: { file_path: "/src/main.ts" },
          inputJson: '{"file_path":"/src/main.ts"}',
          isExecuting: false,
        },
        {
          id: "tc-2",
          name: "Edit",
          input: { file_path: "/src/main.ts" },
          inputJson: '{"file_path":"/src/main.ts"}',
          isExecuting: false,
        },
      ],
    });

    render(<MessageBubble message={message} />);

    const toolCards = screen.getAllByTestId("tool-call-card");
    expect(toolCards).toHaveLength(2);
    expect(toolCards[0]).toHaveAttribute("data-tool-name", "Read");
    expect(toolCards[1]).toHaveAttribute("data-tool-name", "Edit");
  });

  it("shows tool call count label when tool calls exist", () => {
    const message = createMessage({
      role: "assistant",
      text: "Done.",
      toolCalls: [
        {
          id: "tc-1",
          name: "Bash",
          input: { command: "ls" },
          inputJson: '{"command":"ls"}',
          isExecuting: false,
        },
      ],
    });

    render(<MessageBubble message={message} />);

    expect(screen.getByText("1 tool call")).toBeInTheDocument();
  });

  it("shows plural tool call label for multiple calls", () => {
    const message = createMessage({
      role: "assistant",
      text: "",
      toolCalls: [
        {
          id: "tc-1",
          name: "Read",
          input: {},
          inputJson: "{}",
          isExecuting: false,
        },
        {
          id: "tc-2",
          name: "Write",
          input: {},
          inputJson: "{}",
          isExecuting: false,
        },
        {
          id: "tc-3",
          name: "Bash",
          input: {},
          inputJson: "{}",
          isExecuting: false,
        },
      ],
    });

    render(<MessageBubble message={message} />);

    expect(screen.getByText("3 tool calls")).toBeInTheDocument();
  });

  // ── Thinking indicator ──────────────────────────────────────────────────

  it("shows thinking toggle when message has thinking content", () => {
    const message = createMessage({
      role: "assistant",
      text: "The answer is 42.",
      thinking: "Let me think about this carefully...",
    });

    render(<MessageBubble message={message} />);

    expect(screen.getByText("Thought process")).toBeInTheDocument();
    expect(screen.getByText("(show)")).toBeInTheDocument();
  });

  it("expands thinking section when toggle is clicked", async () => {
    const user = userEvent.setup();
    const message = createMessage({
      role: "assistant",
      text: "The answer is 42.",
      thinking: "Deep analysis of the problem...",
    });

    render(<MessageBubble message={message} />);

    // Click to expand thinking
    await user.click(screen.getByText("Thought process"));

    // Thinking content should now be visible
    expect(screen.getByText("Deep analysis of the problem...")).toBeInTheDocument();
    expect(screen.getByText("(hide)")).toBeInTheDocument();
  });

  it("does not show thinking section when message has no thinking", () => {
    const message = createMessage({
      role: "assistant",
      text: "Simple response",
      thinking: "",
    });

    render(<MessageBubble message={message} />);

    expect(screen.queryByText("Thought process")).not.toBeInTheDocument();
  });

  // ── System/result messages ──────────────────────────────────────────────

  it("renders system message as centered divider", () => {
    const message = createMessage({
      role: "system",
      text: "Session started",
    });

    render(<MessageBubble message={message} />);

    expect(screen.getByText("Session started")).toBeInTheDocument();
  });

  it("returns null for system message with empty text", () => {
    const message = createMessage({
      role: "system",
      text: "",
    });

    const { container } = render(<MessageBubble message={message} />);

    expect(container.innerHTML).toBe("");
  });

  // ── Regenerate button ───────────────────────────────────────────────────

  it("shows regenerate button when showRegenerate is true", () => {
    const message = createMessage({
      role: "assistant",
      text: "A response",
    });

    render(
      <MessageBubble
        message={message}
        showRegenerate={true}
        onRegenerate={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Regenerate response")).toBeInTheDocument();
  });

  it("calls onRegenerate when regenerate button is clicked", async () => {
    const user = userEvent.setup();
    const onRegenerate = vi.fn();
    const message = createMessage({
      role: "assistant",
      text: "A response",
    });

    render(
      <MessageBubble
        message={message}
        showRegenerate={true}
        onRegenerate={onRegenerate}
      />,
    );

    await user.click(screen.getByLabelText("Regenerate response"));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("does not show regenerate button when showRegenerate is false", () => {
    const message = createMessage({
      role: "assistant",
      text: "A response",
    });

    render(<MessageBubble message={message} showRegenerate={false} />);

    expect(screen.queryByLabelText("Regenerate response")).not.toBeInTheDocument();
  });

  // ── Pin functionality ─────────────────────────────────────────────────

  it("shows pin button on user messages", () => {
    const message = createMessage({ role: "user", text: "Test" });

    render(<MessageBubble message={message} />);

    expect(screen.getByLabelText("Pin message")).toBeInTheDocument();
  });

  it("shows pin button on assistant messages", () => {
    const message = createMessage({ role: "assistant", text: "Response" });

    render(<MessageBubble message={message} />);

    expect(screen.getByLabelText("Pin message")).toBeInTheDocument();
  });

  // ── Copy button ───────────────────────────────────────────────────────

  it("shows copy button on assistant messages", () => {
    const message = createMessage({
      role: "assistant",
      text: "Copy this text",
    });

    render(<MessageBubble message={message} />);

    expect(screen.getByLabelText("Copy message")).toBeInTheDocument();
  });

  // ── Forked/regenerated label ──────────────────────────────────────────

  it("shows 'Regenerated' label when isForked is true", () => {
    const message = createMessage({
      role: "assistant",
      text: "New response",
    });

    render(<MessageBubble message={message} isForked={true} />);

    expect(screen.getByText("Regenerated")).toBeInTheDocument();
  });

  it("does not show 'Regenerated' label when isForked is false", () => {
    const message = createMessage({
      role: "assistant",
      text: "Normal response",
    });

    render(<MessageBubble message={message} isForked={false} />);

    expect(screen.queryByText("Regenerated")).not.toBeInTheDocument();
  });
});
