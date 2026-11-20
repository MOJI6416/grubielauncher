import type { SupportReply } from "@/types/Journal";

export const SUPPORT_CONTACT_LIMIT = 200;
const REPLY_LIMIT = 4000;

export function normalizeSupportContact(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SUPPORT_CONTACT_LIMIT);
}

export function toSupportReplies(data: unknown): SupportReply[] {
  const items = (data as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];

  const replies: SupportReply[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.code !== "string" ||
      typeof row.reply !== "string" ||
      !row.reply ||
      typeof row.repliedAt !== "string"
    ) {
      continue;
    }
    replies.push({
      code: row.code,
      instanceName: typeof row.instanceName === "string" ? row.instanceName : "",
      createdAt: typeof row.createdAt === "string" ? row.createdAt : row.repliedAt,
      reply: row.reply.slice(0, REPLY_LIMIT),
      repliedAt: row.repliedAt,
      seen: typeof row.replySeenAt === "string",
    });
  }
  return replies.sort((a, b) => b.repliedAt.localeCompare(a.repliedAt));
}
