import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUp,
  Copy,
  ExternalLink,
  History,
  ListTree,
  Loader2,
  PackagePlus,
  RotateCcw,
  ScrollText,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { segmentKeyTarget } from "@renderer/components/SegmentedControl";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ILocalAccount } from "@/types/Account";
import {
  Provider,
  type IProject,
  type IVersion as IProjectVersion,
} from "@/types/ModManager";
import type { IServerConf } from "@/types/Server";
import { Version } from "@renderer/classes/Version";
import { Hint } from "@renderer/components/Hint";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import { formatDate } from "@renderer/features/mods/format";
import { formatCompactNumber, formatNumber } from "@renderer/utilities/numbers";
import {
  useTranslatableText,
  useVersionChangelog,
} from "@renderer/features/mods/changelog";
import { TranslateToggle } from "@renderer/features/mods/TranslateToggle";
import { Markdown } from "@renderer/utilities/markdown";
import { SectionCard } from "@renderer/features/instances/SectionCard";
import {
  classifyModpackVersions,
  installedModpackVersion,
  modpackVersionLabel,
  type ModpackVersionRow,
} from "./modpackVersions";
import { ModpackUpdatePreview } from "./ModpackUpdatePreview";
import {
  canFollowModpack,
  canUpdateFromArchive,
  type ModpackSourceState,
} from "./useModpackSource";
import { useModpackUpdateFlow } from "./useModpackUpdateFlow";
import { ModpackFlowDialogs } from "./ModpackFlowDialogs";
import { ModpackArchivePanel } from "./ModpackArchivePanel";
import { ArchiveSourcePopover } from "./ArchiveSourceForm";
import { ContentProviderIcon } from "@renderer/components/ContentProviderIcon";
import { copyWithFeedback } from "@renderer/utilities/copyFeedback";
import { ListSkeleton } from "@renderer/components/ListSkeleton";
import { RollbackFiles } from "./RollbackFiles";

const api = window.api;

function siteName(provider: Provider): string {
  return provider === Provider.CURSEFORGE ? "CurseForge" : "Modrinth";
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
        "flex h-5 shrink-0 items-center rounded-md border px-1.5 text-3xs font-medium whitespace-nowrap",
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
    <Hint content={`${label}: ${value ?? "—"}`} variant="text" truncatedOnly>
      <div className="min-w-0 rounded-lg bg-surface-2 px-2.5 py-1.5">
        <p className="truncate font-mono text-xs font-medium tabular-nums">
          {value ?? "—"}
        </p>
        <p className="truncate text-3xs text-faint">{label}</p>
      </div>
    </Hint>
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
  if (!props.state.source) {
    return canUpdateFromArchive(props.instance.version, props.state.hasBase) ? (
      <ModpackArchivePanel {...props} />
    ) : null;
  }

  return <LinkedModpackPanel {...props} />;
}

function LinkedModpackPanel(props: ModpackPanelProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { instance, state } = props;

  const source = state.source;
  const conf = instance.version;
  const gameVersion = conf.version.id;
  const provider = source?.provider ?? Provider.MODRINTH;
  const site = siteName(provider);

  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const flow = useModpackUpdateFlow({
    instance,
    state,
    account: props.account,
    server: props.server,
    site,
    currentLabel: source?.versionNumber ?? "",
    onUpdated: props.onUpdated,
    onApplied: () => setSelectedId(null),
  });
  const { phase, prepared, restoreRemoved, stageText } = flow;

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

  const copyIds = async () => {
    await copyWithFeedback(`${source.projectId} ${source.versionId}`);
  };

  const rollbackSummary = state.rollback
    ? t("modpack.rollback.summary", {
        from: state.rollback.fromVersion,
        to: state.rollback.toVersion,
        date: formatDate(state.rollback.createdAt, lang) ?? "",
      })
    : "";

  const selectedAction = (() => {
    if (!selected || selected.relation === "current") return null;
    const label = modpackVersionLabel(selected.version);

    if (!selected.sameGame) {
      return (
        <Hint
          content={project ? t("modpack.otherGameHint") : undefined}
          variant="text"
        >
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
      <Button
        type="button"
        size="sm"
        variant={selected.relation === "newer" ? "secondary" : "outline"}
        disabled={!!actionBlocked || !project || !props.account}
        onClick={() => project && void flow.startPrepare(project, selected.version)}
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
          onRestoreRemovedChange={flow.changeRestoreRemoved}
          unknownJars={flow.unknownJars}
          onCancel={flow.cancelPreview}
          onApply={() => void flow.apply()}
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
          ) : actionBlocked ? (
            <p className="mt-2 text-xs text-faint">{actionBlocked}</p>
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
            <Empty className="h-full gap-2 p-0">
              <EmptyHeader className="gap-1">
                <EmptyMedia variant="icon" className="mb-1">
                  <WifiOff />
                </EmptyMedia>
                <EmptyTitle className="text-xs">
                  {t("modpack.loadFailed", { site })}
                </EmptyTitle>
                <EmptyDescription className="max-w-72 text-xs text-faint">
                  {t("modpack.loadFailedHint")}
                </EmptyDescription>
              </EmptyHeader>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => state.reload(true)}
              >
                <RotateCcw />
                {t("common.retry")}
              </Button>
            </Empty>
          ) : changelog.status === "ready" ? (
            <Markdown
              key={`${changelog.key}-${changelogText.isTranslated}`}
              body={changelogText.text}
              baseUrl={projectUrl}
            />
          ) : changelog.status === "loading" || state.isLoading ? (
            <div aria-hidden className="flex flex-col gap-2 py-1">
              <Skeleton className="h-3 w-2/5 rounded" />
              <Skeleton className="h-2.5 w-11/12 rounded" />
              <Skeleton className="h-2.5 w-3/4 rounded" />
              <Skeleton className="h-2.5 w-5/6 rounded" />
            </div>
          ) : changelog.status === "failed" ? (
            <Empty className="gap-2 py-6">
              <EmptyDescription className="text-xs text-faint">
                {t("modpack.changelogFailed", { site })}
              </EmptyDescription>
            </Empty>
          ) : (
            <Empty className="gap-2 py-6">
              <EmptyDescription className="text-xs text-faint">
                {t("modpack.noChangelog")}
              </EmptyDescription>
            </Empty>
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
            <RollbackFiles rollback={state.rollback} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!!actionBlocked || !props.account}
              onClick={() => void flow.rollback()}
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
                  <ContentProviderIcon provider={provider} className="size-5 text-faint" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <Hint content={title} variant="text" truncatedOnly>
                  <p className="truncate text-sm font-medium">{title}</p>
                </Hint>
                <p className="flex items-center gap-1.5 text-xs text-faint">
                  <ContentProviderIcon provider={provider} className="size-3" />
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
              <Hint content={project.description} variant="text" truncatedOnly>
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {project.description}
                </p>
              </Hint>
            )}

            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              <Stat
                label={t("modpack.stats.downloads")}
                value={formatCompactNumber(project?.stats?.downloads, lang)}
              />
              <Stat
                label={t("modpack.stats.versions")}
                value={
                  state.versions.length
                    ? formatNumber(state.versions.length)
                    : null
                }
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
                  className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 font-mono text-2xs text-faint transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Copy className="size-3 shrink-0" />
                  <span className="truncate">
                    {source.projectId} · {source.versionId}
                  </span>
                </button>
              </Hint>
              <ArchiveSourcePopover
                disabled={!!actionBlocked || !project || !props.account}
                onPickFile={() =>
                  void flow.startFromFile(project ?? undefined, state.versions)
                }
                onSubmitUrl={(url) =>
                  void flow.startFromUrl(url, project ?? undefined, state.versions)
                }
              />
            </div>
          </section>

          <SectionCard
            title={t("modpack.versions")}
            icon={ListTree}
            className="min-h-0 flex-1"
            bodyClassName="overflow-y-auto py-1"
            action={
              <label className="flex shrink-0 items-center gap-1.5 text-2xs text-faint">
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
              <ListSkeleton
                rows={8}
                rowClassName="h-10 px-3"
                iconClassName="hidden"
              />
            ) : visibleRows.length === 0 ? (
              <Empty className="h-full gap-2 px-3 py-6">
                <EmptyDescription className="text-xs text-faint">
                  {state.failed
                    ? t("modpack.loadFailed", { site })
                    : t("modpack.noVersions")}
                </EmptyDescription>
              </Empty>
            ) : (
              <ul
                role="listbox"
                aria-label={t("modpack.versions")}
                onKeyDown={(event) => {
                  const current = visibleRows.findIndex(
                    (row) => row.version.id === selected?.version.id,
                  );
                  const target = segmentKeyTarget(
                    event.key,
                    current,
                    visibleRows.map(() => phase === "idle"),
                  );
                  if (target === null) return;
                  event.preventDefault();
                  setSelectedId(visibleRows[target].version.id);
                  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]').item(target)?.focus();
                }}
              >
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
                          isSelected ? "bg-row-selected" : "hover:bg-row-hover",
                        )}
                      >
                        <Hint
                          content={modpackVersionLabel(row.version)}
                          variant="text"
                          truncatedOnly
                        >
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate font-mono text-xs",
                              !row.sameGame && "text-faint",
                            )}
                          >
                            {modpackVersionLabel(row.version)}
                          </span>
                        </Hint>
                        {relationChip(row)}
                        {typeChip(row.version)}
                        {!row.sameGame && (
                          <span className="shrink-0 font-mono text-3xs text-faint">
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

      <ModpackFlowDialogs
        flow={flow}
        gameVersion={gameVersion}
        loader={conf.loader.name}
      />
    </>
  );
}
