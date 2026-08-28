export function dmRoomId(a: string, b: string): string {
  return `dm_${[a, b].sort().join("_")}`;
}

export function isDmRoomWith(
  roomId: string | undefined,
  ownUserId: string | undefined,
  peerId: string | undefined,
): boolean {
  if (!roomId || !ownUserId || !peerId) return false;
  return roomId === dmRoomId(ownUserId, peerId);
}
