import type { IVoiceParticipantState } from "@/types/Voice";

export const MAX_PARTICIPANT_VOLUME = 2;
export const DEFAULT_PARTICIPANT_VOLUME = 1;

export function participantInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "?";
  return [...cleaned].slice(0, 2).join("").toUpperCase();
}

export function sortVoiceParticipants(
  participants: IVoiceParticipantState[],
): IVoiceParticipantState[] {
  return [...participants].sort((a, b) => {
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
    const byName = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
    });
    if (byName !== 0) return byName;
    return a.identity.localeCompare(b.identity);
  });
}

export function isAloneInRoom(
  participants: IVoiceParticipantState[],
): boolean {
  return participants.filter((participant) => !participant.isLocal).length === 0;
}

export function splitOverflow<T>(
  items: T[],
  max: number,
): { visible: T[]; hidden: number } {
  if (max <= 0) return { visible: [], hidden: items.length };
  if (items.length <= max) return { visible: items, hidden: 0 };
  return { visible: items.slice(0, max), hidden: items.length - max };
}

export function clampParticipantVolume(volume: number): number {
  if (!Number.isFinite(volume)) return DEFAULT_PARTICIPANT_VOLUME;
  return Math.min(MAX_PARTICIPANT_VOLUME, Math.max(0, volume));
}

export function volumePercent(volume: number): number {
  return Math.round(clampParticipantVolume(volume) * 100);
}

export function levelBucket(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0;
  return Math.min(4, Math.ceil(Math.min(1, level) * 4));
}

export function pingableMembers<T extends { _id: string }>(
  members: T[],
  inRoom: string[],
  selfId: string,
): T[] {
  const busy = new Set([...inRoom, selfId]);
  return members.filter((member) => !busy.has(member._id));
}
