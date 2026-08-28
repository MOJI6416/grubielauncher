import { Suspense, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  CopySlash,
  Ellipsis,
  FolderArchive,
  FolderOpen,
  Loader2,
  Lock,
  MonitorDown,
  Play,
  RotateCcw,
  Save,
  ScanLine,
  SquareTerminal,
  Trash,
  WifiOff,
} from "lucide-react";
import { ILocalProject } from "@/types/ModManager";
import { Button } from "@/components/ui/button";
import { Collapse, CollapseInline } from "@/components/ui/collapse";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { resolveInstanceSettings } from "@/shared/instanceSettings";
import { parseArgs } from "@renderer/utilities/jvmArguments";
import { revokePreviousBlobUrl } from "@renderer/utilities/file";
import { Hint } from "@renderer/components/Hint";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import { PanelFallback } from "@renderer/components/PanelFallback";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { BlockedMods } from "@renderer/components/Modals/BlockedMods";
import { CreateServer } from "@renderer/features/servers/CreateServer";
import { isRunningAtom, pathsAtom } from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
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
import {
  InstanceOverviewTab,
  OverviewAction,
} from "@renderer/features/instances/InstanceOverviewTab";
import { InstancePublishingCard } from "@renderer/features/instances/InstancePublishingCard";
import { InstanceSettingsPanel } from "@renderer/features/instances/InstanceSettingsPanel";
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
import { useSyncGuard } from "@renderer/features/instances/useSyncGuard";
import {
  LazyArguments,
  LazyDeleteVersion,
  LazyExport,
  LazyImageCropper,
  LazyLogs,
  LazyModManager,
  LazyServerControl,
  LazyServersPanel,
  LazyShare,
  LazyWorlds,
  useInstancePanelPreload,
} from "./lazyPanels";

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

  const routeTab =
    currentRoute.name === "instance" ? currentRoute.tab : undefined;

  const setActiveTab = (tab: InstanceTab) => {
    if (currentRoute.name !== "instance") return;

    navigate({
      name: "instance",
      id: currentRoute.id,
      tab: tab === "overview" ? undefined : tab,
    });
  };

  const closeScreen = async () => {
    navigate({ name: "home" }, { force: true });
    await clearLauncherTemp(paths.launcher);
  };

  const editor = useInstanceEditor({ closeModal: () => void closeScreen() });

  const {
    version,
    account,
    settings,
    server,
    setServer,
    draft,
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
    isNameValid,
    canSave,
  } = editor;

  useInstancePanelPreload();

  const contents = useInstanceContents(version?.versionPath);
  const updateDetails = useInstanceUpdateDetails(version);
  const syncGuard = useSyncGuard({
    versionPath: version?.versionPath,
    isDownloaded: version?.version.downloadedVersion,
    summary: updateDetails.summary,
    onSync: () => void share.sync(),
  });

  const tabs = useMemo(
    () =>
      buildInstanceTabs({
        contentCount: countContent(draft.mods),
        worldCount: contents.worlds,
        serverCount: draft.servers.length,
        hasSaves: contents.hasSaves,
        hasConfigs: contents.hasConfigs,
        hasStatistics: contents.hasStatistics,
        hasServerManager: !!version?.version.version?.serverManager,
        hasOwnServer: !!server,
        hasUnsavedContent: changes.changeKinds.includes("content"),
      }),
    [
      contents,
      draft.mods.length,
      draft.servers.length,
      server,
      version,
      changes.changeKinds,
    ],
  );

  const activeTab = resolveActiveTab(tabs, routeTab);

  const saveBlockedReason = !isNameValid
    ? t("versions.saveBlocked.invalidName")
    : !changes.hasChanges
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
      : undefined;

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
        downloaded: version.version.downloadedVersion,
      })
    : [];

  const identityStatuses = (
    <span className="flex shrink-0 items-center gap-1.5">
      {statuses
        .filter((kind) => kind === "downloaded")
        .map((kind) => (
          <InstanceStatusChip key={kind} kind={kind} />
        ))}

      {isForeignInstance && (
        <Hint content={readOnlyHint}>
          <span className="flex h-5 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface-3 px-1.5 text-[0.65rem] font-medium whitespace-nowrap text-muted-foreground">
            <Lock className="size-3 shrink-0" />
            {t("versions.chip.readOnly")}
          </span>
        </Hint>
      )}
    </span>
  );

  const overviewActions: OverviewAction[] = version
    ? [
        {
          id: "folder",
          label: t("common.openFolder"),
          icon: FolderOpen,
          onSelect: () => void api.shell.openPath(version.versionPath),
        },
        {
          id: "integrity",
          label: t("versions.checkIntegrity"),
          icon: ScanLine,
          busy: isLoading && loadingType === "check",
          disabled: isLoading || !isInternetOnline || isVersionRunning,
          hint: !isInternetOnline
            ? t("versions.integrityBlocked.offline")
            : isVersionRunning
              ? t("versions.integrityBlocked.running")
              : t("versions.integrityHint"),
          onSelect: () => void editor.runIntegrityCheck(),
        },
        {
          id: "export",
          label: t("export.btn"),
          icon: FolderArchive,
          disabled: isLoading,
          hint: t("export.contents"),
          onSelect: () => setIsOpenExportModal(true),
        },
        {
          id: "shortcut",
          label: t("versions.createShortcut"),
          icon: MonitorDown,
          busy: isLoading && loadingType === "shortcut",
          disabled: isLoading,
          hint: t("versions.shortcutHint"),
          onSelect: () => void editor.createShortcut(),
        },
      ]
    : [];

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

  const resolved = resolveInstanceSettings(settings, draft.overrides);

  return (
    <>
      <section className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border">
          <InstanceTabBar
            items={tabs}
            active={activeTab}
            onSelect={setActiveTab}
          />

          <div className="flex shrink-0 items-center pl-2">
            <CollapseInline show={isInstallActive}>
              {isInstallActive ? (
                <Hint content={t("versions.installBusy")}>
                  <span className="mr-2 flex h-5 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface-3 px-1.5 text-[0.65rem] font-medium whitespace-nowrap text-muted-foreground">
                    <Loader2 className="size-3 shrink-0 animate-spin" />
                    {t("versions.chip.installing")}
                  </span>
                </Hint>
              ) : null}
            </CollapseInline>

            <CollapseInline show={!isInternetOnline}>
              {!isInternetOnline ? (
                <Hint content={t("versions.offlineHint")}>
                  <span className="mr-2 flex h-5 shrink-0 items-center gap-1.5 rounded-md border border-warning/30 bg-warning/12 px-1.5 text-[0.65rem] font-medium whitespace-nowrap text-warning">
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

            <Hint content={playBlockedReason}>
              <Button
                type="button"
                size="sm"
                variant={changes.hasChanges ? "secondary" : "default"}
                className="h-8"
                disabled={!account || isInstallActive || isLaunching}
                onClick={() => version && void runGame({ version })}
              >
                {isLaunching ? <Loader2 className="animate-spin" /> : <Play />}
                {isVersionRunning
                  ? t("versions.playAnotherInstance")
                  : t("nav.play")}
              </Button>
            </Hint>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("common.more")}
                >
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  disabled={isLoading || !account}
                  onSelect={() => void editor.copyRunCommand(false)}
                >
                  <SquareTerminal />
                  {t("versions.runCommand")}
                </DropdownMenuItem>

                {settings?.devMode && (
                  <DropdownMenuItem
                    disabled={isLoading || !account}
                    onSelect={() => void editor.copyRunCommand(true)}
                  >
                    <CopySlash />
                    {t("versions.copyRelativePath")}
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isLoading || isInstallActive || isVersionRunning}
                  onSelect={() => setIsOpenDel(true)}
                >
                  <Trash />
                  {t("versions.deleteInstance")}
                </DropdownMenuItem>
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
          {activeTab === "logs" && version ? (
            <Suspense fallback={<PanelFallback variant="rail" />}>
              <LazyLogs runGame={runGame} />
            </Suspense>
          ) : activeTab === "server" && version && server ? (
            <Suspense fallback={<PanelFallback variant="stacked" />}>
              <LazyServerControl
                onDelete={() => {
                  setServer(undefined);
                  setActiveTab("overview");
                }}
              />
            </Suspense>
          ) : activeTab === "statistics" && version ? (
            <InstanceStatisticsPanel instance={version} />
          ) : activeTab === "configs" && version ? (
            <ConfigsPanel
              versionPath={version.versionPath}
              disabled={isLoading}
            />
          ) : activeTab === "settings" && version ? (
            <div className="grid h-full min-h-0 grid-cols-[minmax(0,440px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3">
              <div className="flex min-h-0 flex-col gap-3">
                <InstanceSettingsPanel
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
                />

                <InstanceLaunchProfileCard
                  runArguments={draft.runArguments}
                  memoryMb={resolved.xmx}
                  optimizedJvm={resolved.optimizedJvm}
                  javaMajorVersion={version.javaMajorVersion}
                  canCopy={!isLoading && !!account}
                  onCopy={() => void editor.copyRunCommand(false)}
                />
              </div>

              <Suspense fallback={<PanelFallback variant="card" />}>
                <LazyArguments
                  embedded
                  settings={resolved}
                  runArguments={draft.runArguments}
                  onClose={() => setActiveTab("overview")}
                  setArguments={draft.setRunArguments}
                />
              </Suspense>
            </div>
          ) : activeTab === "servers" && version ? (
            draft.isReady ? (
              <Suspense fallback={<PanelFallback variant="master-detail" />}>
                <LazyServersPanel
                  quickConnectIp={draft.quickConnectIp}
                  setQuickConnectIp={draft.setQuickConnectIp}
                  onPlayed={() => setActiveTab("overview")}
                  servers={draft.servers}
                  setServers={draft.setServers}
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
                mods={draft.mods}
              />
            </Suspense>
          ) : activeTab === "content" && version ? (
            <Suspense fallback={<PanelFallback variant="board" />}>
              <LazyModManager
                mods={draft.mods}
                setMods={(m: ILocalProject[]) => draft.setMods(m)}
                onClose={() => setActiveTab("overview")}
                loader={version.version.loader.name}
                version={version.version.version}
                isModpacks={false}
                setLoader={() => {}}
                setModpack={() => {}}
                setVersion={() => {}}
                pendingRemovedLocalProjects={draft.pendingRemovedLocalMods}
                setPendingRemovedLocalProjects={
                  draft.setPendingRemovedLocalMods
                }
                running={isVersionRunning}
                versionPath={version.versionPath}
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
              contentCount={countContent(draft.mods)}
              argumentCount={
                parseArgs(draft.runArguments.jvm).length +
                parseArgs(draft.runArguments.game).length
              }
              statistics={editor.statistics}
              memoryMb={resolved.xmx}
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
              onOpenTab={setActiveTab}
              onNameChange={draft.setName}
              onStartRename={() => draft.setEditName(true)}
              onCancelRename={() => {
                draft.setEditName(false);
                draft.setName(version.version.name);
              }}
              onCommitRename={() => draft.setEditName(false)}
              onPickLogo={async () => {
                const filePaths = await api.other.openFileDialog();
                if (!filePaths || filePaths.length === 0) return;
                setCroppedImage(filePaths[0]);
                setIsCropping(true);
              }}
              onRemoveLogo={() => {
                draft.setImage("");
                draft.setIsLogoChanged(true);
              }}
            />
          ) : null}
        </div>

        <Collapse show={changes.hasChanges}>
          {changes.hasChanges ? (
            <footer className="mt-3 flex h-14 items-center gap-3 border-t border-border pt-3">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    canSave ? "bg-primary" : "bg-warning",
                  )}
                />
                <span className="shrink-0 font-medium">
                  {t("versions.unsaved.title")}
                </span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {changes.changeKinds
                    .map((kind) => t(`versions.unsaved.kind.${kind}`))
                    .join(" · ")}
                </span>
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

              <Hint content={saveBlockedReason}>
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
              </Hint>
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
          title={t("versions.publicUpdateTitle")}
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
                draft.reset();
                setIsResetOpen(false);
              },
            },
          ]}
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
              ? t("configs.unsavedTitle")
              : t("versions.notSavedTitle")
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
