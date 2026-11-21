import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Camera,
  FolderOpen,
  GalleryHorizontalEnd,
  History,
  ImageOff,
  ListChecks,
  type LucideIcon,
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
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { formatDay } from "@renderer/utilities/date";
import { useThumbnail } from "@renderer/features/screenshots/thumbnails";
import { IVersionSession } from "@/types/VersionStatistics";
import { SectionCard } from "./SectionCard";
import { recentSessions, screenshotLabel } from "./instanceOverview";
import { InstanceScreenshot } from "./useInstanceInsights";
import { ScreenshotViewer } from "./ScreenshotViewer";
import { formatDuration } from "@renderer/utilities/duration";
import { countFeature } from "@renderer/features/usage/usage";

const api = window.api;

export interface ActivityHint {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  onSelect: () => void;
}

function ShotImage({ path }: { path: string }) {
  const { url, failed } = useThumbnail(path);

  if (url) {
    return (
      <img
        src={url}
        alt=""
        draggable={false}
        className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
      />
    );
  }

  if (failed) {
    return (
      <span className="flex size-full items-center justify-center text-faint">
        <ImageOff className="size-4" />
      </span>
    );
  }

  return <Skeleton className="size-full rounded-none" />;
}

export function ScreenshotsCard({
  screenshots,
  folder,
  className,
  onUseAsCover,
  onShowAll,
}: {
  screenshots: InstanceScreenshot[] | null;
  folder: string;
  className?: string;
  onUseAsCover?: (file: string) => void;
  onShowAll?: () => void;
}) {
  const { t } = useTranslation();
  const [viewing, setViewing] = useState<string | null>(null);

  return (
    <SectionCard
      title={t("versions.screenshots.title")}
      icon={Camera}
      className={className}
      action={
        screenshots?.length ? (
          <span className="flex items-center gap-1">
            {onShowAll && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-2xs text-faint"
                onClick={onShowAll}
              >
                <GalleryHorizontalEnd />
                {t("screenshots.feed.showAll")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-2xs text-faint"
              disabled={!folder}
              onClick={() => void api.shell.openPath(folder)}
            >
              <FolderOpen />
              {t("common.openFolder")}
            </Button>
          </span>
        ) : undefined
      }
    >
      {screenshots === null ? (
        <div className="grid h-full grid-cols-4 gap-2 p-2.5">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="rounded-lg" />
          ))}
        </div>
      ) : screenshots.length === 0 ? (
        <Empty className="h-full gap-1.5 p-4">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon" className="mb-1">
              <Camera />
            </EmptyMedia>
            <EmptyTitle className="text-xs">
              {t("versions.screenshots.empty")}
            </EmptyTitle>
            <EmptyDescription className="text-2xs text-faint">
              {t("versions.screenshots.emptyHint")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid h-full auto-rows-[minmax(0,1fr)] grid-cols-4 gap-2 overflow-y-auto p-2.5">
          {screenshots.map((shot) => (
            <button
              key={shot.path}
              type="button"
              aria-label={screenshotLabel(shot.name)}
              onClick={() => {
                countFeature("screenshots.view");
                setViewing(shot.path);
              }}
              className="group relative min-h-[68px] overflow-hidden rounded-lg border border-border bg-surface-3 transition-colors hover:border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ShotImage path={shot.path} />
              <Hint
                content={screenshotLabel(shot.name)}
                variant="text"
                truncatedOnly
              >
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-background/85 to-transparent px-1.5 pt-4 pb-1 text-left font-mono text-3xs text-foreground/85">
                  {screenshotLabel(shot.name)}
                </span>
              </Hint>
            </button>
          ))}
        </div>
      )}
      {viewing && (
        <ScreenshotViewer
          folder={folder}
          initialPath={viewing}
          onClose={() => setViewing(null)}
          onUseAsCover={onUseAsCover}
        />
      )}
    </SectionCard>
  );
}

export function HintsCard({
  hints,
  className,
}: {
  hints: ActivityHint[];
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <SectionCard
      title={t("versions.activity.title")}
      icon={ListChecks}
      className={className}
      bodyClassName={cn(
        "grid gap-2 p-2.5",
        hints.length > 2 ? "grid-cols-3" : "grid-cols-2",
      )}
    >
      {hints.map((hint) => (
        <Hint
          key={hint.id}
          variant="text"
          truncatedOnly
          content={
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{hint.label}</span>
              <span>{hint.description}</span>
            </span>
          }
        >
          <button
            type="button"
            onClick={hint.onSelect}
            className="flex min-w-0 items-start gap-2.5 rounded-xl border border-border bg-surface-2 p-2.5 text-left transition-colors hover:border-input hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <hint.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-xs font-medium">{hint.label}</span>
              <span className="line-clamp-2 text-2xs leading-snug text-faint">
                {hint.description}
              </span>
            </span>
          </button>
        </Hint>
      ))}
    </SectionCard>
  );
}

export function SessionsCard({
  sessions,
  className,
}: {
  sessions: IVersionSession[];
  className?: string;
}) {
  const { t } = useTranslation();
  const latest = recentSessions(sessions, 10);

  return (
    <SectionCard
      title={t("versionStatistics.recentSessions")}
      icon={History}
      className={className}
      bodyClassName="overflow-x-hidden overflow-y-auto py-1"
    >
      {latest.length === 0 ? (
        <Empty className="h-full gap-1 p-3">
          <EmptyHeader className="gap-1">
            <EmptyTitle className="text-xs">
              {t("versionStatistics.noSessions")}
            </EmptyTitle>
            <EmptyDescription className="text-2xs text-faint">
              {t("versionStatistics.noSessionsHint")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        latest.map((session) => (
          <div
            key={session.id}
            className="flex items-center gap-2 px-3 py-1 text-xs"
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                session.crashed ? "bg-destructive" : "bg-success",
              )}
            />
            <Hint
              content={
                session.server?.trim() || t("versionStatistics.singleplayer")
              }
              variant="text"
              truncatedOnly
            >
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {session.server?.trim() || t("versionStatistics.singleplayer")}
              </span>
            </Hint>
            <span className="shrink-0 font-mono text-2xs whitespace-nowrap text-faint">
              {formatDay(new Date(session.startedAt))}
            </span>
            <span className="min-w-16 shrink-0 text-right font-mono whitespace-nowrap tabular-nums">
              {formatDuration(session.durationSec || 0)}
            </span>
          </div>
        ))
      )}
    </SectionCard>
  );
}
