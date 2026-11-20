import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ILocalAccount } from "@/types/Account";
import type {
  IProject,
  IVersion as IProjectVersion,
} from "@/types/ModManager";
import type { DownloaderInfo } from "@/types/Downloader";
import type { IServerConf } from "@/types/Server";
import { Version } from "@renderer/classes/Version";
import type { IBlockedMod } from "@renderer/components/Modals/BlockedMods";
import type { ModpackDownloadStage } from "@renderer/features/newInstance/downloadModpack";
import { pathsAtom, settingsAtom } from "@renderer/stores/atoms";
import { showFailureToast } from "@renderer/utilities/failures";
import { showNotEnoughSpaceToast } from "@renderer/utilities/diskRoom";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import {
  applyModpackUpdate,
  prepareModpackUpdate,
  prepareModpackUpdateFromFile,
  prepareModpackUpdateFromUrl,
  remergeModpackUpdate,
  rollbackModpackUpdate,
  type ModpackPrepareResult,
  type PreparedModpackUpdate,
} from "./modpackUpdate";
import { modpackVersionLabel } from "./modpackVersions";
import type { ModpackSourceState } from "./useModpackSource";
import { countFeature } from "@renderer/features/usage/usage";
import {
  skippedJarKeys,
  unknownJarsOf,
  type UnknownJar,
} from "@renderer/features/newInstance/unknownJars";
import {
  skipUnknownJars,
  unknownJarItems,
  updatePresenceItems,
} from "./updateUnknownJars";

const api = window.api;

export type ModpackFlowPhase =
  | "idle"
  | "preparing"
  | "preview"
  | "applying"
  | "rollingBack";

export interface ModpackFlowInput {
  instance: Version;
  state: ModpackSourceState;
  account?: ILocalAccount;
  server?: IServerConf;
  site: string;
  currentLabel: string;
  onUpdated: () => void;
  onApplied?: () => void;
}

export function useModpackUpdateFlow(input: ModpackFlowInput) {
  const { t } = useTranslation();
  const settings = useAtomValue(settingsAtom);
  const paths = useAtomValue(pathsAtom);
  const { instance, state, site } = input;

  const [phase, setPhase] = useState<ModpackFlowPhase>("idle");
  const [stage, setStage] = useState<ModpackDownloadStage>(null);
  const [extractPercent, setExtractPercent] = useState<number | null>(null);
  const [downloadInfo, setDownloadInfo] = useState<DownloaderInfo | null>(null);
  const [prepared, setPrepared] = useState<PreparedModpackUpdate | null>(null);
  const [restoreRemoved, setRestoreRemoved] = useState(false);
  const [blockedPack, setBlockedPack] = useState<{
    blocked: IBlockedMod;
    project: IProject;
    target: IProjectVersion;
  } | null>(null);
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[] | null>(null);
  const [jarCheck, setJarCheck] = useState<{
    checking: boolean;
    unknown: UnknownJar[];
  }>({ checking: false, unknown: [] });
  const [installUnknown, setInstallUnknown] = useState<ReadonlySet<string>>(
    new Set(),
  );

  useEffect(() => {
    if (!prepared) {
      setJarCheck({ checking: false, unknown: [] });
      return;
    }
    const items = updatePresenceItems(prepared);
    if (items.length === 0) {
      setJarCheck({ checking: false, unknown: [] });
      return;
    }
    let cancelled = false;
    setJarCheck((previous) => ({ ...previous, checking: true }));
    void api.modManager
      .catalogPresence(items)
      .catch(ignoreFailure)
      .then((result) => {
        if (cancelled) return;
        setJarCheck({
          checking: false,
          unknown: result
            ? unknownJarsOf(result)
            : items.map((item) => ({ key: item.key, checked: false })),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [prepared]);

  useEffect(() => {
    if (phase !== "preparing") return;
    return api.events.onDownloaderInfo(setDownloadInfo);
  }, [phase]);

  const preparedRoot = prepared?.pack.folderPath;
  useEffect(() => {
    if (!preparedRoot) return;
    return () => {
      void api.fs.rimraf(preparedRoot).catch(ignoreFailure);
    };
  }, [preparedRoot]);

  const report = (
    result: ModpackPrepareResult,
    failedSite = site,
  ): PreparedModpackUpdate | null => {
    switch (result.status) {
      case "ready":
        return result.update;
      case "otherGame":
        toast.error(t("modpack.otherGame", { version: result.gameVersion }), {
          description: t("modpack.otherGameHint"),
        });
        return null;
      case "otherProject":
        toast.error(t("modpack.otherProject", { title: result.title }));
        return null;
      case "notModpack":
        toast.error(t("modManager.notModpack"), {
          description: t("modManager.notModpackHint"),
        });
        return null;
      case "badUrl":
        toast.error(t("modpack.archive.badUrl"), {
          description: t("modpack.archive.urlHint"),
        });
        return null;
      case "noBase":
        toast.error(t("modpack.failed"), {
          description: t("modpack.blocked.noBase"),
        });
        return null;
      case "loaderMissing":
        toast.error(t("modpack.failed"), {
          description: t("modpack.loaderMissing"),
        });
        return null;
      case "failed":
        if (showNotEnoughSpaceToast(t("modpack.failed"), result.error)) {
          return null;
        }
        showFailureToast(t("modpack.failed"), result.error, {
          channels: ["modManager:checkModpack", "file:download", "version:import"],
          fallbackDescription: t("modpack.downloadFailedHint", {
            site: failedSite,
          }),
        });
        return null;
      default:
        return null;
    }
  };

  const showPrepared = (next: PreparedModpackUpdate | null) => {
    setRestoreRemoved(false);
    setInstallUnknown(new Set());
    setPrepared(next);
    setPhase(next ? "preview" : "idle");
  };

  const startPrepare = async (
    project: IProject,
    target: IProjectVersion,
    blockedFilePath?: string,
  ) => {
    setPhase("preparing");
    setDownloadInfo(null);
    try {
      const result = await prepareModpackUpdate({
        instance,
        project,
        target,
        blockedFilePath,
        onStage: setStage,
        onExtractPercent: setExtractPercent,
      });

      if (result.status === "blockedPack") {
        setBlockedPack({ blocked: result.blocked, project, target });
        setPhase("idle");
        return;
      }

      showPrepared(report(result));
    } finally {
      setStage(null);
      setExtractPercent(null);
    }
  };

  const startFromFile = async (
    project?: IProject,
    versions?: IProjectVersion[],
  ) => {
    const picked = await api.other.openFileDialog(false, [
      { name: "Modpack", extensions: ["mrpack", "zip"] },
    ]);
    const filePath = picked?.[0];
    if (!filePath) return;
    countFeature("modpack.fromFile");

    setPhase("preparing");
    setStage("extract");
    try {
      const result = await prepareModpackUpdateFromFile({
        instance,
        project,
        versions,
        filePath,
        tempPath: await api.path.join(paths.launcher, "temp"),
        onExtractPercent: setExtractPercent,
      });
      showPrepared(report(result));
    } finally {
      setStage(null);
      setExtractPercent(null);
    }
  };

  const startFromUrl = async (
    url: string,
    project?: IProject,
    versions?: IProjectVersion[],
  ) => {
    countFeature("modpack.fromUrl");
    setPhase("preparing");
    setDownloadInfo(null);
    try {
      const result = await prepareModpackUpdateFromUrl({
        instance,
        project,
        versions,
        url,
        tempPath: await api.path.join(paths.launcher, "temp"),
        downloadLimit: settings.downloadLimit,
        onStage: setStage,
        onExtractPercent: setExtractPercent,
      });
      let host = url;
      try {
        host = new URL(url).host;
      } catch {}
      showPrepared(report(result, host));
    } finally {
      setStage(null);
      setExtractPercent(null);
    }
  };

  const cancelPreview = () => {
    setPrepared(null);
    setPhase("idle");
  };

  const changeRestoreRemoved = (value: boolean) => {
    if (!prepared) return;
    setRestoreRemoved(value);
    setPrepared(remergeModpackUpdate(prepared, instance.version, value));
  };

  const apply = async (resolved?: IBlockedMod[]) => {
    if (!prepared || !input.account) return;

    setPhase("applying");
    try {
      const outcome = await applyModpackUpdate({
        instance,
        update: skipUnknownJars(
          prepared,
          skippedJarKeys(jarCheck.unknown, installUnknown),
        ),
        account: input.account,
        settings,
        server: input.server,
        resolvedBlocked: resolved,
      });

      if (outcome.status === "blockedMods") {
        setBlockedMods(outcome.blocked);
        setPhase("preview");
        return;
      }

      countFeature("modpack.update");
      const label = modpackVersionLabel(prepared.target);
      if (outcome.extraFilesFailed) {
        toast.warning(t("modpack.doneWithGaps", { version: label }), {
          description: t("newInstance.extraFilesFailedHint"),
        });
      } else {
        toast.success(t("modpack.done", { version: label }), {
          description: t("modpack.doneHint"),
        });
      }

      setPrepared(null);
      setPhase("idle");
      input.onApplied?.();
      state.reload();
      input.onUpdated();
    } catch (error) {
      if (showNotEnoughSpaceToast(t("modpack.failed"), error)) {
        setPhase("preview");
        return;
      }
      showFailureToast(t("modpack.failed"), error, {
        channels: ["modpack:applyFiles", "mods:check", "version:changeLoader"],
        fallbackDescription: t("modpack.failedHint", {
          version: input.currentLabel,
        }),
      });
      setPrepared(null);
      setPhase("idle");
      state.reload();
      input.onUpdated();
    }
  };

  const rollback = async () => {
    if (!input.account) return;

    const previous = state.rollback?.fromVersion ?? "";
    setPhase("rollingBack");
    try {
      const done = await rollbackModpackUpdate({
        instance,
        account: input.account,
        settings,
        server: input.server,
      });
      if (done) {
        countFeature("modpack.rollback");
        toast.success(t("modpack.rollback.done", { version: previous }));
      } else {
        showFailureToast(t("modpack.rollback.failed"), undefined, {
          channels: ["modpack:restoreRollback", "mods:check"],
        });
      }
    } catch (error) {
      showFailureToast(t("modpack.rollback.failed"), error, {
        channels: ["modpack:restoreRollback", "mods:check"],
      });
    } finally {
      setPhase("idle");
      input.onApplied?.();
      state.reload();
      input.onUpdated();
    }
  };

  const resolveBlockedPack = (resolved: IBlockedMod[] | null) => {
    const pending = blockedPack;
    setBlockedPack(null);
    const filePath = resolved?.[0]?.filePath;
    if (pending && filePath) {
      void startPrepare(pending.project, pending.target, filePath);
    }
  };

  const resolveBlockedMods = (resolved: IBlockedMod[] | null) => {
    setBlockedMods(null);
    if (resolved) void apply(resolved);
  };

  const stageText =
    phase === "applying"
      ? t("modpack.stage.apply")
      : phase === "rollingBack"
        ? t("modpack.stage.rollback")
        : stage === "download"
          ? t("modpack.stage.download", {
              percent: Math.round(downloadInfo?.progressPercent ?? 0),
            })
          : stage === "extract"
            ? t("modpack.stage.extract", {
                percent: Math.round(extractPercent ?? 0),
              })
            : phase === "preparing"
              ? t("modpack.stage.plan")
              : null;

  return {
    phase,
    prepared,
    restoreRemoved,
    blockedPack,
    blockedMods,
    stageText,
    startPrepare,
    startFromFile,
    startFromUrl,
    cancelPreview,
    changeRestoreRemoved,
    apply,
    rollback,
    resolveBlockedPack,
    resolveBlockedMods,
    unknownJars: prepared
      ? {
          items: unknownJarItems(prepared, jarCheck.unknown, installUnknown),
          checking: jarCheck.checking,
          onToggleInstall: (key: string, install: boolean) =>
            setInstallUnknown((previous) => {
              const next = new Set(previous);
              if (install) next.add(key);
              else next.delete(key);
              return next;
            }),
        }
      : null,
  };
}

export type ModpackUpdateFlow = ReturnType<typeof useModpackUpdateFlow>;
