import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Square, Brain } from "lucide-react";
import { SlashAutocomplete } from "./SlashAutocomplete";
import { MentionAutocomplete } from "./MentionAutocomplete";
import { MentionChip } from "./MentionChip";
import {
  buildCommandList,
  filterCommands,
  type SlashCommand,
} from "@/lib/slashCommands";
import { handleSlashCommand } from "@/lib/slashHandlers";
import { useQuickQuestionStore } from "@/stores/quickQuestion";
import {
  filterMentionSources,
  resolveMention,
  formatMessageWithMentions,
  type MentionSource,
  type ResolvedMention,
} from "@/lib/mentionResolver";
import { useEditorStore } from "@/stores/editor";

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

  // Mention (@) autocomplete state
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [resolvedMentions, setResolvedMentions] = useState<ResolvedMention[]>([]);
  const [isResolvingMention, setIsResolvingMention] = useState(false);

  // Rebuild command list when installedSkills changes
  useEffect(() => {
    if (installedSkills) {
      setAllCommands(buildCommandList(installedSkills));
    }
  }, [installedSkills]);

  const filteredSlash = showSlash ? filterCommands(allCommands, slashQuery) : [];
  const filteredMentions = showMention ? filterMentionSources(mentionQuery) : [];

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

    // Route slash commands through the local handler first.
    // If the handler returns true, the command was handled locally and we
    // must not forward it to Claude.
    if (trimmed.startsWith("/")) {
      const handled = handleSlashCommand(trimmed, onSend);
      setText("");
      setShowSlash(false);
      setSlashQuery("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      if (handled) return;
      // handleSlashCommand already called onSend for forwarded commands.
      return;
    }

    // Format message with any resolved @-mention context
    const withContext = formatMessageWithMentions(resolvedMentions, trimmed);

    // Prepend ultrathink keyword when Deep Think is enabled
    const message = ultrathink ? `ultrathink ${withContext}` : withContext;
    onSend(message);
    setText("");
    setResolvedMentions([]);
    setShowSlash(false);
    setSlashQuery("");
    setShowMention(false);
    setMentionQuery("");
    // Reset height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, isStreaming, disabled, onSend, ultrathink, resolvedMentions]);

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

  const handleMentionSelect = useCallback(
    (source: MentionSource) => {
      setShowMention(false);
      setMentionQuery("");

      // Remove the @query text from the input
      setText((prev) => prev.replace(/@\w*$/, ""));

      // For types that need extra input (e.g. @file needs a path),
      // we would show a file picker here. For now, @file resolves
      // the currently active editor tab as a pragmatic default.
      if (source.needsExtra && source.type === "file") {
        // Access the editor store directly (imported at top level)
        const activeTab = useEditorStore.getState().getActiveTab();
        if (!activeTab) {
          textareaRef.current?.focus();
          return;
        }
        setIsResolvingMention(true);
        void resolveMention(source.type, activeTab.path).then(
          (resolved) => {
            setResolvedMentions((prev) => [...prev, resolved]);
            setIsResolvingMention(false);
          },
          () => {
            setIsResolvingMention(false);
          },
        );
      } else {
        setIsResolvingMention(true);
        void resolveMention(source.type).then(
          (resolved) => {
            setResolvedMentions((prev) => [...prev, resolved]);
            setIsResolvingMention(false);
          },
          () => {
            setIsResolvingMention(false);
          },
        );
      }

      textareaRef.current?.focus();
    },
    [],
  );

  const handleRemoveMention = useCallback((index: number) => {
    setResolvedMentions((prev) => prev.filter((_, i) => i !== index));
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
        setShowMention(false);
        setMentionQuery("");
      } else {
        setShowSlash(false);
        setSlashQuery("");

        // Detect @mention trigger: look for "@" followed by optional word chars
        // at the current cursor position (end of text for simplicity)
        const atMatch = val.match(/@(\w*)$/);
        if (atMatch) {
          setShowMention(true);
          setMentionQuery(atMatch[1]);
          setMentionIndex(0);
        } else {
          setShowMention(false);
          setMentionQuery("");
        }
      }
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Slash command autocomplete navigation
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
      // @mention autocomplete navigation
      if (showMention && filteredMentions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((i) => Math.min(i + 1, filteredMentions.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          handleMentionSelect(filteredMentions[mentionIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowMention(false);
          return;
        }
      }
      // Original Enter-to-send behavior
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [showSlash, filteredSlash, slashIndex, handleSlashSelect, showMention, filteredMentions, mentionIndex, handleMentionSelect, handleSend],
  );

  const placeholder =
    connectionStatus === "starting"
      ? "Connecting..."
      : isStreaming
        ? "Claude is responding..."
        : "Ask Claude anything...";

  const hintText = isStreaming
    ? "Ctrl+C to stop"
    : isResolvingMention
      ? "Resolving context..."
      : "Shift+Enter for newline · @ to add context";

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
        <MentionAutocomplete
          sources={filteredMentions}
          selectedIndex={mentionIndex}
          onSelect={handleMentionSelect}
          visible={showMention && !showSlash}
        />
        {/* Mention chips */}
        {resolvedMentions.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1 px-1">
            {resolvedMentions.map((mention, i) => (
              <MentionChip
                key={`${mention.type}-${mention.label}-${i}`}
                mention={mention}
                onRemove={() => handleRemoveMention(i)}
              />
            ))}
          </div>
        )}
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
            maxLength={100000}
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
