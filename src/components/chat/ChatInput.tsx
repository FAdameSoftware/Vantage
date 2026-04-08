import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { Send, Square } from "lucide-react";
import { SlashAutocomplete } from "./SlashAutocomplete";
import { MentionAutocomplete } from "./MentionAutocomplete";
import { MentionChip } from "./MentionChip";
import { ImagePreview } from "./ImagePreview";
import { ThinkingModeSelector, getThinkingPhrase, getThinkingModeLabel } from "./ThinkingModeSelector";
import {
  buildCommandList,
  filterCommands,
  type SlashCommand,
} from "@/lib/slashCommands";
import { handleSlashCommand } from "@/lib/slashHandlers";
import { useQuickQuestionStore } from "@/stores/quickQuestion";
import { useSettingsStore } from "@/stores/settings";
import { DIMENSIONS } from "@/lib/dimensions";
import {
  filterMentionSources,
  resolveMention,
  formatMessageWithMentions,
  type MentionSource,
  type ResolvedMention,
} from "@/lib/mentionResolver";
import { useImagePaste } from "@/hooks/useImagePaste";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
  connectionStatus: string;
  installedSkills?: Array<{ name: string; description: string; source: string }>;
}

export interface ChatInputHandle {
  setEditText: (text: string) => void;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  connectionStatus,
  installedSkills,
}, ref) {
  const [text, setText] = useState("");
  const thinkingMode = useSettingsStore((s) => s.thinkingMode);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Chat input history (Feature 4: arrow up/down to cycle previous messages)
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const draftRef = useRef("");

  // Expose setEditText for parent to load edited text into input
  useImperativeHandle(ref, () => ({
    setEditText: (editText: string) => {
      setText(editText);
      // Focus and move cursor to end after a tick
      setTimeout(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.selectionStart = editText.length;
          el.selectionEnd = editText.length;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
        }
      }, 0);
    },
  }), []);

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

  // Image paste/drop state
  const imagePaste = useImagePaste();

  // Rebuild command list when installedSkills changes
  useEffect(() => {
    if (installedSkills) {
      setAllCommands(buildCommandList(installedSkills));
    }
  }, [installedSkills]);

  const filteredSlash = showSlash ? filterCommands(allCommands, slashQuery) : [];
  const filteredMentions = showMention ? filterMentionSources(mentionQuery) : [];

  // Auto-resize textarea to fit content, max 240px (~10 lines)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (isStreaming || disabled) return;
    if (!trimmed && !imagePaste.hasImages) return;

    // Add to input history
    if (trimmed) {
      historyRef.current.push(trimmed);
      // Keep max 100 entries
      if (historyRef.current.length > 100) {
        historyRef.current.shift();
      }
      historyIndexRef.current = -1;
      draftRef.current = "";
    }

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

    // Append image data if any images are pasted
    const imageContext = imagePaste.formatImagesForMessage();
    const withImages = imageContext
      ? `${withContext}\n\n${imageContext}`
      : withContext;

    // Prepend thinking phrase when mode is not "auto"
    const thinkingPhrase = getThinkingPhrase(thinkingMode);
    const message = thinkingPhrase ? `${thinkingPhrase} ${withImages}` : withImages;
    onSend(message);
    setText("");
    setResolvedMentions([]);
    imagePaste.clearImages();
    setShowSlash(false);
    setSlashQuery("");
    setShowMention(false);
    setMentionQuery("");
    // Reset height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, isStreaming, disabled, onSend, thinkingMode, resolvedMentions, imagePaste]);

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
      // For @file, don't close the mention autocomplete -- it will show
      // the file picker sub-view. The MentionAutocomplete component
      // handles this internally via its showFilePicker state.
      if (source.needsExtra && source.type === "file") {
        // The MentionAutocomplete component will switch to file picker view.
        // We keep showMention=true so it stays visible.
        return;
      }

      setShowMention(false);
      setMentionQuery("");

      // Remove the @query text from the input
      setText((prev) => prev.replace(/@\w*$/, ""));

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

      textareaRef.current?.focus();
    },
    [],
  );

  // Handle file picker selection from the MentionAutocomplete sub-view
  const handleFilePickerSelect = useCallback(
    (filePath: string) => {
      setShowMention(false);
      setMentionQuery("");

      // Remove the @query text from the input
      setText((prev) => prev.replace(/@\w*$/, ""));

      setIsResolvingMention(true);
      void resolveMention("file", filePath).then(
        (resolved) => {
          setResolvedMentions((prev) => [...prev, resolved]);
          setIsResolvingMention(false);
        },
        () => {
          setIsResolvingMention(false);
        },
      );

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
      // Chat input history: Arrow Up/Down (Feature 4)
      // Only activate when cursor is at position 0 (start of input)
      if (e.key === "ArrowUp" && !showSlash && !showMention) {
        const el = textareaRef.current;
        if (el && el.selectionStart === 0 && el.selectionEnd === 0) {
          const history = historyRef.current;
          if (history.length === 0) return;

          e.preventDefault();
          if (historyIndexRef.current === -1) {
            // Save current draft before browsing history
            draftRef.current = text;
            historyIndexRef.current = history.length - 1;
          } else if (historyIndexRef.current > 0) {
            historyIndexRef.current -= 1;
          }
          setText(history[historyIndexRef.current]);
          return;
        }
      }
      if (e.key === "ArrowDown" && !showSlash && !showMention) {
        const el = textareaRef.current;
        if (el && historyIndexRef.current !== -1) {
          const history = historyRef.current;
          e.preventDefault();
          if (historyIndexRef.current < history.length - 1) {
            historyIndexRef.current += 1;
            setText(history[historyIndexRef.current]);
          } else {
            // Restore draft when going past the end
            historyIndexRef.current = -1;
            setText(draftRef.current);
          }
          return;
        }
      }
      // Original Enter-to-send behavior
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [showSlash, filteredSlash, slashIndex, handleSlashSelect, showMention, filteredMentions, mentionIndex, handleMentionSelect, handleSend, text],
  );

  const placeholder =
    connectionStatus === "starting"
      ? "Connecting..."
      : isStreaming
        ? "Claude is responding..."
        : "Ask Claude anything...";

  const thinkingLabel = getThinkingModeLabel(thinkingMode);
  const isThinkingActive = thinkingMode !== "auto";

  const hintText = isStreaming
    ? "Ctrl+C to stop"
    : isResolvingMention
      ? "Resolving context..."
      : imagePaste.hasImages
        ? "Shift+Enter for newline · Images attached"
        : "Shift+Enter for newline · @ to add context · Ctrl+V to paste images";

  const hasText = text.trim().length > 0;
  const hasContent = hasText || imagePaste.hasImages;

  return (
    <div
      className="shrink-0 px-2 py-1.5"
      style={{ borderTop: "1px solid var(--color-surface-0)" }}
      onDragOver={imagePaste.handleDragOver}
      onDrop={imagePaste.handleDrop}
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
          onSelectFile={handleFilePickerSelect}
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
        {/* Image previews */}
        <ImagePreview
          images={imagePaste.images}
          onRemove={imagePaste.removeImage}
        />
        {/* Image paste error */}
        {imagePaste.error && (
          <div
            className="text-[10px] px-1 mb-1"
            style={{ color: "var(--color-red)" }}
          >
            {imagePaste.error}
          </div>
        )}
        <div
          className="flex items-end gap-1.5 rounded-md p-1.5"
          style={{
            backgroundColor: "var(--color-surface-0)",
            border: "1px solid var(--color-surface-1)",
          }}
        >
          {/* Left: thinking mode selector */}
          <ThinkingModeSelector />

          {/* Center: textarea */}
          <textarea
            ref={textareaRef}
            className="flex-1 bg-transparent text-xs resize-none outline-none placeholder:text-[var(--color-overlay-0)]"
            style={{
              color: "var(--color-text)",
              fontFamily: "var(--font-sans)",
              maxHeight: `${DIMENSIONS.chatInput.maxHeight}px`,
            }}
            placeholder={placeholder}
            rows={1}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={imagePaste.handlePaste}
            disabled={disabled}
            maxLength={100000}
          />

          {/* Right: send / stop */}
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
                color: hasContent ? "var(--color-blue)" : "var(--color-overlay-0)",
              }}
              onClick={handleSend}
              disabled={!hasContent || disabled}
              aria-label="Send message"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
      <p
        className="text-center mt-1 text-[10px]"
        style={{ color: isThinkingActive ? "var(--color-mauve)" : "var(--color-overlay-0)" }}
      >
        {isThinkingActive ? `${thinkingLabel} mode enabled` : hintText}
      </p>
    </div>
  );
});
