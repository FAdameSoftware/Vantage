import { useEffect, useRef, useCallback } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useConversationStore, type SessionMetadata } from "@/stores/conversation";
import type {
  ClaudeOutputMessage,
  PermissionRequestPayload,
  ClaudeStatusPayload,
} from "@/lib/protocol";

// ─── Tauri event bridge ─────────────────────────────────────────────────────

export function useClaude() {
  const sessionIdRef = useRef<string | null>(null);

  const handleSystemInit = useConversationStore((s) => s.handleSystemInit);
  const handleStreamEvent = useConversationStore((s) => s.handleStreamEvent);
  const handleAssistantMessage = useConversationStore((s) => s.handleAssistantMessage);
  const handleResult = useConversationStore((s) => s.handleResult);
  const setPendingPermission = useConversationStore((s) => s.setPendingPermission);
  const setConnectionStatus = useConversationStore((s) => s.setConnectionStatus);
  const addUserMessage = useConversationStore((s) => s.addUserMessage);
  const setSession = useConversationStore((s) => s.setSession);
  const clearConversation = useConversationStore((s) => s.clearConversation);

  // ── Set up Tauri event listeners ──

  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    async function setupListeners() {
      // claude_message — the main message bus
      const unlistenMessage = await listen<ClaudeOutputMessage>(
        "claude_message",
        (event) => {
          const msg = event.payload;

          switch (msg.type) {
            case "system": {
              if (msg.subtype === "init") {
                handleSystemInit(msg);
              }
              // api_retry and compact_boundary are informational — ignored for now
              break;
            }
            case "stream_event": {
              handleStreamEvent(msg);
              break;
            }
            case "assistant": {
              handleAssistantMessage(msg);
              break;
            }
            case "result": {
              handleResult(msg);
              break;
            }
            default:
              break;
          }
        },
      );
      unlisteners.push(unlistenMessage);

      // claude_permission_request
      const unlistenPermission = await listen<PermissionRequestPayload>(
        "claude_permission_request",
        (event) => {
          setPendingPermission(event.payload);
        },
      );
      unlisteners.push(unlistenPermission);

      // claude_status
      const unlistenStatus = await listen<ClaudeStatusPayload>(
        "claude_status",
        (event) => {
          const { status, error } = event.payload;
          const mapped = status as "disconnected" | "starting" | "ready" | "streaming" | "error" | "stopped";
          setConnectionStatus(mapped, error);
        },
      );
      unlisteners.push(unlistenStatus);
    }

    setupListeners();

    return () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [
    handleSystemInit,
    handleStreamEvent,
    handleAssistantMessage,
    handleResult,
    setPendingPermission,
    setConnectionStatus,
  ]);

  // ── Action: start a session ──

  const startSession = useCallback(
    async (cwd: string, resumeSessionId?: string) => {
      setConnectionStatus("starting");
      try {
        const id = await invoke<string>("start_claude_session", {
          cwd,
          resumeSessionId: resumeSessionId ?? null,
        });
        sessionIdRef.current = id;
        const session: SessionMetadata = {
          sessionId: id,
          cwd,
        };
        setSession(session);
      } catch (err) {
        setConnectionStatus("error", String(err));
      }
    },
    [setConnectionStatus, setSession],
  );

  // ── Action: send a message ──

  const sendMessage = useCallback(
    async (content: string) => {
      if (!sessionIdRef.current) return;
      // Optimistically add the user message to the store
      addUserMessage(content);
      try {
        await invoke("send_claude_message", {
          sessionId: sessionIdRef.current,
          message: content,
        });
      } catch (err) {
        setConnectionStatus("error", String(err));
      }
    },
    [addUserMessage, setConnectionStatus],
  );

  // ── Action: respond to a permission request ──

  const respondPermission = useCallback(
    async (allow: boolean, updatedInput?: Record<string, unknown>, denyReason?: string) => {
      if (!sessionIdRef.current) return;
      try {
        await invoke("claude_respond_permission", {
          sessionId: sessionIdRef.current,
          allow,
          updatedInput: updatedInput ?? null,
          denyReason: denyReason ?? null,
        });
        setPendingPermission(null);
      } catch (err) {
        setConnectionStatus("error", String(err));
      }
    },
    [setPendingPermission, setConnectionStatus],
  );

  // ── Action: interrupt (stop streaming) ──

  const interruptSession = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      await invoke("claude_interrupt_session", {
        sessionId: sessionIdRef.current,
      });
    } catch (err) {
      setConnectionStatus("error", String(err));
    }
  }, [setConnectionStatus]);

  // ── Action: stop session completely ──

  const stopSession = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      await invoke("claude_stop_session", {
        sessionId: sessionIdRef.current,
      });
    } catch {
      // Ignore errors on stop — session may already be dead
    }
    sessionIdRef.current = null;
    clearConversation();
  }, [clearConversation]);

  return {
    startSession,
    sendMessage,
    respondPermission,
    interruptSession,
    stopSession,
    sessionId: sessionIdRef,
  };
}
