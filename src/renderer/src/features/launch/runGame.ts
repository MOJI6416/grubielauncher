import { getDefaultStore } from "jotai";
import { jwtDecode } from "jwt-decode";
import { toast } from "sonner";
import i18n from "@renderer/i18n";
import { IAuth } from "@/types/Account";
import { IConsole } from "@/types/Console";
import { IServer } from "@/types/ServersList";
import { diffModpackProjects } from "@/shared/modpackDiff";
import { resolveInstanceSettings } from "@/shared/instanceSettings";
import { accountIdentity } from "@renderer/features/accounts/identity";
import { adoptCanonicalShareCode } from "@renderer/features/instances/shareIdentity";
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  consolesAtom,
  friendSocketAtom,
  installActiveAtom,
  isRunningAtom,
  ownPresenceAtom,
  pathsAtom,
  selectedVersionAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import {
  ensureAccountSession,
  isAccountSessionRefreshError,
} from "@renderer/utilities/accountSession";
import { showErrorToast } from "@renderer/utilities/errorToast";
import { showFailureToast } from "@renderer/utilities/failures";
import { uiJournal } from "@renderer/utilities/journal";
import { isOnlineSocketConnected } from "@renderer/utilities/onlineSocket";
import { checkDiffenceUpdateData, isOwner } from "@renderer/utilities/version";
import {
  launchServersAtom,
  launchUpdateDiffAtom,
  launchUpdateOpenAtom,
  launchUpdateRemoteServersAtom,
  pendingLaunchAtom,
} from "./atoms";
import { nextInstanceNumber, resolveLaunchBlock } from "./launchPlan";
import {
  beginLaunchProgress,
  planLaunchStages,
  setLaunchStage,
} from "./launchProgress";
import { checkOrnitheGeneration } from "./ornitheGeneration";
import { prepareJavaForLaunch } from "@renderer/features/java/javaLaunch";
import type { RunGameParams } from "./types";

const api = window.api;

let launchInFlight = false;

export async function runGame(params: RunGameParams): Promise<void> {
  const store = getDefaultStore();
  const { skipUpdate, version, instance, quick } = params;
  const t = i18n.t.bind(i18n);

  const launchVersion = version || store.get(selectedVersionAtom);
  const a0 = store.get(accountAtom);
  const s0 = store.get(settingsAtom);
  const p0 = store.get(pathsAtom);

  const block = resolveLaunchBlock({
    installActive: store.get(installActiveAtom),
    hasVersion: !!launchVersion,
    hasAccount: !!a0,
    hasSettings: !!s0,
    hasPaths: !!p0?.launcher && !!p0?.minecraft,
    isInstalled: launchVersion ? launchVersion.hasManifest : undefined,
  });

  if (block) {
    uiJournal.info("launch", "launch blocked", {
      versionName: launchVersion?.version.name,
      block,
    });
    if (block.kind === "busy") toast.error(t(block.messageKey));
    else showErrorToast(t(block.titleKey), t(block.hintKey), t("common.copy"));
    return;
  }

  if (!launchVersion || !a0 || !s0) return;

  const _instance =
    instance ??
    nextInstanceNumber(
      store.get(consolesAtom).consoles,
      launchVersion.version.name,
    );

  let account = a0;
  let currentAccounts = store.get(accountsAtom);
  const ad = store.get(authDataAtom);
  let runtimeAuthData = ad;

  const setAccounts = (next: typeof currentAccounts) =>
    store.set(accountsAtom, next);
  const setSelectedAccount = (next: typeof account) =>
    store.set(accountAtom, next);

  if (launchInFlight) {
    uiJournal.info("launch", "ignored: another launch is in progress", {
      versionName: launchVersion.version.name,
    });
    return;
  }
  launchInFlight = true;
  store.set(isRunningAtom, true);

  const checksModpack =
    !skipUpdate &&
    Boolean(launchVersion.version.shareCode) &&
    Boolean(launchVersion.version.downloadedVersion) &&
    isOnlineSocketConnected();
  beginLaunchProgress({
    versionName: launchVersion.version.name,
    instance: _instance,
    plan: planLaunchStages({
      checksAccount: Boolean(ad) && a0.type !== "plain",
      checksModpack,
      modded: launchVersion.version.loader?.name !== "vanilla",
    }),
  });

  const startedAt = Date.now();
  const since = () => Date.now() - startedAt;
  uiJournal.info("launch", "play pressed", {
    versionName: launchVersion.version.name,
    instance: _instance,
    minecraft: launchVersion.version.version?.id,
    loader: launchVersion.version.loader?.name,
    accountType: a0.type,
    nickname: a0.nickname,
    skipUpdate: Boolean(skipUpdate),
    quick,
    shareCode: launchVersion.version.shareCode,
  });

  try {
    if (ad && account.type !== "plain") {
      const refreshed = await ensureAccountSession({
        accounts: currentAccounts,
        authData: ad,
        selectedAccount: account,
        setAccounts,
        setSelectedAccount,
      });

      account = refreshed.account;
      currentAccounts = refreshed.accounts;
      uiJournal.info("launch", "account session checked", {
        refreshed: refreshed.refreshed,
        ms: since(),
      });

      if (refreshed.refreshed && account.accessToken) {
        runtimeAuthData = jwtDecode<IAuth>(account.accessToken);
      }
    }

    if (checksModpack && launchVersion.version.shareCode) {
      setLaunchStage("modpack");
      const serversPath = await api.path.join(
        p0.minecraft,
        "versions",
        launchVersion.version.name,
        "servers.dat",
      );

      let serversLocal: IServer[] = [];
      if (await api.fs.pathExists(serversPath)) {
        serversLocal = await api.servers.read(serversPath);
        store.set(launchServersAtom, serversLocal);
      }

      const modpackData = await api.backend.getModpack(
        account.accessToken || "",
        launchVersion.version.shareCode,
      );
      uiJournal.info("launch", "modpack update check", {
        status: modpackData?.status,
        found: Boolean(modpackData?.data),
        ms: since(),
      });

      if (modpackData.status == "not_found") {
        launchVersion.version.shareCode = undefined;
        launchVersion.version.downloadedVersion = false;
        await launchVersion.save();
      } else if (modpackData.data) {
        await adoptCanonicalShareCode(launchVersion, modpackData.data);

        const diff = await checkDiffenceUpdateData(
          {
            mods: launchVersion.version.loader.mods,
            servers: serversLocal,
            version: launchVersion.version,
            runArguments: launchVersion.version.runArguments || {
              jvm: "",
              game: "",
            },
            versionPath: launchVersion.versionPath,
            logo: launchVersion.version.image || "",
            quickServer: launchVersion.version.quickServer || "",
          },
          account.accessToken || "",
          modpackData.data,
        );

        if (diff) {
          uiJournal.info("launch", "modpack update offered, waiting for the player");
          store.set(
            launchUpdateDiffAtom,
            diffModpackProjects(
              launchVersion.version.loader.mods,
              modpackData.data.conf.loader.mods,
            ),
          );
          store.set(
            launchUpdateRemoteServersAtom,
            (modpackData.data.conf.servers || []).map(
              (server) => server.ip || "",
            ),
          );
          store.set(pendingLaunchAtom, {
            version: launchVersion,
            instance: _instance,
            quick,
          });
          store.set(selectedVersionAtom, launchVersion);
          store.set(launchUpdateOpenAtom, true);
          store.set(isRunningAtom, false);
          return;
        }
      }
    }

    setLaunchStage("prepare");
    const authlibResult = await launchVersion.ensureAuthlib(account);
    if (!authlibResult.ok) {
      uiJournal.warn("launch", "authlib-injector unavailable", {
        reason: authlibResult.reason,
        ms: since(),
      });
      toast.error(
        t(
          authlibResult.reason === "download_failed"
            ? "app.authlibDownloadFailed"
            : "app.authlibUnavailable",
        ),
      );
      store.set(isRunningAtom, false);
      return;
    }

    if (!(await prepareJavaForLaunch(launchVersion))) {
      store.set(isRunningAtom, false);
      return;
    }

    const generationReady = await checkOrnitheGeneration(launchVersion, () =>
      void runGame({ ...params, version: launchVersion, skipUpdate: true }),
    );
    if (!generationReady) {
      store.set(isRunningAtom, false);
      return;
    }

    launchVersion.version.lastLaunch = new Date();
    const trackStatistics = isOwner(
      launchVersion.version.owner,
      account,
      launchVersion.version.ownerId,
    );

    store.set(consolesAtom, (prev) => {
      const idx = prev.consoles.findIndex(
        (c) =>
          c.versionName == launchVersion.version.name && c.instance == _instance,
      );

      if (idx !== -1) {
        const next = [...prev.consoles];
        next[idx] = {
          ...next[idx],
          status: "running",
          startTime: Date.now(),
          trackStatistics,
          account: accountIdentity(account),
          messages: [],
        };
        return { consoles: next };
      }

      const newConsole: IConsole = {
        versionName: launchVersion.version.name || "",
        status: "running",
        instance: _instance,
        startTime: Date.now(),
        trackStatistics,
        account: accountIdentity(account),
        messages: [],
      };

      return { consoles: [...prev.consoles, newConsole] };
    });

    uiJournal.info("launch", "asking main process to start the game", {
      ms: since(),
    });
    const started = await launchVersion.run(
      account,
      resolveInstanceSettings(s0, launchVersion.version.overrides),
      runtimeAuthData,
      _instance,
      quick,
    );
    uiJournal.info("launch", started ? "game process started" : "game process did not start", {
      ms: since(),
    });
    if (!started) throw new Error("Game process did not start");
    setLaunchStage("java");

    const nextPresence = {
      versionName: launchVersion.version.name,
      versionCode: launchVersion.version.shareCode || "",
      serverAddress: "",
    };

    store.set(ownPresenceAtom, nextPresence);
    store.get(friendSocketAtom)?.emit("friendUpdate", nextPresence);

    await launchVersion.save();
    await api.accounts.save(currentAccounts, accountIdentity(account));
  } catch (err) {
    console.error(err);
    uiJournal.failure("launch", "launch failed", err, {
      versionName: launchVersion.version.name,
      ms: since(),
    });
    if (isAccountSessionRefreshError(err)) {
      showErrorToast(
        t("accounts.sessionExpired"),
        t("accounts.sessionExpiredHint"),
        t("common.copy"),
      );
    } else {
      showFailureToast(t("app.startupError"), err);
    }
    store.set(consolesAtom, (prev) => {
      const idx = prev.consoles.findIndex(
        (c) =>
          c.versionName === launchVersion.version.name &&
          c.instance === _instance &&
          c.status === "running",
      );
      if (idx === -1) return prev;

      const next = [...prev.consoles];
      next[idx] = { ...next[idx], status: "error" };
      return { consoles: next };
    });
    store.set(isRunningAtom, false);
  } finally {
    launchInFlight = false;
  }
}
