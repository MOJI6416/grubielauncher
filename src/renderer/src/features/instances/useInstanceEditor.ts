import { useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import axios from "axios";
import { ILocalProject } from "@/types/ModManager";
import { IServerOption } from "@/types/Server";
import { IVersionStatistics } from "@/types/VersionStatistics";
import { renameInstanceKey } from "@/shared/instancesFile";
import { resolveInstanceSettings } from "@/shared/instanceSettings";
import {
  accountAtom,
  authDataAtom,
  consolesAtom,
  consolesMetaAtom,
  installActiveAtom,
  internetAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  networkAtom,
  pathsAtom,
  selectedVersionAtom,
  serverAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { Mods } from "@renderer/classes/Mods";
import {
  applyBlockedModFilePaths,
  checkBlockedMods,
  IBlockedMod,
} from "@renderer/components/Modals/BlockedMods";
import { registerNavigationBlocker } from "@renderer/navigation/guards";
import {
  cancelPendingNavigation,
  confirmPendingNavigation,
  remapInstance,
} from "@renderer/navigation/navigate";
import { pendingNavigationAtom } from "@renderer/navigation/store";
import { holdBusy } from "@renderer/utilities/busy";
import {
  reportIpcFailure,
  showFailureToast,
} from "@renderer/utilities/failures";
import {
  getLocalPathFromFileUrl,
  toFileUrl,
} from "@renderer/utilities/exportVersion";
import { checkDiffenceUpdateData } from "@renderer/utilities/version";
import {
  checkInstanceName,
  type InstanceNameCheck,
} from "@renderer/features/newInstance/nameValidation";
import { useShareFlow } from "@renderer/features/share/useShareFlow";
import type { InstanceLoadingType } from "@renderer/features/share/useShareFlow";
import { instanceFlagsAtom } from "./atoms";
import { instanceKey } from "./selectors";
import { sameOverrides } from "./instanceOverview";
import { updateInstancesFile } from "./instancesStore";
import { createDesktopShortcut } from "./instanceActions";
import { getInstanceActionFlags } from "./instanceActionFlags";
import {
  bumpInstanceDataRevision,
  useInstanceDataRevision,
} from "./instanceRevision";
import {
  consumePublishOffer,
  publishOfferKeyAtom,
  requestPublishOffer,
} from "./publishOffer";
import { readInstanceServers } from "./instanceServers";
import { formatRunCommandForClipboard } from "./runCommand";
import { readInstanceStatistics } from "./stats";
import {
  hasQuickServerChanged,
  haveArgumentsChanged,
  isRenameRequested,
  mergeExternalServers,
  repointLocalImage,
  restoreInstanceConf,
  shouldOfferPublish,
  snapshotInstanceConf,
} from "./saveDecisions";
import { useInstanceDraft } from "./useInstanceDraft";
import { useVersionChanges } from "./useVersionChanges";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const api = window.api;

export function useInstanceEditor({ closeModal }: { closeModal: () => void }) {
  const { t } = useTranslation();

  const [version, setVersion] = useAtom(selectedVersionAtom);
  const versions = useAtomValue(versionsAtom);
  const account = useAtomValue(accountAtom);
  const settings = useAtomValue(settingsAtom);
  const authData = useAtomValue(authDataAtom);
  const paths = useAtomValue(pathsAtom);
  const [server, setServer] = useAtom(serverAtom);
  const isNetwork = useAtomValue(networkAtom);
  const isInternetOnline = useAtomValue(internetAtom);
  const isInstallActive = useAtomValue(installActiveAtom);
  const isDownloadedVersion = useAtomValue(isDownloadedVersionAtom);
  const isOwnerVersion = useAtomValue(isOwnerVersionAtom);
  const pendingNavigation = useAtomValue(pendingNavigationAtom);
  const consoleMetas = useAtomValue(consolesMetaAtom);
  const publishOfferKey = useAtomValue(publishOfferKeyAtom);
  const setConsoles = useSetAtom(consolesAtom);
  const setInstanceFlags = useSetAtom(instanceFlagsAtom);

  const isVersionRunning = useMemo(
    () =>
      !!version &&
      consoleMetas.some(
        (meta) =>
          meta.versionName === version.version.name &&
          meta.status === "running",
      ),
    [consoleMetas, version],
  );

  const draft = useInstanceDraft(version);
  const dataRevision = useInstanceDataRevision();

  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<InstanceLoadingType>();
  const shortcutRef = useRef(false);

  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([]);
  const [isBlockedMods, setIsBlockedMods] = useState(false);
  const [blockedCloseType, setBlockedCloseType] = useState<
    "save" | "check" | "sync"
  >();

  const [statistics, setStatistics] = useState<IVersionStatistics | null>(null);
  const [serverCores, setServerCores] = useState<IServerOption[]>([]);
  const [isServerCreate, setIsServerCreate] = useState(false);
  const [isNotSavedOpen, setIsNotSavedOpen] = useState(false);

  const share = useShareFlow({
    version,
    account,
    servers: draft.servers,
    settings,
    minecraftPath: paths.minecraft,
    image: draft.image,
    quickConnectIp: draft.quickConnectIp,
    closeModal,
    setIsLoading,
    setLoadingType,
    setBlockedMods,
    setIsBlockedMods,
    setBlockedCloseType,
  });

  const changes = useVersionChanges({
    version,
    versionName: draft.name,
    mods: draft.mods,
    servers: draft.servers,
    nbtServers: draft.nbtServers,
    runArguments: draft.runArguments,
    isLogoChanged: draft.isLogoChanged,
    quickConnectIp: draft.quickConnectIp,
    overrides: draft.overrides,
    isLoading,
    isReady: draft.isReady,
  });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!version) {
        setStatistics(null);
        return;
      }

      const loaded = await readInstanceStatistics(version);
      if (!cancelled) setStatistics(loaded.statistics);
    };

    check();

    return () => {
      cancelled = true;
    };
  }, [version?.versionPath, dataRevision]);

  const routeId = version ? instanceKey(version) : null;

  useEffect(() => {
    return registerNavigationBlocker(
      "instance-editor",
      (target) =>
        changes.hasChanges &&
        !isLoading &&
        !(target?.name === "instance" && target.id === routeId),
    );
  }, [changes.hasChanges, isLoading, routeId]);

  useEffect(() => {
    if (pendingNavigation) setIsNotSavedOpen(true);
  }, [pendingNavigation]);

  useEffect(() => {
    if (!version || !consumePublishOffer(instanceKey(version))) return;

    share.setIsOpenModalShare(true);
  }, [version, publishOfferKey]);

  const nameCheck = useMemo<InstanceNameCheck>(() => {
    if (!version) {
      return { ok: false, issue: "empty", characters: [], suggestion: "" };
    }

    const current = version.version.name;
    if (draft.name.trim() === current) {
      return { ok: true, issue: null, characters: [], suggestion: "" };
    }

    return checkInstanceName(
      draft.name,
      versions
        .map((item) => item.version.name)
        .filter((name) => name !== current),
    );
  }, [version, draft.name, versions]);

  const isNameValid = nameCheck.ok;

  const canSave = useMemo(() => {
    if (!version) return false;
    if (isLoading || isInstallActive) return false;
    if (!changes.hasChanges) return false;
    if (!isNameValid) return false;
    if (version.version.owner && account && !isOwnerVersion) {
      return changes.hasOnlyDownloadedRename;
    }
    return true;
  }, [
    version,
    isLoading,
    isInstallActive,
    changes.hasChanges,
    isNameValid,
    account,
    isOwnerVersion,
    changes.hasOnlyDownloadedRename,
  ]);

  async function checkIntegrity(
    resolvedBlockedMods: IBlockedMod[] = blockedMods,
    resolvedMods: ILocalProject[] = draft.mods,
  ) {
    if (!version || !account) return;

    setLoadingType("check");
    setIsLoading(true);

    try {
      const hasBlockedPaths = applyBlockedModFilePaths(
        resolvedMods,
        resolvedBlockedMods,
      );
      if (hasBlockedPaths) {
        version.version.loader.mods = resolvedMods;
        await version.save();
        setBlockedMods([]);
      }

      await version.install(account, settings, [], { operation: "integrity" });

      const versionMods = new Mods(settings, version.version, server);
      await versionMods.check();

      toast.success(t("versions.integrityOk"));
    } catch (error) {
      showFailureToast(t("versions.integrityError"), error);
    } finally {
      setIsLoading(false);
      setLoadingType(undefined);
    }
  }

  async function runIntegrityCheck() {
    if (!version) return;

    if (!account) {
      toast.error(t("versions.integrityError"), {
        description: t("versions.integrityBlocked.noAccount"),
      });
      return;
    }

    const { blockedMods: b, mods: resolvedMods } = await checkBlockedMods(
      draft.mods,
      version.versionPath,
    );
    if (resolvedMods !== draft.mods) draft.setMods(resolvedMods);
    if (b.length > 0) {
      setBlockedMods(b);
      setIsBlockedMods(true);
      setBlockedCloseType("check");
      return;
    }

    await checkIntegrity(undefined, resolvedMods);
  }

  async function saveVersion(
    resolvedBlockedMods: IBlockedMod[] = blockedMods,
    resolvedMods: ILocalProject[] = draft.mods,
  ) {
    if (!version) return;

    let isShare = false;

    setLoadingType("save");
    setIsLoading(true);

    let isRename = false;
    let renamedKey = "";
    let previousKey = "";
    const previousImage = version.version.image ?? "";
    const oldPath = version.versionPath;
    if (isRenameRequested(draft.name, version.version.name)) {
      const versionsPath = await api.path.join(paths.minecraft, "versions");
      const oldName = version.version.name;

      const newName = draft.name.trim();
      const newPath = await api.path.join(versionsPath, newName);

      try {
        if (!(await api.fs.rename(version.versionPath, newPath))) {
          throw new Error("rename failed");
        }

        isRename = true;

        setConsoles((prev) => ({
          consoles: prev.consoles.filter((c) => c.versionName !== oldName),
        }));

        version.version.name = newName;
        await version.init();

        const repointed = repointLocalImage(
          version.version.image,
          oldPath,
          version.versionPath,
        );
        if (repointed) {
          version.version.image = repointed;
          draft.setImage(repointed);
        }

        previousKey = oldPath || oldName;
        renamedKey = version.versionPath || newName;
        updateInstancesFile((file) =>
          renameInstanceKey(file, previousKey, renamedKey),
        );

        isShare = true;
      } catch (error) {
        if (isRename) {
          version.version.name = oldName;
          await api.fs.rename(newPath, oldPath).catch(() => {});
          await version.init().catch(() => {});
        }

        showFailureToast(t("versions.renameError"), error, {
          channels: ["fs:rename"],
        });

        setIsLoading(false);
        setLoadingType(undefined);
        return;
      } finally {
        draft.setEditName(false);
      }
    }

    const wasLogoChanged = draft.isLogoChanged;
    const confSnapshot = snapshotInstanceConf(version.version);

    try {
      const hasBlockedPaths = applyBlockedModFilePaths(
        resolvedMods,
        resolvedBlockedMods,
      );
      const hasModsChanged = !(await api.modManager.compareMods(
        version.version.loader.mods || [],
        resolvedMods,
      ));

      if (hasModsChanged || hasBlockedPaths) {
        const previousMods = version.version.loader.mods;
        version.version.loader.mods = resolvedMods;

        try {
          const versionMods = new Mods(settings, version.version, server);
          if (isVersionRunning) await versionMods.syncLive();
          else await versionMods.check();
        } catch (error) {
          version.version.loader.mods = previousMods;
          throw error;
        }

        isShare = true;
        setBlockedMods([]);
      }
    } catch (error) {
      if (isRename) {
        version.version.name = await api.path.basename(oldPath);
        await api.fs.rename(version.versionPath, oldPath).catch(() => {});
        await version.init().catch(() => {});

        version.version.image = previousImage;
        draft.setImage(previousImage);
        updateInstancesFile((file) =>
          renameInstanceKey(file, renamedKey, previousKey),
        );
      }

      showFailureToast(t("versions.updateError"), error);
      setIsLoading(false);
      setLoadingType(undefined);
      return;
    }

    let hasPartialFailure = false;
    let hasLogoFailure = false;

    if (version.version.version.serverManager && draft.isReady) {
      try {
        const serversPath = await api.path.join(
          version.versionPath,
          "servers.dat",
        );

        if (!(await api.servers.compare(draft.nbtServers, draft.servers))) {
          const stored = await readInstanceServers(version.versionPath);
          if (!stored) throw new Error("servers read failed");

          const merged = mergeExternalServers(
            draft.servers,
            stored,
            draft.nbtServers,
          );

          if (!(await api.servers.write(merged, serversPath))) {
            throw new Error("servers write failed");
          }

          draft.setServers(merged);
          draft.setNbtServers([...merged]);
          isShare = true;
        }
      } catch (error) {
        hasPartialFailure = true;
        showFailureToast(t("versions.serversSaveError"), error, {
          channels: ["servers:write", "servers:read"],
          fallbackDescription: t("versions.serversSaveErrorHint"),
        });
      }
    }

    version.version.lastUpdate = new Date();

    if (!sameOverrides(draft.overrides, version.version.overrides)) {
      version.version.overrides = draft.overrides;
    }

    if (
      haveArgumentsChanged(draft.runArguments, version.version.runArguments)
    ) {
      version.version.runArguments = { ...draft.runArguments };
      isShare = true;
    }

    if (!isDownloadedVersion && draft.isLogoChanged) {
      try {
        const filename = "logo.png";
        const filePath = await api.path.join(version.versionPath, filename);

        let fileUrl = "";
        if (draft.image) {
          const isWritten = draft.image.startsWith("file://")
            ? await api.fs.copy(getLocalPathFromFileUrl(draft.image), filePath)
            : await api.fs.writeFile(
                filePath,
                api.file.fromBuffer(
                  (
                    await axios.get(draft.image, {
                      responseType: "arraybuffer",
                    })
                  ).data,
                ),
                "binary",
              );

          if (!isWritten) throw new Error("logo write failed");

          fileUrl = toFileUrl(filePath);
          draft.setImage(fileUrl);
        } else {
          await api.fs.rimraf(filePath);
        }

        version.version.image = fileUrl;
        isShare = true;
      } catch (error) {
        hasPartialFailure = true;
        hasLogoFailure = true;
        showFailureToast(t("versions.logoSaveError"), error, {
          channels: ["fs:copy", "fs:writeFile"],
        });
      }
    }

    if (
      hasQuickServerChanged(draft.quickConnectIp, version.version.quickServer)
    ) {
      version.version.quickServer = draft.quickConnectIp;
      isShare = true;
    }

    const isConfWriteFailed = !(await version.save());

    if (isConfWriteFailed) {
      restoreInstanceConf(version.version, confSnapshot);

      if (!reportIpcFailure(t("versions.updateError"), ["version:save"])) {
        showFailureToast(t("versions.updateError"), undefined, {
          channels: ["version:save"],
        });
      }
    }

    draft.setPendingRemovedLocalMods([]);

    try {
      await api.fs.rimraf(await api.path.join(version.versionPath, "temp"));
    } catch {}

    bumpInstanceDataRevision();

    if (!isConfWriteFailed && !hasPartialFailure) {
      toast.success(t("versions.updated"));
    }

    void share.refreshPublishDiff();

    draft.setIsLogoChanged(
      hasLogoFailure || (isConfWriteFailed && wasLogoChanged),
    );
    setLoadingType(undefined);
    setIsLoading(false);

    if (isRename) remapInstance(previousKey, renamedKey);

    if (
      shouldOfferPublish({
        changed: isShare && !isConfWriteFailed,
        shareCode: version.version.shareCode,
        isDownloadedVersion: version.version.downloadedVersion,
        isNetwork,
        isVersionRunning,
      })
    ) {
      if (isRename) requestPublishOffer(renamedKey);
      else share.setIsOpenModalShare(true);
    }
  }

  async function commitSave() {
    if (!version) return;

    const { blockedMods: b, mods: resolvedMods } = await checkBlockedMods(
      draft.mods,
      version.versionPath,
    );
    if (resolvedMods !== draft.mods) draft.setMods(resolvedMods);
    if (b.length > 0) {
      setBlockedMods(b);
      setIsBlockedMods(true);
      setBlockedCloseType("save");
      return;
    }

    await saveVersion(undefined, resolvedMods);
  }

  async function resolveBlockedMods(resolved: IBlockedMod[] | null) {
    setIsBlockedMods(false);

    if (!resolved) {
      share.setSyncModpack(undefined);
      setBlockedCloseType(undefined);
      return;
    }

    setBlockedMods(resolved);

    if (blockedCloseType === "save") await saveVersion(resolved);
    if (blockedCloseType === "check") await checkIntegrity(resolved);
    if (blockedCloseType === "sync")
      await share.sync(resolved, share.syncModpack);

    share.setSyncModpack(undefined);
    setBlockedCloseType(undefined);
  }

  async function copyRunCommand(isRelative: boolean) {
    if (!version || !account) return;

    const command = await api.version.getRunCommand(
      account,
      resolveInstanceSettings(settings, draft.overrides),
      { ...version.version, runArguments: draft.runArguments },
      authData,
      isRelative,
    );

    if (!command) {
      if (
        !reportIpcFailure(t("versions.runCommandError"), [
          "version:getRunCommand",
        ])
      ) {
        toast.error(t("versions.runCommandError"), {
          description: t("versions.runCommandErrorHint"),
        });
      }
      return;
    }

    if (!(await copyToClipboard(formatRunCommandForClipboard(command)))) return;
    toast(t("common.copied"));
  }

  async function createShortcut() {
    if (!version || isLoading || shortcutRef.current) return;

    shortcutRef.current = true;
    const startedAt = Date.now();
    setLoadingType("shortcut");
    setIsLoading(true);

    try {
      await createDesktopShortcut(version, t);
    } finally {
      await holdBusy(startedAt);
      shortcutRef.current = false;
      setIsLoading(false);
      setLoadingType(undefined);
    }
  }

  async function installServer(onExisting: () => void) {
    if (!version) return;

    if (server) {
      onExisting();
      return;
    }

    setLoadingType("server");
    setIsLoading(true);

    const cores = await api.servers.get(
      version.version.version.id,
      version.version.loader.name,
    );

    if (!cores.length) {
      setIsLoading(false);
      setLoadingType(undefined);
      if (
        !reportIpcFailure(t("versions.serverCoreLoadError"), ["servers:get"])
      ) {
        toast.error(t("versions.notFoundServerCore"));
      }
      return;
    }

    setServerCores(cores);
    setIsServerCreate(true);

    setIsLoading(false);
    setLoadingType(undefined);
  }

  function closeServerCreate(isSuccess?: boolean) {
    setIsServerCreate(false);
    if (!isSuccess || !version) return;

    const key = instanceKey(version);
    setInstanceFlags((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? { hasStatistics: false }),
        hasServer: true,
      },
    }));
  }

  async function confirmPublicUpdate() {
    if (!account || !version || !version.version.shareCode) return;

    try {
      setIsLoading(true);
      setLoadingType("check_diff");

      const modpackData = await api.backend.getModpack(
        account.accessToken!,
        version.version.shareCode,
      );
      if (!modpackData.data) throw new Error("not found modpack");

      const diff = await checkDiffenceUpdateData(
        {
          mods: version.version.loader.mods,
          runArguments: version.version.runArguments || {
            game: "",
            jvm: "",
          },
          servers: draft.servers,
          version: version.version,
          versionPath: version.versionPath,
          logo: version.version.image || draft.image || "",
          quickServer: draft.quickConnectIp,
        },
        account.accessToken || "",
        modpackData.data,
      );

      if (!diff) {
        share.setIsOpenModalShare(false);
        share.setDiffenceUpdateData("");
        share.setVersionDiffence("sync");
        throw new Error("not found diff");
      }

      share.setDiffenceUpdateData(diff);
      share.setTempModpack(modpackData.data);
      share.setIsOpenModalShare(false);
      share.setShareType("update");
      share.setShareModal(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== "not found diff") {
        showFailureToast(t("versions.updateError"), error);
      }
    } finally {
      setIsLoading(false);
      setLoadingType(undefined);
    }
  }

  function closeNotSaved() {
    setIsNotSavedOpen(false);
  }

  function keepEditing() {
    setIsNotSavedOpen(false);
    cancelPendingNavigation();
  }

  function discardChanges() {
    setIsNotSavedOpen(false);
    if (pendingNavigation) confirmPendingNavigation();
    else closeModal();
  }

  function forgetInstance() {
    setVersion(undefined);
  }

  const isForeignInstance =
    !!version?.version.owner && !!account && !isOwnerVersion;

  const flags = getInstanceActionFlags({
    hasVersion: !!version,
    shareCode: version?.version.shareCode,
    downloadedVersion: version?.version.downloadedVersion,
    owner: version?.version.owner,
    loaderName: version?.version.loader.name,
    hasAccount: !!account,
    isOwnerVersion,
    versionDiffence: share.versionDiffence,
    hasPublishDiff: share.diffenceUpdateData !== "",
    isInternetOnline,
    isNetwork,
  });

  return {
    version,
    account,
    settings,
    server,
    setServer,
    isNetwork,
    isInternetOnline,
    isInstallActive,
    isOwnerVersion,
    isForeignInstance,
    isVersionRunning,
    draft,
    changes,
    share,
    flags,
    statistics,
    isLoading,
    loadingType,
    nameCheck,
    isNameValid,
    canSave,
    blockedMods,
    isBlockedMods,
    resolveBlockedMods,
    serverCores,
    isServerCreate,
    closeServerCreate,
    isNotSavedOpen,
    closeNotSaved,
    keepEditing,
    discardChanges,
    forgetInstance,
    commitSave,
    runIntegrityCheck,
    copyRunCommand,
    createShortcut,
    installServer,
    confirmPublicUpdate,
  };
}
