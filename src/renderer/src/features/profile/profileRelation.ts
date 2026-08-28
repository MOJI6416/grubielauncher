export type ProfileRelation =
  | "self"
  | "friend"
  | "outgoing"
  | "incoming"
  | "none";

export interface RelationRequest {
  type: "requester" | "recipient";
  userId: string;
}

export function profileRelation({
  userId,
  ownId,
  friendIds,
  requests,
}: {
  userId: string;
  ownId?: string | null;
  friendIds: readonly string[];
  requests: readonly RelationRequest[];
}): ProfileRelation {
  if (!userId) return "none";
  if (ownId && ownId === userId) return "self";
  if (friendIds.includes(userId)) return "friend";

  for (const request of requests) {
    if (request.userId !== userId) continue;
    return request.type === "requester" ? "outgoing" : "incoming";
  }

  return "none";
}
