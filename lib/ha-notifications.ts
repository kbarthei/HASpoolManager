import { callHAService } from "./ha-api";

export async function sendHaPersistentNotification(
  title: string,
  message: string,
  notificationId?: string,
): Promise<boolean> {
  return callHAService("persistent_notification", "create", {
    title,
    message,
    ...(notificationId ? { notification_id: notificationId } : {}),
  });
}

export async function dismissHaPersistentNotification(notificationId: string): Promise<boolean> {
  return callHAService("persistent_notification", "dismiss", {
    notification_id: notificationId,
  });
}
