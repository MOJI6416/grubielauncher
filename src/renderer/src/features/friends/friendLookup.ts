const FRIEND_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

export type FriendLookupProblem =
  | "empty"
  | "invalid"
  | "self"
  | "already_friend"
  | "pending";

export function normalizeFriendLookup(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (OBJECT_ID_PATTERN.test(trimmed)) return trimmed.toLowerCase();

  const compact = trimmed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (compact.length !== 8) return "";
  if (![...compact].every((char) => FRIEND_CODE_ALPHABET.includes(char))) {
    return "";
  }

  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export interface FriendLookupContext {
  ownUserId?: string;
  ownFriendCode?: string;
  friends: Array<{ id: string; friendCode?: string }>;
  requests: Array<{ id: string; friendCode?: string }>;
}

function matches(
  candidate: { id: string; friendCode?: string },
  normalized: string,
) {
  return (
    candidate.id === normalized ||
    normalizeFriendLookup(candidate.friendCode || "") === normalized
  );
}

export function validateFriendLookup(
  value: string,
  context: FriendLookupContext,
): FriendLookupProblem | null {
  if (!value.trim()) return "empty";

  const normalized = normalizeFriendLookup(value);
  if (!normalized) return "invalid";

  if (
    normalized === context.ownUserId ||
    (context.ownFriendCode &&
      normalized === normalizeFriendLookup(context.ownFriendCode))
  ) {
    return "self";
  }

  if (context.friends.some((friend) => matches(friend, normalized))) {
    return "already_friend";
  }

  if (context.requests.some((request) => matches(request, normalized))) {
    return "pending";
  }

  return null;
}
