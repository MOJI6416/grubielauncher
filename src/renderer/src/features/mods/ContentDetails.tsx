import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SiCurseforge, SiModrinth } from "react-icons/si";
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
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  DependencyType,
  ILocalProject,
  IProject,
  IVersion as ModVersion,
  Provider,
  VersionReleaseType,
} from "@/types/ModManager";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Hint } from "@renderer/components/Hint";
import { ContentEntry } from "./entries";
import { formatCompactNumber, formatDate } from "./format";
import { ProjectBody } from "./ProjectBody";
import { ProjectGallery } from "./ProjectGallery";
import { ProjectIcon } from "./ProjectIcon";

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
  onTranslate,
  onRetry,
}: {
  entry: ContentEntry;
  project: IProject | null;
  versions: ModVersion[];
  selectedVersion: ModVersion | null;
  installedVersionId: string | null;
  isLoading: boolean;
  isBusy: boolean;
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
  onBack: () => void;
  onClose: () => void;
  onSelectVersion: (version: ModVersion) => void;
  onInstall: (version: ModVersion) => void;
  onDelete: () => void;
  onOpenDependency: (project: IProject) => void;
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
  const changelog = selectedVersion?.changelog?.trim() ?? "";
  const dependencies = selectedVersion?.dependencies ?? [];
  const resolvedDependencies = useMemo(
    () => dependencies.filter((dependency) => dependency.project),
    [dependencies],
  );

  useEffect(() => {
    setTab("about");
  }, [entry.key]);

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
    <aside className="flex w-[344px] shrink-0 flex-col overflow-hidden border-l border-border bg-surface-1">
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        {canGoBack && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("shell.back")}
            onClick={onBack}
          >
            <ChevronLeft className="size-4" />
          </Button>
        )}
        <Hint content={title} variant="text" truncatedOnly>
          <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">
            {title}
          </span>
        </Hint>
        {detail?.url ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("modManager.goToWebsite")}
                onClick={() => api.shell.openExternal(detail.url)}
              >
                <ExternalLink className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("modManager.goToWebsite")}</TooltipContent>
          </Tooltip>
        ) : null}
        {canTranslate && (
          <Tooltip>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent>{t("modManager.translate")}</TooltipContent>
          </Tooltip>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("common.close")}
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </header>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("common.loading")}
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <CircleAlert className="size-6 text-destructive" />
          <p className="text-sm text-foreground">
            {t("modManager.notFoundMod")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("modManager.notFoundModHint")}
          </p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        </div>
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
                <p className="line-clamp-2 text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">
                  {description}
                </p>

                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.6875rem] leading-4 text-faint">
                  <span className="flex items-center gap-1">
                    {entry.provider === Provider.CURSEFORGE ? (
                      <SiCurseforge className="size-3" />
                    ) : entry.provider === Provider.MODRINTH ? (
                      <SiModrinth className="size-3" />
                    ) : (
                      <Package className="size-3" />
                    )}
                  </span>
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

                {isInstalled && !isModpacks && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="outline"
                        className="size-9 border-destructive/40 text-destructive hover:bg-destructive/15 hover:text-destructive"
                        disabled={isBusy || deletionBlockers.length > 0}
                        aria-label={t("common.delete")}
                        onClick={onDelete}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-56">
                      {deletionBlockers.length > 0
                        ? `${t("modManager.requiredBy")}: ${deletionBlockers
                            .map((item) => item.title)
                            .join(", ")}`
                        : alsoRemoves.length > 0
                          ? `${t("modManager.alsoRemoves")}: ${alsoRemoves
                              .map((item) => item.title)
                              .join(", ")}`
                          : t("common.delete")}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}

            <Collapse show={Boolean(progress)}>
              {progress ? (
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{progress.label}</span>
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
              className={`mx-3 mt-2.5 grid h-7 w-auto shrink-0 ${
                isModpacks ? "grid-cols-2" : "grid-cols-3"
              }`}
            >
              <TabsTrigger value="about" className="px-2 text-xs">
                {t("common.description")}
              </TabsTrigger>
              <TabsTrigger value="versions" className="px-2 text-xs">
                {t("modManager.versionsTab")}
                {versions.length > 0 && (
                  <span className="ml-1 font-mono text-[0.625rem] text-faint">
                    {versions.length}
                  </span>
                )}
              </TabsTrigger>
              {!isModpacks && (
                <TabsTrigger value="deps" className="px-2 text-xs">
                  {t("modManager.dependencies")}
                  {dependencies.length > 0 && (
                    <span className="ml-1 font-mono text-[0.625rem] text-faint">
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
                  <ProjectGallery gallery={gallery} />
                </div>
              )}

              {changelog && (
                <div className="mb-3 rounded-lg border border-border bg-surface-2 p-2.5">
                  <p className="mb-1 text-xs font-medium text-foreground">
                    {t("modManager.changelog")}
                    {selectedVersion?.name ? ` · ${selectedVersion.name}` : ""}
                  </p>
                  <div className="max-h-40 overflow-y-auto">
                    <ProjectBody
                      key={`changelog-${entry.key}-${selectedVersion?.id}`}
                      body={changelog}
                      baseUrl={detail?.url}
                    />
                  </div>
                </div>
              )}

              {body ? (
                <ProjectBody
                  key={`body-${entry.key}-${body.length}`}
                  body={body}
                  baseUrl={detail?.url}
                />
              ) : (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  {t("common.notFound")}
                </p>
              )}
            </TabsContent>

            <TabsContent
              value="versions"
              className="min-h-0 flex-1 overflow-hidden"
            >
              {versions.length === 0 ? (
                <p className="m-3 rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  {t("modManager.notFoundMod")}
                </p>
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
              {depsError && (
                <div className="mb-2 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-3 py-5 text-center">
                  <CircleAlert className="size-5 text-destructive" />
                  <p className="text-xs text-muted-foreground">
                    {t("modManager.dependenciesFailed")}
                  </p>
                  <Button size="sm" variant="outline" onClick={onRetry}>
                    {t("common.retry")}
                  </Button>
                </div>
              )}

              {resolvedDependencies.length === 0 ? (
                depsError ? null : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    {t("modManager.noDependencies")}
                  </p>
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
                          <span className="flex items-center gap-1.5 text-[0.6875rem] leading-4">
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
                aria-pressed={isSelected}
                onClick={() => onSelect(version)}
                className="flex h-12 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-surface-2 aria-pressed:bg-surface-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Hint content={version.name} variant="text" truncatedOnly>
                    <span className="truncate text-xs leading-4 text-foreground">
                      {version.name}
                    </span>
                  </Hint>
                  <span className="flex items-center gap-1.5 text-[0.6875rem] leading-4 text-faint">
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
