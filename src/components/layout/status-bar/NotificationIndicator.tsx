import { Bell } from "lucide-react";
import { useNotificationStore } from "@/stores/notifications";

export interface NotificationIndicatorProps {
  windowWidth: number;
}

export function NotificationIndicator({ windowWidth }: NotificationIndicatorProps) {
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  // Notification bell — hidden below 1200px
  if (windowWidth < 1200) return null;

  return (
    <button
      className="flex items-center gap-0.5 hover:text-[var(--color-text)] transition-colors relative shrink-0"
      aria-label={`Notifications${unreadCount > 0 ? `: ${unreadCount} unread` : ""}`}
      onClick={() => window.dispatchEvent(new CustomEvent("vantage:toggle-notification-center"))}
      title="Notification Center"
    >
      <Bell size={12} />
      {unreadCount > 0 && (
        <span
          className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-[9px] font-bold leading-none px-0.5"
          style={{
            backgroundColor: "var(--color-blue)",
            color: "var(--color-base)",
          }}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
