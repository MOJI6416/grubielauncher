import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Download,
  ExternalLink,
  Loader2,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { IProject, ProjectType, Provider } from "@/types/ModManager";
import { Version } from "@renderer/classes/Version";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Hint } from "@renderer/components/Hint";
import { ListSkeleton } from "@renderer/components/ListSkeleton";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { SortMenu } from "@renderer/components/SortMenu";
import { LoadMoreRow } from "@renderer/components/LoadMoreRow";
import { ContentProviderIcon } from "@renderer/components/ContentProviderIcon";
import { ProjectIcon } from "@renderer/features/mods/ProjectIcon";
import { displayTitle } from "@renderer/features/mods/titles";
import {
  useCatalogMeta,
  useCatalogSearch,
} from "@renderer/features/mods/useCatalogSearch";
import { useEntranceWave } from "@renderer/utilities/useEntranceWave";
import { useLoadOnScroll } from "@renderer/utilities/useLoadOnScroll";
import { formatCompactNumber } from "@renderer/utilities/numbers";
import { showFailureToast } from "@renderer/utilities/failures";
import { cn } from "@/lib/utils";
import { WORLD_CATALOG_PROVIDERS } from "./worldCatalogInstall";

const api = window.api;

const QUERY_DELAY_MS = 300;

type CatalogType = ProjectType.WORLD | ProjectType.DATAPACK;
type CatalogSource = Provider.MODRINTH | Provider.CURSEFORGE;

const SOURCE_NAMES: Record<CatalogSource, string> = {
  [Provider.MODRINTH]: "Modrinth",
  [Provider.CURSEFORGE]: "CurseForge",
};

export function WorldCatalog({
  projectType,
  version,
  busyId,
  installedIds,
  blockedReason,
  onInstall,
  onClose,
}: {
  projectType: CatalogType;
  version: Version;
  busyId: string | null;
  installedIds?: ReadonlySet<string>;
  blockedReason?: string;
  onInstall: (project: IProject) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const providers = WORLD_CATALOG_PROVIDERS[projectType];
  const [provider, setProvider] = useState<CatalogSource>(providers[0]);
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(rawQuery), QUERY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [rawQuery]);

  const meta = useCatalogMeta(provider, projectType, true);
  const activeSort = meta.sorts.includes(sort) ? sort : (meta.sorts[0] ?? "");
  const catalog = useCatalogSearch(
    {
      provider,
      projectType,
      query,
      sort: activeSort,
      filters: [],
      gameVersion: version.version.version.id,
      loader: version.version.loader.name,
    },
    meta.isReady,
  );
  const setScroller = useLoadOnScroll(
    catalog.hasMore &&
      !catalog.isLoading &&
      !catalog.isLoadingMore &&
      !catalog.error,
    () => catalog.loadMore(),
    catalog.items.length,
  );
  const isWave = useEntranceWave(catalog.isLoading);

  const title =
    projectType === ProjectType.WORLD
      ? t("worldCatalog.worldsTitle")
      : t("worldCatalog.datapacksTitle");

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <span className="shrink-0 text-xs font-semibold">{title}</span>

        {providers.length > 1 ? (
          <SegmentedControl
            value={provider}
            ariaLabel={t("worldCatalog.source")}
            options={providers.map((value) => ({
              value,
              label: SOURCE_NAMES[value],
              icon: <ContentProviderIcon provider={value} />,
            }))}
            onChange={setProvider}
          />
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-2xs text-faint">
            <ContentProviderIcon provider={provider} />
            {SOURCE_NAMES[provider]}
          </span>
        )}

        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            autoFocus
            value={rawQuery}
            className="h-8 pl-7 text-xs"
            placeholder={t("worldCatalog.search")}
            onChange={(event) => setRawQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
            }}
          />
        </div>

        <SortMenu
          value={activeSort}
          disabled={meta.sorts.length === 0}
          options={meta.sorts.map((value) => ({
            value,
            label: t(`modManager.sorts.${value}`),
          }))}
          onChange={setSort}
        />

        <Hint content={t("common.close")}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-8 shrink-0 text-muted-foreground"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <X />
          </Button>
        </Hint>
      </div>

      {blockedReason && (
        <p className="shrink-0 text-2xs text-warning">{blockedReason}</p>
      )}

      <div ref={setScroller} className="min-h-0 flex-1 overflow-y-auto">
        {catalog.isLoading || !meta.isReady ? (
          <ListSkeleton rows={6} rowClassName="h-14" />
        ) : catalog.error && catalog.items.length === 0 ? (
          <Empty className="h-full border border-dashed border-border bg-surface-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TriangleAlert />
              </EmptyMedia>
              <EmptyTitle>
                {t("modManager.searchFailedSource", {
                  source: SOURCE_NAMES[provider],
                })}
              </EmptyTitle>
            </EmptyHeader>
            <Button variant="outline" size="sm" onClick={catalog.reload}>
              {t("common.retry")}
            </Button>
          </Empty>
        ) : catalog.items.length === 0 ? (
          <Empty className="h-full border border-dashed border-border bg-surface-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>{t("worldCatalog.nothing")}</EmptyTitle>
              <EmptyDescription>
                {query.trim()
                  ? t("worldCatalog.nothingHint")
                  : t("worldCatalog.nothingForVersion", {
                      version: version.version.version.id,
                    })}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className={cn("flex flex-col gap-0.5 pr-1", isWave && "result-wave")}>
            {catalog.items.map((project, index) => (
              <CatalogRow
                key={`${project.provider}:${project.id}`}
                project={project}
                index={index}
                busy={busyId === project.id}
                installed={installedIds?.has(project.id) === true}
                disabled={Boolean(blockedReason) || busyId !== null}
                onInstall={() => onInstall(project)}
              />
            ))}

            <LoadMoreRow
              isLoading={catalog.isLoadingMore}
              failedText={
                catalog.error
                  ? t("modManager.searchFailedSource", {
                      source: SOURCE_NAMES[provider],
                    })
                  : undefined
              }
              onRetry={() => catalog.loadMore(true)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function CatalogRow({
  project,
  index,
  busy,
  installed,
  disabled,
  onInstall,
}: {
  project: IProject;
  index: number;
  busy: boolean;
  installed: boolean;
  disabled: boolean;
  onInstall: () => void;
}) {
  const { t, i18n } = useTranslation();
  const title = displayTitle(project.title);
  const downloads = formatCompactNumber(
    project.stats?.downloads,
    i18n.resolvedLanguage || i18n.language,
  );
  const meta = [project.author?.name, downloads && t("worldCatalog.downloads", { value: downloads })]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      data-wave-row
      style={{ "--wave-index": index } as CSSProperties}
      className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-row-hover"
    >
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-surface-3">
        <ProjectIcon src={project.iconUrl} size={40} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <Hint content={title} variant="text" truncatedOnly>
            <span className="truncate text-xs font-medium">{title}</span>
          </Hint>
          {meta && (
            <Hint content={meta} variant="text" truncatedOnly>
              <span className="min-w-0 shrink truncate text-3xs text-faint">
                {meta}
              </span>
            </Hint>
          )}
        </span>
        <Hint content={project.description} variant="text" truncatedOnly>
          <span className="truncate text-2xs text-muted-foreground">
            {project.description}
          </span>
        </Hint>
      </div>

      {project.url && (
        <Hint content={t("worldCatalog.openPage")}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0 text-muted-foreground"
            aria-label={t("worldCatalog.openPage")}
            onClick={() =>
              void api.shell.openExternal(project.url).catch((error) =>
                showFailureToast(t("settings.about.openLinkFailed"), error, {
                  channels: ["shell:openExternal"],
                }),
              )
            }
          >
            <ExternalLink className="size-3.5" />
          </Button>
        </Hint>
      )}

      <Button
        variant="outline"
        size="sm"
        className="h-7 shrink-0 px-2.5 text-xs"
        disabled={disabled || installed}
        onClick={onInstall}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : installed ? (
          <Check className="size-3.5 text-success" />
        ) : (
          <Download className="size-3.5" />
        )}
        {installed ? t("worldCatalog.installed") : t("worldCatalog.install")}
      </Button>
    </div>
  );
}
