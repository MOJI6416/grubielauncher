import type { AgentChatSummary } from "@/types/Agent";

export type ChatBucketId = "pinned" | "today" | "yesterday" | "week" | "older";

export type ChatBucket = {
  id: ChatBucketId;
  chats: AgentChatSummary[];
};

const BUCKET_ORDER: ChatBucketId[] = [
  "pinned",
  "today",
  "yesterday",
  "week",
  "older",
];

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function filterChats(
  chats: readonly AgentChatSummary[],
  query: string,
): AgentChatSummary[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...chats];

  return chats.filter((chat) => {
    const haystack = [chat.title, chat.model ?? "", chat.provider ?? ""]
      .join(" ")
      .toLowerCase();

    return haystack.includes(needle);
  });
}

export function bucketOf(
  chat: AgentChatSummary,
  now: number,
): Exclude<ChatBucketId, "pinned"> {
  const today = startOfDay(now);
  const updated = chat.updatedAt;

  if (updated >= today) return "today";
  if (updated >= today - DAY) return "yesterday";
  if (updated >= today - 6 * DAY) return "week";

  return "older";
}

export function groupChats(
  chats: readonly AgentChatSummary[],
  now: number,
): ChatBucket[] {
  const buckets = new Map<ChatBucketId, AgentChatSummary[]>();

  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  for (const chat of sorted) {
    const id: ChatBucketId = chat.pinned ? "pinned" : bucketOf(chat, now);
    const list = buckets.get(id) ?? [];
    list.push(chat);
    buckets.set(id, list);
  }

  return BUCKET_ORDER.filter((id) => (buckets.get(id) ?? []).length > 0).map(
    (id) => ({ id, chats: buckets.get(id) ?? [] }),
  );
}
