import { getDefaultStore } from "jotai";
import { toast } from "sonner";
import i18n from "@renderer/i18n";
import { IServer } from "@/types/ServersList";
import {
  accountAtom,
  consolesAtom,
  selectedVersionAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import { showErrorToast } from "@renderer/utilities/errorToast";
import {
  showFailureToast,
  reportIpcFailure,
} from "@renderer/utilities/failures";
import {
  getShareErrorDetails,
  getShareErrorText,
} from "@renderer/utilities/share";
import {
  applyBlockedModFilePaths,
  checkBlockedMods,
} from "@renderer/utilities/blockedMods";
import { preload } from "@renderer/utilities/lazyPreload";
import {
  reportShareSyncInterruption,
  syncShare,
} from "@renderer/utilities/version";
import { supportsQuickPlayMultiplayer } from "@renderer/utilities/versionPure";
import { Mods } from "@renderer/classes/Mods";
import {
  blockedModsAtom,
  blockedModsOpenAtom,
  blockedModsResumeAtom,
} from "./atoms";
import { LazyBlockedMods } from "./lazyDialogs";
import { readInstanceServers } from "@renderer/features/instances/instanceServers";
import { keepOwnServers } from "./joinServers";
import { isInstanceRunning } from "./launchPlan";
import { runGame } from "./runGame";
import type { JoinFriendWorldParams } from "./types";

const api = window.api;

let joinInFlight = false;
let pendingJoin: JoinFriendWorldParams | null = null;

async function restoreOwnServers(
  versionPath: string,
  before: IServer[],
): Promise<boolean> {
  if (before.length === 0) return true;

  const synced = await readInstanceServers(versionPath);
  if (!synced) return false;

  const kept = keepOwnServers(before, synced);
  if (kept.length === 0) return true;

  const serversPath = await api.path.join(versionPath, "servers.dat");
  return await api.servers.write([...synced, ...kept], serversPath);
}

export async function joinFriendWorld(
  params: JoinFriendWorldParams,
): Promise<void> {
  if (joinInFlight) return;

  const store = getDefaultStore();
  const account = store.get(accountAtom);
  const s0 = store.get(settingsAtom);
  const t0 = i18n.t.bind(i18n);

  if (!params.versionCode) {
    toast.warning(t0("friends.friendBuildNotPublished"));
    return;
  }

  joinInFlight = true;
  const toastId = toast.loading(
    t0("friends.joinFlow.connecting", { nickname: params.hostNickname }),
  );

  let ownServers: IServer[] = [];

  try {
    let version = store
      .get(versionsAtom)
      .find((v) => v.version.shareCode === params.versionCode);

    const modpackData = await api.backend.getModpack(
      account?.accessToken || "",
      params.versionCode,
    );

    if (!version) {
      if (!modpackData.data) {
        if (
          !reportIpcFailure(
            t0("addVersion.fromServer.loadError"),
            ["backend:getModpack"],
            { toastId },
          )
        ) {
          toast.error(t0("share.errors.joinShareNotFound"), { id: toastId });
        }
        return;
      }

      pendingJoin = params;
      openNewInstance({
        modpack: modpackData.data,
        onSuccess: () => {
          const queued = pendingJoin;
          pendingJoin = null;
          if (!queued) return;
          setTimeout(() => {
            void joinFriendWorld(queued);
          }, 400);
        },
      });
      toast.info(t0("friends.joinFlow.installFirst"), { id: toastId });
      return;
    }

    if (
      version.version.downloadedVersion &&
      modpackData.data &&
      (modpackData.data.build ?? 0) > (version.version.build ?? 0)
    ) {
      toast.loading(t0("friends.joinFlow.syncing"), { id: toastId });

      const localServers = await readInstanceServers(version.versionPath);
      const serversLocal = localServers ?? [];
      ownServers = serversLocal;

      version = await syncShare(
        version,
        serversLocal,
        s0,
        account?.accessToken || "",
        modpackData.data,
      );

      const restored = await restoreOwnServers(version.versionPath, ownServers);
      if (!restored || localServers === null) {
        showFailureToast(t0("friends.joinFlow.ownServersLost"), undefined, {
          channels: ["servers:write", "servers:read"],
        });
      }

      const { blockedMods: bMods, mods: resolvedMods } = await checkBlockedMods(
        version.version.loader.mods,
        version.versionPath,
      );
      version.version.loader.mods = resolvedMods;
      if (bMods.length > 0) {
        const target = version;
        preload(LazyBlockedMods.preload);
        store.set(blockedModsAtom, bMods);
        store.set(blockedModsResumeAtom, {
          run: async (resolved) => {
            if (!resolved) {
              toast.info(t0("friends.joinFlow.blockedCancelled"));
              return;
            }

            if (applyBlockedModFilePaths(target.version.loader.mods, resolved)) {
              await target.save();
            }

            await new Mods(s0, target.version).check();
            await joinFriendWorld(params);
          },
        });
        store.set(blockedModsOpenAtom, true);
        toast.warning(t0("friends.joinFlow.blockedMods"), { id: toastId });
        return;
      }
    }

    let address = params.address;
    if (params.slug) {
      const result = await api.share.connectToFriendShare(params.slug);
      if (!result.ok || !result.data) {
        showErrorToast(
          getShareErrorText(t0, result.error),
          getShareErrorDetails(t0, result.error),
          t0("common.copy"),
          toastId,
        );
        return;
      }

      address = result.data.connectHost;
    }

    if (!address) {
      toast.error(t0("friends.friendNoJoinTarget"), { id: toastId });
      return;
    }

    store.set(selectedVersionAtom, version);

    const quickPlaySupported =
      version.isQuickPlayMultiplayer ||
      supportsQuickPlayMultiplayer(version.version.version.id);
    const instanceRunning = isInstanceRunning(
      store.get(consolesAtom).consoles,
      version.version.name,
    );

    const writeServerEntry = async () => {
      const serversLocal = await readInstanceServers(version!.versionPath);
      if (!serversLocal) return false;

      const serversPath = await api.path.join(
        version!.versionPath,
        "servers.dat",
      );
      const entryName = t0("friends.joinFlow.serverEntryName", {
        nickname: params.hostNickname,
      });
      const nextServers: IServer[] = [
        { name: entryName, ip: address!, acceptTextures: null },
        ...serversLocal.filter(
          (server) =>
            server.ip !== address &&
            server.name !== entryName &&
            !(params.slug && server.ip.includes(params.slug)),
        ),
      ];

      return await api.servers.write(nextServers, serversPath);
    };

    const reportServerEntryFailure = () => {
      showFailureToast(
        t0("friends.joinFlow.serverEntryFailed", { address }),
        undefined,
        { channels: ["servers:write", "servers:read"], toastId },
      );
    };

    if (instanceRunning) {
      if (!(await writeServerEntry())) {
        reportServerEntryFailure();
        return;
      }

      toast.success(t0("friends.joinFlow.alreadyRunning"), {
        id: toastId,
        duration: 10000,
      });
      return;
    }

    if (quickPlaySupported) {
      toast.success(
        t0("friends.joinFlow.launching", { nickname: params.hostNickname }),
        { id: toastId },
      );
      await runGame({
        version,
        skipUpdate: true,
        quick: { multiplayer: address },
      });
      return;
    }

    if (await writeServerEntry()) {
      toast.success(t0("friends.joinFlow.addedToServers"), {
        id: toastId,
        duration: 10000,
      });
    } else {
      reportServerEntryFailure();
    }

    await runGame({ version, skipUpdate: true });
  } catch (error) {
    console.error("[joinFriendWorld] failed:", error);
    if (!reportShareSyncInterruption(error)) {
      showFailureToast(i18n.t("friends.joinFlow.failed"), error, { toastId });
    } else {
      toast.dismiss(toastId);
    }
  } finally {
    joinInFlight = false;
  }
}
