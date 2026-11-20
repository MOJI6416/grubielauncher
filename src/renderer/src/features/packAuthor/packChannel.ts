import type { IModpackChannel } from "@/types/Backend";

export const ANNOUNCEMENT_MAX_CHARS = 1000;

const SEEN_PREFIX = "packChannel.seen";

const ERROR_KEYS: Record<string, string> = {
  invalid_server: "packAuthor.errors.invalidServer",
  invalid_discord: "packAuthor.errors.invalidDiscord",
  invalid_text: "packAuthor.errors.invalidText",
  announcement_limit: "packAuthor.errors.announcementLimit",
  publish_banned: "packAuthor.errors.publishBanned",
};

export function channelErrorKey(code: string): string {
  return ERROR_KEYS[code] ?? "packAuthor.errors.generic";
}

export function hasChannelContent(
  channel: IModpackChannel | null | undefined,
): boolean {
  return (
    !!channel &&
    (!!channel.server || !!channel.discord || channel.announcements.length > 0)
  );
}

export function newestAnnouncementAt(
  channel: IModpackChannel | null | undefined,
): string | null {
  let newest: string | null = null;
  for (const item of channel?.announcements ?? []) {
    if (!newest || Date.parse(item.createdAt) > Date.parse(newest)) {
      newest = item.createdAt;
    }
  }
  return newest;
}

export function isUnread(newest: string | null, seen: string | null): boolean {
  if (!newest) return false;
  if (!seen) return true;
  return Date.parse(newest) > Date.parse(seen);
}

export function readSeenAt(code: string): string | null {
  try {
    return localStorage.getItem(`${SEEN_PREFIX}.${code}`);
  } catch {
    return null;
  }
}

export function writeSeenAt(code: string, at: string): void {
  try {
    localStorage.setItem(`${SEEN_PREFIX}.${code}`, at);
  } catch {
    return;
  }
}

export function sameChannelField(
  draft: string,
  saved: string | null | undefined,
): boolean {
  return draft.trim() === (saved ?? "");
}
