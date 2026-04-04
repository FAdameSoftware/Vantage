import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Square, Brain } from "lucide-react";
import { SlashAutocomplete } from "./SlashAutocomplete";
import {
  buildCommandList,
  filterCommands,
  type SlashCommand,
} from "@/lib/slashCommands";
import { useQuickQuestionStore } from "@/stores/quickQuestion";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
  connectionStatus: string;
  installedSkills?: Array<{ name: string; description: string; source: string }>;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  connectionStatus,
  installedSkills,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [ultrathink, setUltrathink] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Slash autocomplete state
  const [showSlash, setShowSlash] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [allCommands, setAllCommands] = useState<SlashCommand[]>(() =>
    buildCommandList([]),
  );

  // Rebuild command list when installedSkills changes
  useEffect(() => {
    if (installedSkills) {
      setAllCommands(buildCommandList(installedSkills));
    }
  }, [installedSkills]);

  const filteredSlash = showSlash ? filterCommands(allCommands, slashQuery) : [];

  // Auto-resize textarea to fit content, max 200px
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || disabled) return;
    // Prepend ultrathink keyword when Deep Think is enabled
    const message = ultrathink ? `ultrathink ${trimmed}` : trimmed;
    onSend(message);
    setText("");
    setShowSlash(false);
    setSlashQuery("");
    // Reset height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, isStreaming, disabled, onSend, ultrathink]);

  const handleSlashSelect = useCallback((cmd: SlashCommand) => {
    if (cmd.name === "interview") {
      // Inject the interview prompt template instead of the raw command
      const template =
        "Before building anything, interview me to understand the requirements. " +
        "Ask me questions one at a time about: the problem I'm solving, " +
        "who the users are, what constraints exist, what the acceptance criteria are, " +
        "and any technical preferences. Only start building after I say 'go ahead'.";
      setText(template);
    } else {
      setText("/" + cmd.name + " ");
    }
    setShowSlash(false);
    setSlashQuery("");
    textareaRef.current?.focus();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;

      // If user has typed "/btw <something>", route to quick question overlay
      if (val.startsWith("/btw ") && val.length > 5) {
        useQuickQuestionStore.getState().ask(val.slice(5));
        setText("");
        setShowSlash(false);
        setSlashQuery("");
        return;
      }

      setText(val);

      if (val.startsWith("/")) {
        const query = val.slice(1);
        setShowSlash(true);
        setSlashQuery(query);
        setSlashIndex(0);
      } else {
        setShowSlash(false);
        setSlashQuery("");
      }
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showSlash && filteredSlash.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashIndex((i) => Math.min(i + 1, filteredSlash.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          handleSlashSelect(filteredSlash[slashIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowSlash(false);
          return;
        }
      }
      // Original Enter-to-send behavior
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [showSlash, filteredSlash, slashIndex, handleSlashSelect, handleSend],
  );

  const placeholder =
    connectionStatus === "starting"
      ? "Connecting..."
      : isStreaming
        ? "Claude is responding..."
        : "Ask Claude anything...";

  const hintText = isStreaming ? "Ctrl+C to stop" : "Shift+Enter for newline";

  const hasText = text.trim().length > 0;

  return (
    <div
      className="shrink-0 px-2 py-1.5"
      style={{ borderTop: "1px solid var(--color-surface-0)" }}
    >
      <div className="relative">
        <SlashAutocomplete
          commands={filteredSlash}
          query={slashQuery}
          selectedIndex={slashIndex}
          onSelect={handleSlashSelect}
          visible={showSlash}
        />
        <div
          className="flex items-end gap-1.5 rounded-md p-1.5"
          style={{
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-surface-1)",
          }}
        >
          <textarea
            ref={textareaRef}
            className="flex-1 bg-transparent text-xs resize-none outline-none placeholder:text-[var(--color-overlay-0)]"
            style={{
              color: "var(--color-text)",
              fontFamily: "var(--font-sans)",
              maxHeight: "150px",
            }}
            placeholder={placeholder}
            rows={1}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
          />

          {/* Deep Think toggle — always visible */}
          <button
            type="button"
            className="p-1 rounded transition-colors hover:bg-[var(--color-surface-1)]"
            style={{
              color: ultrathink ? "var(--color-mauve)" : "var(--color-overlay-0)",
              boxShadow: ultrathink ? "0 0 0 1px var(--color-mauve)" : undefined,
            }}
            onClick={() => setUltrathink((u) => !u)}
            aria-label={ultrathink ? "Disable Deep Think" : "Enable Deep Think"}
            title={ultrathink ? "Deep Think ON — max reasoning" : "Deep Think OFF"}
          >
            <Brain size={14} />
          </button>

          {isStreaming ? (
            <button
              type="button"
              className="p-1 rounded transition-colors hover:bg-[var(--color-surface-1)]"
              style={{ color: "var(--color-red)" }}
              onClick={onStop}
              aria-label="Stop generation"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="p-1 rounded transition-colors hover:bg-[var(--color-surface-1)]"
              style={{
                color: hasText ? "var(--color-blue)" : "var(--color-overlay-0)",
              }}
              onClick={handleSend}
              disabled={!hasText || disabled}
              aria-label="Send message"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
      <p
        className="text-center mt-1 text-[10px]"
        style={{ color: ultrathink ? "var(--color-mauve)" : "var(--color-overlay-0)" }}
      >
        {ultrathink ? "Deep Think enabled — maximum reasoning budget" : hintText}
      </p>
    </div>
  );
}
