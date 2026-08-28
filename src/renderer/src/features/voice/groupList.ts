import type { IGroup } from "@/types/Voice";

export interface GroupListEntry {
  group: IGroup;
  unread: number;
  isMuted: boolean;
  isActiveRoom: boolean;
  voiceCount: number;
  voiceIdentities: string[];
}

export interface GroupListInput {
  activeRoomId?: string;
  unreads?: Record<string, number>;
  mutedIds?: string[];
}

export function groupInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1)
    return [...words[0]].slice(0, 2).join("").toUpperCase();
  return `${[...words[0]][0]}${[...words[1]][0]}`.toUpperCase();
}

export function buildGroupList(
  groups: IGroup[],
  input: GroupListInput = {},
): GroupListEntry[] {
  const muted = new Set(input.mutedIds ?? []);
  const unreads = input.unreads ?? {};

  const entries = groups.map<GroupListEntry>((group) => {
    const voiceIdentities = group.voiceParticipants ?? [];

    return {
      group,
      unread: unreads[group._id] ?? 0,
      isMuted: muted.has(group._id),
      isActiveRoom:
        Boolean(input.activeRoomId) && input.activeRoomId === group._id,
      voiceCount: Math.max(group.participantCount ?? 0, voiceIdentities.length),
      voiceIdentities,
    };
  });

  return entries.sort((a, b) => {
    if (a.isActiveRoom !== b.isActiveRoom) return a.isActiveRoom ? -1 : 1;

    const aVoice = a.voiceCount > 0;
    const bVoice = b.voiceCount > 0;
    if (aVoice !== bVoice) return aVoice ? -1 : 1;
    if (aVoice && a.voiceCount !== b.voiceCount) {
      return b.voiceCount - a.voiceCount;
    }

    const aUnread = a.unread > 0 && !a.isMuted;
    const bUnread = b.unread > 0 && !b.isMuted;
    if (aUnread !== bUnread) return aUnread ? -1 : 1;

    return a.group.name.localeCompare(b.group.name, undefined, {
      sensitivity: "base",
    });
  });
}

export function filterGroupList(
  entries: GroupListEntry[],
  query: string,
): GroupListEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;

  return entries.filter(({ group }) => {
    if (group.name.toLowerCase().includes(needle)) return true;
    if (group.code.toLowerCase().includes(needle)) return true;
    return group.members.some((member) =>
      member.nickname.toLowerCase().includes(needle),
    );
  });
}

export interface MemberSortInput {
  ownerId: string;
  selfId?: string;
  onlineIds?: Set<string>;
  inVoice?: string[];
}

export function sortGroupMembers<T extends { _id: string; nickname: string }>(
  members: T[],
  input: MemberSortInput,
): T[] {
  const voice = new Set(input.inVoice ?? []);
  const online = input.onlineIds ?? new Set<string>();

  const weight = (member: T) => {
    if (member._id === input.ownerId) return 0;
    if (voice.has(member._id)) return 1;
    if (member._id === input.selfId) return 2;
    if (online.has(member._id)) return 3;
    return 4;
  };

  return [...members].sort((a, b) => {
    const delta = weight(a) - weight(b);
    if (delta !== 0) return delta;
    return a.nickname.localeCompare(b.nickname, undefined, {
      sensitivity: "base",
    });
  });
}
