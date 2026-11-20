import { Suspense, useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
  CircleCheck,
  CircleUserRound,
  Ellipsis,
  Loader2,
  Lock,
  Play,
  RotateCcw,
  Save,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapse, CollapseInline } from "@/components/ui/collapse";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolveInstanceSettings } from "@/shared/instanceSettings";
import { parseArgs } from "@renderer/utilities/jvmArguments";
import { revokePreviousBlobUrl } from "@renderer/utilities/file";
import { Hint } from "@renderer/components/Hint";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import { PanelFallback } from "@renderer/components/PanelFallback";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { BlockedMods } from "@renderer/components/Modals/BlockedMods";
import { CreateServer } from "@renderer/features/servers/CreateServer";
import { ServerCreateEmpty } from "@renderer/features/servers/ServerCreateEmpty";
import { isRunningAtom, pathsAtom, versionsAtom } from "@renderer/stores/atoms";
import { hasShaderLoader } from "@/shared/shaderLoaders";
import { navigate } from "@renderer/navigation/navigate";
import { openAccounts } from "@renderer/features/accounts/addAccountRequest";
import { getBlockingIds } from "@renderer/navigation/guards";
import { currentRouteAtom } from "@renderer/navigation/store";
import type { InstanceTab } from "@renderer/navigation/routes";
import type { RunGameParams } from "@renderer/features/launch/types";
import { ConfigsPanel } from "@renderer/features/configs/ConfigsPanel";
import {
  InstanceBanner,
  hasInstanceBanner,
} from "@renderer/features/instances/InstanceBanner";
import { InstanceLaunchProfileCard } from "@renderer/features/instances/InstanceLaunchProfileCard";
import { duplicateInstance } from "@renderer/features/instances/duplicateInstance";
import { openPortDialog } from "@renderer/features/port/portStore";
import { InstanceOverviewTab } from "@renderer/features/instances/InstanceOverviewTab";
import {
  OVERVIEW_TILE_IDS,
  buildInstanceActions,
  pickActions,
} from "@renderer/features/instances/instanceActions";
import { TagsDialog } from "@renderer/features/instances/TagsDialog";
import { instanceKey } from "@renderer/features/instances/selectors";
import { InstancePublishingCard } from "@renderer/features/instances/InstancePublishingCard";
import { InstanceSettingsPanel } from "@renderer/features/instances/InstanceSettingsPanel";
import { SharedSettingsCard } from "@renderer/features/sharedSettings/SharedSettingsCard";
import { PackChannelCard } from "@renderer/features/packAuthor/PackChannelCard";
import { usePackChannel } from "@renderer/features/packAuthor/usePackAuthor";
import { hasChannelContent } from "@renderer/features/packAuthor/packChannel";
import {
  ModTranslationRow,
  canTranslateMods,
} from "@renderer/features/instances/ModTranslationRow";
import {
  effectiveJava,
  instanceRequiredJava,
  javaLabel,
} from "@renderer/features/java/javaChoices";
import { useJavaRuntimes } from "@renderer/features/java/useJavaRuntimes";
import { InstanceStatisticsPanel } from "@renderer/features/instances/InstanceStatisticsPanel";
import { InstanceStatusChip } from "@renderer/features/instances/InstanceStatusChip";
import { InstanceTabBar } from "@renderer/features/instances/InstanceTabBar";
import { InstanceUpdateDetails } from "@renderer/features/instances/InstanceUpdateDetails";
import { countContent } from "@renderer/features/instances/contentCounts";
import { clearLauncherTemp } from "@renderer/features/instances/launcherTemp";
import {
  buildInstanceTabs,
  resolveActiveTab,
} from "@renderer/features/instances/instanceTabs";
import { resolveInstanceStatuses } from "@renderer/features/instances/instanceStatus";
import { hasUpdateDetails } from "@renderer/features/instances/updateSummary";
import { useInstanceContents } from "@renderer/features/instances/useInstanceInsights";
import { useInstanceEditor } from "@renderer/features/instances/useInstanceEditor";
import { useInstanceUpdateDetails } from "@renderer/features/instances/useInstanceUpdateDetails";
import { InstanceLoaderCard } from "@renderer/features/instances/InstanceLoaderCard";
import { LoaderVersionPanel } from "@renderer/features/instances/LoaderVersionPanel";
import { findLoaderUpdate } from "@renderer/features/instances/loaderUpdate";
import { useInstanceDataRevision } from "@renderer/features/instances/instanceRevision";
import {
  useLoaderCatalog,
  useLoaderRequirements,
} from "@renderer/features/instances/useLoaderVersions";
import {
  InstanceJarCard,
  JarModsRow,
} from "@renderer/features/instances/InstanceJarCard";
import { JarModsPanel } from "@renderer/features/instances/JarModsPanel";
import { showsJarModsCard } from "@renderer/features/instances/jarMods";
import { isModdedLoader } from "@/shared/loaderCompat";
import { useSyncGuard } from "@renderer/features/instances/useSyncGuard";
import {
  SAVED_FLASH_MS,
  useRecentFlag,
} from "@renderer/utilities/useRecentFlag";
import { bumpInstanceDataRevision } from "@renderer/features/instances/instanceRevision";
import { ModpackPanel } from "@renderer/features/modpack/ModpackPanel";
import {
  canUpdateFromArchive,
  useModpackSource,
} from "@renderer/features/modpack/useModpackSource";
import {
  LazyArguments,
  LazyDeleteVersion,
  LazyExport,
  LazyImageCropper,
  LazyBisect,
  LazyLogs,
  LazyModManager,
  LazyServerControl,
  LazyServersPanel,
  LazyShare,
  LazyWorlds,
  useInstancePanelPreload,
} from "./lazyPanels";
import {
  resolveDefaultTab,
  visibleTabs,
} from "@renderer/features/layout/layout";
import { useLayout } from "@renderer/features/layout/useLayout";
import { useBisectSession } from "@renderer/features/bisect/bisectStore";

const api = window.api;

export function InstanceScreen({
  runGame,
}: {
  runGame: (params: RunGameParams) => Promise<void>;
}) {
  const { t } = useTranslation();

  const currentRoute = useAtomValue(currentRouteAtom);
  const paths = useAtomValue(pathsAtom);
  const isLaunching = useAtomValue(isRunningAtom);

  const [isOpenExportModal, setIsOpenExportModal] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [croppedImage, setCroppedImage] = useState("");
  const [isOpenDel, setIsOpenDel] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isLoaderPanelOpen, setIsLoaderPanelOpen] = useState(false);
  const [isJarPanelOpen, setIsJarPanelOpen] = useState(false);
  const [isTagsOpen, setIsTagsOpen] = useState(false);

  const routeTab =
    currentRoute.name === "instance" ? currentRoute.tab : undefined;

  const setActiveTab = (tab: InstanceTab) => {
    if (currentRoute.name !== "instance") return;
    if (tab !== "settings") {
      setIsLoaderPanelOpen(false);
      setIsJarPanelOpen(false);
    }

    navigate({
      name: "instance",
      id: currentRoute.id,
      tab: tab === defaultTab ? undefined : tab,
    });
  };

  const closeScreen = async () => {
    navigate({ name: "home" }, { force: true });
    await clearLauncherTemp(paths.launcher);
  };

  const editor = useInstanceEditor({
    closeModal: () => void closeScreen(),
    runGame,
  });
  const isSavedShown = useRecentFlag(editor.savedAt, SAVED_FLASH_MS);

  const {
    version,
    account,
    settings,
    server,
    setServer,
    draft,
    content,
    changes,
    share,
    flags,
    isNetwork,
    isInternetOnline,
    isInstallActive,
    isOwnerVersion,
    isForeignInstance,
    isVersionRunning,
    isLoading,
    loadingType,
    nameCheck,
    canSave,
  } = editor;

  useInstancePanelPreload();

  const contents = useInstanceContents(version?.versionPath);
  const modpackState = useModpackSource(version, isInternetOnline);
  const bisectSession = useBisectSession(version?.versionPath);
  const setVersions = useSetAtom(versionsAtom);
  const updateDetails = useInstanceUpdateDetails(version);
  const syncGuard = useSyncGuard({
    versionPath: version?.versionPath,
    isDownloaded: version?.version.downloadedVersion,
    summary: updateDetails.summary,
    onSync: () => void share.sync(),
  });

  const dataRevision = useInstanceDataRevision();
  const loaderName = version?.version.loader.name;
  const isModded = isModdedLoader(loaderName);
  const loaderCatalog = useLoaderCatalog(
    isModded ? loaderName : undefined,
    version?.version.version.id,
  );
  const loaderRequirements = useLoaderRequirements(
    version?.versionPath,
    loaderName,
    isLoaderPanelOpen && routeTab === "settings",
    dataRevision,
  );
  const loaderUpdate = findLoaderUpdate(
    loaderCatalog.versions ?? [],
    version?.version.loader.version?.id,
    loaderName,
  );
  const modTitles = useMemo(() => {
    const titles = new Map<string, string>();
    for (const mod of content.mods) {
      for (const file of mod.version?.files ?? []) {
        if (file.filename) titles.set(file.filename, mod.title);
      }
    }
    return titles;
  }, [content.mods]);

  const openLoaderPanel = () => {
    setIsJarPanelOpen(false);
    setIsLoaderPanelOpen(true);
    setActiveTab("settings");
  };

  const packCode = version?.version.shareCode || undefined;
  const isPackAuthor =
    !!packCode &&
    !version?.version.downloadedVersion &&
    isOwnerVersion &&
    !!account &&
    account.type !== "plain";
  const isPackSubscriber = !!packCode && !!version?.version.downloadedVersion;
  const packChannel = usePackChannel(
    packCode,
    isPackAuthor || isPackSubscriber,
  );
  const isChannelShown = isPackAuthor
    ? !!packChannel.data
    : hasChannelContent(packChannel.data);

  const tabs = useMemo(
    () =>
      buildInstanceTabs({
        contentCount: countContent(content.mods),
        worldCount: contents.worlds,
        serverCount: editor.servers.length,
        hasConfigs: contents.hasConfigs,
        isModded,
        hasStatistics: contents.hasStatistics || isPackAuthor,
        hasServerManager: !!version?.version.version?.serverManager,
        hasOwnServer: !!server,
        canCreateServer: flags.showServerManagerAction,
        hasUnsavedSettings: changes.changeKinds.includes("settings"),
        hasUnsavedArguments: changes.changeKinds.includes("arguments"),
        hasModpack:
          !!version?.version.modpack ||
          (!!version && canUpdateFromArchive(version.version, modpackState.hasBase)),
        hasModpackUpdate: !!modpackState.update,
        hasBisect: !!bisectSession || routeTab === "bisect",
        isBisectActive: !!bisectSession,
      }),
    [
      bisectSession,
      routeTab,
      modpackState.update,
      modpackState.hasBase,
      contents,
      content.mods.length,
      editor.servers.length,
      server,
      version,
      changes.changeKinds,
      isPackAuthor,
      flags.showServerManagerAction,
      isModded,
    ],
  );

  const layout = useLayout();
  const defaultTab = resolveDefaultTab(
    tabs.map((tab) => tab.id),
    layout,
  );
  const activeTab = resolveActiveTab(tabs, routeTab ?? defaultTab);
  const shownTabs = visibleTabs(tabs, layout, activeTab);

  const saveBlockedReason = !changes.hasChanges
    ? t("versions.saveBlocked.noChanges")
    : isForeignInstance
      ? t("versions.saveBlocked.notOwner")
      : undefined;

  const shareBlockedReason = changes.hasChanges
    ? t("versions.shareBlocked.unsaved")
    : isForeignInstance
      ? t("versions.shareBlocked.notOwner")
      : !isNetwork
        ? t("app.backendUnavailable")
        : account?.type === "plain"
          ? t("versions.shareBlocked.plainAccount")
          : undefined;

  const serverBlockedReason = server
    ? isLoading
      ? t("versions.installBusy")
      : undefined
    : editor.isServerCreate
      ? t("versions.serverBlocked.installing")
      : isLoading || isInstallActive
        ? t("versions.installBusy")
        : !flags.canFetchServerCore
          ? t("versions.serverBlocked.offline")
          : undefined;

  const playBlockedReason = !account
    ? t("versions.playBlocked.noAccount")
    : isInstallActive
      ? t("versions.installBusy")
      : content.isApplying
        ? t("versions.playBlocked.applying")
        : undefined;

  const unsavedKinds = changes.changeKinds
    .map((kind) => t(`versions.unsaved.kind.${kind}`))
    .join(" · ");

  const readOnlyHint = t(
    flags.canRenameVersion
      ? "versions.readOnlyHint"
      : "versions.readOnlyHintNoRename",
  );

  const statuses = version
    ? resolveInstanceStatuses({
        running: isVersionRunning,
        installed: version.hasManifest,
        update: share.versionDiffence === "old" ? "behind" : undefined,
      })
    : [];

  const identityStatuses = (
    <span className="flex shrink-0 items-center gap-1.5">
      {isForeignInstance && (
        <Hint content={readOnlyHint}>
          <span className="flex h-5 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface-3 px-1.5 text-3xs font-medium whitespace-nowrap text-muted-foreground">
            <Lock className="size-3 shrink-0" />
            {t("versions.chip.readOnly")}
          </span>
        </Hint>
      )}
    </span>
  );

  const actionGroups = version
    ? buildInstanceActions({
        instance: version,
        t,
        canPlay:
          !!account && !isInstallActive && !isLaunching && !content.isApplying,
        isRunningInstance: isVersionRunning,
        onPlay: editor.requestPlay,
        onPlayAnother: editor.requestPlay,
        onManageTags: () => setIsTagsOpen(true),
        onDuplicate: () => void duplicateInstance(version),
        onPort: () => openPortDialog(version),
        onDelete: () => setIsOpenDel(true),
        account,
        isBusy: isInstallActive,
        screen: {
          isLoading,
          loadingType,
          isOnline: isInternetOnline,
          hasAccount: !!account,
          devMode: !!settings?.devMode,
          onCheckIntegrity: () => void editor.runIntegrityCheck(),
          onExport: () => setIsOpenExportModal(true),
          onCopyRunCommand: (relative) => void editor.copyRunCommand(relative),
          onCreateShortcut: () => void editor.createShortcut(),
        },
      })
    : [];

  const menuGroups = actionGroups
    .map((group) =>
      group.filter(
        (action) => action.id !== "play" && action.id !== "play-another",
      ),
    )
    .filter((group) => group.length > 0);

  const overviewActions = pickActions(actionGroups, OVERVIEW_TILE_IDS);

  const banner = version &&
  hasInstanceBanner({
    versionDiffence: share.versionDiffence,
    hasManifest: version.hasManifest,
  }) ? (
    <InstanceBanner
      instance={version}
      versionDiffence={share.versionDiffence}
      updateSummary={updateDetails.summary}
      isUpdateDetailsOpen={updateDetails.isOpen}
      onToggleUpdateDetails={updateDetails.toggle}
      isSyncing={isLoading && loadingType === "sync"}
      canSync={!changes.hasChanges && !isLoading && isNetwork}
      onSync={() => void syncGuard.requestSync()}
      isChecking={isLoading && loadingType === "check"}
      canRepair={!isLoading && isInternetOnline && !isVersionRunning}
      onRepair={() => void editor.runIntegrityCheck()}
    />
  ) : null;

  const publishing = version ? (
    <InstancePublishingCard
      flags={flags}
      shareBlockedReason={shareBlockedReason}
      canShare={
        !changes.hasChanges &&
        !isLoading &&
        !isForeignInstance &&
        isNetwork &&
        account?.type !== "plain"
      }
      canManageShare={
        !changes.hasChanges && !isLoading && isNetwork && isOwnerVersion
      }
      canSync={!changes.hasChanges && !isLoading && isNetwork}
      serverBlockedReason={serverBlockedReason}
      canInstallServer={!serverBlockedReason}
      hasServer={!!server}
      isCheckingDiff={isLoading && loadingType === "check_diff"}
      isSyncing={isLoading && loadingType === "sync"}
      isInstallingServer={
        (isLoading && loadingType === "server") ||
        (editor.isServerCreate && isInstallActive)
      }
      onShare={() => {
        share.setShareType("new");
        share.setShareModal(true);
      }}
      onManageShare={share.openShareManagement}
      onSync={() => void syncGuard.requestSync()}
      onInstallServer={() =>
        void editor.installServer(() => setActiveTab("server"))
      }
    />
  ) : null;

  const channelCard =
    version && packCode && isChannelShown ? (
      <PackChannelCard
        key={packCode}
        code={packCode}
        isAuthor={isPackAuthor}
        playBlockedReason={
          playBlockedReason ??
          (isLaunching ? t("packAuthor.channel.launching") : undefined)
        }
        onPlayServer={(address) =>
          void runGame({ version, quick: { multiplayer: address } })
        }
      />
    ) : null;

  const resolved = resolveInstanceSettings(settings, draft.overrides);
  const javaRuntimes = useJavaRuntimes();

  return (
    <>
      <section className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex h-13 shrink-0 items-center gap-1 border-b border-border">
          <InstanceTabBar
            items={shownTabs}
            active={activeTab}
            onSelect={setActiveTab}
          />

          <div className="flex shrink-0 items-center pl-2">
            <CollapseInline show={isInstallActive}>
              {isInstallActive ? (
                <Hint content={t("versions.installBusy")}>
                  <span className="mr-2 flex h-5 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface-3 px-1.5 text-3xs font-medium whitespace-nowrap text-muted-foreground">
                    <Loader2 className="size-3 shrink-0 animate-spin" />
                    {t("versions.chip.installing")}
                  </span>
                </Hint>
              ) : null}
            </CollapseInline>

            <CollapseInline show={!isInternetOnline}>
              {!isInternetOnline ? (
                <Hint content={t("versions.offlineHint")}>
                  <span className="mr-2 flex h-5 shrink-0 items-center gap-1.5 rounded-md border border-warning/30 bg-warning/12 px-1.5 text-3xs font-medium whitespace-nowrap text-warning">
                    <WifiOff className="size-3 shrink-0" />
                    {t("versions.chip.offline")}
                  </span>
                </Hint>
              ) : null}
            </CollapseInline>

            {(["running", "update"] as const).map((kind) => (
              <CollapseInline key={kind} show={statuses.includes(kind)}>
                {statuses.includes(kind) ? (
                  <InstanceStatusChip kind={kind} className="mr-2" />
                ) : null}
              </CollapseInline>
            ))}

            <CollapseInline show={!account}>
              {!account ? (
                <Hint content={playBlockedReason}>
                  <button
                    type="button"
                    onClick={openAccounts}
                    className="mr-2 flex h-5 shrink-0 items-center gap-1.5 rounded-md border border-warning/30 bg-warning/12 px-1.5 text-3xs font-medium whitespace-nowrap text-warning transition-colors hover:bg-warning/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <CircleUserRound className="size-3 shrink-0" />
                    {t("accounts.signIn")}
                  </button>
                </Hint>
              ) : null}
            </CollapseInline>

            <Hint
              content={
                playBlockedReason ??
                (isVersionRunning && !isLaunching
                  ? t("versions.playAnotherInstance")
                  : undefined)
              }
            >
              <Button
                type="button"
                className="h-11 px-5"
                disabled={
                  !account || isInstallActive || isLaunching || content.isApplying
                }
                onClick={editor.requestPlay}
              >
                {isLaunching || content.isApplying ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Play />
                )}
                {isVersionRunning && !isLaunching
                  ? t("versions.playAnotherShort")
                  : t("nav.play")}
              </Button>
            </Hint>

            <DropdownMenu>
              <Hint content={t("common.more")}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="ml-1"
                    aria-label={t("common.more")}
                  >
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
              </Hint>
              <DropdownMenuContent align="end" className="w-60">
                {menuGroups.map((group, index) => (
                  <div key={group[0]?.id ?? index}>
                    {index > 0 && <DropdownMenuSeparator />}
                    {group.map((action) => (
                      <DropdownMenuItem
                        key={action.id}
                        variant={action.destructive ? "destructive" : "default"}
                        disabled={action.disabled}
                        onSelect={action.onSelect}
                      >
                        <action.icon />
                        <span>{action.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div
          id="instance-tabpanel"
          role="tabpanel"
          aria-labelledby={`instance-tab-${activeTab}`}
          className="min-h-0 flex-1 overflow-hidden pt-3"
        >
          {activeTab === "modpack" && version ? (
            <ModpackPanel
              instance={version}
              state={modpackState}
              account={account}
              server={server}
              isOnline={isInternetOnline}
              isRunning={isVersionRunning}
              isBusy={isLoading || isInstallActive || content.isApplying}
              isReadOnly={isForeignInstance}
              hasUnsavedChanges={changes.hasChanges}
              onUpdated={() => {
                draft.reset();
                bumpInstanceDataRevision();
                setVersions((previous) => [...previous]);
                void share.refreshPublishDiff();
              }}
            />
          ) : activeTab === "bisect" && version ? (
            <Suspense fallback={<PanelFallback variant="rail" />}>
              <LazyBisect
                version={version}
                mods={content.mods}
                isRunning={isVersionRunning}
                runGame={runGame}
              />
            </Suspense>
          ) : activeTab === "logs" && version ? (
            <Suspense fallback={<PanelFallback variant="rail" />}>
              <LazyLogs runGame={runGame} />
            </Suspense>
          ) : activeTab === "server" && version && server ? (
            <Suspense fallback={<PanelFallback variant="stacked" />}>
              <LazyServerControl onDelete={() => setServer(undefined)} />
            </Suspense>
          ) : activeTab === "server" && version ? (
            <ServerCreateEmpty
              blockedReason={serverBlockedReason}
              isInstalling={
                (isLoading && loadingType === "server") ||
                (editor.isServerCreate && isInstallActive)
              }
              onCreate={() =>
                void editor.installServer(() => setActiveTab("server"))
              }
            />
          ) : activeTab === "statistics" && version ? (
            <InstanceStatisticsPanel
              instance={version}
              authorCode={isPackAuthor ? packCode : null}
            />
          ) : activeTab === "configs" && version ? (
            <ConfigsPanel
              versionPath={version.versionPath}
              disabled={isLoading}
              mods={content.mods}
              onRunGame={editor.requestPlay}
              runBlockedReason={
                playBlockedReason ??
                (isLaunching ? t("packAuthor.channel.launching") : undefined)
              }
            />
          ) : activeTab === "settings" && version && isJarPanelOpen ? (
            <JarModsPanel
              instance={version}
              lockedReason={
                isForeignInstance
                  ? readOnlyHint
                  : isVersionRunning
                    ? t("instanceSettings.runningHint")
                    : undefined
              }
              onClose={() => setIsJarPanelOpen(false)}
            />
          ) : activeTab === "settings" &&
            version &&
            isLoaderPanelOpen &&
            isModded ? (
            <LoaderVersionPanel
              instance={version}
              versions={loaderCatalog.versions}
              isCatalogLoading={loaderCatalog.isLoading}
              catalogFailed={loaderCatalog.failed}
              onReloadCatalog={loaderCatalog.reload}
              scan={loaderRequirements.scan}
              isScanning={loaderRequirements.isLoading}
              modTitles={modTitles}
              blockInput={{
                isReadOnly: isForeignInstance,
                hasAccount: !!account,
                isRunning: isVersionRunning,
                isInstallActive,
                isBusy: isLoading,
                isOnline: isInternetOnline,
              }}
              isChanging={isLoading && loadingType === "loader"}
              isPublishedByOwner={
                !!version.version.shareCode &&
                !version.version.downloadedVersion &&
                !isForeignInstance
              }
              hasServer={!!server}
              onChange={(targetId) => void editor.changeLoaderVersion(targetId)}
              onClose={() => setIsLoaderPanelOpen(false)}
            />
          ) : activeTab === "settings" && version ? (
            <InstanceSettingsPanel
              requiredJavaMajor={instanceRequiredJava(version)}
              overrides={draft.overrides}
              disabled={isLoading || isVersionRunning || isForeignInstance}
              hint={
                isForeignInstance
                  ? readOnlyHint
                  : isVersionRunning
                    ? t("instanceSettings.runningHint")
                    : undefined
              }
              onChange={draft.setOverrides}
              minecraftVersion={version.version.version.id}
              shaderLoader={hasShaderLoader({
                mods: content.mods,
                jarMods: version.version.jarMods,
              })}
              loaderCard={
                isModded ? (
                  <InstanceLoaderCard
                    loader={version.version.loader.name}
                    currentId={version.version.loader.version?.id}
                    minecraftVersion={version.version.version.id}
                    update={loaderUpdate}
                    isChecking={loaderCatalog.isLoading}
                    catalogFailed={loaderCatalog.failed}
                    isChanging={isLoading && loadingType === "loader"}
                    onOpen={() => setIsLoaderPanelOpen(true)}
                    footer={
                      showsJarModsCard(version.version) ? (
                        <JarModsRow
                          conf={version.version}
                          onOpen={() => setIsJarPanelOpen(true)}
                        />
                      ) : undefined
                    }
                  />
                ) : showsJarModsCard(version.version) ? (
                  <InstanceJarCard
                    conf={version.version}
                    onOpen={() => setIsJarPanelOpen(true)}
                  />
                ) : undefined
              }
              languageRow={
                canTranslateMods(
                  settings.lang,
                  version.version.version.id,
                  version.version.loader.name,
                ) ? (
                  <ModTranslationRow
                    versionPath={version.versionPath}
                    mcVersion={version.version.version.id}
                    loader={version.version.loader.name}
                    disabled={
                      isLoading || isVersionRunning || isForeignInstance
                    }
                  />
                ) : undefined
              }
              sharedCard={
                <SharedSettingsCard
                  instance={version}
                  disabled={isLoading || isVersionRunning || isForeignInstance}
                />
              }
              profileCard={
                <InstanceLaunchProfileCard
                  runArguments={draft.runArguments}
                  memoryMb={resolved.xmx}
                  optimizedJvm={resolved.optimizedJvm}
                  java={javaLabel(
                    effectiveJava(
                      draft.overrides?.java,
                      instanceRequiredJava(version),
                      javaRuntimes.list,
                    ),
                  )}
                  canCopy={!isLoading && !!account}
                  onCopy={() => void editor.copyRunCommand(false)}
                />
              }
            />
          ) : activeTab === "arguments" && version ? (
            <Suspense fallback={<PanelFallback variant="card" />}>
              <LazyArguments
                embedded
                settings={resolved}
                runArguments={draft.runArguments}
                onClose={() => setActiveTab("overview")}
                setArguments={draft.setRunArguments}
              />
            </Suspense>
          ) : activeTab === "servers" && version ? (
            editor.isServersReady ? (
              <Suspense fallback={<PanelFallback variant="master-detail" />}>
                <LazyServersPanel
                  quickConnectIp={editor.quickConnectIp}
                  setQuickConnectIp={(ip) => void editor.setQuickConnectIp(ip)}
                  onPlayed={() => setActiveTab("overview")}
                  servers={editor.servers}
                  setServers={editor.setServers}
                  runGame={runGame}
                />
              </Suspense>
            ) : (
              <PanelFallback variant="master-detail" />
            )
          ) : activeTab === "worlds" && version ? (
            <Suspense fallback={<PanelFallback variant="rail" />}>
              <LazyWorlds
                onClose={(isFull) => {
                  if (isFull && !changes.hasChanges) void closeScreen();
                  else setActiveTab("overview");
                }}
                runGame={runGame}
                mods={content.mods}
              />
            </Suspense>
          ) : activeTab === "content" && version ? (
            <Suspense fallback={<PanelFallback variant="board" />}>
              <LazyModManager
                mods={content.mods}
                commitMods={content.commitMods}
                onClose={() => setActiveTab("overview")}
                loader={version.version.loader.name}
                version={version.version.version}
                isModpacks={false}
                setLoader={() => {}}
                setModpack={() => {}}
                setVersion={() => {}}
                running={isVersionRunning}
                versionPath={version.versionPath}
                onOpenWorlds={() => setActiveTab("worlds")}
              />
            </Suspense>
          ) : version ? (
            <InstanceOverviewTab
              instance={version}
              image={draft.image}
              versionName={draft.name}
              editName={draft.editName}
              nameCheck={nameCheck}
              isLoading={isLoading}
              canRename={flags.canRenameVersion && !isVersionRunning}
              canEditLogo={flags.canEditLogo}
              contentCount={countContent(content.mods)}
              argumentCount={
                parseArgs(draft.runArguments.jvm).length +
                parseArgs(draft.runArguments.game).length
              }
              statistics={editor.statistics}
              memoryMb={resolved.xmx}
              loaderFact={
                isModded
                  ? {
                      currentId: version.version.loader.version?.id,
                      update: loaderUpdate,
                    }
                  : undefined
              }
              onOpenLoader={openLoaderPanel}
              modpackFact={
                version.version.modpack
                  ? {
                      title: version.version.modpack.title,
                      version: version.version.modpack.versionNumber,
                      provider: version.version.modpack.provider,
                      update: modpackState.update
                        ? (modpackState.update.versionNumber ??
                          modpackState.update.name)
                        : undefined,
                    }
                  : undefined
              }
              actions={overviewActions}
              statuses={identityStatuses}
              banner={banner}
              updateDetails={
                updateDetails.isOpen &&
                updateDetails.summary &&
                hasUpdateDetails(updateDetails.summary) ? (
                  <InstanceUpdateDetails
                    summary={updateDetails.summary}
                    isDownloaded={version.version.downloadedVersion}
                    onClose={updateDetails.close}
                  />
                ) : null
              }
              publishing={publishing}
              channel={channelCard}
              onOpenTab={setActiveTab}
              onNameChange={draft.setName}
              onStartRename={() => draft.setEditName(true)}
              onCancelRename={editor.cancelRename}
              onCommitRename={() => void editor.renameInstance()}
              onPickLogo={async () => {
                const filePaths = await api.other.openFileDialog();
                if (!filePaths || filePaths.length === 0) return;
                setCroppedImage(filePaths[0]);
                setIsCropping(true);
              }}
              onApplyLogo={(blob) => {
                const url = URL.createObjectURL(blob);
                draft.setImage((prev) => revokePreviousBlobUrl(prev, url) ?? "");
                draft.setIsLogoChanged(true);
              }}
              onRemoveLogo={() => {
                draft.setImage("");
                draft.setIsLogoChanged(true);
              }}
              onUseScreenshotAsCover={(file) => {
                setCroppedImage(file);
                setIsCropping(true);
              }}
            />
          ) : null}
        </div>

        <Collapse show={changes.hasChanges || isSavedShown}>
          {!changes.hasChanges && isSavedShown ? (
            <footer
              role="status"
              className="mt-3 flex h-14 items-center gap-2 border-t border-border pt-3 text-xs"
            >
              <CircleCheck className="size-4 shrink-0 text-success" />
              <span className="font-medium">{t("versions.savedInline")}</span>
            </footer>
          ) : changes.hasChanges ? (
            <footer className="mt-3 flex h-14 items-center gap-3 border-t border-border pt-3">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                <span className="size-1.5 shrink-0 rounded-full bg-warning" />
                <span className="shrink-0 font-medium">
                  {t("versions.unsaved.title")}
                </span>
                <Hint content={unsavedKinds} variant="text" truncatedOnly>
                  <span className="min-w-0 truncate text-muted-foreground">
                    {unsavedKinds}
                  </span>
                </Hint>
                {!canSave && saveBlockedReason && (
                  <span className="shrink-0 text-warning">
                    {saveBlockedReason}
                  </span>
                )}
              </span>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isLoading}
                onClick={() => setIsResetOpen(true)}
              >
                <RotateCcw />
                {t("common.reset")}
              </Button>

              <Button
                type="button"
                variant="secondary"
                disabled={!canSave}
                onClick={() => void editor.commitSave()}
              >
                {isLoading && loadingType === "save" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save />
                )}
                {t("common.save")}
              </Button>
            </footer>
          ) : null}
        </Collapse>
      </section>

      {share.isShareModal && (
        <Suspense fallback={<LazyDialogFallback variant="form" />}>
          <LazyShare
            closeModal={() => share.setShareModal(false)}
            shareType={share.shareType}
            modpack={share.tempModpack}
            diffenceUpdateData={share.diffenceUpdateData}
            onPublished={() => {
              share.setVersionDiffence("sync");
              share.setDiffenceUpdateData("");
            }}
          />
        </Suspense>
      )}

      {editor.isServerCreate && (
        <CreateServer
          close={editor.closeServerCreate}
          serverCores={editor.serverCores}
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
              draft.setImage((prev) => revokePreviousBlobUrl(prev, url) ?? "");
              draft.setIsLogoChanged(true);
            }}
          />
        </Suspense>
      )}

      {syncGuard.confirmation}

      {share.isOpenShareModal && (
        <Confirmation
          title={t("versions.publicUpdateAsk")}
          content={[{ text: t("versions.publicUpdate") }]}
          onClose={() => share.setIsOpenModalShare(false)}
          buttons={[
            {
              text: t("common.update"),
              color: "primary",
              onClick: editor.confirmPublicUpdate,
              loading: isLoading && loadingType === "check_diff",
            },
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: async () => share.setIsOpenModalShare(false),
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
                editor.forgetInstance();
                void closeScreen();
              }
            }}
          />
        </Suspense>
      )}

      {isResetOpen && changes.hasChanges && (
        <Confirmation
          title={t("versions.resetConfirm.title")}
          onClose={() => setIsResetOpen(false)}
          reversible={false}
          content={[
            {
              text: t("versions.resetConfirm.body", {
                kinds: changes.changeKinds
                  .map((kind) => t(`versions.unsaved.kind.${kind}`))
                  .join(", "),
              }),
              color: "warning",
            },
          ]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setIsResetOpen(false),
            },
            {
              text: t("common.reset"),
              color: "danger",
              onClick: () => {
                editor.resetDraft();
                setIsResetOpen(false);
              },
            },
          ]}
        />
      )}

      {editor.isPlayAskOpen && changes.hasChanges && (
        <Confirmation
          title={t("versions.playAsk.title")}
          onClose={editor.closePlayAsk}
          content={[
            {
              text: t("versions.playAsk.body", { kinds: unsavedKinds }),
            },
          ]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: editor.closePlayAsk,
            },
            {
              text: t("versions.playAsk.saveAndPlay"),
              color: "primary",
              loading: isLoading && loadingType === "save",
              onClick: editor.saveAndPlay,
            },
          ]}
        />
      )}

      {isTagsOpen && version && (
        <TagsDialog
          instanceKey={instanceKey(version)}
          name={version.version.name}
          onClose={() => setIsTagsOpen(false)}
        />
      )}

      {editor.isBlockedMods && editor.blockedMods.length > 0 && (
        <BlockedMods
          mods={editor.blockedMods}
          onClose={editor.resolveBlockedMods}
        />
      )}

      {editor.isNotSavedOpen && (
        <Confirmation
          content={[
            {
              text: getBlockingIds().includes("instance-configs")
                ? t("configs.unsavedHint")
                : t("versions.notSavedHint"),
              color: "warning",
            },
          ]}
          onClose={() => editor.closeNotSaved()}
          title={
            getBlockingIds().includes("instance-configs")
              ? t("versions.configNotSavedAsk")
              : t("versions.notSavedAsk")
          }
          reversible={false}
          buttons={[
            {
              text: t("versions.willReturn"),
              color: "secondary",
              onClick: async () => editor.keepEditing(),
            },
            {
              color: "danger",
              text: t("versions.discardChanges"),
              onClick: async () => editor.discardChanges(),
            },
          ]}
        />
      )}
    </>
  );
}
