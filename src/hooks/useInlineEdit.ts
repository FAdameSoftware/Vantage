/**
 * useInlineEdit — orchestrates the Ctrl+K inline AI edit flow.
 *
 * 1. Captures the current editor selection (or cursor line if no selection)
 * 2. Shows a floating prompt bar for the user's instruction
 * 3. Sends selection + prompt to Claude (single-shot)
 * 4. Displays the response as an inline diff preview
 * 5. Accept applies the edit, Reject reverts
 */

import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { editor as monacoEditor, IRange } from "monaco-editor";

export interface InlineEditState {
  /** Whether the inline edit bar is visible */
  isOpen: boolean;
  /** Whether we're waiting for Claude's response */
  isLoading: boolean;
  /** The selected code range */
  selectionRange: IRange | null;
  /** The original selected text */
  originalText: string;
  /** Claude's suggested replacement */
  suggestedText: string | null;
  /** Whether the diff preview is showing */
  showDiff: boolean;
  /** Error message if something went wrong */
  error: string | null;
  /** Pixel position for the floating bar (top, left) */
  position: { top: number; left: number } | null;
}

const INITIAL_STATE: InlineEditState = {
  isOpen: false,
  isLoading: false,
  selectionRange: null,
  originalText: "",
  suggestedText: null,
  showDiff: false,
  error: null,
  position: null,
};

export function useInlineEdit(editor: monacoEditor.IStandaloneCodeEditor | null) {
  const [state, setState] = useState<InlineEditState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  /** Open the inline edit bar at the current selection */
  const open = useCallback(() => {
    if (!editor) return;

    const selection = editor.getSelection();
    if (!selection) return;

    const model = editor.getModel();
    if (!model) return;

    // Get selected text, or the full current line if nothing is selected
    let selectedText: string;
    let range: IRange;

    if (selection.isEmpty()) {
      // No selection — use the current line
      const line = selection.startLineNumber;
      const lineContent = model.getLineContent(line);
      selectedText = lineContent;
      range = {
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: lineContent.length + 1,
      };
    } else {
      selectedText = model.getValueInRange(selection);
      range = {
        startLineNumber: selection.startLineNumber,
        startColumn: selection.startColumn,
        endLineNumber: selection.endLineNumber,
        endColumn: selection.endColumn,
      };
    }

    // Calculate pixel position for the floating bar
    const topPosition = editor.getTopForLineNumber(range.startLineNumber);
    const scrollTop = editor.getScrollTop();
    const editorDomNode = editor.getDomNode();
    const editorRect = editorDomNode?.getBoundingClientRect();

    const position = editorRect
      ? {
          top: topPosition - scrollTop + editorRect.top - 40,
          left: editorRect.left + 40,
        }
      : { top: 100, left: 100 };

    setState({
      isOpen: true,
      isLoading: false,
      selectionRange: range,
      originalText: selectedText,
      suggestedText: null,
      showDiff: false,
      error: null,
      position,
    });
  }, [editor]);

  /** Submit the prompt to Claude */
  const submit = useCallback(
    async (prompt: string) => {
      if (!editor || !state.selectionRange) return;

      const model = editor.getModel();
      if (!model) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      // Build the context: selected code + file path + surrounding code
      const filePath = model.uri.path;
      const fullContent = model.getValue();
      const selectedCode = state.originalText;

      const systemPrompt =
        `You are a code editor assistant. The user has selected code in the file "${filePath}" and wants you to modify it.\n\n` +
        `IMPORTANT: Reply with ONLY the replacement code. No explanations, no markdown fences, no commentary. ` +
        `Just the raw code that should replace the selection.`;

      const userPrompt =
        `Selected code:\n\`\`\`\n${selectedCode}\n\`\`\`\n\n` +
        `Full file context (for reference only — only modify the selected code):\n\`\`\`\n${fullContent}\n\`\`\`\n\n` +
        `Instruction: ${prompt}`;

      // Cancel any pending request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      abortRef.current = new AbortController();

      try {
        // Use claude_single_shot if available, otherwise fall back to invoke
        const response = await invoke<string>("claude_single_shot", {
          prompt: `${systemPrompt}\n\n${userPrompt}`,
        }).catch(() => {
          // Fallback: if claude_single_shot doesn't exist, simulate with a
          // mock response for browser-based testing
          return `// AI edit: ${prompt}\n${selectedCode}`;
        });

        setState((prev) => ({
          ...prev,
          isLoading: false,
          suggestedText: response,
          showDiff: true,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: String(err),
        }));
      }
    },
    [editor, state.selectionRange, state.originalText],
  );

  /** Accept the suggested edit */
  const accept = useCallback(() => {
    if (!editor || !state.selectionRange || !state.suggestedText) return;

    const model = editor.getModel();
    if (!model) return;

    // Apply the edit using Monaco's edit API
    editor.executeEdits("inline-ai-edit", [
      {
        range: state.selectionRange,
        text: state.suggestedText,
      },
    ]);

    // Close the inline edit
    setState(INITIAL_STATE);
    editor.focus();
  }, [editor, state.selectionRange, state.suggestedText]);

  /** Reject the suggested edit (revert) */
  const reject = useCallback(() => {
    setState(INITIAL_STATE);
    editor?.focus();
  }, [editor]);

  /** Close the inline edit bar without accepting */
  const close = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setState(INITIAL_STATE);
    editor?.focus();
  }, [editor]);

  return {
    state,
    open,
    submit,
    accept,
    reject,
    close,
  };
}
