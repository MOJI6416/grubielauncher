import { IFriendRequest } from "@renderer/components/Friends/Friends";
import { ILocalFriend } from "@/types/ILocalFriend";
import { IServerConf } from "@/types/Server";
import { atom } from "jotai";
import { selectAtom } from "jotai/utils";
import { Socket } from "socket.io-client";
import { IAuth, ILocalAccount } from "@/types/Account";
import { DEFAULT_SETTINGS, TSettings } from "@/types/Settings";
import { IServer } from "@/types/ServersList";
import { IConsole, IConsoles } from "@/types/Console";
import { Version } from "@renderer/classes/Version";
import { ActiveFriendShare, SharePeerInfo, ShareState } from "@/types/Share";
import { IFriend, IUpdateStatus } from "@/types/IFriend";
import {
  IGroup,
  IGroupInvite,
  INITIAL_VOICE_CALL,
  INITIAL_VOICE_SESSION,
  IVoiceCallState,
  IVoiceSessionState,
} from "@/types/Voice";
import { loadManualOrder } from "@renderer/utilities/versionOrganize";

export const pathsAtom = atom<{
  launcher: string;
  minecraft: string;
  java: string;
}>({
  launcher: "",
  minecraft: "",
  java: "",
});

export const selectedVersionAtom = atom<Version>();
export const accountAtom = atom<ILocalAccount>();
export const authDataAtom = atom<IAuth | null>(null);

export const settingsAtom = atom<TSettings>(DEFAULT_SETTINGS);

export interface IErrorLogEntry {
  id: string;
  time: number;
  title: string;
  details?: string;
}

export const errorLogAtom = atom<IErrorLogEntry[]>([]);
export const errorLogSeenAtom = atom(0);

export const versionsAtom = atom<Version[]>([]);
export const versionsLoadedAtom = atom(false);
export const manualOrderAtom = atom<string[]>(loadManualOrder());
export const addVersionModalAtom = atom(false);
export const fileDragOverAtom = atom(false);
export const addVersionImportPathAtom = atom<string | null>(null);
export const installActiveAtom = atom(false);
export const accountsModalAtom = atom(false);
export const storageModalAtom = atom(false);
export const accountsAtom = atom<ILocalAccount[]>([]);
export const internetAtom = atom(true);
export const backendOnlineAtom = atom(true);
export const networkAtom = backendOnlineAtom;
export const serverAtom = atom<IServerConf>();
export const versionServersAtom = atom<IServer[]>([]);
export const isRunningAtom = atom(false);
export const localFriendsAtom = atom<ILocalFriend[]>([]);
export const friendSocketAtom = atom<Socket>();
export const friendRequestsAtom = atom<IFriendRequest[]>([]);
export const friendsAtom = atom<IFriend[]>([]);
export const selectedFriendAtom = atom<string>();
export const isDownloadedVersionAtom = atom<boolean>(false);
export const isOwnerVersionAtom = atom<boolean>(false);
export const consolesAtom = atom<IConsoles>({ consoles: [] });

export interface IConsoleMeta {
  versionName: string;
  instance: number;
  status: IConsole["status"];
}

function areConsoleMetasEqual(a: IConsoleMeta[], b: IConsoleMeta[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].versionName !== b[i].versionName ||
      a[i].instance !== b[i].instance ||
      a[i].status !== b[i].status
    ) {
      return false;
    }
  }
  return true;
}

export const consolesMetaAtom = selectAtom(
  consolesAtom,
  (state) =>
    state.consoles.map(({ versionName, instance, status }) => ({
      versionName,
      instance,
      status,
    })),
  areConsoleMetasEqual,
);
export const isFriendsConnectedAtom = atom<boolean>(false);
export const voiceSessionAtom = atom<IVoiceSessionState>(INITIAL_VOICE_SESSION);
export const groupsAtom = atom<IGroup[]>([]);
export const groupInvitesAtom = atom<IGroupInvite[]>([]);
const GROUP_UNREADS_STORAGE_KEY = "groups.unreads";

function loadGroupUnreads(): Record<string, number> {
  try {
    const raw = localStorage.getItem(GROUP_UNREADS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" && entry[1] > 0,
      ),
    );
  } catch {
    return {};
  }
}

export function saveGroupUnreads(unreads: Record<string, number>) {
  try {
    localStorage.setItem(GROUP_UNREADS_STORAGE_KEY, JSON.stringify(unreads));
  } catch {
    return;
  }
}

export const groupUnreadsAtom = atom<Record<string, number>>(
  loadGroupUnreads(),
);
export const openGroupChatIdAtom = atom<string | null>(null);
export const voiceCallAtom = atom<IVoiceCallState>(INITIAL_VOICE_CALL);

const MUTED_GROUPS_STORAGE_KEY = "groups.muted";

function loadMutedGroups(): string[] {
  try {
    const raw = localStorage.getItem(MUTED_GROUPS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveMutedGroups(ids: string[]) {
  try {
    localStorage.setItem(MUTED_GROUPS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    return;
  }
}

export const mutedGroupsAtom = atom<string[]>(loadMutedGroups());
export const ownPresenceAtom = atom<Required<IUpdateStatus>>({
  versionName: "",
  versionCode: "",
  serverAddress: "",
});
export const pendingFriendChatAtom = atom<string | null>(null);
export const pendingSkinDeepLinkAtom = atom<string | null>(null);

export const shareStateAtom = atom<ShareState>({
  phase: "idle",
  candidate: null,
  target: null,
  isTunnelConnected: false,
  isAuthenticated: false,
  isHeartbeatActive: false,
  isDegraded: false,
  reconnectAttempt: 0,
  updatedAt: new Date(0).toISOString(),
});

export const sharePeersAtom = atom<SharePeerInfo[]>([]);
export const isShareModalOpenAtom = atom(false);
export const shareOwnerAccountKeyAtom = atom<string | null>(null);
export const activeFriendSharesAtom = atom<ActiveFriendShare[]>([]);
