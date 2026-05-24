import { ILocalProject } from "@/types/ModManager";
import {
  accountAtom,
  authDataAtom,
  consolesAtom,
  internetAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  networkAtom,
  pathsAtom,
  selectedVersionAtom,
  serverAtom,
  settingsAtom,
  versionsAtom,
  versionServersAtom,
} from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { IArguments } from "@/types/IArguments";
import { useTranslation } from "react-i18next";
import {
  CloudCog,
  CloudDownload,
  CopyCheck,
  CopySlash,
  Cpu,
  Earth,
  Folder,
  FolderArchive,
  Gamepad2,
  ImageMinus,
  ImagePlus,
  Loader2,
  Pencil,
  Save,
  ScanLine,
  Server,
  ServerCog,
  Share2,
  SquareTerminal,
  Trash,
  X,
} from "lucide-react";
import { LoaderLabel } from "@renderer/components/Loaders";
import { SiCurseforge, SiModrinth } from "react-icons/si";
import { VersionDiffence } from "@renderer/components/Versions";
import { IServerOption } from "@/types/Server";
import { IModpack } from "@/types/Backend";
import { CreateServer } from "../../ServerControl/Create";
import { Confirmation } from "../Confirmation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  syncShare,
} from "@renderer/utilities/version";
import { buildPackShareUrl } from "@renderer/utilities/packShare";
import { Mods } from "@renderer/classes/Mods";
import { toast } from "sonner";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import {
  lazyWithPreload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";

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

function loaderRequiresBackend(loader?: string) {
  return loader == "forge" || loader == "neoforge";
}

function quoteRunCommandArg(arg: string) {
  if (arg === "") return '""';
  if (!/[\s"&^<>|()]/.test(arg)) return arg;

  let quoted = '"';
  let backslashes = 0;

  for (const char of arg) {
    if (char === "\\") {
      backslashes++;
      continue;
    }

    if (char === '"') {
      quoted += "\\".repeat(backslashes * 2 + 1);
      quoted += char;
      backslashes = 0;
      continue;
    }

    quoted += "\\".repeat(backslashes);
    quoted += char;
    backslashes = 0;
  }

  quoted += "\\".repeat(backslashes * 2);
  quoted += '"';
  return quoted;
}

function formatRunCommandForClipboard(command: string[]) {
  return command.map(quoteRunCommandArg).join(" ");
}

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

  const [isOpenShareModal, setIsOpenModalShare] = useState(false);
  const [shareType, setShareType] = useState<"new" | "update">("new");
  const [isShareModal, setShareModal] = useState(false);

  const [versionDiffence, setVersionDiffence] = useState<
    "sync" | "new" | "old"
  >("sync");
  const [diffenceUpdateData, setDiffenceUpdateData] = useState<string>("");

  const [tempModpack, setTempModpack] = useState<IModpack>();
  const [isOpenExportModal, setIsOpenExportModal] = useState(false);

  const [isServerManager, setIsServerManager] = useState(false);
  const [serverCores, setServerCores] = useState<IServerOption[]>([]);
  const [isServerCreate, setIsServerCreate] = useState(false);

  const [isInternetOnline] = useAtom(internetAtom);
  const [isDownloadedVersion] = useAtom(isDownloadedVersionAtom);
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom);

  const { t } = useTranslation();

  const [isLogoChanged, setIsLogoChanged] = useState(false);
  const [quickConnectIp, setQuickConnectIp] = useState<string>();

  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([]);
  const [isBlockedMods, setIsBlockedMods] = useState(false);
  const [blockedCloseType, setBlockedCloseType] = useState<
    "save" | "check" | "sync"
  >();
  const [syncModpack, setSyncModpack] = useState<IModpack>();

  const [authData] = useAtom(authDataAtom);
  const [, setConsoles] = useAtom(consolesAtom);

  const [isOpenWorlds, setIsOpenWorlds] = useState(false);

  const [hasChanges, setHasChanges] = useState(false);
  const [hasOnlyDownloadedRename, setHasOnlyDownloadedRename] = useState(false);
  const calcSeqRef = useRef(0);

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

  useEffect(() => {
    let cancelled = false;
    const seq = ++calcSeqRef.current;

    const calc = async () => {
      if (!version) {
        setHasChanges(false);
        setHasOnlyDownloadedRename(false);
        return;
      }

      if (isLoading) return;

      const nameChanged = versionName.trim() !== (version.version.name ?? "");

      const argsChanged =
        runArguments.game !== (version.version.runArguments?.game ?? "") ||
        runArguments.jvm !== (version.version.runArguments?.jvm ?? "");

      const otherChanged =
        isLogoChanged || version.version.quickServer !== quickConnectIp;

      let modsChanged = false;
      let serversChanged = false;

      try {
        modsChanged = !(await api.modManager.compareMods(
          version.version.loader.mods ?? [],
          mods,
        ));
      } catch {
        modsChanged = false;
      }

      if (version.version.version.serverManager) {
        try {
          serversChanged = !(await api.servers.compare(nbtServers, servers));
        } catch {
          serversChanged = false;
        }
      }

      if (cancelled || seq !== calcSeqRef.current) return;

      const onlyNameChanged =
        nameChanged &&
        !modsChanged &&
        !serversChanged &&
        !argsChanged &&
        !otherChanged;
      const hasAnyChanges =
        nameChanged ||
        modsChanged ||
        serversChanged ||
        argsChanged ||
        otherChanged;

      setHasOnlyDownloadedRename(
        !!version.version.downloadedVersion && onlyNameChanged,
      );
      setHasChanges(hasAnyChanges);
    };

    calc();

    return () => {
      cancelled = true;
    };
  }, [
    version,
    versionName,
    mods,
    servers,
    nbtServers,
    runArguments.game,
    runArguments.jvm,
    isLogoChanged,
    quickConnectIp,
    isLoading,
  ]);

  async function sync(
    resolvedBlockedMods: IBlockedMod[] = [],
    preparedModpack?: IModpack,
  ) {
    if (!version || !account || !version.version.shareCode) return;

    setLoadingType("sync");
    setIsLoading(true);

    try {
      const modpack =
        preparedModpack ||
        (
          await api.backend.getModpack(
            account.accessToken || "",
            version.version.shareCode,
          )
        ).data;

      if (!modpack) throw new Error("not share version");

      const hasBlockedPaths = applyBlockedModFilePaths(
        modpack.conf.loader.mods,
        resolvedBlockedMods,
      );
      const missingBlockedMods = await checkBlockedMods(
        modpack.conf.loader.mods,
        version.versionPath,
      );

      if (missingBlockedMods.length > 0) {
        setBlockedMods(missingBlockedMods);
        setSyncModpack(modpack);
        setBlockedCloseType("sync");
        setIsBlockedMods(true);
        return;
      }

      if (hasBlockedPaths) setBlockedMods([]);

      await syncShare(
        version,
        servers,
        settings,
        account.accessToken || "",
        modpack,
      );

      toast.success(t("versions.updated"));

      closeModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("versions.updateError"), { description: message });
    } finally {
      setLoadingType(undefined);
      setIsLoading(false);
    }
  }

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

        isShare = true;
      } catch {
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

    if (
      !isDownloadedVersion &&
      (isLogoChanged || (isRename && isOwnerVersion))
    ) {
      const filename = "logo.png";
      const filePath = await api.path.join(version.versionPath, filename);

      let fileUrl = "";
      if (image) {
        let img = image;
        if (isRename && !isDownloadedVersion && isOwnerVersion) {
          img = img.replace(oldPath, version.versionPath);
        }

        const newFile = await fetch(img).then((r) => r.blob());
        await api.fs.writeFile(
          filePath,
          new Uint8Array(await newFile.arrayBuffer()),
          "binary",
        );

        fileUrl = `file://${filePath}?t=${new Date().getTime()}`;

        setImage(fileUrl);
      } else {
        await api.fs.rimraf(filePath);
      }

      version.version.image = fileUrl;
      isShare = true;
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
  const showShareAction = !!version && !version.version.shareCode;
  const showPublishActions =
    versionDiffence === "new" &&
    !version?.version.downloadedVersion &&
    !!version?.version.shareCode;
  const showSyncAction =
    versionDiffence === "old" && !!version?.version.downloadedVersion;
  const showServerManagerAction =
    !!version && !version.version.downloadedVersion;
  const showRemoteActions =
    showShareAction ||
    showPublishActions ||
    showSyncAction ||
    showServerManagerAction;
  const canFetchServerCore =
    isInternetOnline &&
    (!loaderRequiresBackend(version?.version.loader.name) || isNetwork);
  const canRenameVersion =
    !!version &&
    (!version.version.owner ||
      !account ||
      isOwnerVersion ||
      version.version.downloadedVersion);
  const canEditLogo =
    !!version &&
    !version.version.downloadedVersion &&
    (!version.version.owner || !account || isOwnerVersion);

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
        open
        onOpenChange={(open) => {
          if (open) return;
          handleRequestClose();
        }}
      >
        <DialogContent
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
              <DialogTitle>{t("versions.versionSettings")}</DialogTitle>
            </DialogHeader>

            <div className="grid max-h-[calc(90vh-9rem)] gap-4 overflow-y-auto px-5">
              <div className="grid gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted/40">
                    {image ? (
                      <img
                        src={image}
                        alt="logo"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ImagePlus className="size-5" />
                      </div>
                    )}
                  </div>

                  <div className="grid min-w-0 flex-1 gap-2">
                    {editName ? (
                      <div className="grid gap-1.5">
                        <Input
                          aria-invalid={!isNameValid}
                          placeholder={t("versions.namePlaceholder")}
                          value={versionName}
                          onChange={(event) =>
                            setVersionName(event.currentTarget.value)
                          }
                          disabled={isLoading}
                        />
                        {!isNameValid && (
                          <p className="text-xs leading-5 text-destructive">
                            {t("addVersion.invalidName")}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="truncate text-xl font-semibold">
                        {versionName}
                      </p>
                    )}

                    {version && (
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <Badge variant="secondary">
                          <Gamepad2 />
                          <span className="max-w-40 truncate">
                            {version.version.version.id}
                          </span>
                        </Badge>

                        <Badge variant="secondary">
                          <Cpu />
                          <LoaderLabel loader={version.version.loader.name} />
                          {version.version.loader.name !== "vanilla" && (
                            <span className="max-w-36 truncate">
                              ({version.version.loader.version?.id})
                            </span>
                          )}
                        </Badge>

                        {version.version.shareCode && (
                          <Badge
                            variant="outline"
                            asChild
                            className="max-w-full cursor-pointer"
                          >
                            <button
                              type="button"
                              onClick={async () => {
                                await api.clipboard.writeText(
                                  buildPackShareUrl(
                                    version.version.shareCode || "",
                                  ),
                                );
                                toast(t("common.copied"));
                              }}
                            >
                              <Share2 />
                              <span className="max-w-64 truncate">
                                /{version.version.shareCode}
                              </span>
                            </button>
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {!editName ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        disabled={isLoading || !canRenameVersion}
                        onClick={() => setEditName(true)}
                      >
                        <Pencil />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={async () => {
                          setEditName(false);
                          setVersionName(version?.version.name || "");
                        }}
                      >
                        <X />
                      </Button>
                    )}

                    {canEditLogo && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          disabled={isLoading}
                          onClick={async () => {
                            const filePaths = await api.other.openFileDialog();
                            if (!filePaths || filePaths.length === 0) return;
                            setCroppedImage(filePaths[0]);
                            setIsCropping(true);
                          }}
                        >
                          <ImagePlus />
                        </Button>

                        {image && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            disabled={isLoading}
                            onClick={() => {
                              setImage("");
                              setIsLogoChanged(true);
                            }}
                          >
                            <ImageMinus />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2">
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

              <div className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2">
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

              {showRemoteActions && (
                <div className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2">
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
                        onClick={async () => {
                          if (!account || !version.version.shareCode) return;

                          try {
                            setIsLoading(true);
                            setLoadingType("check_diff");

                            const diff = await checkDiffenceUpdateData(
                              {
                                mods: version.version.loader.mods,
                                runArguments: version.version.runArguments || {
                                  game: "",
                                  jvm: "",
                                },
                                servers,
                                version: version.version,
                                versionPath: await api.path.join(
                                  paths.minecraft,
                                  "versions",
                                  version.version.name,
                                ),
                                logo: image || "",
                                quickServer: quickConnectIp,
                              },
                              account.accessToken || "",
                            );

                            setDiffenceUpdateData(diff);

                            if (!diff) {
                              setVersionDiffence("sync");
                              throw new Error("not found diff");
                            }

                            const modpackData = await api.backend.getModpack(
                              account.accessToken!,
                              version.version.shareCode,
                            );

                            if (!modpackData.data)
                              throw new Error("not found modpack");

                            setTempModpack(modpackData.data);
                            setShareType("update");
                            setShareModal(true);
                          } catch (error) {
                            const message =
                              error instanceof Error
                                ? error.message
                                : String(error);
                            if (message !== "not found diff") {
                              toast.error(t("versions.updateError"), {
                                description: message,
                              });
                            }
                          } finally {
                            setIsLoading(false);
                            setLoadingType(undefined);
                          }
                        }}
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
                      disabled={
                        isLoading ||
                        (!!version?.version.owner &&
                          account &&
                          !isOwnerVersion) ||
                        (!server && !canFetchServerCore)
                      }
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
              )}
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
              setVersionDiffence("new");
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
                      logo: image || "",
                      quickServer: quickConnectIp,
                    },
                    account.accessToken || "",
                  );

                  if (!diff) {
                    setIsOpenModalShare(false);
                    setVersionDiffence("sync");
                    throw new Error("not found diff");
                  }

                  const modpackData = await api.backend.getModpack(
                    account.accessToken!,
                    version.version.shareCode,
                  );
                  if (!modpackData.data) throw new Error("not found modpack");

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
