import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Boxes,
  Cpu,
  Info,
  Loader2,
  MemoryStick,
  NotebookPen,
  Server,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import { Version } from "@renderer/classes/Version";
import { IVersionStatistics } from "@/types/VersionStatistics";
import type { InstanceTab } from "@renderer/navigation/routes";
import { formatRelative } from "@renderer/utilities/date";
import { formatBytes } from "@renderer/utilities/file";
import { cn } from "@/lib/utils";
import { Collapse } from "@/components/ui/collapse";
import { Hint } from "@renderer/components/Hint";
import { FactRow, FactRows } from "@renderer/components/FactRows";
import { SectionCard } from "./SectionCard";
import {
  ActivityHint,
  HintsCard,
  ScreenshotsCard,
  SessionsCard,
} from "./InstanceActivityCard";
import type { InstanceNameCheck } from "@renderer/features/newInstance/nameValidation";
import { InstanceIdentityCard, IdentityStat } from "./InstanceIdentityCard";
import { InstanceNotes } from "./InstanceNotes";
import { instanceLastLaunch } from "./contentCounts";
import { isFreshInstance } from "./instanceOverview";
import { formatPlaytime } from "./playtime";
import {
  useInstanceContents,
  useInstanceDiskUsage,
  useInstanceScreenshots,
  useInstanceSessions,
} from "./useInstanceInsights";

export interface OverviewAction {
  id: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  busy?: boolean;
  hint?: string;
  onSelect: () => void;
}

function ActionTile({ action }: { action: OverviewAction }) {
  const Icon = action.icon;

  return (
    <Hint content={action.hint} variant="text">
      <button
        type="button"
        disabled={action.disabled}
        onClick={action.onSelect}
        className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left transition-colors enabled:hover:border-input enabled:hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-45"
      >
        {action.busy ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Icon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 truncate text-xs font-medium">
          {action.label}
        </span>
      </button>
    </Hint>
  );
}

export interface InstanceOverviewProps {
  instance: Version;
  image: string;
  versionName: string;
  editName: boolean;
  nameCheck: InstanceNameCheck;
  isLoading: boolean;
  canRename: boolean;
  canEditLogo: boolean;
  contentCount: number;
  argumentCount: number;
  statistics: IVersionStatistics | null;
  memoryMb: number;
  actions: OverviewAction[];
  statuses?: ReactNode;
  banner?: ReactNode;
  updateDetails?: ReactNode;
  publishing?: ReactNode;
  onOpenTab: (tab: InstanceTab) => void;
  onNameChange: (value: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onCommitRename: () => void;
  onPickLogo: () => void;
  onRemoveLogo: () => void;
}

export function InstanceOverviewTab(props: InstanceOverviewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Collapse show={Boolean(props.banner)}>
        {props.banner ? <div className="mb-3">{props.banner}</div> : null}
      </Collapse>

      {props.updateDetails ? (
        <div className="min-h-0 flex-1">{props.updateDetails}</div>
      ) : (
        <InstanceOverviewBody {...props} />
      )}
    </div>
  );
}

function InstanceOverviewBody(props: InstanceOverviewProps) {
  const { t } = useTranslation();
  const { instance, statistics } = props;

  const { size, isUnknown: isSizeUnknown } = useInstanceDiskUsage(
    instance.versionPath,
  );
  const { screenshots, folder } = useInstanceScreenshots(
    instance.versionPath,
    8,
  );
  const sessions = useInstanceSessions(instance.versionPath);
  const contents = useInstanceContents(instance.versionPath);

  const timeLabels = { h: t("time.h"), m: t("time.m") };
  const sizeUnits = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];
  const format = (seconds: number) => formatPlaytime(seconds, timeLabels);
  const lastLaunchedAt = instanceLastLaunch(
    instance.version.lastLaunch,
    statistics,
  );
  const hasScreenshots = screenshots === null || screenshots.length > 0;
  const isFresh = isFreshInstance({
    screenshots: screenshots === null ? null : screenshots.length,
    contentCount: props.contentCount,
    launches: statistics?.launches ?? 0,
    worlds: contents.worlds,
  });

  const stats: IdentityStat[] = [
    {
      id: "playtime",
      label: t("versionStatistics.playTime"),
      value: statistics?.playTime ? format(statistics.playTime) : "—",
      onSelect: () => props.onOpenTab("statistics"),
    },
    {
      id: "launches",
      label: t("home.stats.launches"),
      value: statistics ? String(statistics.launches || 0) : "—",
      onSelect: () => props.onOpenTab("statistics"),
    },
    {
      id: "last",
      label: t("versionStatistics.lastLaunch"),
      value: lastLaunchedAt
        ? formatRelative(lastLaunchedAt)
        : t("versions.never"),
    },
    {
      id: "size",
      label: t("versions.facts.diskUsage"),
      value: isSizeUnknown
        ? "?"
        : size === null
          ? "…"
          : formatBytes(size, sizeUnits, 1),
    },
  ];

  const hints: ActivityHint[] = [
    {
      id: "content",
      label: t("shell.tabs.content"),
      description: t("versions.activity.contentHint"),
      icon: Boxes,
      onSelect: () => props.onOpenTab("content"),
    },
    ...(instance.version.version.serverManager
      ? [
          {
            id: "servers",
            label: t("shell.tabs.servers"),
            description: t("versions.activity.serversHint"),
            icon: Server,
            onSelect: () => props.onOpenTab("servers"),
          },
        ]
      : []),
    {
      id: "settings",
      label: t("shell.tabs.settings"),
      description: t("versions.activity.settingsHint"),
      icon: MemoryStick,
      onSelect: () => props.onOpenTab("settings"),
    },
  ];

  return (
    <>
      <div className="mb-3 shrink-0">
        <InstanceIdentityCard
          instance={instance}
          image={props.image}
          versionName={props.versionName}
          editName={props.editName}
          nameCheck={props.nameCheck}
          isLoading={props.isLoading}
          canRename={props.canRename}
          canEditLogo={props.canEditLogo}
          statuses={props.statuses}
          stats={stats}
          onNameChange={props.onNameChange}
          onStartRename={props.onStartRename}
          onCancelRename={props.onCancelRename}
          onCommitRename={props.onCommitRename}
          onPickLogo={props.onPickLogo}
          onRemoveLogo={props.onRemoveLogo}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_306px] grid-rows-[minmax(0,1fr)] gap-3">
        <div className="flex min-h-0 flex-col gap-3">
          <div
            className={cn(
              "grid shrink-0 gap-2",
              props.actions.length > 4 ? "grid-cols-3" : "grid-cols-2",
            )}
          >
            {props.actions.map((action) => (
              <ActionTile key={action.id} action={action} />
            ))}
          </div>

          {isFresh ? (
            <HintsCard className="shrink-0" hints={hints} />
          ) : (
            <ScreenshotsCard
              className={
                hasScreenshots ? "min-h-[150px] flex-1" : "h-28 shrink-0"
              }
              screenshots={screenshots}
              folder={folder}
            />
          )}

          {!hasScreenshots && (
            <SectionCard
              title={t("versions.notes.title")}
              icon={NotebookPen}
              className="min-h-[96px] flex-1"
            >
              <InstanceNotes versionPath={instance.versionPath} />
            </SectionCard>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <SectionCard
            title={t("versions.facts.title")}
            icon={Info}
            className="shrink-0"
          >
            <FactRows surface="card">
              <FactRow
                icon={<Cpu className="size-3.5" />}
                label={t("versions.facts.java")}
                value={
                  <span className="font-mono">
                    {instance.javaMajorVersion
                      ? `Java ${instance.javaMajorVersion}`
                      : "—"}
                  </span>
                }
              />
              <FactRow
                icon={<MemoryStick className="size-3.5" />}
                label={t("settings.memory")}
                value={
                  <span className="font-mono tabular-nums">
                    {props.memoryMb} {t("settings.mb")}
                  </span>
                }
                onSelect={() => props.onOpenTab("settings")}
              />
              <FactRow
                icon={<SquareTerminal className="size-3.5" />}
                label={t("addVersion.preview.arguments")}
                value={
                  <span className="font-mono tabular-nums">
                    {props.argumentCount || "—"}
                  </span>
                }
                onSelect={() => props.onOpenTab("settings")}
              />
            </FactRows>
          </SectionCard>

          {props.publishing}

          {hasScreenshots ? (
            <SectionCard
              title={t("versions.notes.title")}
              icon={NotebookPen}
              className="min-h-[72px] flex-1"
            >
              <InstanceNotes versionPath={instance.versionPath} />
            </SectionCard>
          ) : (
            <SessionsCard
              className="min-h-[72px] flex-1"
              sessions={sessions}
              timeLabels={timeLabels}
            />
          )}
        </div>
      </div>
    </>
  );
}
