import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useLayoutStore } from "@/stores/layout";
import { useSettingsStore } from "@/stores/settings";
import { useConversationStore } from "@/stores/conversation";
import type {
  ClaudeEventPayload,
  ClaudeOutputMessage,
  StreamEventMessage,
  ResultMessage,
} from "@/lib/protocol";

export interface QuickQuestionState {
  /** Whether the overlay is visible */
  isOpen: boolean;
  /** The question being asked */
  question: string;
  /** The response text (streamed in) */
  response: string;
  /** Whether a response is currently streaming */
  isLoading: boolean;
  /** Error message if the request failed */
  error: string | null;

  open: () => void;
  close: () => void;
  ask: (question: string) => void;
  appendResponse: (text: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

// ── Internal state for the one-shot session ─────────────────────────────────

let _btw_session_id: string | null = null;
let _btw_unlisten: UnlistenFn | null = null;

/**
 * Clean up the one-shot session and event listener.
 */
async function cleanupBtwSession() {
  if (_btw_unlisten) {
    _btw_unlisten();
    _btw_unlisten = null;
  }
  if (_btw_session_id) {
    try {
      await invoke("claude_stop_session", { sessionId: _btw_session_id });
    } catch {
      // Session may already be dead
    }
    _btw_session_id = null;
  }
}

export const useQuickQuestionStore = create<QuickQuestionState>()((set, get) => ({
  isOpen: false,
  question: "",
  response: "",
  isLoading: false,
  error: null,

  open: () => set({ isOpen: true }),
  close: () => {
    set({ isOpen: false });
    // Stop the one-shot session when the overlay is dismissed
    void cleanupBtwSession();
  },
  ask: (question) => {
    set({ question, response: "", isLoading: true, error: null, isOpen: true });
    // Fire off the one-shot Claude query
    void runQuickQuestion(question, get, set);
  },
  appendResponse: (text) => set((s) => ({ response: s.response + text })),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
  reset: () => {
    set({
      isOpen: false,
      question: "",
      response: "",
      isLoading: false,
      error: null,
    });
    void cleanupBtwSession();
  },
}));

// ── One-shot Claude query implementation ────────────────────────────────────

type SetFn = (
  partial:
    | Partial<QuickQuestionState>
    | ((s: QuickQuestionState) => Partial<QuickQuestionState>),
) => void;
type GetFn = () => QuickQuestionState;

async function runQuickQuestion(
  question: string,
  _get: GetFn,
  set: SetFn,
) {
  // Clean up any previous one-shot session
  await cleanupBtwSession();

  try {
    // Resolve the working directory from current session or project root
    const cwd =
      useConversationStore.getState().session?.cwd ??
      useLayoutStore.getState().projectRootPath ??
      ".";

    // Set up the event listener BEFORE starting the session so we don't miss
    // early events. We filter by the session ID we'll get back.
    let sessionId: string | null = null;

    _btw_unlisten = await listen<ClaudeEventPayload>(
      "claude_message",
      (event) => {
        if (!sessionId) return;
        const payload = event.payload;
        // Only process events for our one-shot session
        const msg = payload.message as ClaudeOutputMessage;

        // Check if this event belongs to our session
        const msgSessionId = (msg as { session_id?: string }).session_id;
        if (msgSessionId && msgSessionId !== sessionId) return;

        switch (msg.type) {
          case "stream_event": {
            const streamMsg = msg as StreamEventMessage;
            const eventType = streamMsg.event.type;
            if (eventType === "content_block_delta") {
              const delta = streamMsg.event.delta;
              if (delta.type === "text_delta" && delta.text) {
                set((s) => ({ response: s.response + delta.text }));
              }
            }
            break;
          }

          case "result": {
            const resultMsg = msg as ResultMessage;
            if (resultMsg.is_error && resultMsg.errors?.length) {
              set({ error: resultMsg.errors[0], isLoading: false });
            } else {
              set({ isLoading: false });
            }
            // Auto-cleanup the one-shot session after result
            void cleanupBtwSession();
            break;
          }

          default:
            break;
        }
      },
    );

    // Start a fresh one-shot session
    const settings = useSettingsStore.getState();
    sessionId = await invoke<string>("claude_start_session", {
      cwd,
      sessionId: null,
      resume: false,
      effortLevel: settings.effortLevel,
      planMode: false,
      fromPr: null,
    });
    _btw_session_id = sessionId;

    // Send the question as the first message
    await invoke("claude_send_message", {
      sessionId,
      content: question,
    });
  } catch (err) {
    set({ error: String(err), isLoading: false });
    void cleanupBtwSession();
  }
}
