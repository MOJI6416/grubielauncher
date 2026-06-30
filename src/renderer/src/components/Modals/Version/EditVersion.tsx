import { ILocalProject } from "@/types/ModManager";
import {
  accountAtom,
  authDataAtom,
  consolesAtom,
  installActiveAtom,
  internetAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  manualOrderAtom,
  networkAtom,
  pathsAtom,
  selectedVersionAtom,
  serverAtom,
  settingsAtom,
  versionsAtom,
  versionServersAtom,
} from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import { Suspense, useEffect, useMemo, useState } from "react";
import { IArguments } from "@/types/IArguments";
import { useTranslation } from "react-i18next";
import {
  Boxes,
  CloudCog,
  CloudDownload,
  CopyCheck,
  CopySlash,
  Earth,
  Folder,
  FolderArchive,
  Globe,
  Loader2,
  Save,
  ScanLine,
  Server,
  ServerCog,
  Settings,
  Share2,
  SquareTerminal,
  Trash,
  Rocket,
  Wrench,
} from "lucide-react";
import { SiCurseforge, SiModrinth } from "react-icons/si";
import { VersionDiffence } from "@renderer/components/Versions";
import { IServerOption } from "@/types/Server";
import { CreateServer } from "../../ServerControl/Create";
import { Confirmation } from "../Confirmation";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  applyBlockedModFilePaths,
  BlockedMods,
  checkBlockedMods,
  IBlockedMod,
} from "../BlockedMods";
import { IServer } from "@/types/ServersList";
import type { RunGameParams } from "@renderer/App";
import {
  checkDiffenceUpdateData,
  checkVersionName,
} from "@renderer/utilities/version";
import { renameVersionOrganizeKey } from "@renderer/utilities/versionOrganize";
import {
  getLocalPathFromFileUrl,
  toFileUrl,
} from "@renderer/utilities/exportVersion";
import { Mods } from "@renderer/classes/Mods";
import axios from "axios";
import { toast } from "sonner";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import {
  lazyWithPreload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";
import { formatRunCommandForClipboard } from "./editVersionRunCommand";
import { getEditVersionFlags } from "./editVersionFlags";
import { useVersionChanges } from "./useVersionChanges";
import { useShareFlow } from "./useShareFlow";
import { VersionHeaderCard } from "./VersionHeaderCard";

const api = window.api;

const loadServers = () =>
  import("@renderer/components/ServerList/Servers").then((module) => ({
    default: module.Servers,
  }));
const loadShareModal = () =>
  import("@renderer/components/Modals/Version/Share/Share").then((module) => ({
    default: module.Share,
  }));
const loadExport = () =>
  import("@renderer/components/Export").then((module) => ({
    default: module.Export,
  }));
const loadImageCropper = () =>
  import("@renderer/components/ImageCropper").then((module) => ({
    default: module.ImageCropper,
  }));
const loadModManager = () =>
  import("@renderer/components/ModManager/ModManager").then((module) => ({
    default: module.ModManager,
  }));
const loadArguments = () =>
  import("@renderer/components/Arguments").then((module) => ({
    default: module.Arguments,
  }));
const loadServerControl = () =>
  import("@renderer/components/ServerControl/Control").then((module) => ({
    default: module.ServerControl,
  }));
const loadDeleteVersion = () =>
  import("./DeleteVersion").then((module) => ({
    default: module.DeleteVersion,
  }));
const loadWorlds = () =>
  import("@renderer/components/Worlds/WorldsModal").then((module) => ({
    default: module.Worlds,
  }));

const LazyServers = lazyWithPreload(loadServers);
const LazyShareModal = lazyWithPreload(loadShareModal);
const LazyExport = lazyWithPreload(loadExport);
const LazyImageCropper = lazyWithPreload(loadImageCropper);
const LazyModManager = lazyWithPreload(loadModManager);
const LazyArguments = lazyWithPreload(loadArguments);
const LazyServerControl = lazyWithPreload(loadServerControl);
const LazyDeleteVersion = lazyWithPreload(loadDeleteVersion);
const LazyWorlds = lazyWithPreload(loadWorlds);

export function EditVersion({
  closeModal,
  vd,
  runGame,
}: {
  closeModal: () => void;
  vd?: VersionDiffence;
  runGame: (params: RunGameParams) => Promise<void>;
}) {
  const [account] = useAtom(accountAtom);
  const [version, setVersion] = useAtom(selectedVersionAtom);
  const [versions] = useAtom(versionsAtom);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<
    "save" | "check_diff" | "sync" | "server" | "check"
  >();

  const [notSavedModal, setNotSavedModal] = useState(false);
  const [servers, setServers] = useState<IServer[]>([]);
  const [nbtServers, setNbtServers] = useAtom(versionServersAtom);

  const [versionName, setVersionName] = useState("");
  const [mods, setMods] = useState<ILocalProject[]>([]);
  const [pendingRemovedLocalMods, setPendingRemovedLocalMods] = useState<
    ILocalProject[]
  >([]);
  const [runArguments, setRunArguments] = useState<IArguments>({
    game: "",
    jvm: "",
  });
  const [image, setImage] = useState("");
  const [editName, setEditName] = useState(false);

  const [isCropping, setIsCropping] = useState(false);
  const [croppedImage, setCroppedImage] = useState("");

  const [isServers, setIsServers] = useState(false);
  const [isModManager, setIsModManager] = useState(false);

  const [isNetwork] = useAtom(networkAtom);
  const [isOpenArguments, setIsOpenArguments] = useState(false);

  const [paths] = useAtom(pathsAtom);
  const [isOpenDel, setIsOpenDel] = useState(false);

  const [settings] = useAtom(settingsAtom);
  const [server, setServer] = useAtom(serverAtom);

  const [isOpenExportModal, setIsOpenExportModal] = useState(false);

  const [isServerManager, setIsServerManager] = useState(false);
  const [serverCores, setServerCores] = useState<IServerOption[]>([]);
  const [isServerCreate, setIsServerCreate] = useState(false);

  const [isInternetOnline] = useAtom(internetAtom);
  const [isInstallActive] = useAtom(installActiveAtom);
  const [isDownloadedVersion] = useAtom(isDownloadedVersionAtom);
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom);
  const setManualOrder = useAtom(manualOrderAtom)[1];

  const { t } = useTranslation();

  const [isLogoChanged, setIsLogoChanged] = useState(false);
  const [quickConnectIp, setQuickConnectIp] = useState<string>();

  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([]);
  const [isBlockedMods, setIsBlockedMods] = useState(false);
  const [blockedCloseType, setBlockedCloseType] = useState<
    "save" | "check" | "sync"
  >();

  const [authData] = useAtom(authDataAtom);
  const [, setConsoles] = useAtom(consolesAtom);

  const [isOpenWorlds, setIsOpenWorlds] = useState(false);

  const {
    isOpenShareModal,
    setIsOpenModalShare,
    shareType,
    setShareType,
    isShareModal,
    setShareModal,
    versionDiffence,
    setVersionDiffence,
    diffenceUpdateData,
    setDiffenceUpdateData,
    tempModpack,
    setTempModpack,
    syncModpack,
    setSyncModpack,
    sync,
    openShareManagement,
  } = useShareFlow({
    version,
    account,
    servers,
    settings,
    minecraftPath: paths.minecraft,
    image,
    quickConnectIp,
    closeModal,
    setIsLoading,
    setLoadingType,
    setBlockedMods,
    setIsBlockedMods,
    setBlockedCloseType,
  });

  const { hasChanges, setHasChanges, hasOnlyDownloadedRename } =
    useVersionChanges({
      version,
      versionName,
      mods,
      servers,
      nbtServers,
      runArguments,
      isLogoChanged,
      quickConnectIp,
      isLoading,
    });

  const [hasSaves, setHasSaves] = useState(false);
  const [isCheckingSaves, setIsCheckingSaves] = useState(false);

  useEffect(() => {
    (async () => {
      if (!version) return;

      setImage(version.version.image);
      setVersionName(version.version.name);
      setMods(version.version.loader.mods || []);
      setPendingRemovedLocalMods([]);
      setRunArguments(version.version.runArguments || { game: "", jvm: "" });
      setServers(version.version.version.serverManager ? nbtServers : []);
      setQuickConnectIp(version.version.quickServer);
      setIsLogoChanged(false);
      setEditName(false);

      vd && setVersionDiffence(vd);
    })();
  }, []);

  useEffect(() => {
    return schedulePreload(
      [
        LazyServers.preload,
        LazyShareModal.preload,
        LazyExport.preload,
        LazyImageCropper.preload,
        LazyModManager.preload,
        LazyArguments.preload,
        LazyServerControl.preload,
        LazyDeleteVersion.preload,
        LazyWorlds.preload,
      ],
      900,
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!version) {
        setHasSaves(false);
        return;
      }

      setIsCheckingSaves(true);
      try {
        const worldsPath = await api.path.join(version.versionPath, "saves");
        const exists = await api.fs.pathExists(worldsPath);
        if (!cancelled) setHasSaves(exists);
      } catch {
        if (!cancelled) setHasSaves(false);
      } finally {
        if (!cancelled) setIsCheckingSaves(false);
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, [version?.versionPath]);

  const isNameValid = useMemo(() => {
    if (!version) return false;
    const next = versionName.trim();
    const current = version.version.name;
    if (next === current) return true;
    return checkVersionName(
      next,
      versions.map((v) => v.version),
      version.version,
    );
  }, [version, versionName, versions]);

  const canSave = useMemo(() => {
    if (!version) return false;
    if (isLoading) return false;
    if (!hasChanges) return false;
    if (!isNameValid) return false;
    if (version.version.owner && account && !isOwnerVersion) {
      return hasOnlyDownloadedRename;
    }
    return true;
  }, [
    version,
    isLoading,
    hasChanges,
    isNameValid,
    account,
    isOwnerVersion,
    hasOnlyDownloadedRename,
  ]);

  async function checkIntegrity(
    resolvedBlockedMods: IBlockedMod[] = blockedMods,
  ) {
    if (!version || !account) return;

    setLoadingType("check");
    setIsLoading(true);

    try {
      const hasBlockedPaths = applyBlockedModFilePaths(
        mods,
        resolvedBlockedMods,
      );
      if (hasBlockedPaths) {
        version.version.loader.mods = mods;
        await version.save();
        setBlockedMods([]);
      }

      await version.install(account, settings, [], { operation: "integrity" });

      const versionMods = new Mods(settings, version.version, server);
      await versionMods.check();

      toast.success(t("versions.integrityOk"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      toast.error(t("versions.integrityError"), { description: message });
    } finally {
      setIsLoading(false);
      setLoadingType(undefined);
    }
  }

  async function saveVersion(resolvedBlockedMods: IBlockedMod[] = blockedMods) {
    if (!version) return;

    let isShare = false;

    setLoadingType("save");
    setIsLoading(true);

    let isRename = false;
    const oldPath = version.versionPath;
    if (versionName.trim() !== version.version.name) {
      const versionsPath = await api.path.join(paths.minecraft, "versions");
      const oldName = version.version.name;

      const newName = versionName.trim();
      const newPath = await api.path.join(versionsPath, newName);

      try {
        await api.fs.rename(version.versionPath, newPath);

        isRename = true;

        setConsoles((prev) => ({
          consoles: prev.consoles.filter((c) => c.versionName !== oldName),
        }));

        version.version.name = newName;
        await version.init();

        const img = version.version.image;
        if (img && img.startsWith("file://")) {
          const newVersionPath = version.versionPath;
          const variants: [string, string][] = [
            [oldPath, newVersionPath],
            [oldPath.replace(/\\/g, "/"), newVersionPath.replace(/\\/g, "/")],
            [
              encodeURI(oldPath.replace(/\\/g, "/")),
              encodeURI(newVersionPath.replace(/\\/g, "/")),
            ],
          ];
          const match = variants.find(([from]) => from && img.includes(from));
          if (match) {
            const repointed = img.replace(match[0], match[1]);
            version.version.image = repointed;
            setImage(repointed);
          }
        }

        setManualOrder(
          renameVersionOrganizeKey(
            oldPath || oldName,
            version.versionPath || newName,
          ),
        );

        isShare = true;
      } catch {
        if (isRename) {
          version.version.name = oldName;
          await api.fs.rename(newPath, oldPath).catch(() => {});
          await version.init().catch(() => {});
        }

        toast.error(t("versions.renameError"));

        setIsLoading(false);
        setLoadingType(undefined);

        setHasChanges(false);
        return;
      } finally {
        setEditName(false);
      }
    }

    try {
      const hasBlockedPaths = applyBlockedModFilePaths(
        mods,
        resolvedBlockedMods,
      );
      const hasModsChanged = !(await api.modManager.compareMods(
        version.version.loader.mods || [],
        mods,
      ));

      if (hasModsChanged || hasBlockedPaths) {
        const previousMods = version.version.loader.mods;
        version.version.loader.mods = mods;

        try {
          const versionMods = new Mods(settings, version.version, server);
          await versionMods.check();
        } catch (error) {
          version.version.loader.mods = previousMods;
          throw error;
        }

        isShare = true;
        setBlockedMods([]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (isRename) {
        version.version.name = await api.path.basename(oldPath);
        await api.fs.rename(version.versionPath, oldPath).catch(() => {});
        await version.init().catch(() => {});
      }

      toast.error(t("versions.updateError"), { description: message });
      setIsLoading(false);
      setLoadingType(undefined);
      return;
    }

    if (version.version.version.serverManager) {
      try {
        const serversPath = await api.path.join(
          version.versionPath,
          "servers.dat",
        );

        if (!(await api.servers.compare(nbtServers, servers))) {
          await api.servers.write(servers, serversPath);
          setNbtServers([...servers]);
          isShare = true;
        }
      } catch {}
    }

    version.version.lastUpdate = new Date();

    if (
      runArguments.game !== (version.version.runArguments?.game || "") ||
      runArguments.jvm !== (version.version.runArguments?.jvm || "")
    ) {
      version.version.runArguments = { ...runArguments };
      isShare = true;
    }

    if (!isDownloadedVersion && isLogoChanged) {
      try {
        const filename = "logo.png";
        const filePath = await api.path.join(version.versionPath, filename);

        let fileUrl = "";
        if (image) {
          if (image.startsWith("file://")) {
            await api.fs.copy(getLocalPathFromFileUrl(image), filePath);
          } else {
            const response = await axios.get(image, {
              responseType: "arraybuffer",
            });
            const buffer = api.file.fromBuffer(response.data);
            await api.fs.writeFile(filePath, buffer, "binary");
          }

          fileUrl = toFileUrl(filePath);
          setImage(fileUrl);
        } else {
          await api.fs.rimraf(filePath);
        }

        version.version.image = fileUrl;
        isShare = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(t("versions.updateError"), { description: message });
      }
    }

    if (quickConnectIp !== version.version.quickServer) {
      version.version.quickServer = quickConnectIp;
      isShare = true;
    }

    await version.save();
    setPendingRemovedLocalMods([]);

    try {
      await api.fs.rimraf(await api.path.join(version.versionPath, "temp"));
    } catch {}

    toast.success(t("versions.updated"));

    setIsLogoChanged(false);
    setLoadingType(undefined);
    setIsLoading(false);

    if (
      isShare &&
      version.version.shareCode &&
      !version.version.downloadedVersion &&
      isNetwork
    ) {
      setIsOpenModalShare(true);
    }
  }

  const hasNestedDialog =
    isShareModal ||
    isServerCreate ||
    isOpenExportModal ||
    isCropping ||
    isModManager ||
    isServers ||
    isOpenArguments ||
    notSavedModal ||
    isServerManager ||
    isOpenShareModal ||
    isOpenDel ||
    isBlockedMods ||
    isOpenWorlds;
  const {
    showShareAction,
    showShareManagementAction,
    showPublishActions,
    showSyncAction,
    showServerManagerAction,
    showRemoteActions,
    canFetchServerCore,
    canRenameVersion,
    canEditLogo,
  } = getEditVersionFlags({
    hasVersion: !!version,
    shareCode: version?.version.shareCode,
    downloadedVersion: version?.version.downloadedVersion,
    owner: version?.version.owner,
    loaderName: version?.version.loader.name,
    hasAccount: !!account,
    isOwnerVersion,
    versionDiffence,
    isInternetOnline,
    isNetwork,
  });

  function handleRequestClose() {
    if (isLoading || hasNestedDialog) return;

    if (hasChanges) {
      setNotSavedModal(true);
      return;
    }

    closeModal();
  }

  return (
    <>
      <Dialog
        open={!(isLoading && isInstallActive)}
        onOpenChange={(open) => {
          if (open) return;
          handleRequestClose();
        }}
      >
        <DialogContent aria-describedby={undefined}
          className="max-h-[90vh] overflow-hidden p-0 sm:max-w-2xl"
          onClick={(event) => event.stopPropagation()}
          onEscapeKeyDown={(event) => {
            if (isLoading || hasNestedDialog) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (isLoading || hasNestedDialog) event.preventDefault();
          }}
        >
          <TooltipProvider delayDuration={300}>
            <DialogHeader className="px-5 pt-5">
              <DialogTitle className="flex items-center gap-2">
                <Settings className="size-5" />
                {t("versions.versionSettings")}
              </DialogTitle>
            </DialogHeader>

            <div className="grid max-h-[calc(90vh-9rem)] gap-4 overflow-y-auto px-5">
              <VersionHeaderCard
                version={version}
                image={image}
                versionName={versionName}
                editName={editName}
                isNameValid={isNameValid}
                isLoading={isLoading}
                canRenameVersion={canRenameVersion}
                canEditLogo={canEditLogo}
                onNameChange={setVersionName}
                onStartRename={() => setEditName(true)}
                onCancelRename={() => {
                  setEditName(false);
                  setVersionName(version?.version.name || "");
                }}
                onPickLogo={async () => {
                  const filePaths = await api.other.openFileDialog();
                  if (!filePaths || filePaths.length === 0) return;
                  setCroppedImage(filePaths[0]);
                  setIsCropping(true);
                }}
                onRemoveLogo={() => {
                  setImage("");
                  setIsLogoChanged(true);
                }}
              />

              <div className="rounded-xl border bg-card">
                <div className="flex items-center gap-2 rounded-t-xl border-b bg-muted/30 px-3 py-2 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
                  <Boxes className="size-3.5" />
                  {t("versions.sections.content")}
                </div>
                <div className="grid gap-2 p-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!version || isLoading || !isInternetOnline}
                  onClick={() => setIsModManager((prev) => !prev)}
                >
                  <span className="flex items-center gap-1">
                    <SiCurseforge />
                    <SiModrinth />
                  </span>
                  {t("modManager.title")}
                </Button>

                {version?.version.version?.serverManager && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!version || isLoading}
                    onClick={() => setIsServers(true)}
                  >
                    <Server />
                    {t("versions.servers")}
                  </Button>
                )}

                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    !version || isLoading || isCheckingSaves || !hasSaves
                  }
                  onClick={() => setIsOpenWorlds(true)}
                >
                  <Earth />
                  {t("worlds.title")}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    (version?.version.downloadedVersion &&
                      runArguments.game === "" &&
                      runArguments.jvm === "") ||
                    isLoading
                  }
                  onClick={() => setIsOpenArguments(true)}
                >
                  <SquareTerminal />
                  {t("arguments.title")}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    if (!version) return;
                    await api.shell.openPath(
                      await api.path.join(
                        paths.minecraft,
                        "versions",
                        version.version.name,
                      ),
                    );
                  }}
                >
                  <Folder />
                  {t("common.openFolder")}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  disabled={!version || isLoading}
                  onClick={async () => {
                    if (!version) return;

                    let icon: string | undefined = version.version.image;
                    try {
                      const base64 = await api.image.bytes(version.version.image);
                      if (base64) {
                        const bytes = Uint8Array.from(atob(base64), (c) =>
                          c.charCodeAt(0),
                        );
                        const bitmap = await createImageBitmap(
                          new Blob([bytes]),
                        );
                        const canvas = document.createElement("canvas");
                        canvas.width = 256;
                        canvas.height = 256;
                        const ctx = canvas.getContext("2d");
                        if (ctx) {
                          ctx.drawImage(bitmap, 0, 0, 256, 256);
                          icon = canvas.toDataURL("image/png");
                        }
                      }
                    } catch {
                      /* fall back to the raw image / launcher icon */
                    }

                    const res = await api.shortcut.create(
                      version.version.name,
                      0,
                      icon,
                    );
                    if (res.success) {
                      toast.success(t("versions.shortcutCreated"));
                    } else {
                      toast.error(t("versions.shortcutFailed"));
                    }
                  }}
                >
                  <Rocket />
                  {t("versions.createShortcut")}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  disabled={isLoading || !isInternetOnline}
                  onClick={async () => {
                    if (!version) return;

                    const b = await checkBlockedMods(mods, version.versionPath);
                    if (b.length > 0) {
                      setBlockedMods(b);
                      setIsBlockedMods(true);
                      setBlockedCloseType("check");
                      return;
                    }

                    await checkIntegrity();
                  }}
                >
                  {isLoading && loadingType === "check" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ScanLine />
                  )}
                  {t("versions.checkIntegrity")}
                </Button>
                </div>
              </div>

              {showRemoteActions && (
                <div className="rounded-xl border bg-card">
                  <div className="flex items-center gap-2 rounded-t-xl border-b bg-muted/30 px-3 py-2 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
                    <Globe className="size-3.5" />
                    {t("versions.sections.publishing")}
                  </div>
                  <div className="grid gap-2 p-3 sm:grid-cols-2">
                  {version && showShareAction && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        hasChanges ||
                        isLoading ||
                        (version?.version.owner &&
                          account &&
                          !isOwnerVersion) ||
                        !isNetwork ||
                        account?.type === "plain"
                      }
                      onClick={async () => {
                        setShareType("new");
                        setShareModal(true);
                      }}
                    >
                      <Share2 />
                      {t("versions.share")}
                    </Button>
                  )}

                  {version && showPublishActions && (
                    <ButtonGroup className="w-full">
                      <Button
                        type="button"
                        className="min-w-0 flex-1"
                        disabled={
                          hasChanges ||
                          isLoading ||
                          !isNetwork ||
                          !isOwnerVersion
                        }
                        onClick={openShareManagement}
                      >
                        {isLoading && loadingType === "check_diff" ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <CloudCog />
                        )}
                        {t("versions.publish")}
                      </Button>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            disabled={
                              hasChanges ||
                              isLoading ||
                              !isNetwork ||
                              !isOwnerVersion
                            }
                            onClick={async () => {
                              if (!account) return;
                              setLoadingType("sync");
                              setIsLoading(true);
                              await sync();
                            }}
                          >
                            {isLoading && loadingType === "sync" ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <CloudDownload />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("versions.synchronizeDescription")}
                        </TooltipContent>
                      </Tooltip>
                    </ButtonGroup>
                  )}

                  {version &&
                    showShareManagementAction &&
                    !showPublishActions && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={
                          hasChanges ||
                          isLoading ||
                          !isNetwork ||
                          !isOwnerVersion
                        }
                        onClick={openShareManagement}
                      >
                        {isLoading && loadingType === "check_diff" ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <CloudCog />
                        )}
                        {t("versions.shareOptions")}
                      </Button>
                    )}

                  {version && showSyncAction && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          disabled={hasChanges || isLoading || !isNetwork}
                          onClick={async () => {
                            if (!account) return;
                            setLoadingType("sync");
                            setIsLoading(true);
                            await sync();
                          }}
                        >
                          {isLoading && loadingType === "sync" ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <CloudDownload />
                          )}
                          {t("versions.synchronize")}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("versions.synchronizeDescription")}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {version && showServerManagerAction && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isLoading || (!server && !canFetchServerCore)}
                      onClick={async () => {
                        if (!version) return;

                        if (server) {
                          setIsServerManager(true);
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
                          toast.error(t("versions.notFoundServerCore"));
                          return;
                        }

                        setServerCores(cores);
                        setIsServerCreate(true);

                        setIsLoading(false);
                        setLoadingType(undefined);
                      }}
                    >
                      {isLoading && loadingType === "server" ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <ServerCog />
                      )}
                      {t("versions.serverManager")}
                    </Button>
                  )}
                </div>
                </div>
              )}

              <div className="rounded-xl border bg-card">
                <div className="flex items-center gap-2 rounded-t-xl border-b bg-muted/30 px-3 py-2 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
                  <Wrench className="size-3.5" />
                  {t("versions.sections.tools")}
                </div>
                <div className="grid gap-2 p-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isLoading}
                  onClick={() => setIsOpenExportModal(true)}
                >
                  <FolderArchive />
                  {t("export.btn")}
                </Button>

                {settings?.devMode && (
                  <ButtonGroup className="w-full">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-w-0 flex-1"
                          disabled={isLoading}
                          onClick={async () => {
                            if (!version || !account) return;
                            const command = await version.getRunCommand(
                              account,
                              settings,
                              authData,
                            );
                            if (!command) return;
                            await api.clipboard.writeText(
                              formatRunCommandForClipboard(command),
                            );
                            toast(t("common.copied"));
                          }}
                        >
                          <CopyCheck />
                          <span className="truncate">
                            {t("versions.copyRunComand")}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("versions.copyAbsolutePath")}
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          disabled={isLoading}
                          onClick={async () => {
                            if (!version || !account) return;
                            const command = await version.getRunCommand(
                              account,
                              settings,
                              authData,
                              true,
                            );
                            if (!command) return;
                            await api.clipboard.writeText(
                              formatRunCommandForClipboard(command),
                            );
                            toast(t("common.copied"));
                          }}
                        >
                          <CopySlash />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("versions.copyRelativePath")}
                      </TooltipContent>
                    </Tooltip>
                  </ButtonGroup>
                )}
                </div>
              </div>
            </div>

            <DialogFooter className="m-0 rounded-none border-t bg-muted/25 px-5 py-4">
              <Button
                type="button"
                disabled={!canSave}
                onClick={async () => {
                  if (!version) return;

                  const b = await checkBlockedMods(mods, version.versionPath);
                  if (b.length > 0) {
                    setBlockedMods(b);
                    setIsBlockedMods(true);
                    setBlockedCloseType("save");
                    return;
                  }

                  await saveVersion();
                }}
              >
                {isLoading && loadingType === "save" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save />
                )}
                {t("common.save")}
              </Button>

              <Button
                type="button"
                variant="destructive"
                disabled={
                  isLoading ||
                  (!!version?.version.owner && account && !isOwnerVersion)
                }
                onClick={() => setIsOpenDel(true)}
              >
                <Trash />
                {t("common.delete")}
              </Button>
            </DialogFooter>
          </TooltipProvider>
        </DialogContent>
      </Dialog>

      {isShareModal && (
        <Suspense fallback={<LazyDialogFallback variant="form" />}>
          <LazyShareModal
            closeModal={() => setShareModal(false)}
            shareType={shareType}
            modpack={tempModpack}
            diffenceUpdateData={diffenceUpdateData}
            onPublished={() => {
              setVersionDiffence("sync");
              setDiffenceUpdateData("");
            }}
          />
        </Suspense>
      )}

      {isServerCreate && (
        <CreateServer
          close={() => setIsServerCreate(false)}
          serverCores={serverCores}
        />
      )}

      {isOpenExportModal && version && (
        <Suspense fallback={<LazyDialogFallback variant="compact" />}>
          <LazyExport
            onClose={() => setIsOpenExportModal(false)}
            versionPath={version.versionPath}
          />
        </Suspense>
      )}

      {isCropping && (
        <Suspense fallback={<LazyDialogFallback variant="form" />}>
          <LazyImageCropper
            onClose={() => {
              setIsCropping(false);
              setCroppedImage("");
            }}
            title={t("common.editingLogo")}
            image={croppedImage}
            size={{ width: 256, height: 256 }}
            changeImage={async (url: string) => {
              setImage(url);
              setIsLogoChanged(true);
            }}
          />
        </Suspense>
      )}

      {isModManager && version && (
        <Suspense fallback={<LazyDialogFallback variant="workspace" />}>
          <LazyModManager
            mods={mods}
            setMods={(m: ILocalProject[]) => setMods(m)}
            onClose={() => setIsModManager(false)}
            loader={version.version.loader.name}
            version={version.version.version}
            isModpacks={false}
            setLoader={() => {}}
            setModpack={() => {}}
            setVersion={() => {}}
            pendingRemovedLocalProjects={pendingRemovedLocalMods}
            setPendingRemovedLocalProjects={setPendingRemovedLocalMods}
          />
        </Suspense>
      )}

      {isServers && version && (
        <Suspense fallback={<LazyDialogFallback variant="wide" />}>
          <LazyServers
            quickConnectIp={quickConnectIp}
            setQuickConnectIp={setQuickConnectIp}
            closeModal={(isFull?: boolean) => {
              if (isFull) closeModal();
              else setIsServers(false);
            }}
            servers={servers}
            setServers={setServers}
            runGame={runGame}
          />
        </Suspense>
      )}

      {isOpenArguments && version && (
        <Suspense fallback={<LazyDialogFallback variant="form" />}>
          <LazyArguments
            runArguments={runArguments}
            onClose={() => setIsOpenArguments(false)}
            setArguments={setRunArguments}
          />
        </Suspense>
      )}

      {notSavedModal && (
        <Confirmation
          content={[{ text: t("versions.notSaved"), color: "warning" }]}
          onClose={() => setNotSavedModal(false)}
          title={t("common.confirmation")}
          buttons={[
            {
              text: t("versions.willReturn"),
              onClick: async () => setNotSavedModal(false),
            },
            {
              color: "danger",
              text: t("common.close"),
              onClick: async () => closeModal(),
            },
          ]}
        />
      )}

      {isServerManager && version && (
        <Suspense fallback={<LazyDialogFallback variant="wide" />}>
          <LazyServerControl
            onClose={() => setIsServerManager(false)}
            onDelete={() => setServer(undefined)}
          />
        </Suspense>
      )}

      {isOpenShareModal && (
        <Confirmation
          content={[{ text: t("versions.publicUpdate") }]}
          onClose={() => setIsOpenModalShare(false)}
          buttons={[
            {
              text: t("common.yes"),
              color: "primary",
              onClick: async () => {
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
                      servers,
                      version: version.version,
                      versionPath: version.versionPath,
                      logo: version.version.image || image || "",
                      quickServer: quickConnectIp,
                    },
                    account.accessToken || "",
                    modpackData.data,
                  );

                  if (!diff) {
                    setIsOpenModalShare(false);
                    setVersionDiffence("sync");
                    throw new Error("not found diff");
                  }

                  setDiffenceUpdateData(diff);
                  setTempModpack(modpackData.data);
                  setIsOpenModalShare(false);
                  setShareType("update");
                  setShareModal(true);
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : String(error);
                  if (message !== "not found diff") {
                    toast.error(t("versions.updateError"), {
                      description: message,
                    });
                  }
                } finally {
                  setIsLoading(false);
                  setLoadingType(undefined);
                }
              },
              loading: isLoading && loadingType === "check_diff",
            },
            {
              text: t("common.no"),
              onClick: async () => setIsOpenModalShare(false),
            },
          ]}
        />
      )}

      {isOpenDel && (
        <Suspense fallback={<LazyDialogFallback variant="compact" />}>
          <LazyDeleteVersion
            close={(isDeleted?: boolean) => {
              setIsOpenDel(false);
              if (isDeleted) {
                setVersion(undefined);
                closeModal();
              }
            }}
          />
        </Suspense>
      )}

      {isBlockedMods && blockedMods.length > 0 && (
        <BlockedMods
          mods={blockedMods}
          onClose={async (bMods) => {
            setBlockedMods(bMods);
            setIsBlockedMods(false);

            if (blockedCloseType === "save") await saveVersion(bMods);
            if (blockedCloseType === "check") await checkIntegrity(bMods);
            if (blockedCloseType === "sync") await sync(bMods, syncModpack);

            setSyncModpack(undefined);
            setBlockedCloseType(undefined);
          }}
        />
      )}

      {isOpenWorlds && (
        <Suspense fallback={<LazyDialogFallback variant="wide" />}>
          <LazyWorlds
            onClose={(isFull) => {
              if (isFull) closeModal();
              else setIsOpenWorlds(false);
            }}
            runGame={runGame}
            mods={mods}
          />
        </Suspense>
      )}
    </>
  );
}
