import { useEffect, useRef } from "react";
import { getDefaultStore, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import type { GameInviteResult } from "@/types/GameInvite";
import type {
  CompanionGameAction,
  CompanionGameEvent,
  CompanionSession,
} from "@/shared/companion";
import {
  accountAtom,
  activeFriendSharesAtom,
  authDataAtom,
  friendSocketAtom,
  friendsAtom,
  ownPresenceAtom,
  settingsAtom,
  shareStateAtom,
  voiceSessionAtom,
} from "@renderer/stores/atoms";
import { getApiBase } from "@renderer/utilities/apiBase";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { voiceSetDeafened, voiceSetMicMuted } from "@renderer/utilities/voiceClient";
import { evaluateAchievements } from "@renderer/utilities/achievements";
import { fetchMergedAchievementStats } from "@renderer/utilities/achievementStats";
import { playAchievementSound } from "@renderer/utilities/sounds";
import { dismissOverlayToast } from "@renderer/features/overlay/overlayToasts";
import { friendPresence } from "@renderer/features/friends/presence";
import {
  claimGameInviteResults,
  releaseGameInviteResults,
} from "@renderer/features/friends/gameInvite";
import { withMember } from "@renderer/features/share/hostModel";
import { joinFriendWorld } from "@renderer/features/launch/joinFriendWorld";
import { companionSessionsAtom } from "./companionStore";
import { buildFriendsSnapshot, buildVoiceSnapshot } from "./companionSnapshots";

const api = window.api;
const INVITE_TIMEOUT_MS = 15_000;
const LIVE_CHECK_MS = 30_000;
const FRIENDS_REFRESH_MS = 60_000;
const ERROR_CODE = /^[a-z_]{1,40}$/;

type Outcome = { ok: true } | { ok: false; error: string };

type InviteTarget =
  | { type: "server" }
  | { type: "world"; slug: string; sessionId: string; publicAddress: string; visibility?: string };

function failed(error: string): Outcome {
  return { ok: false, error };
}

async function inviteFromGame(friend: string, toServer: boolean): Promise<Outcome> {
  const store = getDefaultStore();
  const socket = store.get(friendSocketAtom);
  if (!socket?.connected) return failed("offline");
  if (!store.get(ownPresenceAtom).versionCode) return failed("unpublished");

  let target: InviteTarget;
  if (toServer) {
    target = { type: "server" };
  } else {
    const share = store.get(shareStateAtom);
    if (share.phase !== "online" || !share.slug || !share.sessionId || !share.publicAddress) {
      return failed("not_hosting");
    }
    const host = share.host;
    if (host?.inviteOnly && !host.members.some((member) => member.userId === friend)) {
      const nickname =
        store.get(friendsAtom).find((entry) => entry.user?._id === friend)?.user.nickname ?? "";
      const updated = await api.share.updateHost({
        members: withMember(host.members, { userId: friend, nickname }),
      });
      if (!updated.ok) return failed("unknown");
    }
    target = {
      type: "world",
      slug: share.slug,
      sessionId: share.sessionId,
      publicAddress: share.publicAddress,
      visibility: share.visibility,
    };
  }

  claimGameInviteResults([friend]);
  const result = await new Promise<GameInviteResult | null>((resolve) => {
    const timer = window.setTimeout(() => {
      socket.off("gameInviteResult", onResult);
      resolve(null);
    }, INVITE_TIMEOUT_MS);
    function onResult(payload: GameInviteResult) {
      if (payload.recipientId && payload.recipientId !== friend) return;
      window.clearTimeout(timer);
      socket?.off("gameInviteResult", onResult);
      resolve(payload);
    }
    socket.on("gameInviteResult", onResult);
    socket.emit("gameInvite", { recipientId: friend, target });
  });
  releaseGameInviteResults([friend]);
  if (!result) return failed("timeout");
  if (result.ok) return { ok: true };
  return failed(result.code && ERROR_CODE.test(result.code) ? result.code : "unknown");
}

async function joinFromGame(friendId: string): Promise<Outcome> {
  const store = getDefaultStore();
  const friend = store.get(friendsAtom).find((entry) => entry.user?._id === friendId);
  if (!friend) return failed("friend_offline");
  const share = store.get(activeFriendSharesAtom).find((entry) => entry.hostUserId === friendId);
  const presence = friendPresence(friend, share);
  if (presence.kind !== "playing" || !presence.hasJoinTarget) return failed("not_found");
  await joinFriendWorld({
    versionCode: presence.joinVersionCode,
    hostNickname: friend.user.nickname,
    slug: share?.slug,
    address: friend.serverAddress || undefined,
    hostUserId: friendId,
  });
  return { ok: true };
}

async function sendScreenshotFromGame(path: string, friendId: string): Promise<Outcome> {
  const store = getDefaultStore();
  const socket = store.get(friendSocketAtom);
  const account = store.get(accountAtom);
  const own = store.get(authDataAtom)?.sub;
  if (!socket?.connected || !account?.accessToken || !own) return failed("offline");
  const name = path.split(/[\\/]/).pop() || "screenshot.png";
  const url = await api.backend.uploadFileFromPath(
    account.accessToken,
    path,
    `chat_${Date.now()}_${name}`,
    `chat/${own}`,
  );
  if (!url) return failed("unknown");
  socket.emit("sendMessage", {
    message: { sender: own, message: { _type: "image", value: url }, time: new Date() },
    recipient: friendId,
    clientMessageId: `companion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  return { ok: true };
}

async function runAction(session: CompanionSession, action: CompanionGameAction): Promise<void> {
  const reply = (req: string, outcome: Outcome) =>
    api.companion
      .result(session.versionName, session.instance, req, outcome.ok, outcome.ok ? undefined : outcome.error)
      .catch(ignoreFailure);
  switch (action.kind) {
    case "decline":
      dismissOverlayToast(action.id);
      return;
    case "voice":
      if (action.action === "mute" || action.action === "unmute") {
        await voiceSetMicMuted(action.action === "mute");
      } else {
        await voiceSetDeafened(action.action === "deafen");
      }
      return;
    case "invite":
      await reply(action.req, await inviteFromGame(action.friend, Boolean(action.server)));
      return;
    case "join":
      await reply(action.req, await joinFromGame(action.friend));
      return;
    case "sendScreenshot":
      await reply(action.req, await sendScreenshotFromGame(action.path, action.friend));
      return;
    default:
      return;
  }
}

export function CompanionHost() {
  const { t } = useTranslation();
  const sessions = useAtomValue(companionSessionsAtom);
  const live = sessions.length > 0;
  const authData = useAtomValue(authDataAtom);
  const friends = useAtomValue(friendsAtom);
  const shares = useAtomValue(activeFriendSharesAtom);
  const friendSocket = useAtomValue(friendSocketAtom);
  const voice = useAtomValue(voiceSessionAtom);
  const pttBind = useAtomValue(settingsAtom).voicePttBind;
  const lastLiveCheck = useRef(0);
  const liveCheckRunning = useRef(false);

  useEffect(() => {
    const self = authData?.sub ? { id: authData.sub, name: authData.nickname ?? "" } : null;
    void api.companion.setSelf(self).catch(ignoreFailure);
  }, [authData?.sub, authData?.nickname]);

  useEffect(() => {
    if (!live) return;
    void api.companion
      .setFriends(buildFriendsSnapshot(friends, shares, getApiBase()))
      .catch(ignoreFailure);
  }, [live, friends, shares]);

  useEffect(() => {
    if (!live || !friendSocket) return;
    const timer = window.setInterval(() => {
      if (friendSocket.connected) friendSocket.emit("getFriends");
    }, FRIENDS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [live, friendSocket]);

  useEffect(() => {
    if (!live) return;
    void api.companion
      .setVoice(buildVoiceSnapshot(voice, pttBind, getApiBase()))
      .catch(ignoreFailure);
  }, [live, voice, pttBind]);

  useEffect(() => {
    return api.companion.onAction((event: CompanionGameEvent) => {
      void runAction(event.session, event.action).catch((error) => {
        console.warn("[companion] game action failed", event.action.kind, error);
        const req = "req" in event.action ? event.action.req : null;
        if (req) {
          void api.companion
            .result(event.session.versionName, event.session.instance, req, false, "unknown")
            .catch(ignoreFailure);
        }
      });
    });
  }, []);

  useEffect(() => {
    return api.companion.onHang((hang) => {
      const body = hang.mods.length > 0
        ? t("companion.hangMods", { mods: hang.mods.slice(0, 3).join(", ") })
        : t("companion.hangUnknown");
      toast.warning(t("companion.hangTitle", { seconds: hang.seconds }), {
        id: `companion-hang:${hang.versionName}:${hang.instance}`,
        description: body,
        icon: <TriangleAlert className="size-4 text-warning" />,
        duration: 15_000,
      });
    });
  }, [t]);

  useEffect(() => {
    return api.companion.onStats(({ session }) => {
      const now = Date.now();
      if (liveCheckRunning.current || now - lastLiveCheck.current < LIVE_CHECK_MS) return;
      lastLiveCheck.current = now;
      liveCheckRunning.current = true;
      void checkLiveAchievements(session, (id) => t(`achievements.items.${id}.name`), (name) =>
        t("achievements.unlockedToast", { name }),
      )
        .catch((error) => console.warn("[companion] live achievements failed", error))
        .finally(() => {
          liveCheckRunning.current = false;
        });
    });
  }, [t]);

  return null;
}

async function checkLiveAchievements(
  session: CompanionSession,
  nameOf: (id: string) => string,
  unlockedText: (name: string) => string,
): Promise<void> {
  const store = getDefaultStore();
  const auth = store.get(authDataAtom);
  const account = store.get(accountAtom);
  if (!auth?.sub || !account?.accessToken) return;
  const user = await api.backend.getUser(account.accessToken, auth.sub);
  if (!user) return;
  const { stats } = await fetchMergedAchievementStats(account);
  const unlocked = evaluateAchievements(stats, user.playTime, user.achievements)
    .filter((progress) => progress.unlocked)
    .map((progress) => progress.def);
  const fresh = unlocked.filter((def) => !user.achievements.includes(def.id));
  if (fresh.length === 0) return;
  const saved = await api.backend.updateUser(account.accessToken, user._id, {
    achievements: unlocked.map((def) => def.id),
  });
  if (!saved) return;
  for (const def of fresh) {
    const name = nameOf(def.id);
    toast.success(unlockedText(name));
    await api.companion
      .pushToast(session.versionName, session.instance, {
        id: `achievement:${def.id}`,
        kind: "achievement",
        title: name,
        body: unlockedText(name),
        count: 1,
        actionable: false,
        meta: `+${def.points}`,
      })
      .catch(ignoreFailure);
  }
  playAchievementSound();
}
