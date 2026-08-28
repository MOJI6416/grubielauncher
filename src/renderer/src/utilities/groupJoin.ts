import { toast } from "sonner";
import { showFailureToast } from "./failures";

export type GroupJoinError =
  | "banned"
  | "group_full"
  | "rate_limited"
  | "not_found"
  | "invalid_code"
  | null;

export function groupJoinErrorKey(result: GroupJoinError): string {
  if (result === "banned") return "groups.bannedToast";
  if (result === "group_full") return "groups.fullToast";
  if (result === "rate_limited") return "groups.rateLimitedToast";
  return "groups.codeNotFound";
}

export function reportGroupJoinFailure(
  result: GroupJoinError,
  translate: (key: string) => string,
): void {
  if (result !== null) {
    toast.error(translate(groupJoinErrorKey(result)));
    return;
  }

  showFailureToast(translate("groups.joinCodeError"), undefined, {
    channels: ["backend:groupJoinByCode"],
    fallbackDescription: translate("groups.codeNotFound"),
  });
}
