import { create } from "zustand";
import type {
  ConversationMessage,
  SessionMetadata,
  ResultSummary,
  ActiveBlock,
  ConnectionStatus,
} from "@/stores/conversation";

// ── Per-agent conversation state ────────────────────────────────────

export interface AgentConversationState {
  messages: ConversationMessage[];
  isStreaming: boolean;
  isThinking: boolean;
  thinkingStartedAt: number | null;
  activeBlocks: Map<number, ActiveBlock>;
  activeMessageId: string | null;
  session: SessionMetadata | null;
  totalCost: number;
  totalTokens: { input: number; output: number };
  lastResult: ResultSummary | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  pendingPermission: {
    sessionId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
  } | null;
}

const createDefaultState = (): AgentConversationState => ({
  messages: [],
  isStreaming: false,
  isThinking: false,
  thinkingStartedAt: null,
  activeBlocks: new Map(),
  activeMessageId: null,
  session: null,
  totalCost: 0,
  totalTokens: { input: 0, output: 0 },
  lastResult: null,
  connectionStatus: "disconnected",
  connectionError: null,
  pendingPermission: null,
});

// ── Store interface ─────────────────────────────────────────────────

interface AgentConversationsStore {
  /** Per-agent conversation state, keyed by agent ID */
  conversations: Map<string, AgentConversationState>;

  /** Get or create conversation state for an agent */
  getConversation: (agentId: string) => AgentConversationState;

  /** Set conversation state for an agent (used by event handlers) */
  updateConversation: (
    agentId: string,
    updater: (prev: AgentConversationState) => Partial<AgentConversationState>,
  ) => void;

  /** Remove conversation state when an agent is deleted */
  removeConversation: (agentId: string) => void;
}

// ── Store implementation ────────────────────────────────────────────

export const useAgentConversationsStore = create<AgentConversationsStore>()(
  (set, get) => ({
    conversations: new Map(),

    getConversation(agentId) {
      const existing = get().conversations.get(agentId);
      if (existing) return existing;
      const fresh = createDefaultState();
      set((state) => {
        const next = new Map(state.conversations);
        next.set(agentId, fresh);
        return { conversations: next };
      });
      return fresh;
    },

    updateConversation(agentId, updater) {
      set((state) => {
        const current =
          state.conversations.get(agentId) ?? createDefaultState();
        const updates = updater(current);
        const next = new Map(state.conversations);
        next.set(agentId, { ...current, ...updates });
        return { conversations: next };
      });
    },

    removeConversation(agentId) {
      set((state) => {
        const next = new Map(state.conversations);
        next.delete(agentId);
        return { conversations: next };
      });
    },
  }),
);
