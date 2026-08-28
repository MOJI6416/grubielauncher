import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  FolderInput,
  HardDriveDownload,
  Layers3,
  Loader2,
  PencilLine,
  Server,
  Signal,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IArguments } from "@/types/IArguments";
import type { Loader } from "@/types/Loader";
import type { IModpack as IBackendModpack } from "@/types/Backend";
import {
  ILocalProject,
  IProject,
  IVersion as IProjectVersion,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";
import { DownloaderInfo } from "@/types/Downloader";
import {
  accountAtom,
  authDataAtom,
  installActiveAtom,
  internetAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  networkAtom,
  pathsAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { loaders } from "@renderer/components/Loaders";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import {
  BlockedMods,
  areBlockedModsReady,
  checkBlockedMods,
  type IBlockedMod,
} from "@renderer/components/Modals/BlockedMods";
import { navigate } from "@renderer/navigation/navigate";
import { instanceKey } from "@renderer/features/instances/selectors";
import { openTaskCenter } from "@renderer/features/install/installUi";
import {
  lazyWithPreload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";
import { revokePreviousBlobUrl } from "@renderer/utilities/file";
import {
  reportIpcFailure,
  showFailureToast,
} from "@renderer/utilities/failures";
import {
  parsePackShareCode,
  withPackRequestTimeout,
} from "@renderer/utilities/packShare";
import { mcVersionToJavaMajor } from "@/shared/javaVersions";
import {
  getUnavailableConnectivityProblem,
  loaderRequiresBackend,
} from "@renderer/utilities/connectivity";
import { CommunityBrowser } from "@renderer/features/community/CommunityBrowser";
import { CustomForm } from "./CustomForm";
import { IdentityFields } from "./IdentityFields";
import { InstallView } from "./InstallView";
import { ModpackBrowser } from "./ModpackBrowser";
import { PackConfirm } from "./PackConfirm";
import { CodeSource, FileSource, ServerSource } from "./PackSources";
import {
  INSTANCE_CONTENT_FAILED,
  INSTANCE_FOLDER_EXISTS,
  createInstance,
} from "./createInstance";
import {
  downloadModpack,
  readBlockedModpack,
  type ModpackDownloadStage,
} from "./downloadModpack";
import { checkInstanceName, suggestInstanceName } from "./nameValidation";
import { hasLocalContent, summarizePackContent } from "./packSummary";
import { resolvePackVersions } from "./resolvePackVersions";
import { buildSharedPack } from "./sharedPack";
import { creationBlockers, creationWarnings } from "./creationPlan";
import { serverInstanceName, serverListName } from "./serverTarget";
import {
  EMPTY_ARGUMENTS,
  NewInstanceSource,
  createInitialState,
  isPackLocked,
  needsPackPicker,
  newInstanceReducer,
  packVersionIssue,
} from "./state";
import { useServerProbe } from "./useServerProbe";
import { useKnownServers, useOwnModpacks } from "./useSuggestions";
import { useInstanceFolderNames } from "./useInstanceFolders";
import { useVersionCatalog } from "./useVersionCatalog";
import { versionKind } from "./versionCatalog";

const api = window.api;

const LazyServers = lazyWithPreload(() =>
  import("@renderer/features/servers/ServersDialog").then((module) => ({
    default: module.ServersDialog,
  })),
);
const LazyImageCropper = lazyWithPreload(() =>
  import("@renderer/components/ImageCropper").then((module) => ({
    default: module.ImageCropper,
  })),
);
const LazyArguments = lazyWithPreload(() =>
  import("@renderer/components/Arguments").then((module) => ({
    default: module.Arguments,
  })),
);
const LazyContentManager = lazyWithPreload(() =>
  import("@renderer/features/mods/ContentManager").then((module) => ({
    default: module.ContentManager,
  })),
);

type BusyKind = "file" | "code" | "modpack" | "install" | null;

const SOURCE_ICONS = {
  custom: PencilLine,
  community: Users,
  catalog: Layers3,
  code: Ticket,
  file: FolderInput,
  server: Server,
} as const;

export function NewInstancePanel({
  closeModal,
  modpack,
  source,
  successCallback,
  importFilePath,
}: {
  closeModal: () => void;
  modpack?: IBackendModpack;
  source?: NewInstanceSource;
  successCallback?: () => void;
  importFilePath?: string;
}) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(
    newInstanceReducer,
    source ?? (modpack ? "code" : "custom"),
    createInitialState,
  );

  const [busy, setBusy] = useState<BusyKind>(null);
  const [shareCode, setShareCode] = useState("");
  const [modpackStage, setModpackStage] = useState<ModpackDownloadStage>(null);
  const [downloadInfo, setDownloadInfo] = useState<DownloaderInfo | null>(null);
  const [pendingModpack, setPendingModpack] = useState<{
    project: IProject;
    version: IProjectVersion;
  } | null>(null);
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([]);
  const [isBlockedOpen, setBlockedOpen] = useState(false);
  const [cropSource, setCropSource] = useState("");
  const [isContentOpen, setContentOpen] = useState(false);
  const [isServersOpen, setServersOpen] = useState(false);
  const [isArgumentsOpen, setArgumentsOpen] = useState(false);

  const account = useAtomValue(accountAtom);
  const authData = useAtomValue(authDataAtom);
  const versions = useAtomValue(versionsAtom);
  const paths = useAtomValue(pathsAtom);
  const settings = useAtomValue(settingsAtom);
  const isInternetOnline = useAtomValue(internetAtom);
  const isBackendOnline = useAtomValue(networkAtom);
  const isInstallActive = useAtomValue(installActiveAtom);
  const [, setDownloadedVersion] = useAtom(isDownloadedVersionAtom);
  const setOwnerVersion = useSetAtom(isOwnerVersionAtom);

  const importedPathRef = useRef<string | null>(null);
  const packRequestRef = useRef(0);
  const installAbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const probe = useServerProbe();
  const ownModpacks = useOwnModpacks(
    state.source === "code" && !state.pack && isBackendOnline,
  );
  const knownServers = useKnownServers(
    state.source === "server" && !state.serverTarget,
  );

  const folderNames = useInstanceFolderNames();
  const instanceNames = useMemo(
    () => versions.map((version) => version.version.name),
    [versions],
  );
  const takenNames = useMemo(
    () => [...instanceNames, ...folderNames],
    [folderNames, instanceNames],
  );
  const nameCheck = useMemo(
    () => checkInstanceName(state.name, instanceNames, folderNames),
    [folderNames, instanceNames, state.name],
  );

  const isPicking = needsPackPicker(state);
  const isLocked = isPackLocked(state);
  const isInstalling = busy === "install";

  useEffect(() => {
    return schedulePreload(
      [
        LazyArguments.preload,
        LazyImageCropper.preload,
        LazyContentManager.preload,
        LazyServers.preload,
      ],
      900,
    );
  }, []);

  useEffect(() => {
    return api.events.onDownloaderInfo(setDownloadInfo);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (isInstalling) return;

      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }

      if (
        document.querySelector(
          "[data-slot=dialog-content],[data-slot=alert-dialog-content],[data-radix-popper-content-wrapper]",
        )
      ) {
        return;
      }

      event.preventDefault();
      closeModal();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeModal, isInstalling]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setDownloadedVersion(state.pack?.kind === "share");
    setOwnerVersion(state.pack ? state.pack.isOwner : true);
  }, [setDownloadedVersion, setOwnerVersion, state.pack]);

  const catalog = useVersionCatalog(
    state,
    dispatch,
    { isInternetOnline, isBackendOnline },
    !isLocked && (state.source === "custom" || state.source === "server"),
  );

  useEffect(() => {
    if (state.pack || state.source === "catalog" || !state.minecraftVersion) {
      return;
    }

    const base =
      state.source === "server" && state.serverTarget
        ? serverInstanceName(state.serverTarget)
        : `${loaders[state.loader].name} ${state.minecraftVersion.id}`;

    dispatch({
      type: "autoName",
      value: suggestInstanceName(base, takenNames),
    });
  }, [
    state.loader,
    state.minecraftVersion,
    state.pack,
    state.serverTarget,
    state.source,
    takenNames,
  ]);

  const discardTempPack = useCallback(async (target?: string) => {
    if (!target) return;

    await api.fs.rimraf(target).catch(() => undefined);
  }, []);

  const cleanupTemp = useCallback(async () => {
    const target =
      state.pack?.importData?.path ?? state.pack?.importModpack?.folderPath;
    if (!target) return;

    await api.fs.rimraf(target).catch(() => undefined);
  }, [state.pack]);

  const applyImportedPack = useCallback(
    async (imported: Awaited<ReturnType<typeof api.version.import>>) => {
      if (imported.type === "gl" && imported.gl) {
        const { conf, servers, options } = imported.gl;

        dispatch({
          type: "applyPack",
          pack: {
            kind: "file",
            title: conf.name,
            isOwner: true,
            importData: imported.gl,
          },
          content: {
            name: suggestInstanceName(conf.name, takenNames),
            image: conf.image,
            loader: conf.loader.name,
            minecraftVersion: conf.version,
            loaderVersion: conf.loader.version,
            mods: conf.loader.mods,
            servers,
            options,
            runArguments: conf.runArguments || EMPTY_ARGUMENTS,
            quickServer: conf.quickServer || "",
          },
        });
        return true;
      }

      if (imported.type === "other" && imported.other) {
        const pack = imported.other;
        const resolution = await resolvePackVersions(pack);

        dispatch({
          type: "applyPack",
          pack: {
            kind: "file",
            title: pack.name,
            isOwner: true,
            importModpack: pack,
          },
          content: {
            name: suggestInstanceName(pack.name, takenNames),
            image: pack.image || "",
            loader: pack.loader ?? "vanilla",
            minecraftVersion: resolution.minecraftVersion,
            loaderVersion: resolution.loaderVersion,
            mods: pack.mods,
            servers: [],
            options: "",
            runArguments: EMPTY_ARGUMENTS,
            quickServer: "",
          },
          versionIssue: packVersionIssue(resolution),
        });

        if (resolution.issue) {
          dispatch({
            type: "loaderVersionsLoaded",
            versions: resolution.loaderVersions,
            issue: resolution.issue,
          });
        }

        if (resolution.versionMissing) toast.error(t("versions.notFound"));
        if (resolution.catalogFailed) {
          showFailureToast(t("versions.listLoadError"), undefined, {
            channels: ["versions:getList"],
          });
        }

        return true;
      }

      return false;
    },
    [t, takenNames],
  );

  const importFromFile = useCallback(
    async (filePath: string) => {
      const requestId = ++packRequestRef.current;
      setBusy("file");

      try {
        const imported = await api.version.import(
          filePath,
          await api.path.join(paths.launcher, "temp"),
        );

        if (requestId !== packRequestRef.current) {
          await discardTempPack(
            imported.gl?.path ?? imported.other?.folderPath,
          );
          return;
        }

        const applied = await applyImportedPack(imported);
        if (!applied) throw new Error("import failed");
      } catch (error) {
        if (requestId !== packRequestRef.current) return;

        if (
          !reportIpcFailure(t("addVersion.fromFile.error"), ["version:import"])
        ) {
          showFailureToast(t("addVersion.fromFile.error"), error, {
            fallbackDescription: t("addVersion.fromFile.errorUnsupported"),
          });
        }
      } finally {
        if (requestId === packRequestRef.current) setBusy(null);
      }
    },
    [applyImportedPack, discardTempPack, paths.launcher, t],
  );

  useEffect(() => {
    if (!importFilePath || importedPathRef.current === importFilePath) return;

    importedPathRef.current = importFilePath;
    dispatch({ type: "selectSource", source: "file" });
    void importFromFile(importFilePath);
  }, [importFilePath, importFromFile]);

  const applySharedModpack = useCallback(
    (shared: IBackendModpack, ownedByUser?: boolean) => {
      const { pack, content } = buildSharedPack(shared, {
        authSub: authData?.sub,
        ownedByUser,
        takenNames,
      });

      dispatch({ type: "applyPack", pack, content });
    },
    [authData?.sub, takenNames],
  );

  useEffect(() => {
    if (!modpack) return;
    applySharedModpack(modpack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modpack]);

  const searchByCode = useCallback(async () => {
    const requestId = ++packRequestRef.current;
    setBusy("code");
    const code = parsePackShareCode(shareCode);
    if (code !== shareCode.trim()) setShareCode(code);

    try {
      const response = await withPackRequestTimeout(
        api.backend.getModpack(account?.accessToken || "", code),
      );

      if (requestId !== packRequestRef.current) return;

      if (response.data) {
        applySharedModpack(response.data);
      } else if (response.status === "not_found") {
        toast.error(t("addVersion.fromServer.notFound"));
      } else {
        showFailureToast(t("addVersion.fromServer.loadError"), undefined, {
          channels: ["backend:getModpack"],
          fallbackDescription: t("addVersion.fromServer.loadErrorHint"),
        });
      }
    } catch (error) {
      if (requestId !== packRequestRef.current) return;

      showFailureToast(t("addVersion.fromServer.loadError"), error, {
        fallbackDescription: t("addVersion.fromServer.timeoutHint"),
      });
    } finally {
      if (requestId === packRequestRef.current) setBusy(null);
    }
  }, [account?.accessToken, applySharedModpack, shareCode, t]);

  const applyModpackResult = useCallback(
    async (
      result: Awaited<ReturnType<typeof downloadModpack>>,
      project: IProject,
      version: IProjectVersion,
    ) => {
      if (result.status === "blocked") {
        setPendingModpack({ project, version });
        setBlockedMods([result.blocked]);
        setBlockedOpen(true);
        return;
      }

      if (result.status === "failed") {
        showFailureToast(t("modManager.notModpack"), result.error, {
          channels: ["modManager:checkModpack", "file:download"],
          fallbackDescription: t("modManager.notModpackHint"),
        });
        return;
      }

      const pack = result.modpack;
      const resolution = await resolvePackVersions(pack);

      dispatch({
        type: "applyPack",
        pack: {
          kind: "modpack",
          title: pack.name || project.title,
          provider: project.provider,
          isOwner: true,
          importModpack: pack,
        },
        content: {
          name: suggestInstanceName(pack.name || project.title, takenNames),
          image: pack.image || project.iconUrl || "",
          loader: pack.loader ?? "vanilla",
          minecraftVersion: resolution.minecraftVersion,
          loaderVersion: resolution.loaderVersion,
          mods: pack.mods,
          servers: [],
          options: "",
          runArguments: EMPTY_ARGUMENTS,
          quickServer: "",
        },
        versionIssue: packVersionIssue(resolution),
      });

      if (resolution.issue) {
        dispatch({
          type: "loaderVersionsLoaded",
          versions: resolution.loaderVersions,
          issue: resolution.issue,
        });
      }
    },
    [t, takenNames],
  );

  const retryPackVersions = useCallback(async () => {
    const pack = state.pack?.importModpack;
    if (!pack) return;

    const requestId = ++packRequestRef.current;
    setBusy("modpack");

    try {
      const resolution = await resolvePackVersions(pack);

      if (requestId !== packRequestRef.current) return;

      dispatch({
        type: "packVersionsResolved",
        minecraftVersion: resolution.minecraftVersion,
        loaderVersion: resolution.loaderVersion,
        loaderVersions: resolution.loaderVersions,
        issue: resolution.issue,
        versionIssue: packVersionIssue(resolution),
      });
    } finally {
      if (requestId === packRequestRef.current) setBusy(null);
    }
  }, [state.pack?.importModpack]);

  const pickModpack = useCallback(
    async (project: IProject, version: IProjectVersion) => {
      const requestId = ++packRequestRef.current;
      setBusy("modpack");

      try {
        const result = await downloadModpack(project, version, setModpackStage);

        if (requestId !== packRequestRef.current) {
          if (result.status === "ok") {
            await discardTempPack(result.modpack.folderPath);
          }
          return;
        }

        await applyModpackResult(result, project, version);
      } finally {
        if (requestId === packRequestRef.current) {
          setBusy(null);
          setModpackStage(null);
        }
      }
    },
    [applyModpackResult, discardTempPack],
  );

  const useServer = useCallback(() => {
    const target = probe.probe;
    if (target.status !== "online" || !target.minecraftVersion) return;

    const entry = state.versions.find(
      (item) => item.id === target.minecraftVersion,
    );

    dispatch({
      type: "applyServer",
      target: {
        host: target.host,
        port: null,
        address: target.address,
      },
      server: {
        name: serverListName(target.motd, target.host),
        ip: target.address,
        acceptTextures: null,
      },
      logo: target.favicon,
    });

    if (entry) dispatch({ type: "selectVersion", version: entry });
    else toast.warning(t("newInstance.server.versionMissing"));
  }, [probe.probe, state.versions, t]);

  const contentSummary = useMemo(
    () => summarizePackContent(state.mods),
    [state.mods],
  );

  const substituteFromModrinth = useCallback(
    async (blocked: IBlockedMod, project: IProject) => {
      try {
        const found = await api.modManager.getVersions(
          Provider.MODRINTH,
          project.id,
          {
            version: state.minecraftVersion?.id,
            loader: state.loader,
            projectType: ProjectType.MOD,
            modUrl: project.url,
          },
        );

        const version = found?.[0];
        if (!version?.files?.length) return false;

        const replacement: ILocalProject = {
          title: project.title,
          description: project.description,
          projectType: ProjectType.MOD,
          iconUrl: project.iconUrl,
          url: project.url,
          provider: Provider.MODRINTH,
          id: project.id,
          version: {
            id: version.id,
            dependencies: [],
            files: version.files,
          },
        };

        const next = [...state.mods];
        const index = next.findIndex((mod) => mod.id === blocked.projectId);
        if (index === -1) next.push(replacement);
        else next[index] = replacement;

        dispatch({ type: "setMods", mods: next });

        return true;
      } catch {
        return false;
      }
    },
    [state.loader, state.minecraftVersion?.id, state.mods],
  );

  const blockers = useMemo(
    () =>
      creationBlockers({
        hasAccount: !!account,
        isInternetOnline,
        isBackendOnline,
        loader: state.loader,
        nameOk: nameCheck.ok,
        hasMinecraftVersion: !!state.minecraftVersion,
        hasLoaderVersion: !!state.loaderVersion,
        loaderVersionUnresolved: state.loaderVersionIssue !== null,
      }),
    [
      account,
      isBackendOnline,
      isInternetOnline,
      nameCheck.ok,
      state.loader,
      state.loaderVersion,
      state.loaderVersionIssue,
      state.minecraftVersion,
    ],
  );

  const warnings = useMemo(() => {
    const list = creationWarnings({
      versionKind: state.minecraftVersion
        ? versionKind(state.minecraftVersion.type)
        : null,
      javaMajor: state.minecraftVersion
        ? mcVersionToJavaMajor(state.minecraftVersion.id)
        : null,
      hasLocalMods: hasLocalContent(state.mods),
      bytes: contentSummary.bytes,
      isBackendOnline,
      needsBackend: !!state.pack?.shareCode,
    });

    return list.map((warning) => t(`newInstance.warnings.${warning}`));
  }, [
    contentSummary.bytes,
    isBackendOnline,
    state.minecraftVersion,
    state.mods,
    state.pack?.shareCode,
    t,
  ]);

  const separator = paths.minecraft.includes("\\") ? "\\" : "/";
  const folderPath = `${paths.minecraft}${separator}versions${separator}${state.name.trim()}`;

  const similarInstances = useMemo(() => {
    const targetId = state.minecraftVersion?.id;
    if (!targetId) return [];

    return versions
      .filter((item) => item.version.version.id === targetId)
      .slice(0, 4)
      .map((item) => ({
        key: instanceKey(item),
        name: item.version.name,
        loader: item.version.loader.name,
        loaderVersion: item.version.loader.version?.id,
      }));
  }, [state.minecraftVersion?.id, versions]);

  const unavailableLoaders = useMemo(() => {
    if (isBackendOnline) return {};

    return {
      forge: t("newInstance.loaderNeedsBackend"),
      neoforge: t("newInstance.loaderNeedsBackend"),
    } as Partial<Record<Loader, string>>;
  }, [isBackendOnline, t]);

  const beginInstall = useCallback(() => {
    const controller = new AbortController();
    installAbortRef.current = controller;
    setBusy("install");

    return controller;
  }, []);

  const runCreate = useCallback(
    async (resolvedBlocked: IBlockedMod[], mods = state.mods) => {
      if (!state.minecraftVersion) return;

      const controller =
        installAbortRef.current && !installAbortRef.current.signal.aborted
          ? installAbortRef.current
          : beginInstall();

      setBusy("install");

      try {
        const { instance, extraFilesFailed } = await createInstance({
          name: state.name,
          image: state.image,
          loader: state.loader,
          loaderVersion: state.loaderVersion,
          minecraftVersion: state.minecraftVersion,
          mods,
          servers: state.servers,
          options: state.options,
          runArguments: state.runArguments,
          quickServer: state.quickServer,
          pack: state.pack,
          blockedMods: resolvedBlocked,
          signal: controller.signal,
        });

        setBlockedMods([]);

        if (extraFilesFailed) {
          toast.warning(t("newInstance.extraFilesFailed"), {
            description: t("newInstance.extraFilesFailedHint"),
          });
        } else {
          toast.success(t("versions.added"));
        }

        successCallback?.();

        if (isMountedRef.current) {
          closeModal();
          navigate(
            { name: "instance", id: instanceKey(instance) },
            { force: true, replace: true },
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === VERSION_INSTALL_CANCELLED) {
          toast.info(t("newInstance.installCancelled"));
        } else if (message === INSTANCE_FOLDER_EXISTS) {
          toast.error(t("newInstance.name.folderTaken"));
        } else if (message === INSTANCE_CONTENT_FAILED) {
          showFailureToast(t("newInstance.contentFailed"), undefined, {
            channels: ["fs:copy", "fs:ensure", "fs:writeFile", "servers:write"],
            fallbackDescription: t("newInstance.contentFailedHint"),
          });
        } else {
          showFailureToast(t("versions.installError"), error);
        }
      } finally {
        if (installAbortRef.current === controller) {
          installAbortRef.current = null;
        }
        setBusy(null);
      }
    },
    [beginInstall, closeModal, state, successCallback, t],
  );

  const handleCreate = useCallback(async () => {
    if (isInstallActive) toast.info(t("taskCenter.queued"));

    if (state.mods.length === 0 || state.pack?.importData) {
      void runCreate([]);
      return;
    }

    const controller = beginInstall();

    try {
      const versionPath = await api.path.join(
        paths.minecraft,
        "versions",
        state.name.trim(),
      );
      const result = await checkBlockedMods(state.mods, versionPath);

      if (controller.signal.aborted) {
        installAbortRef.current = null;
        setBusy(null);
        toast.info(t("newInstance.installCancelled"));
        return;
      }

      if (result.mods !== state.mods) {
        dispatch({ type: "setMods", mods: result.mods });
      }

      if (result.blockedMods.length > 0) {
        installAbortRef.current = null;
        setBusy(null);
        setBlockedMods(result.blockedMods);
        setBlockedOpen(true);
        return;
      }

      void runCreate([], result.mods);
    } catch (error) {
      installAbortRef.current = null;
      setBusy(null);
      showFailureToast(t("versions.installError"), error);
    }
  }, [beginInstall, isInstallActive, paths.minecraft, runCreate, state, t]);

  const sources: NewInstanceSource[] = [
    "custom",
    "community",
    "catalog",
    "code",
    "file",
    "server",
  ];

  const offlineReason = !isInternetOnline
    ? t("newInstance.blockers.internet")
    : null;

  const communityOfflineProblem = getUnavailableConnectivityProblem(true, {
    isInternetOnline,
    isBackendOnline,
  });

  const changeSource = (source: NewInstanceSource) => {
    if (source === state.source) return;
    packRequestRef.current += 1;
    setBusy(null);
    setModpackStage(null);
    void cleanupTemp();
    probe.reset();
    setShareCode("");
    setContentOpen(false);
    dispatch({ type: "selectSource", source });
  };

  const dropPack = () => {
    packRequestRef.current += 1;
    void cleanupTemp();
    setContentOpen(false);
    dispatch({ type: "clearPack" });
  };

  const blockerLabel = blockers.length
    ? t(`newInstance.blockers.${blockers[0]}`)
    : "";

  return (
    <>
      <section
        data-add-version-screen="true"
        className="flex h-full min-h-0 overflow-hidden rounded-xl border border-border bg-card"
      >
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-border bg-surface-1 p-2">
          <span className="px-2.5 pt-1 pb-2 text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
            {t("addVersion.sourceTitle")}
          </span>

          {sources.map((source) => {
            const Icon = SOURCE_ICONS[source];

            return (
              <button
                key={source}
                type="button"
                disabled={
                  isInstalling || (!!modpack && source !== state.source)
                }
                aria-current={state.source === source}
                onClick={() => changeSource(source)}
                className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground aria-[current=true]:bg-primary-soft aria-[current=true]:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Icon className="size-4 shrink-0 text-faint" />
                <span className="min-w-0 truncate">
                  {t(`newInstance.sources.${source}`)}
                </span>
              </button>
            );
          })}

          <div className="mt-auto flex items-start gap-2 rounded-lg border border-dashed border-border p-2.5">
            <FolderInput className="mt-0.5 size-3.5 shrink-0 text-faint" />
            <span className="min-w-0 text-[0.68rem] leading-snug text-faint">
              {t("addVersion.dropDescription")}
            </span>
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-3.5 pb-3">
            {isInstalling ? (
              <InstallView
                name={state.name.trim()}
                loader={state.loader}
                onCancel={() => installAbortRef.current?.abort()}
              />
            ) : isContentOpen ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2.5">
                <header className="flex h-8 shrink-0 items-center gap-2">
                  <Layers3 className="size-4 shrink-0 text-faint" />
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">
                    {t("modManager.title")}
                  </span>
                  <span className="min-w-0 truncate text-xs text-faint">
                    {state.name.trim()}
                  </span>
                </header>

                <div className="min-h-0 flex-1">
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      </div>
                    }
                  >
                    <LazyContentManager
                      mods={state.mods}
                      setMods={(mods) => dispatch({ type: "setMods", mods })}
                      onClose={() => setContentOpen(false)}
                      loader={state.loader}
                      version={state.minecraftVersion}
                      isModpacks={false}
                      setLoader={() => undefined}
                      setVersion={() => undefined}
                      setModpack={() => undefined}
                      canEdit={state.pack?.kind !== "share"}
                    />
                  </Suspense>
                </div>
              </div>
            ) : isPicking ? (
              state.source === "community" ? (
                <CommunityBrowser
                  isBusy={busy !== null}
                  offlineProblem={communityOfflineProblem}
                  onPick={(shared) => applySharedModpack(shared)}
                  onOpenInstalled={(key) => {
                    closeModal();
                    navigate(
                      { name: "instance", id: key },
                      { force: true, replace: true },
                    );
                  }}
                />
              ) : state.source === "catalog" ? (
                <ModpackBrowser
                  isBusy={busy === "modpack"}
                  offlineReason={offlineReason}
                  stage={modpackStage}
                  progressPercent={downloadInfo?.progressPercent ?? 0}
                  onPick={(project, version) =>
                    void pickModpack(project, version)
                  }
                />
              ) : state.source === "code" ? (
                <CodeSource
                  value={shareCode}
                  own={ownModpacks}
                  isBusy={busy === "code"}
                  isBackendOnline={isBackendOnline && isInternetOnline}
                  offlineReason={offlineReason}
                  onChange={(value) => setShareCode(parsePackShareCode(value))}
                  onSearch={() => void searchByCode()}
                  onPickOwn={(pack) => applySharedModpack(pack, true)}
                  onOpenInstalled={(key) => {
                    closeModal();
                    navigate(
                      { name: "instance", id: key },
                      { force: true, replace: true },
                    );
                  }}
                />
              ) : state.source === "file" ? (
                <FileSource
                  isBusy={busy === "file"}
                  onPick={async () => {
                    const filePaths = await api.other.openFileDialog(false, [
                      { name: "Modpack", extensions: ["zip", "mrpack"] },
                    ]);
                    if (!filePaths.length) return;
                    await importFromFile(filePaths[0]);
                  }}
                />
              ) : (
                <ServerSource
                  value={state.serverAddress}
                  probe={probe.probe}
                  known={knownServers}
                  isBusy={probe.probe.status === "probing"}
                  onChange={(value) =>
                    dispatch({ type: "setServerAddress", value })
                  }
                  onProbe={() => void probe.run(state.serverAddress)}
                  onUse={useServer}
                />
              )
            ) : (
              <>
                <IdentityFields
                  name={state.name}
                  image={state.image}
                  check={nameCheck}
                  canEditImage={state.pack?.kind !== "share"}
                  hint={isLocked ? t("newInstance.nameFromPack") : undefined}
                  onNameChange={(value) => dispatch({ type: "setName", value })}
                  onUseSuggestion={(value) =>
                    dispatch({ type: "setName", value })
                  }
                  onSubmit={() => {
                    if (blockers.length > 0) return;
                    void handleCreate();
                  }}
                  onPickImage={async () => {
                    const filePaths = await api.other.openFileDialog();
                    if (!filePaths.length) return;
                    setCropSource(filePaths[0]);
                  }}
                  onClearImage={() => dispatch({ type: "setImage", value: "" })}
                />

                {state.serverTarget && (
                  <div className="flex h-9 shrink-0 items-center gap-2.5 rounded-lg border border-border bg-surface-1 pr-1 pl-3">
                    <Signal className="size-4 shrink-0 text-success" />
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {t("newInstance.server.applied", {
                        address: state.serverTarget.address,
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("common.delete")}
                      onClick={() => dispatch({ type: "clearServer" })}
                    >
                      <X />
                    </Button>
                  </div>
                )}

                {isLocked ? (
                  <PackConfirm
                    state={state}
                    folderPath={folderPath}
                    warnings={warnings}
                    canChangeContent={state.pack?.kind !== "share"}
                    isBusy={busy !== null}
                    onRetryVersions={
                      state.pack?.importModpack
                        ? () => void retryPackVersions()
                        : undefined
                    }
                    onChangePack={modpack ? undefined : dropPack}
                    onOpenContent={() => setContentOpen(true)}
                    onOpenServers={() => setServersOpen(true)}
                    onOpenArguments={() => setArgumentsOpen(true)}
                    onSelectLoaderVersion={(id) => {
                      const version = state.loaderVersions.find(
                        (item) => item.id === id,
                      );
                      if (version) {
                        dispatch({ type: "selectLoaderVersion", version });
                      }
                    }}
                  />
                ) : (
                  <CustomForm
                    state={state}
                    dispatch={dispatch}
                    catalog={catalog}
                    unavailableLoaders={unavailableLoaders}
                    folderPath={folderPath}
                    language={settings.lang || "en"}
                    warnings={warnings}
                    similar={similarInstances}
                    unavailableReason={
                      offlineReason ??
                      (!isBackendOnline && loaderRequiresBackend(state.loader)
                        ? t("newInstance.blockers.backend")
                        : null)
                    }
                  />
                )}
              </>
            )}
          </div>

          <footer className="flex h-14 shrink-0 items-center gap-2 border-t border-border px-4">
            {isInstalling ? (
              <>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {t("newInstance.installHint")}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => {
                    openTaskCenter();
                    closeModal();
                  }}
                >
                  {t("newInstance.minimize")}
                </Button>
              </>
            ) : isContentOpen ? (
              <>
                <span className="min-w-0 flex-1 truncate text-xs text-faint">
                  {t("newInstance.contentHint")}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => setContentOpen(false)}
                >
                  {t("common.ok")}
                </Button>
              </>
            ) : (
              <>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-xs",
                    blockerLabel && !isPicking
                      ? "text-muted-foreground"
                      : "text-faint",
                  )}
                >
                  {isPicking
                    ? t(`newInstance.pickHint.${state.source}`)
                    : blockerLabel || t("newInstance.readyHint")}
                </span>

                <Button variant="ghost" onClick={closeModal}>
                  {t("common.cancel")}
                </Button>

                {!isPicking && (
                  <Button
                    disabled={blockers.length > 0}
                    onClick={() => void handleCreate()}
                  >
                    {busy ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <HardDriveDownload />
                    )}
                    {t("newInstance.create")}
                  </Button>
                )}
              </>
            )}
          </footer>
        </div>
      </section>

      {isArgumentsOpen && (
        <Suspense fallback={<LazyDialogFallback variant="form" />}>
          <LazyArguments
            runArguments={state.runArguments}
            onClose={() => setArgumentsOpen(false)}
            setArguments={(value: IArguments) =>
              dispatch({ type: "setRunArguments", value })
            }
          />
        </Suspense>
      )}

      {cropSource && (
        <Suspense fallback={<LazyDialogFallback variant="form" />}>
          <LazyImageCropper
            title={t("common.editingLogo")}
            image={cropSource}
            size={{ width: 256, height: 256 }}
            onClose={() => setCropSource("")}
            changeImage={async (url: string) => {
              dispatch({
                type: "setImage",
                value: revokePreviousBlobUrl(state.image, url) ?? "",
              });
            }}
          />
        </Suspense>
      )}

      {isServersOpen && (
        <Suspense fallback={<LazyDialogFallback variant="wide" />}>
          <LazyServers
            isAdding
            servers={state.servers}
            setServers={(update) =>
              dispatch({
                type: "setServers",
                servers:
                  typeof update === "function" ? update(state.servers) : update,
              })
            }
            onClose={() => setServersOpen(false)}
            quickConnectIp={state.quickServer}
            setQuickConnectIp={(value: string) =>
              dispatch({ type: "setQuickServer", value })
            }
          />
        </Suspense>
      )}

      {isBlockedOpen && blockedMods.length > 0 && (
        <BlockedMods
          mods={blockedMods}
          mcVersion={state.minecraftVersion?.id}
          loader={state.loader}
          onSubstitute={pendingModpack ? undefined : substituteFromModrinth}
          onClose={(resolved) => {
            setBlockedOpen(false);

            if (!resolved) {
              setPendingModpack(null);
              setBusy(null);
              setModpackStage(null);
              return;
            }

            setBlockedMods(resolved);

            if (pendingModpack) {
              const target = pendingModpack;
              setPendingModpack(null);

              const filePath = resolved[0]?.filePath;
              if (!filePath) {
                if (areBlockedModsReady(resolved)) {
                  toast.error(t("newInstance.modpackFileRequired"), {
                    description: t("newInstance.modpackFileRequiredHint"),
                  });
                }
                return;
              }

              const requestId = ++packRequestRef.current;
              setBusy("modpack");
              void readBlockedModpack(
                filePath,
                target.project,
                target.version,
                setModpackStage,
              )
                .then((result) => {
                  if (requestId !== packRequestRef.current) {
                    if (result.status === "ok") {
                      return discardTempPack(result.modpack.folderPath);
                    }
                    return;
                  }

                  return applyModpackResult(
                    result,
                    target.project,
                    target.version,
                  );
                })
                .finally(() => {
                  if (requestId !== packRequestRef.current) return;
                  setBusy(null);
                  setModpackStage(null);
                });
              return;
            }

            if (!areBlockedModsReady(resolved)) return;

            void runCreate(resolved);
          }}
        />
      )}
    </>
  );
}
