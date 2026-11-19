import type {
  ShareAccessMode,
  ShareGuestRef,
  ShareHostState,
  ShareMember,
  ShareRemovedGuest,
  ShareState,
  ShareVisibility,
} from "@/types/Share";
import type { ShareGuestRow } from "./guests";

export const SEAT_OPTIONS = [0, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20];

export function accessModeOf(
  visibility: ShareVisibility,
  host: Pick<ShareHostState, "inviteOnly"> | undefined,
): ShareAccessMode {
  if (visibility === "public") return "public";
  return host?.inviteOnly ? "invite" : "friends";
}

export function accessTarget(mode: ShareAccessMode): {
  visibility: ShareVisibility;
  inviteOnly: boolean;
} {
  return {
    visibility: mode === "public" ? "public" : "friends",
    inviteOnly: mode === "invite",
  };
}

export function withMember(
  members: ShareMember[],
  member: ShareMember,
): ShareMember[] {
  if (members.some((entry) => entry.userId === member.userId)) return members;
  return [...members, member];
}

export function withoutMember(
  members: ShareMember[],
  userId: string,
): ShareMember[] {
  return members.filter((entry) => entry.userId !== userId);
}

export function guestRefOf(row: ShareGuestRow): ShareGuestRef {
  return { userId: row.userId, username: row.gameName };
}

export function canKickGuest(row: ShareGuestRow): boolean {
  return !!row.userId || !!row.gameName;
}

export function removedGuestName(guest: ShareRemovedGuest): string {
  return guest.nickname || guest.username || "";
}

export function isServerTarget(state: ShareState): boolean {
  return (state.target ?? state.candidate)?.kind === "server";
}
