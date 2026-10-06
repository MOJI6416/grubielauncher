import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SiCurseforge, SiModrinth } from "react-icons/si";
import {
  ArrowUp,
  Copy,
  ExternalLink,
  FileUp,
  FolderOpen,
  History,
  ListTree,
  Loader2,
  PackagePlus,
  RotateCcw,
  ScrollText,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ILocalAccount } from "@/types/Account";
import {
  Provider,
  type IProject,
  type IVersion as IProjectVersion,
} from "@/types/ModManager";
import type { DownloaderInfo } from "@/types/Downloader";
import type { IServerConf } from "@/types/Server";
import { Version } from "@renderer/classes/Version";
import { Hint } from "@renderer/components/Hint";
import { BlockedMods, type IBlockedMod } from "@renderer/components/Modals/BlockedMods";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import { formatCompactNumber, formatDate } from "@renderer/features/mods/format";
import {
  useTranslatableText,
  useVersionChangelog,
} from "@renderer/features/mods/changelog";
import { TranslateToggle } from "@renderer/features/mods/TranslateToggle";
import type { ModpackDownloadStage } from "@renderer/features/newInstance/downloadModpack";
import { pathsAtom, settingsAtom } from "@renderer/stores/atoms";
import { Markdown } from "@renderer/utilities/markdown";
import { showFailureToast } from "@renderer/utilities/failures";
import { SectionCard } from "@renderer/features/instances/SectionCard";
import {
  applyModpackUpdate,
  prepareModpackUpdate,
  prepareModpackUpdateFromFile,
  remergeModpackUpdate,
  rollbackModpackUpdate,
  type ModpackPrepareResult,
  type PreparedModpackUpdate,
} from "./modpackUpdate";
import {
  classifyModpackVersions,
  installedModpackVersion,
  modpackVersionLabel,
  type ModpackVersionRow,
} from "./modpackVersions";
import { ModpackUpdatePreview } from "./ModpackUpdatePreview";
import { canFollowModpack, type ModpackSourceState } from "./useModpackSource";

const api = window.api;

type Phase = "idle" | "preparing" | "preview" | "applying" | "rollingBack";

function siteName(provider: Provider): string {
  return provider === Provider.CURSEFORGE ? "CurseForge" : "Modrinth";
}

function SiteIcon({ provider, className }: { provider: Provider; className?: string }) {
  return provider === Provider.CURSEFORGE ? (
    <SiCurseforge className={className} />
  ) : (
    <SiModrinth className={className} />
  );
}

function Chip({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "success" | "warning";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "flex h-5 shrink-0 items-center rounded-md border px-1.5 text-[0.65rem] font-medium whitespace-nowrap",
        tone === "success" && "border-success/30 bg-success/12 text-success",
        tone === "warning" && "border-warning/30 bg-warning/12 text-warning",
        tone === "muted" && "border-border bg-surface-3 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-2 px-2.5 py-1.5">
      <p className="truncate font-mono text-xs font-medium tabular-nums">
        {value ?? "—"}
      </p>
      <p className="truncate text-[0.65rem] text-faint">{label}</p>
    </div>
  );
}

export interface ModpackPanelProps {
  instance: Version;
  state: ModpackSourceState;
  account?: ILocalAccount;
  server?: IServerConf;
  isOnline: boolean;
  isRunning: boolean;
  isBusy: boolean;
  isReadOnly: boolean;
  hasUnsavedChanges: boolean;
  onUpdated: () => void;
}

export function ModpackPanel(props: ModpackPanelProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { instance, state } = props;
  const settings = useAtomValue(settingsAtom);
  const paths = useAtomValue(pathsAtom);

  const source = state.source;
  const conf = instance.version;
  const gameVersion = conf.version.id;
  const provider = source?.provider ?? Provider.MODRINTH;
  const site = siteName(provider);

  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState<ModpackDownloadStage>(null);
  const [extractPercent, setExtractPercent] = useState<number | null>(null);
  const [downloadInfo, setDownloadInfo] = useState<DownloaderInfo | null>(null);
  const [prepared, setPrepared] = useState<PreparedModpackUpdate | null>(null);
  const [restoreRemoved, setRestoreRemoved] = useState(false);
  const [blockedPack, setBlockedPack] = useState<{
    blocked: IBlockedMod;
    target: IProjectVersion;
  } | null>(null);
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[] | null>(null);

  const rows = useMemo(
    () =>
      classifyModpackVersions(
        state.versions,
        installedModpackVersion(source),
        gameVersion,
      ),
    [gameVersion, source, state.versions],
  );
  const visibleRows = useMemo(
    () =>
      showAll
        ? rows
        : rows.filter((row) => row.sameGame || row.relation === "current"),
    [rows, showAll],
  );

  const fallbackId = state.update?.id ?? source?.versionId ?? null;
  const selected: ModpackVersionRow | undefined =
    rows.find((row) => row.version.id === (selectedId ?? fallbackId)) ??
    rows.find((row) => row.version.id === source?.versionId);

  useEffect(() => {
    if (phase !== "preparing") return;
    return api.events.onDownloaderInfo(setDownloadInfo);
  }, [phase]);

  const preparedRoot = prepared?.pack.folderPath;
  useEffect(() => {
    if (!preparedRoot) return;
    return () => {
      void api.fs.rimraf(preparedRoot).catch(() => undefined);
    };
  }, [preparedRoot]);

  const selectedVersion = selected?.version;
  const changelog = useVersionChangelog({
    provider: source?.provider,
    projectId: source?.projectId,
    version: selectedVersion,
  });
  const changelogText = useTranslatableText(changelog.key, changelog.text);

  if (!source) return null;

  const project: IProject | null = state.project;
  const title = project?.title || source.title;
  const projectUrl = project?.url || source.url;
  const currentLabel = source.versionNumber;

  const followBlocked = !canFollowModpack(conf)
    ? t("modpack.blocked.downloaded")
    : state.hasBase === false
      ? t("modpack.blocked.noBase")
      : props.isReadOnly
        ? t("versions.readOnlyHint")
        : undefined;

  const actionBlocked =
    followBlocked ??
    (props.hasUnsavedChanges
      ? t("modpack.blocked.unsaved")
      : props.isRunning
        ? t("modpack.blocked.running")
        : !props.isOnline
          ? t("modpack.blocked.offline", { site })
          : props.isBusy || phase !== "idle"
            ? t("versions.installBusy")
            : undefined);

  const report = (result: ModpackPrepareResult): PreparedModpackUpdate | null => {
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
        showFailureToast(t("modpack.failed"), result.error, {
          channels: ["modManager:checkModpack", "file:download", "version:import"],
          fallbackDescription: t("modpack.downloadFailedHint", { site }),
        });
        return null;
      default:
        return null;
    }
  };

  const startPrepare = async (
    target: IProjectVersion,
    blockedFilePath?: string,
  ) => {
    if (!project) return;

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
        setBlockedPack({ blocked: result.blocked, target });
        setPhase("idle");
        return;
      }

      const next = report(result);
      setRestoreRemoved(false);
      setPrepared(next);
      setPhase(next ? "preview" : "idle");
    } finally {
      setStage(null);
      setExtractPercent(null);
    }
  };

  const startFromFile = async () => {
    if (!project) return;

    const picked = await api.other.openFileDialog(false, [
      { name: "Modpack", extensions: ["mrpack", "zip"] },
    ]);
    const filePath = picked?.[0];
    if (!filePath) return;

    setPhase("preparing");
    setStage("extract");
    try {
      const result = await prepareModpackUpdateFromFile({
        instance,
        project,
        versions: state.versions,
        filePath,
        tempPath: await api.path.join(paths.launcher, "temp"),
        onExtractPercent: setExtractPercent,
      });
      const next = report(result);
      setRestoreRemoved(false);
      setPrepared(next);
      setPhase(next ? "preview" : "idle");
    } finally {
      setStage(null);
      setExtractPercent(null);
    }
  };

  const cancelPreview = () => {
    setPrepared(null);
    setPhase("idle");
  };

  const apply = async (resolved?: IBlockedMod[]) => {
    if (!prepared || !props.account) return;

    setPhase("applying");
    try {
      const outcome = await applyModpackUpdate({
        instance,
        update: prepared,
        account: props.account,
        settings,
        server: props.server,
        resolvedBlocked: resolved,
      });

      if (outcome.status === "blockedMods") {
        setBlockedMods(outcome.blocked);
        setPhase("preview");
        return;
      }

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
      setSelectedId(null);
      setPhase("idle");
      state.reload();
      props.onUpdated();
    } catch (error) {
      showFailureToast(t("modpack.failed"), error, {
        channels: ["modpack:applyFiles", "mods:check", "version:changeLoader"],
        fallbackDescription: t("modpack.failedHint", { version: currentLabel }),
      });
      setPrepared(null);
      setPhase("idle");
      state.reload();
      props.onUpdated();
    }
  };

  const rollback = async () => {
    if (!props.account) return;

    const previous = state.rollback?.fromVersion ?? "";
    setPhase("rollingBack");
    try {
      const done = await rollbackModpackUpdate({
        instance,
        account: props.account,
        settings,
        server: props.server,
      });
      if (done) {
        toast.success(t("modpack.rollback.done", { version: previous }));
      } else {
        toast.error(t("modpack.rollback.failed"));
      }
    } catch (error) {
      showFailureToast(t("modpack.rollback.failed"), error, {
        channels: ["modpack:restoreRollback", "mods:check"],
      });
    } finally {
      setSelectedId(null);
      setPhase("idle");
      state.reload();
      props.onUpdated();
    }
  };

  const openBackups = async () => {
    const folder = await api.path.join(
      instance.versionPath,
      "storage",
      "modpack",
      "rollback",
      "files",
    );
    await api.shell.openPath(folder);
  };

  const copyIds = async () => {
    const ok = await api.clipboard.writeText(
      `${source.projectId} ${source.versionId}`,
    );
    if (ok) toast.success(t("common.copied"));
  };

  const rollbackSummary = state.rollback
    ? t("modpack.rollback.summary", {
        from: state.rollback.fromVersion,
        to: state.rollback.toVersion,
        date: formatDate(state.rollback.createdAt, lang) ?? "",
      })
    : "";

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

  const selectedAction = (() => {
    if (!selected || selected.relation === "current") return null;
    const label = modpackVersionLabel(selected.version);

    if (!selected.sameGame) {
      return (
        <Hint content={t("modpack.otherGameHint")} variant="text">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!project}
            onClick={() =>
              project &&
              openNewInstance({
                source: "catalog",
                catalogPack: { project, version: selected.version },
              })
            }
          >
            <PackagePlus />
            {t("modpack.newInstance", { version: label })}
          </Button>
        </Hint>
      );
    }

    return (
      <Hint content={actionBlocked} variant="text">
        <Button
          type="button"
          size="sm"
          variant={selected.relation === "newer" ? "secondary" : "outline"}
          disabled={!!actionBlocked || !project || !props.account}
          onClick={() => void startPrepare(selected.version)}
        >
          {phase === "preparing" ? (
            <Loader2 className="animate-spin" />
          ) : selected.relation === "newer" ? (
            <ArrowUp />
          ) : (
            <History />
          )}
          {t(
            selected.relation === "newer"
              ? "modpack.updateTo"
              : "modpack.switchTo",
            { version: label },
          )}
        </Button>
      </Hint>
    );
  })();

  const relationChip = (row: ModpackVersionRow) =>
    row.relation === "current" ? (
      <Chip tone="success">{t("modpack.current")}</Chip>
    ) : row.version.id === state.update?.id ? (
      <Chip tone="warning">{t("modpack.newest")}</Chip>
    ) : null;

  const typeChip = (version: IProjectVersion) =>
    version.releaseType && version.releaseType !== "release" ? (
      <Chip>{t(`modpack.channel.${version.releaseType}`)}</Chip>
    ) : null;

  const leftColumn =
    phase === "preview" || (phase === "applying" && prepared) ? (
      prepared && (
        <ModpackUpdatePreview
          update={prepared}
          currentLabel={currentLabel}
          isOlder={
            rows.find((row) => row.version.id === prepared.target.id)
              ?.relation === "older"
          }
          restoreRemoved={restoreRemoved}
          isApplying={phase === "applying"}
          onRestoreRemovedChange={(value) => {
            setRestoreRemoved(value);
            setPrepared(remergeModpackUpdate(prepared, conf, value));
          }}
          onCancel={cancelPreview}
          onApply={() => void apply()}
        />
      )
    ) : (
      <>
        <div className="surface-lit shrink-0 rounded-xl border border-border bg-card px-3.5 py-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <Hint
                  content={selectedVersion ? selectedVersion.name : currentLabel}
                  variant="text"
                  truncatedOnly
                >
                  <span className="min-w-0 truncate font-mono text-base font-medium">
                    {selectedVersion
                      ? modpackVersionLabel(selectedVersion)
                      : currentLabel}
                  </span>
                </Hint>
                {selected ? relationChip(selected) : <Chip tone="success">{t("modpack.current")}</Chip>}
                {selectedVersion && typeChip(selectedVersion)}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-faint">
                {selectedVersion?.gameVersions?.length ? (
                  <span className="font-mono">
                    MC {selectedVersion.gameVersions.slice(0, 3).join(", ")}
                  </span>
                ) : (
                  <span className="font-mono">MC {gameVersion}</span>
                )}
                {selectedVersion?.datePublished && (
                  <span>{formatDate(selectedVersion.datePublished, lang)}</span>
                )}
                {selectedVersion && selectedVersion.downloads > 0 && (
                  <span>
                    {t("modpack.downloadsCount", {
                      count: selectedVersion.downloads,
                      value: formatCompactNumber(selectedVersion.downloads, lang),
                    })}
                  </span>
                )}
              </p>
            </div>
            {selectedAction}
          </div>

          {stageText ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {stageText}
            </p>
          ) : followBlocked ? (
            <p className="mt-2 text-xs text-faint">{followBlocked}</p>
          ) : selected?.relation === "current" &&
            !state.update &&
            !state.isLoading ? (
            <p className="mt-2 text-xs text-faint">{t("modpack.upToDate")}</p>
          ) : null}
        </div>

        <SectionCard
          title={t("modpack.changelog")}
          icon={ScrollText}
          action={
            changelog.status === "ready" && changelogText.canTranslate ? (
              <TranslateToggle
                isTranslated={changelogText.isTranslated}
                isTranslating={changelogText.isTranslating}
                onToggle={() => void changelogText.toggle()}
              />
            ) : undefined
          }
          className="min-h-0 flex-1"
          bodyClassName="overflow-y-auto px-3.5 py-3"
        >
          {state.failed && !selectedVersion ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <WifiOff className="size-5 text-faint" />
              <p className="text-xs font-medium text-muted-foreground">
                {t("modpack.loadFailed", { site })}
              </p>
              <p className="max-w-72 text-xs text-faint">
                {t("modpack.loadFailedHint")}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => state.reload(true)}
              >
                <RotateCcw />
                {t("common.retry")}
              </Button>
            </div>
          ) : changelog.status === "ready" ? (
            <Markdown
              key={`${changelog.key}-${changelogText.isTranslated}`}
              body={changelogText.text}
              baseUrl={projectUrl}
            />
          ) : changelog.status === "loading" || state.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-4 animate-spin text-faint" />
            </div>
          ) : changelog.status === "failed" ? (
            <p className="py-6 text-center text-xs text-faint">
              {t("modpack.changelogFailed", { site })}
            </p>
          ) : (
            <p className="py-6 text-center text-xs text-faint">
              {t("modpack.noChangelog")}
            </p>
          )}
        </SectionCard>

        {state.rollback && canFollowModpack(conf) && (
          <div className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3.5">
            <History className="size-3.5 shrink-0 text-faint" />
            <Hint content={rollbackSummary} variant="text" truncatedOnly>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {rollbackSummary}
              </span>
            </Hint>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void openBackups()}
            >
              <FolderOpen />
              {t("modpack.rollback.backups")}
            </Button>
            <Hint content={actionBlocked} variant="text">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!!actionBlocked || !props.account}
                onClick={() => void rollback()}
              >
                {phase === "rollingBack" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RotateCcw />
                )}
                {t("modpack.rollback.action", {
                  version: state.rollback.fromVersion,
                })}
              </Button>
            </Hint>
          </div>
        )}
      </>
    );

  return (
    <>
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_306px] grid-rows-[minmax(0,1fr)] gap-3">
        <div className="flex min-h-0 flex-col gap-3">{leftColumn}</div>

        <div className="flex min-h-0 flex-col gap-3">
          <section className="surface-lit shrink-0 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-3">
              {project?.iconUrl ? (
                <img
                  src={project.iconUrl}
                  alt=""
                  className="size-11 shrink-0 rounded-lg bg-surface-3 object-cover"
                />
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-surface-3">
                  <SiteIcon provider={provider} className="size-5 text-faint" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <Hint content={title} variant="text" truncatedOnly>
                  <p className="truncate text-sm font-medium">{title}</p>
                </Hint>
                <p className="flex items-center gap-1.5 text-xs text-faint">
                  <SiteIcon provider={provider} className="size-3" />
                  {site}
                </p>
              </div>
              <Hint content={t("modpack.openSite", { site })}>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("modpack.openSite", { site })}
                  disabled={!projectUrl}
                  onClick={() => projectUrl && api.shell.openExternal(projectUrl)}
                >
                  <ExternalLink />
                </Button>
              </Hint>
            </div>

            {project?.description && (
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                {project.description}
              </p>
            )}

            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              <Stat
                label={t("modpack.stats.downloads")}
                value={formatCompactNumber(project?.stats?.downloads, lang)}
              />
              <Stat
                label={t("modpack.stats.versions")}
                value={state.versions.length ? String(state.versions.length) : null}
              />
              <Stat
                label={t("modpack.stats.updated")}
                value={formatDate(project?.stats?.dateModified, lang)}
              />
              <Stat
                label={t("modpack.stats.created")}
                value={formatDate(project?.stats?.dateCreated, lang)}
              />
            </div>

            <div className="mt-2.5 flex items-center gap-1">
              <Hint content={t("modpack.copyIds")} variant="text">
                <button
                  type="button"
                  onClick={() => void copyIds()}
                  className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 font-mono text-[0.68rem] text-faint transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Copy className="size-3 shrink-0" />
                  <span className="truncate">
                    {source.projectId} · {source.versionId}
                  </span>
                </button>
              </Hint>
              <Hint content={actionBlocked ?? t("modpack.fromFileHint")} variant="text">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 shrink-0 px-2 text-xs"
                  disabled={!!actionBlocked || !project || !props.account}
                  onClick={() => void startFromFile()}
                >
                  <FileUp />
                  {t("modpack.fromFile")}
                </Button>
              </Hint>
            </div>
          </section>

          <SectionCard
            title={t("modpack.versions")}
            icon={ListTree}
            className="min-h-0 flex-1"
            bodyClassName="overflow-y-auto py-1"
            action={
              <label className="flex shrink-0 items-center gap-1.5 text-[0.68rem] text-faint">
                <span className="font-mono">{gameVersion}</span>
                <Switch
                  size="sm"
                  checked={!showAll}
                  onCheckedChange={(value) => setShowAll(!value)}
                  aria-label={t("modpack.onlyGame", { version: gameVersion })}
                />
              </label>
            }
          >
            {state.isLoading && state.versions.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="size-4 animate-spin text-faint" />
              </div>
            ) : visibleRows.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-faint">
                {state.failed
                  ? t("modpack.loadFailed", { site })
                  : t("modpack.noVersions")}
              </p>
            ) : (
              <ul role="listbox" aria-label={t("modpack.versions")}>
                {visibleRows.map((row) => {
                  const isSelected = row.version.id === selected?.version.id;

                  return (
                    <li key={row.version.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={phase !== "idle"}
                        onClick={() => setSelectedId(row.version.id)}
                        className={cn(
                          "flex h-10 w-full items-center gap-2 px-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset disabled:cursor-default",
                          isSelected ? "bg-surface-3" : "hover:bg-surface-2",
                        )}
                      >
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate font-mono text-xs",
                            !row.sameGame && "text-faint",
                          )}
                        >
                          {modpackVersionLabel(row.version)}
                        </span>
                        {relationChip(row)}
                        {typeChip(row.version)}
                        {!row.sameGame && (
                          <span className="shrink-0 font-mono text-[0.65rem] text-faint">
                            {row.version.gameVersions?.[0]}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      {blockedPack && (
        <BlockedMods
          mods={[blockedPack.blocked]}
          onClose={(resolved) => {
            const pending = blockedPack;
            setBlockedPack(null);
            const filePath = resolved?.[0]?.filePath;
            if (filePath) void startPrepare(pending.target, filePath);
          }}
        />
      )}

      {blockedMods && (
        <BlockedMods
          mods={blockedMods}
          mcVersion={gameVersion}
          loader={conf.loader.name}
          onClose={(resolved) => {
            setBlockedMods(null);
            if (resolved) void apply(resolved);
          }}
        />
      )}
    </>
  );
}
