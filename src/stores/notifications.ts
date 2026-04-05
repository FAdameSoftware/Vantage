import { create } from "zustand";

export type NotificationType = "info" | "warning" | "error" | "success";

export interface Notification {
  id: string;
  timestamp: number;
  message: string;
  description?: string;
  type: NotificationType;
  read: boolean;
}

/** Maximum notifications to retain in the store */
const MAX_NOTIFICATIONS = 50;

let nextId = 1;

export interface NotificationState {
  notifications: Notification[];
  unreadCount: number;

  /** Add a notification to the store */
  addNotification: (message: string, type: NotificationType, description?: string) => void;
  /** Mark all notifications as read */
  markAllRead: () => void;
  /** Clear all notifications */
  clearAll: () => void;
  /** Dismiss (remove) a single notification by ID */
  dismiss: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification(message, type, description) {
    const notification: Notification = {
      id: `notif-${nextId++}`,
      timestamp: Date.now(),
      message,
      description,
      type,
      read: false,
    };

    set((state) => {
      const updated = [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS);
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
      };
    });
  },

  markAllRead() {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  clearAll() {
    set({ notifications: [], unreadCount: 0 });
  },

  dismiss(id) {
    set((state) => {
      const updated = state.notifications.filter((n) => n.id !== id);
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
      };
    });
  },
}));
