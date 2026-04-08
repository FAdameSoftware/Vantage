/**
 * useClaudeSession — Session lifecycle management for the main (non-agent)
 * Claude session. Handles starting, sending messages, permissions,
 * interrupting, and stopping.
 *
 * The duplicated session-start logic (IMPROVE-010) is consolidated into
 * the private `createSession` helper used by both `startSession` and
 * `sendMessage`.
 */

import { useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  useConversationStore,
  type SessionMetadata,
} from "@/stores/conversation";
import { useSettingsStore } from "@/stores/settings";
import { useLayoutStore } from "@/stores/layout";

export function useClaudeSession() {
  const sessionIdRef = useRef<string | null>(null);

  // Race condition fix (2A): Prevent concurrent session creation.
  // If sendMessage auto-starts a session while startSession is already in-flight,
  // two sessions would be created in parallel. This ref holds the pending start
  // promise so sendMessage can await it instead of starting a second session.
  const sessionStartPromiseRef = useRef<Promise<string | null> | null>(null);

  const setConnectionStatus = useConversationStore(
    (s) => s.setConnectionStatus,
  );
  const setSession = useConversationStore((s) => s.setSession);
  const addUserMessage = useConversationStore((s) => s.addUserMessage);
  const setPendingPermission = useConversationStore(
    (s) => s.setPendingPermission,
  );
  const clearConversation = useConversationStore((s) => s.clearConversation);

  // ── Shared session-start logic (deduplicates IMPROVE-010) ──

  const createSession = useCallback(
    async (
      cwd: string,
      opts: {
        resumeSessionId?: string;
        fromPr?: number;
      } = {},
    ): Promise<string | null> => {
      setConnectionStatus("starting");

      const startPromise = (async (): Promise<string | null> => {
        try {
          const settings = useSettingsStore.getState();
          const id = await invoke<string>("claude_start_session", {
            cwd,
            sessionId: opts.resumeSessionId ?? null,
            resume: !!opts.resumeSessionId,
            effortLevel: settings.effortLevel,
            planMode: settings.planMode,
            fromPr: opts.fromPr ?? null,
            skipPermissions: settings.skipPermissions ?? false,
          });
          sessionIdRef.current = id;
          const session: SessionMetadata = {
            sessionId: id,
            cwd,
          };
          setSession(session);
          return id;
        } catch (err) {
          setConnectionStatus("error", String(err));
          return null;
        } finally {
          sessionStartPromiseRef.current = null;
        }
      })();

      sessionStartPromiseRef.current = startPromise;
      return startPromise;
    },
    [setConnectionStatus, setSession],
  );

  // ── Action: start a session ──

  const startSession = useCallback(
    async (cwd: string, resumeSessionId?: string, fromPr?: number) => {
      // Race condition fix (2A): If a session start is already in-flight, await it
      // instead of starting a duplicate session.
      if (sessionStartPromiseRef.current) {
        await sessionStartPromiseRef.current;
        return;
      }

      await createSession(cwd, { resumeSessionId, fromPr });
    },
    [createSession],
  );

  // ── Action: send a message (auto-starts session if needed) ──

  const sendMessage = useCallback(
    async (content: string, cwd?: string) => {
      // Race condition fix (2A): If a session start is already in-flight,
      // await it instead of starting a duplicate session. Two rapid sendMessage
      // calls would otherwise both see sessionIdRef.current === null and both
      // invoke claude_start_session, creating two parallel sessions.
      if (!sessionIdRef.current && sessionStartPromiseRef.current) {
        await sessionStartPromiseRef.current;
      }

      // If no active session, auto-start one first
      if (!sessionIdRef.current) {
        const sessionCwd =
          cwd ??
          useConversationStore.getState().session?.cwd ??
          useLayoutStore.getState().projectRootPath ??
          ".";

        const result = await createSession(sessionCwd);
        if (!result) return;
      }

      // Optimistically add the user message to the store
      addUserMessage(content);
      try {
        await invoke("claude_send_message", {
          sessionId: sessionIdRef.current,
          content,
        });
      } catch (err) {
        setConnectionStatus("error", String(err));
      }
    },
    [addUserMessage, setConnectionStatus, createSession],
  );

  // ── Action: respond to a permission request ──

  const respondPermission = useCallback(
    async (
      allow: boolean,
      updatedInput?: Record<string, unknown>,
      denyReason?: string,
    ) => {
      // Read session ID from store (not local ref) so this works from any
      // component that calls useClaude(), including PermissionDialog.
      const sid = sessionIdRef.current ?? useConversationStore.getState().session?.sessionId;
      if (!sid) return;
      try {
        await invoke("claude_respond_permission", {
          sessionId: sid,
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
    } catch (err) {
      // Session may already be dead — log but don't propagate
      console.warn("Failed to stop Claude session (may already be dead):", err);
    }
    sessionIdRef.current = null;
    clearConversation();
  }, [clearConversation]);

  return {
    sessionIdRef,
    startSession,
    sendMessage,
    respondPermission,
    interruptSession,
    stopSession,
  };
}
