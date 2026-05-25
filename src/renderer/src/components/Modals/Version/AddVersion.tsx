import {
  accountAtom,
  authDataAtom,
  internetAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  networkAtom,
  pathsAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import {
  CircleAlert,
  HardDriveDownload,
  ImageOff,
  ImagePlus,
  Loader2,
  PackageSearch,
  Server,
  SquareTerminal,
  File,
  FolderInput,
  Layers3,
  PencilLine,
} from "lucide-react";
import {
  Suspense,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { loaders, Loaders } from "../../Loaders";
import { SiCurseforge, SiModrinth } from "react-icons/si";
import { IArguments } from "@/types/IArguments";
import { ILocalProject, Provider } from "@/types/ModManager";
import { IModpack } from "@/types/Backend";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { IModpack as IImportModpack } from "@/types/ModManager";
import { IModpackFile, IVersion, IVersionConf } from "@/types/IVersion";
import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";
import {
  applyBlockedModFilePaths,
  areBlockedModsReady,
  BlockedMods,
  checkBlockedMods,
  IBlockedMod,
} from "../BlockedMods";

import axios from "axios";
import { Loader } from "@/types/Loader";
import { IServer } from "@/types/ServersList";
import { LoaderVersion } from "@/types/VersionsService";
import { checkVersionName } from "@renderer/utilities/version";
import { Version } from "@renderer/classes/Version";
import { Mods } from "@renderer/classes/Mods";
import { toast } from "sonner";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import {
  lazyWithPreload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";
import {
  canLoadLoaderData as canLoadLoaderDataForConnectivity,
  loaderRequiresBackend,
} from "@renderer/utilities/connectivity";
import {
  parsePackShareCode,
  withPackRequestTimeout,
} from "@renderer/utilities/packShare";
import { getLocalPathFromFileUrl } from "@renderer/utilities/exportVersion";
import { resolveImportedLoaderVersion } from "@/shared/loaderVersions";
import grubieIcon from "@renderer/assets/icon.png";
import prismIcon from "@renderer/assets/launchers/prism.svg";
import multimcIcon from "@renderer/assets/launchers/multimc.svg";

const api = window.api;

const loadServers = () =>
  import("@renderer/components/ServerList/Servers").then((module) => ({
    default: module.Servers,
  }));
const loadImageCropper = () =>
  import("@renderer/components/ImageCropper").then((module) => ({
    default: module.ImageCropper,
  }));
const loadArguments = () =>
  import("@renderer/components/Arguments").then((module) => ({
    default: module.Arguments,
  }));
const loadModManager = () =>
  import("@renderer/components/ModManager/ModManager").then((module) => ({
    default: module.ModManager,
  }));

const LazyServers = lazyWithPreload(loadServers);
const LazyImageCropper = lazyWithPreload(loadImageCropper);
const LazyArguments = lazyWithPreload(loadArguments);
const LazyModManager = lazyWithPreload(loadModManager);

function ImportSourceTile({
  name,
  format,
  children,
}: {
  name: string;
  format: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1 rounded-lg border bg-background/70 p-2 text-center">
      <div className="mx-auto flex size-8 items-center justify-center rounded-md border bg-muted/35 text-base">
        {children}
      </div>
      <span className="truncate text-xs font-medium leading-4 text-foreground">
        {name}
      </span>
      <span className="text-[10px] uppercase leading-3 text-muted-foreground">
        {format}
      </span>
    </div>
  );
}

function getImageExtension(source: string, contentType?: string) {
  const fromContentType = contentType?.split(";")[0]?.trim().toLowerCase();
  if (fromContentType === "image/jpeg") return "jpg";
  if (fromContentType === "image/png") return "png";
  if (fromContentType === "image/webp") return "webp";

  try {
    const pathname = source.startsWith("file://")
      ? new URL(source).pathname
      : source.split("?")[0];
    const extension = decodeURIComponent(pathname)
      .split("/")
      .pop()
      ?.split(".")
      .pop()
      ?.toLowerCase();

    if (extension && ["png", "jpg", "jpeg", "webp"].includes(extension)) {
      return extension === "jpeg" ? "jpg" : extension;
    }
  } catch {}

  return "png";
}

function toFileUrl(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  const withLeadingSlash = /^[a-zA-Z]:/.test(normalized)
    ? `/${normalized}`
    : normalized.startsWith("/")
      ? normalized
      : `/${normalized}`;

  return `file://${encodeURI(withLeadingSlash)}?t=${Date.now()}`;
}

function rewriteImportedLocalPaths(
  mods: ILocalProject[],
  importFolderPath: string,
  newVersionPath: string,
) {
  const normalizedImportRoot = importFolderPath.replace(/\\/g, "/");
  const normalizedOverridesRoot = `${normalizedImportRoot}/overrides`;

  for (const mod of mods) {
    for (const file of mod.version?.files ?? []) {
      if (!file.localPath) continue;

      const normalizedLocalPath = file.localPath.replace(/\\/g, "/");
      if (!normalizedLocalPath.startsWith(normalizedOverridesRoot)) continue;

      const relativePath = normalizedLocalPath
        .slice(normalizedOverridesRoot.length)
        .replace(/^\/+/, "");
      if (!relativePath) continue;

      file.localPath = `${newVersionPath.replace(/\\/g, "/")}/${relativePath}`;
    }
  }
}

export function AddVersion({
  closeModal,
  modpack,
  successCallback,
}: {
  closeModal: () => void;
  modpack?: IModpack;
  successCallback?: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<
    "install" | "search" | "versions" | "loaders" | "file"
  >();
  const [versionName, setVersionName] = useState("");
  const [versions, setVersions] = useAtom(versionsAtom);
  const { t } = useTranslation();
  const [image, setImage] = useState("");
  const [croppedImage, setCroppedImage] = useState("");
  const [isCropping, setIsCropping] = useState(false);
  const [loader, setLoader] = useState<Loader | undefined>("vanilla");
  const [selectVersions, setSelectVersions] = useState<IVersion[]>([]);
  const [selectVersion, setSelectVersion] = useState<IVersion>();
  const [isDownloadedVersion, setIsDownloadedVersion] = useAtom(
    isDownloadedVersionAtom,
  );
  const [viewSnapshots, setViewSnapshots] = useState(false);
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([]);
  const [loaderVersion, setLoaderVersion] = useState<LoaderVersion>();
  const [paths] = useAtom(pathsAtom);
  const [isModManager, setIsModManager] = useState(false);
  const [isServers, setIsServers] = useState(false);
  const [runArguments, setRunArguments] = useState<IArguments>({
    game: "",
    jvm: "",
  });
  const [isOpenArguments, setIsOpenArguments] = useState(false);
  const [account] = useAtom(accountAtom);
  const [mods, setMods] = useState<ILocalProject[]>([]);
  const [servers, setServers] = useState<IServer[]>([]);
  const [options, setOptions] = useState("");
  const [shareCode, setShareCode] = useState<string>();
  const [shareVersion, setShareVersion] = useState<IVersionConf>();
  const [isValidVersionName, setIsValidVersionName] = useState(false);
  const [isOwnerVersion, setIsOwnerVersion] = useAtom(isOwnerVersionAtom);
  const [settings] = useAtom(settingsAtom);
  const [selectedTab, setSelectedTab] = useState<
    "manually" | "fromServer" | "fromFile" | "modpacks"
  >("manually");
  const [searchCode, setSearchCode] = useState("");
  const [importData, setImportData] = useState<IModpackFile | undefined>();
  const [importModpack, setImportModpack] = useState<
    IImportModpack | undefined
  >();
  const [quickConnectIp, setQuickConnectIp] = useState("");
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([]);
  const [isBlockedMods, setIsBlockedMods] = useState(false);
  const [importLoaderVersionError, setImportLoaderVersionError] = useState<
    "missingRequired" | "notFound" | null
  >(null);

  useEffect(() => {
    return schedulePreload(
      [
        LazyArguments.preload,
        LazyImageCropper.preload,
        LazyModManager.preload,
        LazyServers.preload,
      ],
      900,
    );
  }, []);
  const [authData] = useAtom(authDataAtom);
  const [isInternetOnline] = useAtom(internetAtom);
  const [isBackendOnline] = useAtom(networkAtom);

  const isPresenceOfLocalMods = useMemo(() => {
    return mods.some((mod) => mod.provider == Provider.LOCAL);
  }, [mods]);

  const canLoadLoaderData = useCallback(
    (targetLoader?: Loader) => {
      return canLoadLoaderDataForConnectivity(targetLoader, {
        isInternetOnline,
        isBackendOnline,
      });
    },
    [isBackendOnline, isInternetOnline],
  );

  useEffect(() => {
    setSelectVersion(undefined);
    setIsDownloadedVersion(false);
    setIsOwnerVersion(true);

    if (modpack) searchVersion(modpack);
  }, []);

  useEffect(() => {
    if (!importModpack) return;
    let isCancelled = false;

    (async () => {
      setVersionName(importModpack.name);
      setLoader(importModpack.loader);
      setImage(importModpack.image || "");
      setMods(importModpack.mods);
      setIsDownloadedVersion(true);
      setSelectVersion(undefined);
      setLoaderVersion(undefined);
      setLoaderVersions([]);
      setImportLoaderVersionError(null);

      if (!importModpack.loader || !importModpack.version) return;

      if (!canLoadLoaderData(importModpack.loader)) {
        setSelectVersions([]);
        setLoaderVersions([]);
        setSelectVersion(undefined);
        setLoaderVersion(undefined);
        return;
      }

      setIsLoading(true);
      setLoadingType("versions");

      try {
        const versionList = await api.versions.getList(
          importModpack.loader,
          true,
        );
        if (isCancelled) return;

        setSelectVersions(versionList);

        const importedVersion = versionList.find(
          (v) => v.id == importModpack.version,
        );

        if (!importedVersion) {
          toast.error(t("versions.notFound"));
          return;
        }

        setSelectVersion(importedVersion);

        if (importModpack.loader == "vanilla") return;

        setLoadingType("loaders");
        const importedLoaderVersions = await api.versions.getLoaderVersions(
          importModpack.loader,
          importedVersion.id,
        );
        if (isCancelled) return;

        setLoaderVersions(importedLoaderVersions);
        const loaderResolution = resolveImportedLoaderVersion({
          loader: importModpack.loader,
          minecraftVersion: importedVersion.id,
          requiredLoaderVersion: importModpack.loaderVersion,
          availableVersions: importedLoaderVersions,
        });

        if (
          loaderResolution.status === "matched" ||
          loaderResolution.status === "synthesized"
        ) {
          setImportLoaderVersionError(null);
          setLoaderVersion(loaderResolution.version);
          setLoaderVersions(
            importedLoaderVersions.some(
              (version) => version.id === loaderResolution.version.id,
            )
              ? importedLoaderVersions
              : [loaderResolution.version, ...importedLoaderVersions],
          );
        } else {
          setLoaderVersion(undefined);
          setImportLoaderVersionError(
            loaderResolution.status === "missingRequired"
              ? "missingRequired"
              : "notFound",
          );
          toast.error(t("addVersion.fromFile.loaderVersionNotFound"));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
          setLoadingType(undefined);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [canLoadLoaderData, importModpack]);

  useEffect(() => {
    if (modpack || selectedTab != "manually") return;
    let isCancelled = false;
    let shouldWaitForLoaderVersions = false;

    const targetLoader = loader || "vanilla";

    if (!canLoadLoaderData(targetLoader)) {
      setSelectVersions([]);
      setLoaderVersions([]);
      setSelectVersion(undefined);
      setLoaderVersion(undefined);
      setIsLoading(false);
      setLoadingType(undefined);
      return;
    }

    (async () => {
      setIsLoading(true);
      setLoadingType("versions");
      setLoaderVersions([]);
      setLoaderVersion(undefined);

      try {
        const data = await api.versions.getList(targetLoader, viewSnapshots);
        if (isCancelled) return;

        setSelectVersions(data);
        setSelectVersion(data[0]);

        if (!data[0]) {
          setIsLoading(false);
          setLoadingType(undefined);
          return;
        }

        if (targetLoader == "vanilla") {
          setVersionName(getVersionName("vanilla", data[0].id));
        } else {
          shouldWaitForLoaderVersions = true;
        }
      } finally {
        if (isCancelled) return;
        if (!shouldWaitForLoaderVersions) {
          setIsLoading(false);
          setLoadingType(undefined);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [canLoadLoaderData, loader, modpack, selectedTab, viewSnapshots]);

  useEffect(() => {
    if (
      modpack ||
      selectedTab == "fromFile" ||
      selectedTab == "fromServer" ||
      !!importModpack ||
      (selectedTab == "modpacks" && !importModpack)
    )
      return;

    if (!selectVersion) return;

    if (selectedTab != "modpacks" && !importModpack)
      setVersionName(getVersionName(loader || "vanilla", selectVersion.id));

    if (loader == "vanilla") {
      setLoaderVersions([]);
      setLoaderVersion(undefined);
      setIsLoading(false);
      setLoadingType(undefined);
      return;
    }

    const targetLoader = loader || "forge";
    if (!canLoadLoaderData(targetLoader)) {
      setLoaderVersions([]);
      setLoaderVersion(undefined);
      setIsLoading(false);
      setLoadingType(undefined);
      return;
    }

    let isCancelled = false;

    (async () => {
      setIsLoading(true);
      setLoadingType("loaders");

      try {
        const data = await api.versions.getLoaderVersions(
          targetLoader,
          selectVersion.id,
        );
        if (isCancelled) return;

        setLoaderVersion(data[0]);
        setLoaderVersions(data);
      } finally {
        if (isCancelled) return;
        setIsLoading(false);
        setLoadingType(undefined);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [
    canLoadLoaderData,
    importModpack,
    loader,
    modpack,
    selectVersion,
    selectedTab,
  ]);

  useEffect(() => {
    if (!versionName) {
      setIsValidVersionName(false);
      return;
    }

    const result = checkVersionName(
      versionName,
      versions.map((v) => v.version),
      undefined,
      isDownloadedVersion,
    );
    setIsValidVersionName(result);
  }, [versionName]);

  async function addVersion(resolvedBlockedMods: IBlockedMod[] = blockedMods) {
    let isClosed = false;

    try {
      isClosed = await addVersionInternal(resolvedBlockedMods);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);

      if (message === VERSION_INSTALL_CANCELLED) {
        return;
      }

      toast.error(t("versions.installError"), { description: message });
    } finally {
      if (!isClosed) {
        setIsLoading(false);
        setLoadingType(undefined);
      }
    }
  }

  async function addVersionInternal(resolvedBlockedMods: IBlockedMod[]) {
    if (
      !account ||
      !selectVersion ||
      !loader ||
      (loader != "vanilla" && !loaderVersion)
    )
      return false;

    const newVersionPath = await api.path.join(
      paths.minecraft,
      "versions",
      versionName.trim(),
    );

    await api.fs.ensure(newVersionPath);

    let newVersion: Version | undefined;

    try {
      let newImage: string = image || "";
      if (image && selectedTab != "fromServer") {
        try {
          if (image.startsWith("file://")) {
            const file = getLocalPathFromFileUrl(image);
            const filename = `logo.${getImageExtension(image)}`;
            const filePath = await api.path.join(newVersionPath, filename);
            await api.fs.copy(file, filePath);
            newImage = toFileUrl(filePath);
          } else {
            const response = await axios.get(image, {
              responseType: "arraybuffer",
            });
            const contentTypeHeader = response.headers["content-type"];
            const contentType =
              typeof contentTypeHeader === "string"
                ? contentTypeHeader
                : undefined;

            const filename = `logo.${getImageExtension(
              image,
              contentType,
            )}`;
            const filePath = await api.path.join(newVersionPath, filename);
            const buffer = api.file.fromBuffer(response.data);
            await api.fs.writeFile(filePath, buffer, "binary");
            newImage = toFileUrl(filePath);
          }
        } catch {}
      }

      const tmpVersion: Partial<IVersionConf> = shareVersion
        ? { ...shareVersion }
        : importData
          ? { ...importData.conf }
          : {};

      const isDownloadedVersion = shareVersion
        ? isOwnerVersion
          ? !!versions.find(
              (v) => v.version.shareCode == shareVersion.shareCode,
            )
          : true
        : false;

      const newVersionConf: IVersionConf = {
        ...tmpVersion,
        name: versionName.trim(),
        version: {
          ...selectVersion,
        },
        lastLaunch: new Date(),
        downloadedVersion: isDownloadedVersion,
        shareCode,
        lastUpdate: new Date(),
        build: shareVersion?.build ?? tmpVersion.build ?? 0,
        runArguments: runArguments,
        image: newImage,
        loader: {
          name: loader,
          mods,
          version: loaderVersion,
          other: tmpVersion.loader?.other || undefined,
        },
        owner: `${account.type}_${account.nickname}`,
      };

      setIsLoading(true);
      setLoadingType("install");

      if (selectedTab == "fromServer" || selectedTab == "manually") {
        if (servers.length > 0) {
          const serversPath = await api.path.join(
            newVersionPath,
            "servers.dat",
          );
          await api.servers.write(servers, serversPath);
        }

        if (options != "") {
          const optionsPath = await api.path.join(
            newVersionPath,
            "options.txt",
          );
          await api.fs.writeFile(optionsPath, options, "utf-8");
        }
      }

      if (importData) {
        await api.fs.copy(importData.path, newVersionPath);
        await api.fs.rimraf(importData.path);
      } else if (importModpack) {
        const overridesPath = await api.path.join(
          importModpack.folderPath,
          "overrides",
        );
        if (await api.fs.pathExists(overridesPath)) {
          await api.fs.copy(overridesPath, newVersionPath);
        }
        rewriteImportedLocalPaths(mods, importModpack.folderPath, newVersionPath);
        await api.fs.rimraf(importModpack.folderPath);
      }

      newVersion = new Version(newVersionConf);
      await newVersion.init();

      await newVersion.install(account, settings, [], {
        cleanupOnCancel: true,
        keepProgressOpen: selectedTab != "fromFile",
      });
      await newVersion.save();

      if (selectedTab != "fromFile") {
        const hasBlockedPaths = applyBlockedModFilePaths(
          mods,
          resolvedBlockedMods,
        );
        if (hasBlockedPaths) newVersion.version.loader.mods = mods;

        const versionMods = new Mods(settings, newVersionConf);
        await versionMods.check({
          operation: "install",
          keepProgressOpen: !!newVersionConf.loader.other?.url,
        });

        if (newVersionConf.loader.other?.url) {
          await versionMods.downloadOther({ operation: "install" });
        }
        if (hasBlockedPaths) await newVersion.save();
        setBlockedMods([]);
      }

      if (shareCode && isDownloadedVersion && isBackendOnline) {
        await api.backend
          .modpackDownloaded(account?.accessToken || "", shareCode)
          .catch((error) =>
            console.error("[version:add] download mark failed", error),
          );
      }

      setVersions([...versions, newVersion]);

      successCallback?.();
      closeModal();
      toast.success(t("versions.added"));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== VERSION_INSTALL_CANCELLED) {
        if (newVersion) {
          await newVersion.delete(account, true).catch((cleanupError) => {
            console.error(
              "[version:add] failed to cleanup version",
              cleanupError,
            );
          });
        } else {
          await api.fs.rimraf(newVersionPath).catch((cleanupError) => {
            console.error(
              "[version:add] failed to cleanup version path",
              cleanupError,
            );
          });
        }
      }

      throw error;
    }
  }

  async function searchVersion(modpack: IModpack) {
    if (!account) return;

    setVersionName(modpack.conf.name);
    setShareCode(modpack._id);
    setRunArguments(modpack.conf.runArguments);
    setImage(modpack.conf.image);
    setMods(modpack.conf.loader.mods);
    setServers(modpack.conf.servers);
    setOptions(modpack.conf.options);
    setSelectVersion(modpack.conf.version);
    setLoader(modpack.conf.loader.name);
    setLoaderVersion(modpack.conf.loader.version);
    setQuickConnectIp(modpack.conf.quickServer || "");
    setIsDownloadedVersion(true);
    setIsOwnerVersion(authData?.sub == modpack.owner._id);

    setShareVersion({
      ...modpack.conf,
      build: modpack.build,
      downloadedVersion: true,
      lastLaunch: new Date(),
      lastUpdate: new Date(),
      owner: authData?.sub,
      shareCode: modpack._id,
    });
  }

  function getVersionName(loader: Loader, version: string) {
    return `${loaders[loader].name} ${version}`;
  }

  const hasNestedDialog =
    isOpenArguments || isCropping || isModManager || isServers || isBlockedMods;
  const isVersionNameInput =
    selectedTab == "manually" ||
    !!shareVersion ||
    !!importData ||
    !!importModpack;
  const showPrimaryInput =
    selectedTab == "manually" ||
    selectedTab == "fromServer" ||
    !!importData ||
    !!importModpack;
  const showVersionSettings =
    selectedTab == "manually" ||
    !!shareVersion ||
    !!importData ||
    !!importModpack;
  const showImageControls =
    selectedTab == "manually" ||
    !!shareVersion ||
    !!importData ||
    !!importModpack;
  const canEditLogo =
    showImageControls && !isDownloadedVersion && selectedTab != "fromServer";
  const isPendingServerLookup =
    selectedTab == "fromServer" &&
    !shareVersion &&
    !importData &&
    !importModpack;
  const showLogoSlot = showImageControls || !!image || !isPendingServerLookup;
  const versionSelectItems = selectVersions.length
    ? selectVersions
    : selectVersion
      ? [selectVersion]
      : [];
  const loaderVersionSelectItems = loaderVersions.length
    ? loaderVersions
    : loaderVersion
      ? [loaderVersion]
      : [];
  const currentLoader = loader || "vanilla";
  const currentManualLoaderRequiresBackend =
    selectedTab == "manually" && loaderRequiresBackend(currentLoader);
  const canInstall =
    !isLoading &&
    isInternetOnline &&
    !!selectVersion &&
    !!loader &&
    (loader != "vanilla" ? !!loaderVersion : true) &&
    !importLoaderVersionError &&
    isValidVersionName &&
    (!currentManualLoaderRequiresBackend || isBackendOnline);
  const showVersionNameError =
    isVersionNameInput && versionName.trim() != "" && !isValidVersionName;
  const hasResolvedPack = !!shareVersion || !!importData || !!importModpack;
  const hasVersionActions =
    loadingType != "install" &&
    (mods.length > 0 ||
      (servers.length > 0 && !!selectVersion?.serverManager) ||
      (runArguments.game != "" && runArguments.jvm != "") ||
      isPresenceOfLocalMods);

  const cleanupImportedTemp = useCallback(async () => {
    const cleanupPath = importData?.path || importModpack?.folderPath;
    if (!cleanupPath) return;

    await api.fs.rimraf(cleanupPath).catch(() => {});
  }, [importData?.path, importModpack?.folderPath]);

  const closeWithImportCleanup = useCallback(() => {
    void cleanupImportedTemp();
    closeModal();
  }, [cleanupImportedTemp, closeModal]);

  function handleTabChange(key: string) {
    const tab = key as "manually" | "fromServer" | "fromFile" | "modpacks";

    void cleanupImportedTemp();

    setSelectedTab(tab);
    setShareVersion(undefined);
    setVersionName("");
    setShareCode("");
    setRunArguments({ game: "", jvm: "" });
    setImage("");
    setMods([]);
    setServers([]);
    setOptions("");
    setSelectVersion(selectVersions[0]);
    setLoader("vanilla");
    setLoaderVersion(undefined);
    setIsDownloadedVersion(false);
    setIsOwnerVersion(true);
    setSearchCode("");
    setImportData(undefined);
    setImportModpack(undefined);
    setImportLoaderVersionError(null);

    if (tab == "modpacks") {
      setSelectVersion(undefined);
      setLoader(undefined);
      setIsModManager(true);
    } else if (tab == "manually") {
      setVersionName(getVersionName("vanilla", selectVersions[0]?.id || ""));
    }
  }

  function handleLoaderSelect(nextLoader: Loader) {
    if (nextLoader == loader) return;

    setLoader(nextLoader);
    setSelectVersions([]);
    setSelectVersion(undefined);
    setLoaderVersions([]);
    setLoaderVersion(undefined);
    setImportLoaderVersionError(null);

    if (selectedTab == "manually" && canLoadLoaderData(nextLoader)) {
      setIsLoading(true);
      setLoadingType("versions");
    } else {
      setIsLoading(false);
      setLoadingType(undefined);
    }
  }

  async function handleInstallClick() {
    if (selectedTab != "fromFile" && mods.length > 0) {
      const newVersionPath = await api.path.join(
        paths.minecraft,
        "versions",
        versionName.trim(),
      );
      const blockedMods: IBlockedMod[] = await checkBlockedMods(
        mods,
        newVersionPath,
      );

      if (blockedMods.length > 0) {
        setBlockedMods(blockedMods);
        setIsBlockedMods(true);
        return;
      }
    }

    addVersion();
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (open || isLoading || hasNestedDialog) return;
          closeWithImportCleanup();
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-hidden p-0 sm:max-w-lg"
          onClick={(event) => event.stopPropagation()}
          onEscapeKeyDown={(event) => {
            if (isLoading || hasNestedDialog) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (isLoading || hasNestedDialog) event.preventDefault();
          }}
        >
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>{t("versions.addingVersion")}</DialogTitle>
          </DialogHeader>

          <div
            className={`max-h-[calc(90vh-8.5rem)] overflow-y-auto px-5 ${selectedTab != "manually" ? "pb-5" : ""}`}
          >
            <div className="grid gap-4">
              {!hasResolvedPack && (
                <Tabs
                  value={selectedTab}
                  onValueChange={handleTabChange}
                  className="w-full"
                >
                  <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl bg-muted/50 group-data-[orientation=horizontal]/tabs:h-auto">
                    <TabsTrigger
                      value="manually"
                      className="h-12 w-full flex-none justify-center gap-2 px-3"
                      disabled={isLoading || !!modpack || !isInternetOnline}
                    >
                      <PencilLine className="size-4" />
                      {t("addVersion.tabs.manually")}
                    </TabsTrigger>
                    <TabsTrigger
                      value="modpacks"
                      className="h-12 w-full flex-none justify-center gap-2 px-3"
                      disabled={isLoading || !!modpack || !isInternetOnline}
                    >
                      <Layers3 className="size-4" />
                      {t("addVersion.tabs.modpacks")}
                    </TabsTrigger>
                    <TabsTrigger
                      value="fromServer"
                      className="h-12 w-full flex-none justify-center gap-2 px-3"
                      disabled={isLoading || !!modpack || !isBackendOnline}
                    >
                      <Server className="size-4" />
                      {t("addVersion.tabs.fromServer")}
                    </TabsTrigger>
                    <TabsTrigger
                      value="fromFile"
                      className="h-12 w-full flex-none justify-center gap-2 px-3"
                      disabled={isLoading || !!modpack}
                    >
                      <FolderInput className="size-4" />
                      {t("addVersion.tabs.fromFile")}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}

              <div className="grid gap-4">
                {(selectedTab == "manually" ||
                  selectedTab == "fromServer" ||
                  shareVersion ||
                  importData ||
                  importModpack) && (
                  <Card className="gap-4 py-4 shadow-none">
                    <CardContent className="grid gap-4 px-4">
                      {(showImageControls || showPrimaryInput) && (
                        <div
                          className={
                            showLogoSlot
                              ? "grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start"
                              : "grid gap-3"
                          }
                        >
                          {showLogoSlot &&
                            (image ? (
                              <div className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-muted/40">
                                <img
                                  src={image}
                                  alt={versionName || t("versions.name")}
                                  className="h-full w-full object-cover"
                                />
                                {canEditLogo && (
                                  <button
                                    type="button"
                                    disabled={isLoading}
                                    className="absolute inset-0 flex items-center justify-center bg-black/65 px-1 text-[10px] text-white opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-0"
                                    onClick={() => setImage("")}
                                  >
                                    {t("common.delete")}
                                  </button>
                                )}
                              </div>
                            ) : canEditLogo ? (
                              <button
                                type="button"
                                disabled={isLoading}
                                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                                aria-label={t("common.editingLogo")}
                                onClick={async () => {
                                  const filePaths =
                                    await api.other.openFileDialog();

                                  if (!filePaths.length) return;
                                  setCroppedImage(filePaths[0]);
                                  setIsCropping(true);
                                }}
                              >
                                <ImagePlus className="size-5" />
                              </button>
                            ) : (
                              <div
                                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed bg-muted/25 text-muted-foreground"
                                title={t("common.logo")}
                              >
                                <ImageOff className="size-5" />
                              </div>
                            ))}

                          {showPrimaryInput && (
                            <div className="grid min-w-0 flex-1 gap-2">
                              <Label htmlFor="add-version-primary-input">
                                {isVersionNameInput
                                  ? t("versions.name")
                                  : t("addVersion.fromServer.shareCode")}
                              </Label>
                              <div className="grid min-w-0 flex-1 gap-1">
                                <div className="relative">
                                  <Input
                                    id="add-version-primary-input"
                                    aria-invalid={showVersionNameError}
                                    placeholder={
                                      isVersionNameInput
                                        ? t("versions.namePlaceholder")
                                        : undefined
                                    }
                                    value={
                                      isVersionNameInput
                                        ? versionName
                                        : searchCode
                                    }
                                    onChange={(event) => {
                                      const value = event.target.value;

                                      if (isVersionNameInput) {
                                        setVersionName(value);
                                      } else if (selectedTab == "fromServer") {
                                        setSearchCode(
                                          parsePackShareCode(value),
                                        );
                                      }
                                    }}
                                    disabled={isLoading}
                                  />
                                </div>
                                {showVersionNameError && (
                                  <p className="text-xs leading-5 text-destructive">
                                    {t("addVersion.invalidName")}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {(selectedTab == "manually" ||
                        shareVersion ||
                        importData ||
                        importModpack) && (
                        <div className="grid gap-4">
                          <div className="grid gap-3 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
                            <div className="min-w-0">
                              <Loaders
                                isDisabled={isDownloadedVersion}
                                disabledLoaders={
                                  isBackendOnline ? [] : ["forge", "neoforge"]
                                }
                                select={handleLoaderSelect}
                                isLoading={isLoading}
                                label={t("versions.loader")}
                                loader={loader || "vanilla"}
                              />
                            </div>

                            <div className="grid min-w-0 gap-2">
                              <div className="flex h-5 items-center gap-2">
                                <Label>{t("versions.version")}</Label>
                                {isLoading && loadingType == "versions" && (
                                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                                )}
                              </div>
                              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                                <Select
                                  value={selectVersion?.id || ""}
                                  disabled={
                                    isLoading ||
                                    !canLoadLoaderData(currentLoader) ||
                                    versionSelectItems.length == 0 ||
                                    isDownloadedVersion
                                  }
                                  onValueChange={(value) => {
                                    const version = versionSelectItems.find(
                                      (v) => v.id == value,
                                    );
                                    if (version) setSelectVersion(version);
                                  }}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue
                                      placeholder={t("versions.version")}
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {versionSelectItems.map((v) => (
                                      <SelectItem key={v.id} value={v.id}>
                                        {v.id}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {loader == "vanilla" &&
                                selectVersions.length != 0 &&
                                !isDownloadedVersion &&
                                loadingType != "install" ? (
                                  <div className="flex h-8 items-center gap-2 rounded-lg border bg-muted/30 px-3">
                                    <Checkbox
                                      id="add-version-snapshots"
                                      checked={viewSnapshots}
                                      disabled={isLoading}
                                      onCheckedChange={(checked) => {
                                        setViewSnapshots(checked === true);
                                      }}
                                    />
                                    <Label
                                      htmlFor="add-version-snapshots"
                                      className="cursor-pointer text-sm"
                                    >
                                      {t("versions.snapshots")}
                                    </Label>
                                  </div>
                                ) : undefined}
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-3">
                            {loader && loader != "vanilla" ? (
                              <div className="grid min-w-0 gap-2">
                                <div className="flex h-5 items-center gap-2">
                                  <Label>{t("versions.loaderVersion")}</Label>
                                  {isLoading &&
                                    (loadingType == "loaders" ||
                                      loadingType == "versions") && (
                                      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                                    )}
                                </div>
                                <Select
                                  value={loaderVersion?.id || ""}
                                  disabled={
                                    isLoading ||
                                    !canLoadLoaderData(currentLoader) ||
                                    isDownloadedVersion ||
                                    loaderVersionSelectItems.length == 0
                                  }
                                  onValueChange={(value) => {
                                    const version =
                                      loaderVersionSelectItems.find(
                                        (v) => v.id == value,
                                      );
                                    if (version) setLoaderVersion(version);
                                  }}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue
                                      placeholder={t("versions.loaderVersion")}
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {loaderVersionSelectItems.map((v) => (
                                      <SelectItem key={v.id} value={v.id}>
                                        {v.id}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {importLoaderVersionError && (
                                  <p className="text-xs leading-5 text-destructive">
                                    {t(
                                      importLoaderVersionError ===
                                        "missingRequired"
                                        ? "addVersion.fromFile.loaderVersionMissing"
                                        : "addVersion.fromFile.loaderVersionNotFound",
                                    )}
                                  </p>
                                )}
                              </div>
                            ) : undefined}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {selectedTab == "fromFile" && !importData && (
                  <Card className="gap-4 py-4 shadow-none">
                    <CardContent className="grid gap-4 px-4">
                      <div className="grid gap-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">
                            {t("addVersion.fromFile.supportedLaunchers")}
                          </p>
                          <span className="shrink-0 rounded-md border bg-muted/30 px-2 py-1 text-[10px] uppercase text-muted-foreground">
                            .zip / .mrpack
                          </span>
                        </div>

                        <div className="grid grid-cols-5 gap-2">
                          <ImportSourceTile name="Grubie" format="zip">
                            <img
                              src={grubieIcon}
                              alt=""
                              className="size-5 object-contain"
                            />
                          </ImportSourceTile>
                          <ImportSourceTile name="CurseForge" format="zip">
                            <SiCurseforge className="size-5 text-[#f16436]" />
                          </ImportSourceTile>
                          <ImportSourceTile name="Modrinth" format="mrpack">
                            <SiModrinth className="size-5 text-[#1bd96a]" />
                          </ImportSourceTile>
                          <ImportSourceTile name="Prism" format="zip">
                            <img
                              src={prismIcon}
                              alt=""
                              className="size-5 object-contain"
                            />
                          </ImportSourceTile>
                          <ImportSourceTile name="MultiMC" format="zip">
                            <img
                              src={multimcIcon}
                              alt=""
                              className="size-5 object-contain"
                            />
                          </ImportSourceTile>
                        </div>
                      </div>
                      <Button
                        type="button"
                        className="w-full"
                        disabled={isLoading}
                        onClick={async () => {
                          try {
                            setIsLoading(true);
                            setLoadingType("file");

                            const filePaths = await api.other.openFileDialog(
                              false,
                              [
                                {
                                  name: "Modpack",
                                  extensions: ["zip", "mrpack"],
                                },
                              ],
                            );

                            if (!filePaths.length) {
                              setIsLoading(false);
                              setLoadingType(undefined);
                              return;
                            }

                            const data = await api.version.import(
                              filePaths[0],
                              await api.path.join(paths.launcher, "temp"),
                            );

                            const { type, gl, other } = data;

                            if (type == "gl" && gl) {
                              const { conf, servers, options } = gl;
                              setVersionName(conf.name);
                              setShareCode(conf.shareCode);
                              setRunArguments(
                                conf.runArguments || { game: "", jvm: "" },
                              );
                              setImage(conf.image);
                              setMods(conf.loader.mods);
                              setServers(servers);
                              setOptions(options);
                              setSelectVersion(conf.version);
                              setLoader(conf.loader.name);
                              setLoaderVersion(conf.loader.version);
                              setQuickConnectIp(conf.quickServer || "");
                              setIsDownloadedVersion(true);
                              setIsOwnerVersion(true);

                              setImportData({ ...gl });
                            } else if (type == "other" && other) {
                              setSelectedTab("modpacks");
                              setImportModpack(other);
                            }
                          } catch {
                            setImportData(undefined);
                            toast.error(t("addVersion.fromFile.error"));
                          } finally {
                            setIsLoading(false);
                            setLoadingType(undefined);
                          }
                        }}
                      >
                        {isLoading && loadingType == "file" ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <File />
                        )}
                        {t("common.choose")}
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {!(isLoading && loadingType == "install") &&
                  selectedTab == "fromServer" &&
                  !shareVersion &&
                  selectedTab == "fromServer" && (
                    <Button
                      type="button"
                      disabled={
                        searchCode.trim() == "" || isLoading || !isBackendOnline
                      }
                      onClick={async () => {
                        setIsLoading(true);
                        setLoadingType("search");

                        const shareCode = parsePackShareCode(searchCode);
                        if (shareCode !== searchCode.trim()) {
                          setSearchCode(shareCode);
                        }

                        try {
                          const modpackData = await withPackRequestTimeout(
                            api.backend.getModpack(
                              account?.accessToken || "",
                              shareCode,
                            ),
                          );

                          if (modpackData.data)
                            await searchVersion(modpackData.data);
                          else toast.error(t("addVersion.fromServer.notFound"));
                        } catch {
                          toast.error(t("addVersion.fromServer.notFound"));
                        } finally {
                          setIsLoading(false);
                          setLoadingType(undefined);
                        }
                      }}
                    >
                      {isLoading && loadingType == "search" ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <PackageSearch />
                      )}
                      {t("addVersion.fromServer.find")}
                    </Button>
                  )}

                {showVersionSettings && hasVersionActions && (
                  <Card className="gap-4 py-4 shadow-none">
                    <CardContent className="grid gap-2 px-4">
                      {mods.length > 0 && (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!selectVersion || isLoading}
                          onClick={() => {
                            setIsModManager((prev) => !prev);
                          }}
                        >
                          <span className="flex items-center gap-1">
                            <SiCurseforge />
                            <SiModrinth />
                          </span>
                          {t("modManager.title")}
                        </Button>
                      )}

                      {servers.length > 0 && selectVersion?.serverManager ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setIsServers(true);
                          }}
                        >
                          <Server />
                          {t("versions.servers")}
                        </Button>
                      ) : (
                        ""
                      )}

                      {runArguments.game != "" && runArguments.jvm != "" && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setIsOpenArguments(true);
                          }}
                        >
                          <SquareTerminal />
                          {t("arguments.title")}
                        </Button>
                      )}

                      {isPresenceOfLocalMods && (
                        <Alert className="border-border/70 bg-muted/20 text-muted-foreground">
                          <CircleAlert className="text-muted-foreground" />
                          <AlertDescription>
                            {t("addVersion.localModsWarning")}
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>

          {showVersionSettings && (
            <DialogFooter className="m-0 rounded-none border-t bg-muted/30 px-5 py-4">
              {isLoading && loadingType == "install" ? (
                <div className="flex w-full items-center justify-center gap-2 rounded-lg border bg-background/60 p-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t("common.install")}
                </div>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isLoading}
                    onClick={closeWithImportCleanup}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="button"
                    disabled={!canInstall}
                    onClick={handleInstallClick}
                  >
                    <HardDriveDownload />
                    {t("common.install")}
                  </Button>
                </>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      {isOpenArguments && (
        <Suspense fallback={<LazyDialogFallback variant="form" />}>
          <LazyArguments
            runArguments={runArguments}
            onClose={() => setIsOpenArguments(false)}
            setArguments={(args) => setRunArguments(args)}
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
            }}
          />
        </Suspense>
      )}
      {isModManager && (
        <Suspense fallback={<LazyDialogFallback variant="workspace" />}>
          <LazyModManager
            mods={mods}
            setMods={(mods) => setMods(mods)}
            onClose={(modpack) => {
              setIsModManager(false);

              if (!modpack && !importModpack && selectedTab == "modpacks") {
                setSelectVersion(selectVersions[0]);
                setLoader("vanilla");
                setSelectedTab("manually");
              }
            }}
            loader={loader}
            version={selectVersion}
            isModpacks={selectedTab == "modpacks" && !importModpack}
            setLoader={(loader) => setLoader(loader)}
            setVersion={(setVersion) => setSelectVersion(setVersion)}
            setModpack={(setModpack) => setImportModpack(setModpack)}
          />
        </Suspense>
      )}
      {isServers && (
        <Suspense fallback={<LazyDialogFallback variant="wide" />}>
          <LazyServers
            isAdding
            servers={servers}
            setServers={setServers}
            closeModal={() => setIsServers(false)}
            quickConnectIp={quickConnectIp}
            setQuickConnectIp={(ip) => setQuickConnectIp(ip)}
          />
        </Suspense>
      )}

      {isBlockedMods && blockedMods.length && (
        <BlockedMods
          mods={blockedMods}
          onClose={(bMods) => {
            setBlockedMods(bMods);
            setIsBlockedMods(false);
            if (!areBlockedModsReady(bMods)) return;
            addVersion(bMods);
          }}
        />
      )}
    </>
  );
}
