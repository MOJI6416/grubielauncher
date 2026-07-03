export type GroupJoinError = "banned" | "group_full" | "rate_limited" | null;

export function groupJoinErrorKey(result: GroupJoinError): string {
  if (result === "banned") return "groups.bannedToast";
  if (result === "group_full") return "groups.fullToast";
  if (result === "rate_limited") return "groups.rateLimitedToast";
  return "groups.codeNotFound";
}
