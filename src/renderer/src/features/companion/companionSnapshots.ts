import type { IFriend } from "@/types/IFriend";
import type { ActiveFriendShare } from "@/types/Share";
import type { IVoiceSessionState } from "@/types/Voice";
import type { VoicePttBind } from "@/types/Settings";
import type {
  CompanionFriends,
  CompanionVoice,
} from "@/shared/companion";
import { COMPANION_OFFLINE_LIMIT } from "@/shared/companion";
import { friendPresence } from "@renderer/features/friends/presence";
import { isVoiceLive } from "@renderer/features/voice/roomModel";
import { userHeadUrl } from "@renderer/features/accounts/identity";

const GLFW_NAMED: Record<string, number> = {
  Space: 32,
  Quote: 39,
  Comma: 44,
  Minus: 45,
  Period: 46,
  Slash: 47,
  Semicolon: 59,
  Equal: 61,
  BracketLeft: 91,
  Backslash: 92,
  BracketRight: 93,
  Backquote: 96,
  Escape: 256,
  Enter: 257,
  Tab: 258,
  Backspace: 259,
  Insert: 260,
  Delete: 261,
  ArrowRight: 262,
  ArrowLeft: 263,
  ArrowDown: 264,
  ArrowUp: 265,
  PageUp: 266,
  PageDown: 267,
  Home: 268,
  End: 269,
  CapsLock: 280,
  ScrollLock: 281,
  NumLock: 282,
  PrintScreen: 283,
  NumpadDecimal: 330,
  NumpadDivide: 331,
  NumpadMultiply: 332,
  NumpadSubtract: 333,
  NumpadAdd: 334,
  NumpadEnter: 335,
  Shift: 340,
  Ctrl: 341,
  Alt: 342,
  Meta: 343,
  ShiftRight: 344,
  CtrlRight: 345,
  AltRight: 346,
  MetaRight: 347,
};

export function glfwKeyFor(bind: VoicePttBind | null | undefined): number | undefined {
  if (!bind || bind.type !== "key") return undefined;
  const label = bind.label.trim();
  if (/^[A-Z]$/.test(label)) return label.charCodeAt(0);
  if (/^[0-9]$/.test(label)) return label.charCodeAt(0);
  const f = /^F([1-9]|1[0-9]|2[0-4])$/.exec(label);
  if (f) return 289 + Number(f[1]);
  const numpad = /^Numpad([0-9])$/.exec(label);
  if (numpad) return 320 + Number(numpad[1]);
  return GLFW_NAMED[label];
}

export function headUrl(apiBase: string, userId: string): string | undefined {
  const url = userHeadUrl(apiBase, userId);
  return url && url.startsWith("https://") ? url : undefined;
}

export function buildFriendsSnapshot(
  friends: IFriend[],
  shares: ActiveFriendShare[],
  apiBase: string,
): CompanionFriends {
  const sharesByHost = new Map(shares.map((share) => [share.hostUserId, share]));
  const online: CompanionFriends["online"] = [];
  const offlineList: NonNullable<CompanionFriends["offlineList"]> = [];
  let offline = 0;
  for (const friend of friends) {
    const id = friend.user?._id;
    if (!id) continue;
    const presence = friendPresence(friend, sharesByHost.get(id));
    if (presence.kind === "offline") {
      offline += 1;
      const avatarUrl = headUrl(apiBase, id);
      offlineList.push({ id, name: friend.user.nickname, ...(avatarUrl ? { avatarUrl } : {}) });
      continue;
    }
    const place =
      presence.place?.kind === "server"
        ? presence.place.address
        : presence.place?.kind === "world"
          ? presence.place.address
          : "";
    const activity = [presence.versionName, place].filter(Boolean).join(" · ");
    online.push({
      id,
      name: friend.user.nickname,
      status: presence.kind === "playing" ? "playing" : "online",
      ...(activity ? { activity } : {}),
      ...(headUrl(apiBase, id) ? { avatarUrl: headUrl(apiBase, id) } : {}),
      joinable: presence.hasJoinTarget,
    });
  }
  online.sort((a, b) => Number(b.status === "playing") - Number(a.status === "playing") || a.name.localeCompare(b.name));
  offlineList.sort((a, b) => a.name.localeCompare(b.name));
  return { online, offline, offlineList: offlineList.slice(0, COMPANION_OFFLINE_LIMIT) };
}

export function buildVoiceSnapshot(
  session: IVoiceSessionState,
  pttBind: VoicePttBind | null | undefined,
  apiBase: string,
): CompanionVoice {
  if (!isVoiceLive(session.state)) {
    return { active: false, muted: false, deafened: false, ptt: false, members: [] };
  }
  const code = session.pttEnabled ? glfwKeyFor(pttBind) : undefined;
  return {
    active: true,
    ...(session.roomName ? { channel: session.roomName } : {}),
    muted: session.isMicMuted,
    deafened: session.isDeafened,
    ptt: session.pttEnabled,
    ...(session.pttBindLabel ? { pttKey: session.pttBindLabel } : {}),
    ...(code ? { pttCode: code } : {}),
    members: session.participants.map((participant) => ({
      id: participant.identity,
      name: participant.name,
      speaking: participant.isSpeaking,
      muted: participant.isMuted,
      ...(headUrl(apiBase, participant.identity)
        ? { avatarUrl: headUrl(apiBase, participant.identity) }
        : {}),
    })),
  };
}
