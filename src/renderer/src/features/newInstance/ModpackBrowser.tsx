import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SiCurseforge, SiModrinth } from "react-icons/si";
import {
  CircleAlert,
  Download,
  HardDriveDownload,
  Loader2,
  Package,
  RotateCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VirtualizedSelect } from "@/components/ui/virtualized-select";
import { Hint } from "@renderer/components/Hint";
import type { Loader } from "@/types/Loader";
import type { IVersion as IGameVersion } from "@/types/IVersion";
import {
  IProject,
  IVersion as IProjectVersion,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import { settingsAtom } from "@renderer/stores/atoms";
import { LoaderLabel } from "@renderer/components/Loaders";
import {
  useCatalogMeta,
  useCatalogSearch,
} from "@renderer/features/mods/useCatalogSearch";
import {
  formatCompactNumber,
  formatDate,
} from "@renderer/features/mods/format";
import { cn } from "@/lib/utils";
import type { ModpackDownloadStage } from "./downloadModpack";

const api = window.api;

const VERSIONS_CHANNEL = "modManager:getVersions";
const CATALOG_LOADERS: Loader[] = ["forge", "neoforge", "fabric", "quilt"];
const ROW_HEIGHT = 60;

interface DetailState {
  project: IProject | null;
  versions: IProjectVersion[];
  selectedId: string | null;
  isLoading: boolean;
  failed: boolean;
  loadFailed: boolean;
}

const EMPTY_DETAIL: DetailState = {
  project: null,
  versions: [],
  selectedId: null,
  isLoading: false,
  failed: false,
  loadFailed: false,
};

export function ModpackBrowser({
  isBusy,
  offlineReason,
  stage,
  progressPercent,
  onPick,
}: {
  isBusy: boolean;
  offlineReason: string | null;
  stage: ModpackDownloadStage;
  progressPercent: number;
  onPick: (project: IProject, version: IProjectVersion) => void;
}) {
  const { t } = useTranslation();
  const settings = useAtomValue(settingsAtom);
  const language = settings.lang || "en";

  const [provider, setProvider] = useState<Provider>(Provider.CURSEFORGE);
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("");
  const [gameVersion, setGameVersion] = useState("");
  const [loader, setLoader] = useState<Loader | undefined>();
  const [gameVersions, setGameVersions] = useState<IGameVersion[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>(EMPTY_DETAIL);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );

  const detailRequestRef = useRef(0);
  const versionsFailedAtRef = useRef(0);
  const meta = useCatalogMeta(provider, ProjectType.MODPACK, true);

  useEffect(() => {
    return api.events.onIpcError((payload) => {
      if (payload?.channel !== VERSIONS_CHANNEL) return;

      versionsFailedAtRef.current = Date.now();
      setDetail((prev) =>
        prev.isLoading || !prev.failed || prev.loadFailed
          ? prev
          : { ...prev, loadFailed: true },
      );
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(rawQuery), 350);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  useEffect(() => {
    setSort(meta.sorts[0] ?? "");
  }, [meta.sorts, provider]);

  useEffect(() => {
    let cancelled = false;

    void api.versions
      .getList("vanilla")
      .then((list) => {
        if (!cancelled) setGameVersions(list ?? []);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const catalog = useCatalogSearch(
    {
      provider,
      projectType: ProjectType.MODPACK,
      query,
      sort,
      filters: [],
      gameVersion: gameVersion || undefined,
      loader,
    },
    meta.isReady,
  );

  const items = catalog.items;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastVisible = virtualItems[virtualItems.length - 1]?.index ?? -1;

  useEffect(() => {
    if (!catalog.hasMore || catalog.isLoading || catalog.isLoadingMore) return;
    if (lastVisible < items.length - 4) return;

    catalog.loadMore();
  }, [catalog, items.length, lastVisible]);

  const openDetail = useCallback(
    async (project: IProject) => {
      const requestId = ++detailRequestRef.current;

      setActiveId(project.id);
      setDetail({
        ...EMPTY_DETAIL,
        project,
        isLoading: true,
      });

      const startedAt = Date.now();

      const [versions, info] = await Promise.all([
        api.modManager
          .getVersions(project.provider, project.id, {
            projectType: ProjectType.MODPACK,
            loader,
            version: gameVersion || undefined,
            modUrl: project.url,
          })
          .catch(() => [] as IProjectVersion[]),
        api.modManager
          .getProject(project.provider, project.id)
          .catch(() => null),
      ]);

      if (requestId !== detailRequestRef.current) return;

      const loadFailed =
        versions.length === 0 && versionsFailedAtRef.current >= startedAt;

      setDetail({
        project: info ? { ...project, ...info } : project,
        versions,
        selectedId: versions[0]?.id ?? null,
        isLoading: false,
        failed: versions.length === 0,
        loadFailed,
      });
    },
    [gameVersion, loader],
  );

  useEffect(() => {
    detailRequestRef.current += 1;
    setActiveId(null);
    setDetail(EMPTY_DETAIL);
  }, [provider, query, gameVersion, loader, sort]);

  const selectedVersion = useMemo(
    () => detail.versions.find((item) => item.id === detail.selectedId) ?? null,
    [detail.selectedId, detail.versions],
  );

  const stageLabel = stage
    ? stage === "extract"
      ? t("modManager.extracting")
      : t("downloadProgress.title")
    : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
          {[Provider.CURSEFORGE, Provider.MODRINTH].map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={provider === item}
              disabled={isBusy}
              onClick={() => setProvider(item)}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-surface-3 aria-pressed:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {item === Provider.CURSEFORGE ? (
                <SiCurseforge className="size-4" />
              ) : (
                <SiModrinth className="size-4" />
              )}
              {provider === item &&
                (item === Provider.CURSEFORGE ? "CurseForge" : "Modrinth")}
            </button>
          ))}
        </div>

        <div className="relative min-w-28 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <Input
            value={rawQuery}
            disabled={isBusy}
            className="h-8 pr-8 pl-8"
            placeholder={t("browser.search")}
            onChange={(event) => setRawQuery(event.target.value)}
          />
          {(catalog.isLoading || !meta.isReady) && (
            <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-faint" />
          )}
        </div>

        <div className="w-32 shrink-0">
          <VirtualizedSelect
            size="sm"
            aria-label={t("versions.version")}
            value={gameVersion}
            placeholder={t("versions.version")}
            searchPlaceholder={t("common.search")}
            emptyText={t("common.notFound")}
            disabled={isBusy}
            options={[
              { value: "", label: t("newInstance.anyVersion") },
              ...gameVersions.map((item) => ({
                value: item.id,
                label: item.id,
              })),
            ]}
            onValueChange={setGameVersion}
          />
        </div>

        <Select
          value={loader ?? "any"}
          disabled={isBusy}
          onValueChange={(value) =>
            setLoader(value === "any" ? undefined : (value as Loader))
          }
        >
          <SelectTrigger size="sm" className="w-40 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("newInstance.anyLoader")}</SelectItem>
            {CATALOG_LOADERS.map((item) => (
              <SelectItem key={item} value={item}>
                <LoaderLabel loader={item} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} disabled={isBusy} onValueChange={setSort}>
          <SelectTrigger size="sm" className="w-40 shrink-0">
            <SelectValue placeholder={t("modManager.sort")} />
          </SelectTrigger>
          <SelectContent>
            {meta.sorts.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`modManager.sorts.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem] gap-3">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
          <div
            ref={setScrollElement}
            className="min-h-0 flex-1 overflow-y-auto p-1.5"
          >
            {items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
                {(catalog.isLoading || !meta.isReady) && !offlineReason ? (
                  <Loader2 className="size-5 animate-spin text-faint" />
                ) : (
                  <>
                    <span className="flex size-11 items-center justify-center rounded-xl bg-surface-2">
                      {catalog.error || offlineReason ? (
                        <CircleAlert className="size-5 text-destructive" />
                      ) : (
                        <Search className="size-5 text-faint" />
                      )}
                    </span>
                    <p className="text-sm font-medium text-foreground">
                      {offlineReason
                        ? t("shell.offline.internet")
                        : catalog.error
                          ? t("modManager.searchFailedTitle")
                          : t("common.notFound")}
                    </p>
                    <p className="max-w-64 text-xs text-muted-foreground">
                      {offlineReason ??
                        (catalog.error
                          ? t("modManager.searchFailed")
                          : t("modManager.notFoundHint"))}
                    </p>
                    {catalog.error && !offlineReason && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={catalog.reload}
                      >
                        <RotateCw />
                        {t("common.retry")}
                      </Button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div
                className="relative w-full"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualItems.map((row) => {
                  const project = items[row.index];
                  if (!project) return null;

                  const downloads = formatCompactNumber(
                    project.stats?.downloads,
                    language,
                  );
                  const updated = formatDate(
                    project.stats?.dateModified,
                    language,
                  );

                  return (
                    <button
                      key={`${project.provider}-${project.id}`}
                      type="button"
                      disabled={isBusy}
                      aria-selected={activeId === project.id}
                      style={{
                        height: `${row.size}px`,
                        transform: `translateY(${row.start}px)`,
                      }}
                      onClick={() => void openDetail(project)}
                      className="absolute top-0 left-0 flex w-full items-center gap-2.5 rounded-xl px-2 text-left transition-colors hover:bg-surface-2 aria-selected:bg-primary-soft disabled:cursor-not-allowed"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2">
                        {project.iconUrl ? (
                          <img
                            src={project.iconUrl}
                            alt=""
                            draggable={false}
                            className="size-full object-cover"
                          />
                        ) : (
                          <Package className="size-4 text-faint" />
                        )}
                      </span>

                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium text-foreground">
                          {project.title}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {project.description}
                        </span>
                      </span>

                      <span className="flex shrink-0 flex-col items-end gap-0.5 text-[0.7rem] text-faint">
                        {downloads && (
                          <span className="flex items-center gap-1 font-mono tabular-nums">
                            <Download className="size-3" />
                            {downloads}
                          </span>
                        )}
                        {updated && <span>{updated}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {catalog.isLoadingMore && (
            <div className="flex h-7 shrink-0 items-center justify-center gap-2 border-t border-border text-[0.7rem] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {t("common.searching")}
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
          {!detail.project ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <Package className="size-6 text-faint" />
              <p className="text-xs text-muted-foreground">
                {t("newInstance.pickModpackHint")}
              </p>
            </div>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {detail.project.gallery?.[0]?.url && (
                  <img
                    src={detail.project.gallery[0].url}
                    alt=""
                    draggable={false}
                    className="h-28 w-full shrink-0 border-b border-border object-cover"
                  />
                )}

                <div className="flex shrink-0 items-start gap-2.5 p-2.5">
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2">
                    {detail.project.iconUrl ? (
                      <img
                        src={detail.project.iconUrl}
                        alt=""
                        draggable={false}
                        className="size-full object-cover"
                      />
                    ) : (
                      <Package className="size-5 text-faint" />
                    )}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Hint
                      content={detail.project.title}
                      variant="text"
                      truncatedOnly
                    >
                      <span className="truncate text-sm font-semibold text-foreground">
                        {detail.project.title}
                      </span>
                    </Hint>
                    <span className="flex items-center gap-2 text-[0.7rem] text-faint">
                      {detail.project.provider === Provider.CURSEFORGE ? (
                        <SiCurseforge className="size-3 text-[#f16436]" />
                      ) : (
                        <SiModrinth className="size-3 text-[#1bd96a]" />
                      )}
                      {formatCompactNumber(
                        detail.project.stats?.downloads,
                        language,
                      ) && (
                        <span className="font-mono tabular-nums">
                          {formatCompactNumber(
                            detail.project.stats?.downloads,
                            language,
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <p className="px-2.5 pb-2.5 text-xs leading-snug text-muted-foreground">
                  {detail.project.description}
                </p>

                <dl className="mt-auto divide-y divide-border/60 border-t border-border/60">
                  {[
                    {
                      key: "downloads",
                      label: t("newInstance.stats.downloads"),
                      value: detail.project.stats?.downloads
                        ? formatCompactNumber(
                            detail.project.stats.downloads,
                            language,
                          )
                        : null,
                    },
                    {
                      key: "follows",
                      label: t("newInstance.stats.follows"),
                      value: detail.project.stats?.follows
                        ? formatCompactNumber(
                            detail.project.stats.follows,
                            language,
                          )
                        : null,
                    },
                    {
                      key: "updated",
                      label: t("modManager.statsUpdated"),
                      value: formatDate(
                        detail.project.stats?.dateModified,
                        language,
                      ),
                    },
                  ]
                    .filter((row) => !!row.value)
                    .map((row) => (
                      <div
                        key={row.key}
                        className="flex items-center gap-2 px-2.5 py-1.5"
                      >
                        <dt className="shrink-0 text-xs text-muted-foreground">
                          {row.label}
                        </dt>
                        <dd className="ml-auto min-w-0 truncate font-mono text-xs tabular-nums text-foreground">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>

              <div className="shrink-0 border-t border-border p-2.5">
                {detail.isLoading ? (
                  <div className="flex h-16 items-center justify-center">
                    <Loader2 className="size-4 animate-spin text-faint" />
                  </div>
                ) : detail.failed ? (
                  <div className="grid gap-2">
                    <p className="text-xs text-destructive">
                      {detail.loadFailed
                        ? t("newInstance.modpackVersionsFailed")
                        : t("newInstance.noModpackVersions")}
                    </p>
                    {detail.loadFailed && detail.project && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => {
                          if (detail.project) void openDetail(detail.project);
                        }}
                      >
                        <RotateCw />
                        {t("common.retry")}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid min-w-0 gap-2">
                    <VirtualizedSelect
                      className="min-w-0"
                      size="sm"
                      aria-label={t("versions.version")}
                      value={detail.selectedId ?? ""}
                      placeholder={t("versions.version")}
                      searchPlaceholder={t("common.search")}
                      emptyText={t("common.notFound")}
                      disabled={isBusy}
                      options={detail.versions.map((item) => ({
                        value: item.id,
                        label: item.name || item.id,
                      }))}
                      onValueChange={(value) =>
                        setDetail((prev) => ({ ...prev, selectedId: value }))
                      }
                    />

                    {isBusy && stage ? (
                      <div className="grid gap-1.5">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" />
                          <span className="min-w-0 flex-1 truncate">
                            {stageLabel}
                          </span>
                          {stage === "download" && (
                            <span className="font-mono tabular-nums text-faint">
                              {progressPercent}%
                            </span>
                          )}
                        </div>
                        <Progress
                          value={stage === "extract" ? 100 : progressPercent}
                          max={100}
                          className={cn(
                            "h-1.5",
                            stage === "extract" &&
                              "[&_[data-slot=progress-indicator]]:animate-pulse",
                          )}
                        />
                      </div>
                    ) : (
                      <Button
                        type="button"
                        className="h-9 w-full min-w-0"
                        disabled={!selectedVersion || isBusy}
                        onClick={() => {
                          if (!detail.project || !selectedVersion) return;
                          onPick(detail.project, selectedVersion);
                        }}
                      >
                        <HardDriveDownload />
                        <span className="min-w-0 truncate">
                          {t("newInstance.useModpack")}
                        </span>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
