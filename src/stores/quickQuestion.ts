import { create } from "zustand";

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

export const useQuickQuestionStore = create<QuickQuestionState>()((set) => ({
  isOpen: false,
  question: "",
  response: "",
  isLoading: false,
  error: null,

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  ask: (question) =>
    set({ question, response: "", isLoading: true, error: null, isOpen: true }),
  appendResponse: (text) => set((s) => ({ response: s.response + text })),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
  reset: () =>
    set({
      isOpen: false,
      question: "",
      response: "",
      isLoading: false,
      error: null,
    }),
}));
