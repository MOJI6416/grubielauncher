import { useEffect, useRef } from "react";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LazyNewInstanceScreen } from "@renderer/screens/lazyScreens";
import { incomingInviteAtom } from "@renderer/features/friends/gameInvite";
import { loadGroups } from "@renderer/features/friends/groups";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import {
  PendingDeepLaunch,
  resolveDeepLaunch,
} from "@renderer/features/launch/deepLaunch";
import { runGame } from "@renderer/features/launch/runGame";
import { resolveDeepLink } from "@renderer/navigation/deepLinkRoutes";
import { navigate } from "@renderer/navigation/navigate";
import {
  accountAtom,
  pendingFriendRequestAtom,
  pendingSkinDeepLinkAtom,
  pendingWebLoginAtom,
  versionsAtom,
  versionsLoadedAtom,
} from "@renderer/stores/atoms";
import { reportIpcFailure, showFailureToast } from "@renderer/utilities/failures";
import { reportGroupJoinFailure } from "@renderer/utilities/groupJoin";
import { useLatestRef } from "@renderer/utilities/useLatestRef";
import type { LauncherDeepLink } from "@/types/DeepLink";

const api = window.api;

export function DeepLinkHost() {
  const { t } = useTranslation();
  const tRef = useLatestRef(t);
  const versions = useAtomValue(versionsAtom);
  const versionsLoaded = useAtomValue(versionsLoadedAtom);
  const setPendingSkinDeepLink = useSetAtom(pendingSkinDeepLinkAtom);
  const setPendingWebLogin = useSetAtom(pendingWebLoginAtom);
  const setPendingFriendRequest = useSetAtom(pendingFriendRequestAtom);
  const pendingRef = useRef<PendingDeepLaunch | null>(null);
  const queuedLinksRef = useRef<LauncherDeepLink[]>([]);
  const isBootstrappedRef = useRef(false);

  const tryDeepLaunchRef = useRef(() => {});
  tryDeepLaunchRef.current = () => {
    const decision = resolveDeepLaunch(
      pendingRef.current,
      versions,
      versionsLoaded,
    );

    if (decision.kind === "wait") return;

    pendingRef.current = null;

    if (decision.kind === "launch") {
      void runGame({ version: decision.version, instance: decision.instance });
      return;
    }

    toast.error(tRef.current("versions.launchNotFound"));
  };

  useEffect(() => {
    tryDeepLaunchRef.current();
  }, [versions, versionsLoaded]);

  const handleDeepLinkRef = useRef<
    (payload: LauncherDeepLink) => Promise<void>
  >(async () => {});

  useEffect(() => {
    if (!versionsLoaded) return;

    isBootstrappedRef.current = true;
    const queued = queuedLinksRef.current.splice(0);
    queued.forEach((payload) => void handleDeepLinkRef.current(payload));
  }, [versionsLoaded]);

  useEffect(() => {
    handleDeepLinkRef.current = async (payload) => {
      const linkAccount = getDefaultStore().get(accountAtom);
      const intent = resolveDeepLink(payload, {
        hasAccount: !!linkAccount,
        accountType: linkAccount?.type ?? null,
        hasAccessToken: !!linkAccount?.accessToken,
      });

      if (intent.kind !== "pack") void api.other.restoreWindow();

      if (intent.kind === "notice") {
        const message = tRef.current(intent.messageKey);
        if (intent.level === "error") toast.error(message);
        else toast.info(message);
        return;
      }

      if (intent.kind === "launch") {
        pendingRef.current = {
          versionName: intent.versionName,
          instance: intent.instance,
        };
        tryDeepLaunchRef.current();
        return;
      }

      if (intent.kind === "groupJoin") {
        const token = linkAccount?.accessToken ?? "";
        const group = await api.backend.groupJoinByCode(token, intent.code);
        if (!group || typeof group === "string") {
          reportGroupJoinFailure(group ?? null, tRef.current);
          return;
        }

        toast.success(tRef.current("groups.joined", { group: group.name }));
        void loadGroups();
        return;
      }

      if (intent.kind === "skin") {
        setPendingSkinDeepLink(intent.skinId);
        return;
      }

      if (intent.kind === "webLogin") {
        setPendingWebLogin(intent.requestId);
        return;
      }

      if (intent.kind === "friendRequest") {
        setPendingFriendRequest(intent.userId);
        navigate({ name: "people", section: "requests" });
        return;
      }

      try {
        await LazyNewInstanceScreen.preload();

        const modpackData = await api.backend.getModpack(
          linkAccount?.accessToken || "",
          intent.shareCode,
        );

        if (!modpackData.data) {
          if (
            !reportIpcFailure(tRef.current("addVersion.fromServer.loadError"), [
              "backend:getModpack",
            ])
          ) {
            toast.error(tRef.current("addVersion.fromServer.notFound"));
          }
          return;
        }

        openNewInstance({ modpack: modpackData.data });
        getDefaultStore().set(incomingInviteAtom, null);
        void api.other.restoreWindow();
      } catch (error) {
        console.error(error);
        showFailureToast(
          tRef.current("addVersion.fromServer.loadError"),
          error,
        );
      }
    };

    return api.events.onDeepLink((payload) => {
      if (!isBootstrappedRef.current) {
        queuedLinksRef.current.push(payload);
        return;
      }

      void handleDeepLinkRef.current(payload);
    });
  }, [
    setPendingFriendRequest,
    setPendingSkinDeepLink,
    setPendingWebLogin,
    tRef,
  ]);

  return null;
}
