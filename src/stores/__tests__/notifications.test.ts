import { describe, it, expect, beforeEach } from "vitest";
import { useNotificationStore } from "../notifications";

beforeEach(() => {
  useNotificationStore.setState({
    notifications: [],
    unreadCount: 0,
  });
});

describe("Notification Store", () => {
  it("starts with empty notifications", () => {
    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(0);
    expect(state.unreadCount).toBe(0);
  });

  it("adds a notification", () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification("File saved", "success");

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].message).toBe("File saved");
    expect(state.notifications[0].type).toBe("success");
    expect(state.notifications[0].read).toBe(false);
    expect(state.unreadCount).toBe(1);
  });

  it("adds notification with description", () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification("Error occurred", "error", "Something went wrong");

    const state = useNotificationStore.getState();
    expect(state.notifications[0].description).toBe("Something went wrong");
  });

  it("prepends new notifications (newest first)", () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification("First", "info");
    addNotification("Second", "info");

    const state = useNotificationStore.getState();
    expect(state.notifications[0].message).toBe("Second");
    expect(state.notifications[1].message).toBe("First");
  });

  it("limits to 50 notifications", () => {
    const { addNotification } = useNotificationStore.getState();
    for (let i = 0; i < 60; i++) {
      addNotification(`Notification ${i}`, "info");
    }

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(50);
    // Newest should be first
    expect(state.notifications[0].message).toBe("Notification 59");
  });

  it("marks all as read", () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification("One", "info");
    addNotification("Two", "warning");
    addNotification("Three", "error");

    expect(useNotificationStore.getState().unreadCount).toBe(3);

    useNotificationStore.getState().markAllRead();

    const state = useNotificationStore.getState();
    expect(state.unreadCount).toBe(0);
    expect(state.notifications.every((n) => n.read)).toBe(true);
  });

  it("clears all notifications", () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification("One", "info");
    addNotification("Two", "error");

    useNotificationStore.getState().clearAll();

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(0);
    expect(state.unreadCount).toBe(0);
  });

  it("dismisses a single notification", () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification("Keep", "info");
    addNotification("Remove", "error");

    const toRemove = useNotificationStore.getState().notifications[0]; // "Remove" (newest first)
    useNotificationStore.getState().dismiss(toRemove.id);

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0].message).toBe("Keep");
  });

  it("updates unread count correctly on dismiss", () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification("One", "info");
    addNotification("Two", "info");

    expect(useNotificationStore.getState().unreadCount).toBe(2);

    // Dismiss one unread notification
    const toDismiss = useNotificationStore.getState().notifications[0];
    useNotificationStore.getState().dismiss(toDismiss.id);

    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it("assigns unique IDs to each notification", () => {
    const { addNotification } = useNotificationStore.getState();
    addNotification("A", "info");
    addNotification("B", "info");
    addNotification("C", "info");

    const ids = useNotificationStore.getState().notifications.map((n) => n.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });

  it("sets timestamp on notification", () => {
    const before = Date.now();
    useNotificationStore.getState().addNotification("Test", "success");
    const after = Date.now();

    const timestamp = useNotificationStore.getState().notifications[0].timestamp;
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});
