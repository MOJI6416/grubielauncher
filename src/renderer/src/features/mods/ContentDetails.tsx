import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Ban,
  ChevronLeft,
  CircleAlert,
  CircleArrowUp,
  CircleHelp,
  Download,
  ExternalLink,
  Heart,
  History,
  Languages,
  Loader2,
  Package,
  PackageCheck,
  Pin,
  PinOff,
  Plus,
  Trash2,
  UserRound,
  X,
  Star,
  CopyPlus,
} from "lucide-react";
import {
  DependencyType,
  ILocalProject,
  IProject,
  IProjectAuthor,
  IVersion as ModVersion,
  Provider,
  VersionReleaseType,
} from "@/types/ModManager";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModRelationsView } from "./ModRelationsView";
import type { ModRelations } from "./modRelations";
import { Hint } from "@renderer/components/Hint";
import { ContentEntry } from "./entries";
import { formatDate } from "./format";
import { formatCompactNumber } from "@renderer/utilities/numbers";
import { ProjectBody } from "./ProjectBody";
import { ProjectGallery } from "./ProjectGallery";
import { ProjectIcon } from "./ProjectIcon";
import { TranslateToggle } from "./TranslateToggle";
import { useTranslatableText, useVersionChangelog } from "./changelog";
import { Skeleton } from "@/components/ui/skeleton";
import { ContentProviderIcon } from "@renderer/components/ContentProviderIcon";

const api = window.api;

const VERSION_ROW_HEIGHT = 52;

function releaseTypeClass(type: VersionReleaseType | undefined): string {
  if (type === "release") return "bg-success/15 text-success";
  if (type === "beta") return "bg-warning/15 text-warning";
  if (type === "alpha") return "bg-destructive/15 text-destructive";
  return "bg-surface-3 text-muted-foreground";
}

function dependencyClass(type: DependencyType): string {
  if (type === DependencyType.REQUIRED) return "bg-warning/15 text-warning";
  if (type === DependencyType.EMBEDDED) return "bg-success/15 text-success";
  if (type === DependencyType.INCOMPATIBLE)
    return "bg-destructive/15 text-destructive";
  return "bg-surface-3 text-muted-foreground";
}

function dependencyLabelKey(type: DependencyType): string {
  if (type === DependencyType.REQUIRED) return "modManager.dependencyTypes.1";
  if (type === DependencyType.OPTIONAL) return "modManager.dependencyTypes.2";
  if (type === DependencyType.EMBEDDED) return "modManager.dependencyTypes.3";
  if (type === DependencyType.INCOMPATIBLE)
    return "modManager.dependencyTypes.4";
  return "modManager.dependencyTypes.0";
}

export interface DetailProgress {
  label: string;
  percent: number | null;
}

export function ContentDetails({
  entry,
  project,
  versions,
  selectedVersion,
  installedVersionId,
  isLoading,
  isBusy,
  lockedHint,
  error,
  depsError,
  canEdit,
  canGoBack,
  isModpacks,
  lang,
  progress,
  canTranslate,
  isTranslating,
  deletionBlockers,
  alsoRemoves,
  findInstalled,
  onBack,
  onClose,
  onSelectVersion,
  onInstall,
  onDelete,
  onOpenDependency,
  onOpenLink,
  onTranslate,
  onRetry,
  width,
  clampWidth,
  onResizeEnd,
  onResetWidth,
  isPinned = false,
  canPin = false,
  onTogglePin,
  isFavorite = false,
  onToggleFavorite,
  onInstallElsewhere,
  relations = null,
  relationsScanning = false,
  onLoadRelations,
  onOpenInstalled,
  onAuthor,
}: {
  entry: ContentEntry;
  project: IProject | null;
  versions: ModVersion[];
  selectedVersion: ModVersion | null;
  installedVersionId: string | null;
  isLoading: boolean;
  isBusy: boolean;
  lockedHint?: string;
  error: boolean;
  depsError: boolean;
  canEdit: boolean;
  canGoBack: boolean;
  isModpacks: boolean;
  lang: string;
  progress: DetailProgress | null;
  canTranslate: boolean;
  isTranslating: boolean;
  deletionBlockers: ILocalProject[];
  alsoRemoves: ILocalProject[];
  findInstalled: (project: IProject) => ILocalProject | undefined;
  width: number;
  clampWidth: (width: number) => number;
  onResizeEnd: (width: number) => void;
  onResetWidth: () => void;
  isPinned?: boolean;
  canPin?: boolean;
  onTogglePin?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onInstallElsewhere?: () => void;
  relations?: ModRelations | null;
  relationsScanning?: boolean;
  onLoadRelations?: () => void;
  onOpenInstalled?: (mod: ILocalProject) => void;
  onAuthor?: (author: IProjectAuthor) => void;
  onBack: () => void;
  onClose: () => void;
  onSelectVersion: (version: ModVersion) => void;
  onInstall: (version: ModVersion) => void;
  onDelete: () => void;
  onOpenDependency: (project: IProject) => void;
  onOpenLink: (href: string) => Promise<boolean>;
  onTranslate: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("about");

  const detail = project ?? entry.project;
  const title = detail?.title ?? entry.title;
  const description = detail?.description ?? entry.description;
  const body = (detail?.body || description || "").trim();
  const gallery = useMemo(
    () => (detail?.gallery ?? []).filter((image) => !!image?.url),
    [detail],
  );
  const stats = detail?.stats ?? entry.stats;
  const author = project?.author ?? entry.project?.author;
  const changelog = useVersionChangelog({
    provider: entry.provider,
    projectId: entry.id,
    version: selectedVersion,
  });
  const changelogText = useTranslatableText(changelog.key, changelog.text);
  const dependencies = selectedVersion?.dependencies ?? [];
  const resolvedDependencies = useMemo(
    () => dependencies.filter((dependency) => dependency.project),
    [dependencies],
  );

  useEffect(() => {
    setTab("about");
  }, [entry.key]);

  useEffect(() => {
    if (tab === "deps" && relations) onLoadRelations?.();
  }, [tab, entry.key, relations, onLoadRelations]);

  const asideRef = useRef<HTMLElement | null>(null);

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();

    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = asideRef.current?.offsetWidth ?? width;
    let next = startWidth;

    handle.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";

    const onMove = (move: globalThis.PointerEvent) => {
      next = clampWidth(startWidth + (startX - move.clientX));
      if (asideRef.current) asideRef.current.style.width = `${next}px`;
    };
    const onEnd = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
      document.body.style.cursor = "";
      onResizeEnd(next);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
  };

  const isInstalled = Boolean(entry.installed);
  const isCurrentInstalled =
    isInstalled && selectedVersion?.id === installedVersionId;

  const downloads = formatCompactNumber(stats?.downloads, lang);
  const follows =
    entry.provider === Provider.MODRINTH
      ? formatCompactNumber(stats?.follows, lang)
      : null;
  const updated = formatDate(stats?.dateModified, lang);

  const primaryLabel = isModpacks
    ? t("common.install")
    : !isInstalled
      ? t("common.install")
      : isCurrentInstalled
        ? t("modManager.installed")
        : t("common.update");

  return (
    <aside
      ref={asideRef}
      style={{ width }}
      className="relative flex shrink-0 flex-col overflow-hidden border-l border-border bg-surface-1"
    >
      <Hint
        content={t("modManager.detailResizeHint")}
        side="left"
        className="max-w-56"
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("modManager.detailResize")}
          tabIndex={0}
          onPointerDown={startResize}
          onDoubleClick={onResetWidth}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") onResizeEnd(width + 24);
            else if (event.key === "ArrowRight") onResizeEnd(width - 24);
            else if (event.key === "Home") onResetWidth();
            else return;
            event.preventDefault();
          }}
          className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize transition-colors hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:outline-none"
        />
      </Hint>
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        {canGoBack && (
          <Hint content={t("shell.back")}>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("shell.back")}
              onClick={onBack}
            >
              <ChevronLeft className="size-4" />
            </Button>
          </Hint>
        )}
        <Hint content={title} variant="text" truncatedOnly>
          <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium select-text">
            {title}
          </span>
        </Hint>
        {detail?.url ? (
          <Hint content={t("modManager.goToWebsite")}>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("modManager.goToWebsite")}
              onClick={() => api.shell.openExternal(detail.url)}
            >
              <ExternalLink className="size-4" />
            </Button>
          </Hint>
        ) : null}
        {canTranslate && (
          <Hint content={t("modManager.translate")}>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={isTranslating}
              aria-label={t("modManager.translate")}
              onClick={onTranslate}
            >
              {isTranslating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Languages className="size-4" />
              )}
            </Button>
          </Hint>
        )}
        <Hint content={t("common.close")}>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </Hint>
      </header>

      {isLoading ? (
        <div
          aria-hidden
          className="flex flex-1 flex-col gap-3 overflow-hidden p-4"
        >
          <Skeleton className="h-32 w-full shrink-0 rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1 rounded-lg" />
            <Skeleton className="size-9 rounded-lg" />
          </div>
          <Skeleton className="h-3 w-11/12 rounded" />
          <Skeleton className="h-3 w-4/5 rounded" />
          <Skeleton className="h-3 w-5/6 rounded" />
          <Skeleton className="h-3 w-2/3 rounded" />
        </div>
      ) : error ? (
        <Empty className="flex-1 gap-3 px-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleAlert className="text-destructive" />
            </EmptyMedia>
            <EmptyTitle>{t("modManager.notFoundMod")}</EmptyTitle>
            <EmptyDescription className="text-xs">
              {t("modManager.notFoundModHint")}
            </EmptyDescription>
          </EmptyHeader>
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        </Empty>
      ) : (
        <>
          <div className="shrink-0 border-b border-border p-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 text-faint">
                <ProjectIcon
                  src={entry.iconUrl}
                  size={44}
                  fallback={<Package className="size-5" />}
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Hint content={description} variant="text" truncatedOnly>
                  <p className="line-clamp-2 text-xs leading-4 text-muted-foreground select-text [overflow-wrap:anywhere]">
                    {description}
                  </p>
                </Hint>

                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs leading-4 text-faint">
                  <span className="flex items-center gap-1">
                    <ContentProviderIcon provider={entry.provider} className="size-3" />
                  </span>
                  {author &&
                    (onAuthor ? (
                      <Hint
                        content={t("modManager.authorProjects", {
                          name: author.name,
                        })}
                        className="max-w-64"
                      >
                        <button
                          type="button"
                          className="flex max-w-40 min-w-0 items-center gap-1 rounded-sm transition-colors hover:text-foreground"
                          onClick={() => onAuthor(author)}
                        >
                          <UserRound className="size-3 shrink-0" />
                          <span className="truncate">{author.name}</span>
                        </button>
                      </Hint>
                    ) : (
                      <span className="flex max-w-40 min-w-0 items-center gap-1">
                        <UserRound className="size-3 shrink-0" />
                        <Hint content={author.name} variant="text" truncatedOnly>
                          <span className="truncate">{author.name}</span>
                        </Hint>
                      </span>
                    ))}
                  {downloads && (
                    <span className="flex items-center gap-1 tabular-nums">
                      <Download className="size-3" />
                      {downloads}
                    </span>
                  )}
                  {follows && (
                    <span className="flex items-center gap-1 tabular-nums">
                      <Heart className="size-3" />
                      {follows}
                    </span>
                  )}
                  {updated && (
                    <Hint content={t("modManager.statsUpdated")} variant="text">
                      <span className="flex items-center gap-1">
                        <History className="size-3" />
                        {updated}
                      </span>
                    </Hint>
                  )}
                </div>
              </div>
            </div>

            {canEdit && (
              <div className="mt-3 flex items-center gap-2">
                <Hint content={lockedHint} wrapperClassName="flex-1">
                  <Button
                    className={
                      isCurrentInstalled && !isModpacks
                        ? "h-9 flex-1 border-success/40 text-success"
                        : "h-9 flex-1"
                    }
                    variant={
                      isCurrentInstalled && !isModpacks ? "outline" : "secondary"
                    }
                    disabled={
                      isBusy ||
                      Boolean(lockedHint) ||
                      !selectedVersion ||
                      (!isModpacks && isCurrentInstalled)
                    }
                    onClick={() => selectedVersion && onInstall(selectedVersion)}
                  >
                    {isBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : isCurrentInstalled ? (
                      <PackageCheck className="size-4" />
                    ) : isInstalled ? (
                      <CircleArrowUp className="size-4" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    {primaryLabel}
                  </Button>
                </Hint>

                {!isModpacks && onToggleFavorite && (
                  <Hint
                    content={t(
                      isFavorite
                        ? "modManager.favoriteRemove"
                        : "modManager.favoriteAdd",
                    )}
                  >
                    <Button
                      size="icon"
                      variant="outline"
                      aria-pressed={isFavorite}
                      className={
                        isFavorite
                          ? "size-9 border-info/50 text-info hover:text-info"
                          : "size-9"
                      }
                      aria-label={t(
                        isFavorite
                          ? "modManager.favoriteRemove"
                          : "modManager.favoriteAdd",
                      )}
                      onClick={onToggleFavorite}
                    >
                      <Star
                        className={isFavorite ? "size-4 fill-current" : "size-4"}
                      />
                    </Button>
                  </Hint>
                )}

                {!isModpacks && onInstallElsewhere && (
                  <Hint content={t("modManager.installElsewhere")}>
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-9"
                      disabled={isBusy}
                      aria-label={t("modManager.installElsewhere")}
                      onClick={onInstallElsewhere}
                    >
                      <CopyPlus className="size-4" />
                    </Button>
                  </Hint>
                )}

                {isInstalled && !isModpacks && canPin && onTogglePin && (
                  <Hint
                    content={t(
                      isPinned ? "modManager.unpinHint" : "modManager.pinHint",
                    )}
                    className="max-w-60"
                  >
                    <Button
                      size="icon"
                      variant="outline"
                      aria-pressed={isPinned}
                      className={
                        isPinned
                          ? "size-9 border-info/50 text-info hover:text-info"
                          : "size-9"
                      }
                      disabled={isBusy}
                      aria-label={t(
                        isPinned ? "modManager.unpin" : "modManager.pin",
                      )}
                      onClick={onTogglePin}
                    >
                      {isPinned ? (
                        <PinOff className="size-4" />
                      ) : (
                        <Pin className="size-4" />
                      )}
                    </Button>
                  </Hint>
                )}

                {isInstalled && !isModpacks && (
                  <Hint
                    content={
                      lockedHint ??
                      (deletionBlockers.length > 0
                        ? `${t("modManager.requiredBy")}: ${deletionBlockers
                            .map((item) => item.title)
                            .join(", ")}`
                        : alsoRemoves.length > 0
                          ? `${t("modManager.alsoRemoves")}: ${alsoRemoves
                              .map((item) => item.title)
                              .join(", ")}`
                          : t("common.delete"))
                    }
                    className="max-w-56"
                  >
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-9 border-destructive/40 text-destructive hover:bg-destructive/15 hover:text-destructive"
                      disabled={isBusy || Boolean(lockedHint)}
                      aria-label={t("common.delete")}
                      onClick={onDelete}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </Hint>
                )}
              </div>
            )}

            <Collapse show={Boolean(progress)}>
              {progress ? (
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <Hint content={progress.label} variant="text" truncatedOnly>
                      <span className="truncate">{progress.label}</span>
                    </Hint>
                    {progress.percent != null && (
                      <span className="shrink-0 font-mono tabular-nums">
                        {progress.percent}%
                      </span>
                    )}
                  </div>
                  <Progress value={progress.percent ?? 100} max={100} />
                </div>
              ) : null}
            </Collapse>
          </div>

          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
          >
            <TabsList
              variant="line"
              className="h-9 w-full shrink-0 justify-start gap-0 border-b border-border p-0 px-1"
            >
              <TabsTrigger value="about">
                {t("common.description")}
              </TabsTrigger>
              <TabsTrigger value="versions">
                {t("modManager.versionsTab")}
                {versions.length > 0 && (
                  <span className="ml-1 font-mono text-3xs text-faint">
                    {versions.length}
                  </span>
                )}
              </TabsTrigger>
              {!isModpacks && (
                <TabsTrigger value="deps">
                  {relations
                    ? t("modManager.relations.tab")
                    : t("modManager.dependencies")}
                  {dependencies.length > 0 && (
                    <span className="ml-1 font-mono text-3xs text-faint">
                      {dependencies.length}
                    </span>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent
              value="about"
              className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-3"
            >
              {gallery.length > 0 && (
                <div className="mb-3">
                  <ProjectGallery gallery={gallery} title={title} />
                </div>
              )}

              {(changelog.status === "ready" ||
                changelog.status === "loading") && (
                <div className="mb-3 rounded-lg border border-border bg-surface-2 p-2.5">
                  <div className="mb-1 flex min-h-6 items-center gap-1">
                    <Hint content={`${t("modManager.changelog")}${selectedVersion?.name ? ` · ${selectedVersion.name}` : ""}`} variant="text" truncatedOnly>
                      <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                        {t("modManager.changelog")}
                        {selectedVersion?.name ? ` · ${selectedVersion.name}` : ""}
                      </p>
                    </Hint>
                    {changelogText.canTranslate && (
                      <TranslateToggle
                        isTranslated={changelogText.isTranslated}
                        isTranslating={changelogText.isTranslating}
                        onToggle={() => void changelogText.toggle()}
                      />
                    )}
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {changelog.status === "loading" ? (
                      <div aria-hidden className="flex flex-col gap-1.5 py-1">
                        <Skeleton className="h-2.5 w-11/12 rounded" />
                        <Skeleton className="h-2.5 w-3/4 rounded" />
                        <Skeleton className="h-2.5 w-5/6 rounded" />
                      </div>
                    ) : (
                      <ProjectBody
                        key={`changelog-${changelog.key}-${changelogText.isTranslated}`}
                        body={changelogText.text}
                        baseUrl={detail?.url}
                        onLink={onOpenLink}
                      />
                    )}
                  </div>
                </div>
              )}

              {body ? (
                <ProjectBody
                  key={`body-${entry.key}-${body.length}`}
                  body={body}
                  baseUrl={detail?.url}
                  onLink={onOpenLink}
                />
              ) : (
                <Empty className="gap-2 rounded-lg border border-dashed border-border px-3 py-6">
                  <EmptyDescription className="text-xs">
                    {t("common.notFound")}
                  </EmptyDescription>
                </Empty>
              )}
            </TabsContent>

            <TabsContent
              value="versions"
              className="min-h-0 flex-1 overflow-hidden"
            >
              {versions.length === 0 ? (
                <Empty className="m-3 w-auto gap-2 rounded-lg border border-dashed border-border px-3 py-6">
                  <EmptyDescription className="text-xs">
                    {t("modManager.notFoundMod")}
                  </EmptyDescription>
                </Empty>
              ) : (
                <VersionList
                  versions={versions}
                  selectedVersionId={selectedVersion?.id ?? null}
                  installedVersionId={installedVersionId}
                  lang={lang}
                  onSelect={onSelectVersion}
                />
              )}
            </TabsContent>

            <TabsContent
              value="deps"
              className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-3"
            >
              {relations && (
                <ModRelationsView
                  relations={relations}
                  isScanning={relationsScanning}
                  onOpen={onOpenInstalled}
                />
              )}

              {relations && resolvedDependencies.length > 0 && (
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {t("modManager.relations.declared", {
                    version: selectedVersion?.name ?? "",
                  })}
                </p>
              )}

              {depsError && (
                <Empty className="mb-2 gap-2 rounded-lg border border-dashed border-border px-3 py-5">
                  <EmptyMedia variant="icon" className="mb-0">
                    <CircleAlert className="text-destructive" />
                  </EmptyMedia>
                  <EmptyDescription className="text-xs">
                    {t("modManager.dependenciesFailed")}
                  </EmptyDescription>
                  <Button size="sm" variant="outline" onClick={onRetry}>
                    {t("common.retry")}
                  </Button>
                </Empty>
              )}

              {resolvedDependencies.length === 0 ? (
                depsError || relations ? null : (
                  <Empty className="gap-2 rounded-lg border border-dashed border-border px-3 py-6">
                    <EmptyDescription className="text-xs">
                      {t("modManager.noDependencies")}
                    </EmptyDescription>
                  </Empty>
                )
              ) : (
                <div className="flex flex-col gap-1.5">
                  {resolvedDependencies.map((dependency, index) => {
                    const depProject = dependency.project;
                    if (!depProject) return null;

                    const depInstalled = findInstalled(depProject);
                    const canOpen =
                      dependency.relationType !== DependencyType.EMBEDDED;

                    return (
                      <div
                        key={`${depProject.id}-${index}`}
                        className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-2 p-1.5"
                      >
                        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-1 text-faint">
                          <ProjectIcon src={depProject.iconUrl} size={32} />
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <Hint
                            content={depProject.title}
                            variant="text"
                            truncatedOnly
                          >
                            <span className="truncate text-xs leading-4 text-foreground">
                              {depProject.title}
                            </span>
                          </Hint>
                          <span className="flex items-center gap-1.5 text-2xs leading-4">
                            <span
                              className={`flex items-center gap-1 rounded-sm px-1 py-px ${dependencyClass(dependency.relationType)}`}
                            >
                              {dependency.relationType ===
                              DependencyType.INCOMPATIBLE ? (
                                <Ban className="size-2.5" />
                              ) : dependency.relationType ===
                                DependencyType.EMBEDDED ? (
                                <PackageCheck className="size-2.5" />
                              ) : dependency.relationType ===
                                DependencyType.OPTIONAL ? (
                                <CircleHelp className="size-2.5" />
                              ) : (
                                <CircleAlert className="size-2.5" />
                              )}
                              {t(dependencyLabelKey(dependency.relationType))}
                            </span>
                            {depInstalled && (
                              <span className="text-success">
                                {t("modManager.installed")}
                              </span>
                            )}
                          </span>
                        </div>

                        {canOpen && (
                          <Hint content={isBusy ? undefined : depProject.title}>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="shrink-0"
                              disabled={isBusy}
                              aria-label={depProject.title}
                              onClick={() => onOpenDependency(depProject)}
                            >
                              <ChevronLeft className="size-4 rotate-180" />
                            </Button>
                          </Hint>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </aside>
  );
}

function VersionList({
  versions,
  selectedVersionId,
  installedVersionId,
  lang,
  onSelect,
}: {
  versions: ModVersion[];
  selectedVersionId: string | null;
  installedVersionId: string | null;
  lang: string;
  onSelect: (version: ModVersion) => void;
}) {
  const { t } = useTranslation();
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );

  const virtualizer = useVirtualizer({
    count: versions.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => VERSION_ROW_HEIGHT,
    overscan: 6,
  });

  return (
    <div
      ref={setScrollElement}
      className="h-full min-h-0 overflow-y-auto px-2 py-2"
    >
      <div
        role="listbox"
        aria-label={t("modManager.versionsTab")}
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const version = versions[virtualRow.index];
          const isSelected = version.id === selectedVersionId;
          const isInstalledVersion = version.id === installedVersionId;

          return (
            <div
              key={version.id}
              className="absolute top-0 left-0 w-full px-1"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(version)}
                className="flex h-12 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-row-hover aria-selected:bg-row-selected"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Hint content={version.name} variant="text" truncatedOnly>
                    <span className="truncate text-xs leading-4 text-foreground">
                      {version.name}
                    </span>
                  </Hint>
                  <span className="flex items-center gap-1.5 text-2xs leading-4 text-faint">
                    <span
                      className={`rounded-sm px-1 py-px ${releaseTypeClass(version.releaseType)}`}
                    >
                      {version.releaseType
                        ? t(`modManager.releaseTypes.${version.releaseType}`)
                        : t("modManager.releaseTypes.release")}
                    </span>
                    {formatDate(version.datePublished, lang) ?? ""}
                  </span>
                </div>

                {isInstalledVersion && (
                  <PackageCheck className="size-4 shrink-0 text-success" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
