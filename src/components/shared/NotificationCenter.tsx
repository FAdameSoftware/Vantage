import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useClickOutside } from "@/hooks/useClickOutside";
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  Info,
  AlertTriangle,
  XCircle,
  CheckCircle,
} from "lucide-react";
import {
  useNotificationStore,
  type Notification,
  type NotificationType,
} from "@/stores/notifications";
import { formatRelativeTime } from "@/lib/formatters";

/** Get the icon and color for a notification type */
function getTypeStyle(type: NotificationType): { icon: React.ReactNode; color: string } {
  switch (type) {
    case "success":
      return {
        icon: <CheckCircle size={14} />,
        color: "var(--color-green)",
      };
    case "error":
      return {
        icon: <XCircle size={14} />,
        color: "var(--color-red)",
      };
    case "warning":
      return {
        icon: <AlertTriangle size={14} />,
        color: "var(--color-yellow)",
      };
    case "info":
    default:
      return {
        icon: <Info size={14} />,
        color: "var(--color-blue)",
      };
  }
}

/** Group notifications into "Today" and "Earlier" */
function groupNotifications(
  notifications: Notification[]
): { today: Notification[]; earlier: Notification[] } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const today: Notification[] = [];
  const earlier: Notification[] = [];

  for (const n of notifications) {
    if (n.timestamp >= startOfToday) {
      today.push(n);
    } else {
      earlier.push(n);
    }
  }

  return { today, earlier };
}

function NotificationItem({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: (id: string) => void;
}) {
  const style = getTypeStyle(notification.type);

  return (
    <div
      className="flex items-start gap-2 px-3 py-2 hover:bg-[var(--color-surface-0)] transition-colors group"
      style={{
        opacity: notification.read ? 0.7 : 1,
        borderBottom: "1px solid var(--color-surface-0)",
      }}
    >
      <div className="shrink-0 mt-0.5" style={{ color: style.color }}>
        {style.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-xs leading-snug"
          style={{ color: "var(--color-text)" }}
        >
          {notification.message}
        </p>
        {notification.description && (
          <p
            className="text-[10px] mt-0.5 leading-snug"
            style={{ color: "var(--color-overlay-1)" }}
          >
            {notification.description}
          </p>
        )}
        <p
          className="text-[10px] mt-0.5"
          style={{ color: "var(--color-overlay-0)" }}
        >
          {formatRelativeTime(notification.timestamp)}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(notification.id)}
        className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-surface-1)] transition-all"
        style={{ color: "var(--color-overlay-1)" }}
        title="Dismiss"
      >
        <X size={12} />
      </button>
      {!notification.read && (
        <div
          className="shrink-0 w-1.5 h-1.5 rounded-full mt-1.5"
          style={{ backgroundColor: "var(--color-blue)" }}
          title="Unread"
        />
      )}
    </div>
  );
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const dismiss = useNotificationStore((s) => s.dismiss);

  // Listen for toggle event from status bar bell
  useEffect(() => {
    const handler = () => {
      setIsOpen((prev) => {
        const next = !prev;
        // Mark all as read when opening
        if (next) {
          markAllRead();
        }
        return next;
      });
    };
    window.addEventListener("vantage:toggle-notification-center", handler);
    return () => window.removeEventListener("vantage:toggle-notification-center", handler);
  }, [markAllRead]);

  // Close on outside click
  const closePanel = useCallback(() => setIsOpen(false), []);
  useClickOutside(panelRef, closePanel, isOpen);

  const { today, earlier } = groupNotifications(notifications);

  return (
    <AnimatePresence>
      {isOpen && (
    <motion.div
      ref={panelRef}
      className="fixed bottom-7 left-[140px] z-[100] rounded-lg shadow-xl flex flex-col"
      style={{
        backgroundColor: "var(--color-mantle)",
        border: "1px solid var(--color-surface-1)",
        width: "340px",
        maxHeight: "420px",
      }}
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-surface-0)" }}
      >
        <div className="flex items-center gap-2">
          <Bell size={14} style={{ color: "var(--color-text)" }} />
          <span className="text-xs font-medium" style={{ color: "var(--color-text)" }}>
            Notifications
          </span>
          {unreadCount > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: "var(--color-blue)",
                color: "var(--color-base)",
              }}
            >
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={markAllRead}
            className="p-1 rounded hover:bg-[var(--color-surface-0)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            title="Mark all as read"
          >
            <CheckCheck size={14} />
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="p-1 rounded hover:bg-[var(--color-surface-0)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            title="Clear all"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1 rounded hover:bg-[var(--color-surface-0)] transition-colors"
            style={{ color: "var(--color-overlay-1)" }}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-auto">
        {notifications.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-10 px-4"
            style={{ color: "var(--color-overlay-1)" }}
          >
            <Bell size={24} className="mb-2 opacity-40" />
            <span className="text-xs">No notifications</span>
          </div>
        ) : (
          <>
            {today.length > 0 && (
              <div>
                <div
                  className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider"
                  style={{
                    color: "var(--color-overlay-0)",
                    backgroundColor: "var(--color-crust)",
                  }}
                >
                  Today
                </div>
                {today.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onDismiss={dismiss}
                  />
                ))}
              </div>
            )}
            {earlier.length > 0 && (
              <div>
                <div
                  className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider"
                  style={{
                    color: "var(--color-overlay-0)",
                    backgroundColor: "var(--color-crust)",
                  }}
                >
                  Earlier
                </div>
                {earlier.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onDismiss={dismiss}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
