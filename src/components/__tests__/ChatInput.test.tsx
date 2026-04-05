import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput } from "../chat/ChatInput";
import { useSettingsStore } from "@/stores/settings";

// Mock the quickQuestion store
vi.mock("@/stores/quickQuestion", () => ({
  useQuickQuestionStore: Object.assign(
    () => ({ isOpen: false, question: "", response: "" }),
    {
      getState: () => ({
        ask: vi.fn(),
      }),
    },
  ),
}));

// Default props factory
function defaultProps(overrides: Partial<Parameters<typeof ChatInput>[0]> = {}) {
  return {
    onSend: vi.fn(),
    onStop: vi.fn(),
    isStreaming: false,
    disabled: false,
    connectionStatus: "ready",
    ...overrides,
  };
}

describe("ChatInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders textarea with correct placeholder when ready", () => {
    render(<ChatInput {...defaultProps()} />);
    expect(screen.getByPlaceholderText("Ask Claude anything...")).toBeInTheDocument();
  });

  it("renders 'Connecting...' placeholder when starting", () => {
    render(<ChatInput {...defaultProps({ connectionStatus: "starting" })} />);
    expect(screen.getByPlaceholderText("Connecting...")).toBeInTheDocument();
  });

  it("renders streaming placeholder when streaming", () => {
    render(<ChatInput {...defaultProps({ isStreaming: true })} />);
    expect(screen.getByPlaceholderText("Claude is responding...")).toBeInTheDocument();
  });

  it("calls onSend with trimmed text on Enter", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps({ onSend })} />);

    const textarea = screen.getByPlaceholderText("Ask Claude anything...");
    await user.type(textarea, "hello world");
    await user.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith("hello world");
  });

  it("does not call onSend on Shift+Enter (inserts newline)", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps({ onSend })} />);

    const textarea = screen.getByPlaceholderText("Ask Claude anything...");
    await user.type(textarea, "line1");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not call onSend when text is empty", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps({ onSend })} />);

    const textarea = screen.getByPlaceholderText("Ask Claude anything...");
    await user.click(textarea);
    await user.keyboard("{Enter}");

    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables textarea when disabled prop is true", () => {
    render(<ChatInput {...defaultProps({ disabled: true })} />);
    const textarea = screen.getByPlaceholderText("Ask Claude anything...");
    expect(textarea).toBeDisabled();
  });

  it("shows stop button during streaming", () => {
    render(<ChatInput {...defaultProps({ isStreaming: true })} />);
    expect(screen.getByLabelText("Stop generation")).toBeInTheDocument();
  });

  it("calls onStop when stop button clicked during streaming", async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(<ChatInput {...defaultProps({ isStreaming: true, onStop })} />);

    await user.click(screen.getByLabelText("Stop generation"));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("shows send button when not streaming", () => {
    render(<ChatInput {...defaultProps()} />);
    expect(screen.getByLabelText("Send message")).toBeInTheDocument();
  });

  it("send button is disabled when no text", () => {
    render(<ChatInput {...defaultProps()} />);
    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });

  it("prepends thinking phrase when thinking mode is set via store", async () => {
    // Set thinking mode to ultrathink in the store
    act(() => {
      useSettingsStore.getState().setThinkingMode("ultrathink");
    });

    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps({ onSend })} />);

    // Type and send
    const textarea = screen.getByPlaceholderText("Ask Claude anything...");
    await user.type(textarea, "test message");
    await user.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith("ultrathink test message");

    // Reset store
    act(() => {
      useSettingsStore.getState().setThinkingMode("auto");
    });
  });

  it("shows thinking mode label when a non-auto mode is selected", () => {
    act(() => {
      useSettingsStore.getState().setThinkingMode("think_hard");
    });
    render(<ChatInput {...defaultProps()} />);

    expect(screen.getByText(/Think Hard mode enabled/)).toBeInTheDocument();

    // Reset store
    act(() => {
      useSettingsStore.getState().setThinkingMode("auto");
    });
  });

  it("renders thinking mode selector button", () => {
    render(<ChatInput {...defaultProps()} />);
    expect(screen.getByLabelText(/Thinking mode/)).toBeInTheDocument();
  });

  it("shows slash autocomplete when / is typed", async () => {
    const user = userEvent.setup();
    render(<ChatInput {...defaultProps()} />);

    const textarea = screen.getByPlaceholderText("Ask Claude anything...");
    await user.type(textarea, "/");

    // Slash commands should be visible (at least some built-in ones)
    expect(screen.getByText(/\/clear/)).toBeInTheDocument();
  });

  it("clears text after sending", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps({ onSend })} />);

    const textarea = screen.getByPlaceholderText("Ask Claude anything...");
    await user.type(textarea, "send this");
    await user.keyboard("{Enter}");

    expect(textarea).toHaveValue("");
  });
});
