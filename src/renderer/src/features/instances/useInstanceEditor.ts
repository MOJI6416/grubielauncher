import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ILocalProject } from "@/types/ModManager";
import { IServerOption } from "@/types/Server";
import type { RunGameParams } from "@renderer/features/launch/types";
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
import { useInstanceContent } from "./useInstanceContent";
import { useInstanceServers } from "./useInstanceServers";
import { updateInstancesFile } from "./instancesStore";
import { createDesktopShortcut } from "./instanceActions";
import { getInstanceActionFlags } from "./instanceActionFlags";
import { isForeignPublication } from "./deleteGates";
import {
  bumpInstanceDataRevision,
  useInstanceDataRevision,
} from "./instanceRevision";
import {
  consumePublishOffer,
  publishOfferKeyAtom,
  requestPublishOffer,
} from "./publishOffer";
import { consumeRenameOffer, renameOfferAtom } from "./renameOffer";
import { formatRunCommandForClipboard } from "./runCommand";
import { readInstanceStatistics } from "./stats";
import {
  hasQuickServerChanged,
  haveArgumentsChanged,
  isRenameRequested,
  repointLocalImage,
  restoreInstanceConf,
  shouldOfferPublish,
  snapshotInstanceConf,
} from "./saveDecisions";
import { useInstanceDraft } from "./useInstanceDraft";
import { useVersionChanges } from "./useVersionChanges";
import { copyWithFeedback } from "@renderer/utilities/copyFeedback";
import { downloadImage } from "@renderer/utilities/imageDownload";
import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";
import { VERSION_FILE_STAGES, contentPlan } from "@/shared/installPlan";
import { loaderChangeErrorKey } from "./loaderUpdate";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { countFeature } from "@renderer/features/usage/usage";

const api = window.api;

export function useInstanceEditor({
  closeModal,
  runGame,
}: {
  closeModal: () => void;
  runGame: (params: RunGameParams) => Promise<void>;
}) {
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
  const renameOffer = useAtomValue(renameOfferAtom);
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
    "check" | "sync" | "content"
  >();
  const blockedResolverRef = useRef<
    ((resolved: IBlockedMod[] | null) => void) | null
  >(null);

  const [statistics, setStatistics] = useState<IVersionStatistics | null>(null);
  const [serverCores, setServerCores] = useState<IServerOption[]>([]);
  const [isServerCreate, setIsServerCreate] = useState(false);
  const [isNotSavedOpen, setIsNotSavedOpen] = useState(false);
  const [isPlayAskOpen, setIsPlayAskOpen] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const [quickConnectIp, setQuickConnectIpState] = useState(
    () => version?.version.quickServer,
  );

  const requestBlockedFiles = useCallback(
    (mods: IBlockedMod[]) =>
      new Promise<IBlockedMod[] | null>((resolve) => {
        blockedResolverRef.current?.(null);
        blockedResolverRef.current = resolve;
        setBlockedMods(mods);
        setBlockedCloseType("content");
        setIsBlockedMods(true);
      }),
    [],
  );

  const refreshPublishDiffRef = useRef<() => void>(() => undefined);

  const content = useInstanceContent({
    version,
    settings,
    server,
    isRunning: isVersionRunning,
    requestBlockedFiles,
    onApplied: () => refreshPublishDiffRef.current(),
  });

  const serverList = useInstanceServers(version, () =>
    refreshPublishDiffRef.current(),
  );

  const share = useShareFlow({
    version,
    account,
    servers: serverList.servers,
    settings,
    minecraftPath: paths.minecraft,
    image: draft.image,
    quickConnectIp,
    closeModal,
    setIsLoading,
    setLoadingType,
    setBlockedMods,
    setIsBlockedMods,
    setBlockedCloseType,
  });
  refreshPublishDiffRef.current = () => void share.refreshPublishDiff();

  const changes = useVersionChanges({
    version,
    runArguments: draft.runArguments,
    isLogoChanged: draft.isLogoChanged,
    overrides: draft.overrides,
    savedRevision,
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
    if (
      (version.version.owner || version.version.ownerId) &&
      account &&
      !isOwnerVersion
    ) {
      return false;
    }
    return true;
  }, [
    version,
    isLoading,
    isInstallActive,
    changes.hasChanges,
    account,
    isOwnerVersion,
  ]);

  async function checkIntegrity(
    resolvedBlockedMods: IBlockedMod[] = blockedMods,
    resolvedMods: ILocalProject[] = content.mods,
  ) {
    if (!version || !account) return;

    setLoadingType("check");
    setIsLoading(true);

    try {
      await content.idle();

      const hasBlockedPaths = applyBlockedModFilePaths(
        resolvedMods,
        resolvedBlockedMods,
      );
      if (hasBlockedPaths) {
        version.version.loader.mods = resolvedMods;
        await version.save();
        setBlockedMods([]);
      }

      const plan = [
        ...VERSION_FILE_STAGES,
        ...contentPlan(version.version.loader.mods, server),
      ];

      await version.install(account, settings, [], {
        operation: "integrity",
        keepProgressOpen: true,
        plan,
      });

      const versionMods = new Mods(settings, version.version, server);
      const repaired = await versionMods.check({
        operation: "integrity",
        plan,
      });
      if (repaired > 0) await version.save();

      toast.success(t("versions.integrityOk"));
    } catch (error) {
      showFailureToast(t("versions.integrityError"), error);
    } finally {
      setIsLoading(false);
      setLoadingType(undefined);
      bumpInstanceDataRevision();
    }
  }

  async function runIntegrityCheck() {
    if (!version) return;
    countFeature("manage.integrity");

    if (!account) {
      toast.error(t("versions.integrityError"), {
        description: t("versions.integrityBlocked.noAccount"),
      });
      return;
    }

    const { blockedMods: b, mods: resolvedMods } = await checkBlockedMods(
      version.version.loader.mods ?? [],
      version.versionPath,
    );
    if (b.length > 0) {
      setBlockedMods(b);
      setIsBlockedMods(true);
      setBlockedCloseType("check");
      return;
    }

    await checkIntegrity(undefined, resolvedMods);
  }

  async function renameInstance(): Promise<boolean> {
    if (!version) return false;

    if (!isRenameRequested(draft.name, version.version.name)) {
      draft.setEditName(false);
      return true;
    }

    if (!isNameValid) return false;

    setLoadingType("rename");
    setIsLoading(true);

    const versionsPath = await api.path.join(paths.minecraft, "versions");
    const oldName = version.version.name;
    const oldPath = version.versionPath;
    const newName = draft.name.trim();
    const newPath = await api.path.join(versionsPath, newName);
    let isMoved = false;

    try {
      await content.idle();

      if (!(await api.fs.rename(oldPath, newPath))) {
        throw new Error("rename failed");
      }
      isMoved = true;

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
        if (!draft.isLogoChanged) draft.setImage(repointed);
      }

      if (!(await version.save())) throw new Error("version save failed");

      const previousKey = oldPath || oldName;
      const renamedKey = version.versionPath || newName;
      updateInstancesFile((file) =>
        renameInstanceKey(file, previousKey, renamedKey),
      );

      draft.setEditName(false);
      bumpInstanceDataRevision();
      remapInstance(previousKey, renamedKey);
      toast.success(t("versions.renamed", { name: newName }));

      if (
        shouldOfferPublish({
          changed: true,
          shareCode: version.version.shareCode,
          isDownloadedVersion: version.version.downloadedVersion,
          isNetwork,
          isVersionRunning,
        })
      ) {
        requestPublishOffer(renamedKey);
      }

      return true;
    } catch (error) {
      if (isMoved) {
        version.version.name = oldName;
        await api.fs.rename(newPath, oldPath).catch(ignoreFailure);
        await version.init().catch(ignoreFailure);
      }

      showFailureToast(t("versions.renameError"), error, {
        channels: ["fs:rename", "version:save"],
      });
      return false;
    } finally {
      setIsLoading(false);
      setLoadingType(undefined);
    }
  }

  function cancelRename() {
    if (!version) return;
    draft.setEditName(false);
    draft.setName(version.version.name);
  }

  async function setQuickConnectIp(ip: string) {
    if (!version) return;
    const previous = version.version.quickServer;
    if (!hasQuickServerChanged(ip, previous)) return;

    const next = ip.trim() || undefined;
    setQuickConnectIpState(next);
    version.version.quickServer = next;

    if (await version.save()) {
      refreshPublishDiffRef.current();
      return;
    }

    version.version.quickServer = previous;
    setQuickConnectIpState(previous);
    if (!reportIpcFailure(t("versions.updateError"), ["version:save"])) {
      showFailureToast(t("versions.updateError"), undefined, {
        channels: ["version:save"],
      });
    }
  }

  async function saveVersion(): Promise<boolean> {
    if (!version) return false;

    let isShare = false;

    setLoadingType("save");
    setIsLoading(true);

    const wasLogoChanged = draft.isLogoChanged;
    const confSnapshot = snapshotInstanceConf(version.version);

    let hasLogoFailure = false;

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
                api.file.fromBuffer((await downloadImage(draft.image)).data),
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
        hasLogoFailure = true;
        showFailureToast(t("versions.logoSaveError"), error, {
          channels: ["fs:copy", "fs:writeFile"],
        });
      }
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

    bumpInstanceDataRevision();
    setSavedRevision((value) => value + 1);

    if (!isConfWriteFailed && !hasLogoFailure) {
      setSavedAt(Date.now());
    }

    void share.refreshPublishDiff();

    draft.setIsLogoChanged(
      hasLogoFailure || (isConfWriteFailed && wasLogoChanged),
    );
    setLoadingType(undefined);
    setIsLoading(false);

    if (
      shouldOfferPublish({
        changed: isShare && !isConfWriteFailed,
        shareCode: version.version.shareCode,
        isDownloadedVersion: version.version.downloadedVersion,
        isNetwork,
        isVersionRunning,
      })
    ) {
      share.setIsOpenModalShare(true);
    }

    return !isConfWriteFailed;
  }

  async function commitSave() {
    await saveVersion();
  }

  function resetDraft() {
    draft.reset();
    setSavedRevision((value) => value + 1);
  }

  async function launch() {
    if (!version) return;
    await content.idle();
    await runGame({ version });
  }

  function requestPlay() {
    if (!version) return;
    if (changes.hasChanges && canSave) {
      setIsPlayAskOpen(true);
      return;
    }
    void launch();
  }

  async function saveAndPlay() {
    setIsPlayAskOpen(false);
    if (await saveVersion()) await launch();
  }

  async function resolveBlockedMods(resolved: IBlockedMod[] | null) {
    setIsBlockedMods(false);

    if (blockedCloseType === "content") {
      const resolve = blockedResolverRef.current;
      blockedResolverRef.current = null;
      setBlockedMods([]);
      setBlockedCloseType(undefined);
      resolve?.(resolved);
      return;
    }

    if (!resolved) {
      share.setSyncModpack(undefined);
      setBlockedCloseType(undefined);
      return;
    }

    setBlockedMods(resolved);

    if (blockedCloseType === "check") await checkIntegrity(resolved);
    if (blockedCloseType === "sync")
      await share.sync(resolved, share.syncModpack);

    share.setSyncModpack(undefined);
    setBlockedCloseType(undefined);
  }

  async function copyRunCommand(isRelative: boolean) {
    if (!version || !account) return;
    countFeature("manage.copyCommand");

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

    await copyWithFeedback(formatRunCommandForClipboard(command));
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
          servers: serverList.servers,
          version: version.version,
          versionPath: version.versionPath,
          logo: version.version.image || draft.image || "",
          quickServer: quickConnectIp,
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

  async function changeLoaderVersion(targetId: string) {
    if (!version || !account || isLoading) return false;
    countFeature("manage.loaderVersion");

    const previousId = version.version.loader.version?.id;

    setLoadingType("loader");
    setIsLoading(true);

    try {
      const next = await version.changeLoader(account, settings, targetId);

      bumpInstanceDataRevision();
      toast.success(t("loaderUpdate.done", { version: next.id }), {
        description: previousId
          ? t("loaderUpdate.doneHint", { version: previousId })
          : undefined,
      });

      void share.refreshPublishDiff();

      if (
        shouldOfferPublish({
          changed: true,
          shareCode: version.version.shareCode,
          isDownloadedVersion: version.version.downloadedVersion,
          isNetwork,
          isVersionRunning,
        })
      ) {
        share.setIsOpenModalShare(true);
      }

      return true;
    } catch (error) {
      const messageKey = loaderChangeErrorKey(error);

      if (
        error instanceof Error &&
        error.message === VERSION_INSTALL_CANCELLED
      ) {
        toast(t("loaderUpdate.cancelled"));
      } else if (messageKey) {
        toast.error(t("loaderUpdate.failed"), { description: t(messageKey) });
      } else {
        showFailureToast(t("loaderUpdate.failed"), error, {
          fallbackDescription: previousId
            ? t("loaderUpdate.failedHint", { version: previousId })
            : undefined,
        });
      }

      return false;
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
    (!!version?.version.owner || !!version?.version.ownerId) &&
    !!account &&
    !isOwnerVersion;

  const isForeignPack = isForeignPublication({
    shareCode: version?.version.shareCode,
    owner: version?.version.owner,
    ownerId: version?.version.ownerId,
    account,
  });

  const flags = getInstanceActionFlags({
    hasVersion: !!version,
    shareCode: version?.version.shareCode,
    downloadedVersion: version?.version.downloadedVersion,
    owner: version?.version.owner,
    ownerId: version?.version.ownerId,
    loaderName: version?.version.loader.name,
    hasAccount: !!account,
    isOwnerVersion,
    versionDiffence: share.versionDiffence,
    hasPublishDiff: share.diffenceUpdateData !== "",
    isInternetOnline,
    isNetwork,
  });

  useEffect(() => {
    if (!version) return;

    const name = consumeRenameOffer(instanceKey(version));
    if (name === null || !flags.canRenameVersion || isVersionRunning) return;

    draft.setName(name);
    draft.setEditName(true);
  }, [version, renameOffer]);

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
    isForeignPack,
    isVersionRunning,
    draft,
    content,
    servers: serverList.servers,
    setServers: serverList.setServers,
    isServersReady: serverList.isReady,
    quickConnectIp,
    setQuickConnectIp,
    changes,
    share,
    flags,
    statistics,
    isLoading,
    loadingType,
    savedAt,
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
    isPlayAskOpen,
    closePlayAsk: () => setIsPlayAskOpen(false),
    requestPlay,
    saveAndPlay,
    forgetInstance,
    commitSave,
    resetDraft,
    renameInstance,
    cancelRename,
    runIntegrityCheck,
    copyRunCommand,
    createShortcut,
    installServer,
    confirmPublicUpdate,
    changeLoaderVersion,
  };
}
