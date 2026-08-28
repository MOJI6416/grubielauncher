import type { INotificationPrefs } from "@/types/IUser";

export const NOTIFICATION_EVENTS = [
  "gameInvite",
  "friendRequest",
  "worldShare",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const DEFAULT_NOTIFICATION_PREFS: INotificationPrefs = {
  enabled: true,
  gameInvite: true,
  friendRequest: true,
  worldShare: true,
};

export type ConnectionsSummary =
  | "empty"
  | "telegramOffer"
  | "notifications"
  | "muted";

export function connectionsSummary(state: {
  hasDiscord: boolean;
  hasTelegram: boolean;
  prefs: INotificationPrefs;
}): ConnectionsSummary {
  if (!state.hasTelegram) {
    return state.hasDiscord ? "telegramOffer" : "empty";
  }

  if (!state.prefs.enabled) return "muted";
  if (!NOTIFICATION_EVENTS.some((event) => state.prefs[event])) return "muted";

  return "notifications";
}
