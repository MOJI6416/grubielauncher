export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export type DayLabel =
  | { kind: "today" }
  | { kind: "yesterday" }
  | { kind: "date"; date: Date };

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function shouldShowDaySeparator(
  time: string | number | Date,
  previousTime?: string | number | Date | null,
) {
  if (previousTime === undefined || previousTime === null) return true;

  const current = new Date(time);
  const previous = new Date(previousTime);

  if (Number.isNaN(current.getTime()) || Number.isNaN(previous.getTime())) {
    return false;
  }

  return !isSameDay(current, previous);
}

export function getDayLabel(
  time: string | number | Date,
  now: Date = new Date(),
): DayLabel {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return { kind: "date", date: new Date(0) };

  if (isSameDay(date, now)) return { kind: "today" };

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return { kind: "yesterday" };

  return { kind: "date", date };
}

export function shouldGroupMessage(
  current: { sender?: string; time: string | number | Date; hasReply?: boolean },
  previous?: {
    sender?: string;
    time: string | number | Date;
    isSystem?: boolean;
  } | null,
) {
  if (!previous || previous.isSystem) return false;
  if (current.hasReply) return false;
  if (!current.sender || current.sender !== previous.sender) return false;

  const currentTime = new Date(current.time).getTime();
  const previousTime = new Date(previous.time).getTime();

  if (Number.isNaN(currentTime) || Number.isNaN(previousTime)) return false;
  if (!isSameDay(new Date(currentTime), new Date(previousTime))) return false;

  return Math.abs(currentTime - previousTime) < GROUP_WINDOW_MS;
}

export type ChatRow<T> =
  | { kind: "day"; key: string; time: string | number | Date }
  | { kind: "unread"; key: string }
  | { kind: "message"; key: string; entry: T; grouped: boolean };

export interface ChatRowSource {
  key: string;
  sender?: string;
  time: string | number | Date;
  hasReply?: boolean;
  isSystem?: boolean;
}

export function buildChatRows<T extends ChatRowSource>(
  entries: T[],
  options: { unreadKey?: string } = {},
): ChatRow<T>[] {
  const rows: ChatRow<T>[] = [];

  for (const [index, entry] of entries.entries()) {
    const previous = index > 0 ? entries[index - 1] : null;
    const hasDay = shouldShowDaySeparator(entry.time, previous?.time ?? null);

    if (hasDay) {
      rows.push({ kind: "day", key: `day-${entry.key}`, time: entry.time });
    }

    const isUnreadStart = options.unreadKey === entry.key;
    if (isUnreadStart) {
      rows.push({ kind: "unread", key: `unread-${entry.key}` });
    }

    rows.push({
      kind: "message",
      key: entry.key,
      entry,
      grouped:
        !hasDay &&
        !isUnreadStart &&
        !entry.isSystem &&
        shouldGroupMessage(entry, previous),
    });
  }

  return rows;
}
