/**
 * Enhanced toast utility that fires a sonner toast AND captures it
 * in the notification store for the notification center history.
 *
 * Usage: import { notifyToast } from "@/lib/notifyToast" instead of
 * importing { toast } from "sonner" directly when you want the
 * notification to be recorded in history.
 *
 * Existing code that uses `toast` from sonner directly still works —
 * those toasts just won't appear in the notification center. To capture
 * existing toasts without changing every call site, we also provide
 * `initToastCapture()` which monkey-patches sonner's toast methods.
 */

import { toast, type ExternalToast } from "sonner";
import { useNotificationStore } from "@/stores/notifications";
import type { NotificationType } from "@/stores/notifications";

/** Fire a toast AND record it in the notification store */
export const notifyToast = {
  success(message: string, data?: ExternalToast) {
    capture(message, "success", data?.description as string | undefined);
    return toast.success(message, data);
  },
  error(message: string, data?: ExternalToast) {
    capture(message, "error", data?.description as string | undefined);
    return toast.error(message, data);
  },
  warning(message: string, data?: ExternalToast) {
    capture(message, "warning", data?.description as string | undefined);
    return toast.warning(message, data);
  },
  info(message: string, data?: ExternalToast) {
    capture(message, "info", data?.description as string | undefined);
    return toast.info(message, data);
  },
  message(message: string, data?: ExternalToast) {
    capture(message, "info", data?.description as string | undefined);
    return toast.message(message, data);
  },
};

function capture(message: string, type: NotificationType, description?: string) {
  useNotificationStore.getState().addNotification(message, type, description);
}

/**
 * Monkey-patch sonner's toast methods so ALL existing toast.success/error/etc.
 * calls are automatically captured in the notification store. Call once at
 * app startup (e.g., in App.tsx or main.tsx).
 */
let captured = false;

export function initToastCapture(): void {
  if (captured) return;
  captured = true;

  const origSuccess = toast.success.bind(toast);
  const origError = toast.error.bind(toast);
  const origWarning = toast.warning.bind(toast);
  const origInfo = toast.info.bind(toast);
  const origMessage = toast.message.bind(toast);

  toast.success = ((message: string | React.ReactNode, data?: ExternalToast) => {
    if (typeof message === "string") {
      capture(message, "success", data?.description as string | undefined);
    }
    return origSuccess(message, data);
  }) as typeof toast.success;

  toast.error = ((message: string | React.ReactNode, data?: ExternalToast) => {
    if (typeof message === "string") {
      capture(message, "error", data?.description as string | undefined);
    }
    return origError(message, data);
  }) as typeof toast.error;

  toast.warning = ((message: string | React.ReactNode, data?: ExternalToast) => {
    if (typeof message === "string") {
      capture(message, "warning", data?.description as string | undefined);
    }
    return origWarning(message, data);
  }) as typeof toast.warning;

  toast.info = ((message: string | React.ReactNode, data?: ExternalToast) => {
    if (typeof message === "string") {
      capture(message, "info", data?.description as string | undefined);
    }
    return origInfo(message, data);
  }) as typeof toast.info;

  toast.message = ((message: string | React.ReactNode, data?: ExternalToast) => {
    if (typeof message === "string") {
      capture(message, "info", data?.description as string | undefined);
    }
    return origMessage(message, data);
  }) as typeof toast.message;
}
