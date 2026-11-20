import { useEffect, useState, type CSSProperties, type UIEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue, useSetAtom } from "jotai";
import {
  CircleAlert,
  FilterX,
  HardDriveDownload,
  Loader2,
  RotateCw,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IModpack } from "@/types/Backend";
import {
  internetAtom,
  networkAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import type { ConnectivityProblem } from "@renderer/utilities/connectivity";
import { LoaderLabel } from "@renderer/components/Loaders";
import { CommunityPackCard } from "./CommunityPackCard";
import {
  areFacetCountsExact,
  catalogEmptyState,
  EMPTY_FILTERS,
  EXPLORE_SORTS,
  type ExploreFilters,
  isFilterActive,
  loaderFacetOptions,
  versionFacetOptions,
} from "./exploreQuery";
import { useExploreCatalog } from "./useExploreCatalog";
import {
  findInstalledInstanceKey,
  useInstalledShareCodes,
} from "./installedPacks";
import { usePackInstall } from "./usePackInstall";
import { ListSkeleton } from "@renderer/components/ListSkeleton";
import { Hint } from "@renderer/components/Hint";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { SortMenu } from "@renderer/components/SortMenu";
import { useEntranceWave } from "@renderer/utilities/useEntranceWave";

const LOAD_MORE_THRESHOLD = 180;
const api = window.api;

export function CommunityBrowser({
  isBusy,
  offlineProblem,
  onPick,
  onOpenInstalled,
}: {
  isBusy: boolean;
  offlineProblem: ConnectivityProblem | null;
  onPick: (modpack: IModpack) => void;
  onOpenInstalled: (instanceKey: string) => void;
}) {
  const { t } = useTranslation();
  const settings = useAtomValue(settingsAtom);
  const language = settings.lang || "en";
  const setIsInternetOnline = useSetAtom(internetAtom);
  const setIsBackendOnline = useSetAtom(networkAtom);

  const [rawQuery, setRawQuery] = useState("");
  const [filters, setFilters] = useState<ExploreFilters>(EMPTY_FILTERS);
  const [isRechecking, setIsRechecking] = useState(false);

  const installed = useInstalledShareCodes();
  const catalog = useExploreCatalog(filters, !offlineProblem);
  const isResultWave = useEntranceWave(catalog.isLoading);
  const { busyId, install } = usePackInstall(onPick);

  useEffect(() => {
    const timer = setTimeout(
      () => setFilters((previous) => ({ ...previous, query: rawQuery })),
      350,
    );

    return () => clearTimeout(timer);
  }, [rawQuery]);

  const loaderOptions = loaderFacetOptions(catalog.facets);
  const versionOptions = versionFacetOptions(catalog.facets);
  const hasLoaderCounts = areFacetCountsExact(filters, "loader");
  const hasVersionCounts = areFacetCountsExact(filters, "mc");
  const isPending = isBusy || busyId !== null;
  const areFiltersActive = isFilterActive(filters);
  const emptyState = catalogEmptyState({
    offlineProblem,
    hasError: catalog.error,
    filters,
  });

  const resetFilters = () => {
    setRawQuery("");
    setFilters(EMPTY_FILTERS);
  };

  const recheckConnection = async () => {
    setIsRechecking(true);
    const isHealthy =
      (await api.backend.checkHealth().catch(ignoreFailure)) === true;
    setIsInternetOnline(window.navigator.onLine);
    setIsBackendOnline(isHealthy);
    setIsRechecking(false);
  };

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const rest =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    if (rest < LOAD_MORE_THRESHOLD) catalog.loadMore();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative min-w-28 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <Input
            value={rawQuery}
            disabled={isPending}
            className="h-8 pr-8 pl-8"
            placeholder={t("community.search")}
            onChange={(event) => setRawQuery(event.target.value)}
          />
          {catalog.isLoading && (
            <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-faint" />
          )}
        </div>

        <Select
          value={filters.mc || "any"}
          disabled={isPending}
          onValueChange={(value) =>
            setFilters((previous) => ({
              ...previous,
              mc: value === "any" ? "" : value,
            }))
          }
        >
          <SelectTrigger size="sm" className="w-40 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("newInstance.anyVersion")}</SelectItem>
            {versionOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Hint content={option.value} variant="text" truncatedOnly>
                    <span className="min-w-0 truncate font-mono">
                      {option.value}
                    </span>
                  </Hint>
                  {hasVersionCounts && (
                    <span className="ml-auto shrink-0 font-mono text-faint tabular-nums">
                      {option.count}
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.loader || "any"}
          disabled={isPending}
          onValueChange={(value) =>
            setFilters((previous) => ({
              ...previous,
              loader: value === "any" ? "" : value,
            }))
          }
        >
          <SelectTrigger size="sm" className="w-40 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("newInstance.anyLoader")}</SelectItem>
            {loaderOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <LoaderLabel loader={option.value} />
                  {hasLoaderCounts && (
                    <span className="ml-auto shrink-0 font-mono text-faint tabular-nums">
                      {option.count}
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SortMenu
          value={filters.sort}
          disabled={isPending}
          options={EXPLORE_SORTS.map((value) => ({
            value,
            label: t(`community.sorts.${value}`),
          }))}
          onChange={(value) =>
            setFilters((previous) => ({
              ...previous,
              sort: value as ExploreFilters["sort"],
            }))
          }
        />
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
        <div
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          {catalog.items.length === 0 &&
          catalog.isLoading &&
          !offlineProblem ? (
            <ListSkeleton rows={9} />
          ) : catalog.items.length === 0 ? (
            <Empty className="h-full px-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {emptyState.action === "none" ||
                  emptyState.action === "resetFilters" ? (
                    <Users />
                  ) : (
                    <CircleAlert className="text-destructive" />
                  )}
                </EmptyMedia>
                <EmptyTitle>{t(emptyState.titleKey)}</EmptyTitle>
                <EmptyDescription className="max-w-72 text-xs">
                  {t(emptyState.hintKey)}
                </EmptyDescription>
              </EmptyHeader>
              {emptyState.action === "retryConnection" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isRechecking}
                  onClick={() => void recheckConnection()}
                >
                  {isRechecking ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RotateCw />
                  )}
                  {t("common.retry")}
                </Button>
              )}
              {emptyState.action === "retryLoad" && (
                <Button size="sm" variant="outline" onClick={catalog.reload}>
                  <RotateCw />
                  {t("common.retry")}
                </Button>
              )}
              {emptyState.action === "resetFilters" && (
                <Button size="sm" variant="outline" onClick={resetFilters}>
                  <FilterX />
                  {t("community.resetFilters")}
                </Button>
              )}
            </Empty>
          ) : (
            <div className={cn("grid grid-cols-1 gap-1.5", isResultWave && "result-wave")}>
              {catalog.items.map((pack, index) => {
                const instanceKey = findInstalledInstanceKey(installed, pack);

                return (
                  <div
                    key={pack.id}
                    className="min-w-0"
                    data-wave-row
                    style={{ "--wave-index": index } as CSSProperties}
                  >
                    <CommunityPackCard
                      pack={pack}
                      language={language}
                      isInstalled={Boolean(instanceKey)}
                      action={
                        instanceKey ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenInstalled(instanceKey)}
                          >
                            {t("versions.openInstance")}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => void install(pack.id)}
                          >
                            {busyId === pack.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <HardDriveDownload />
                            )}
                            {t("common.install")}
                          </Button>
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex h-7 shrink-0 items-center gap-2 border-t border-border px-2.5 text-2xs text-faint">
          {catalog.isLoadingMore ? (
            <>
              <Loader2 className="size-3 animate-spin" />
              {t("common.searching")}
            </>
          ) : catalog.loadMoreError ? (
            <>
              <CircleAlert className="size-3 shrink-0 text-warning" />
              <Hint
                content={t("community.loadMoreFailed")}
                variant="text"
                truncatedOnly
              >
                <span className="min-w-0 truncate text-warning">
                  {t("community.loadMoreFailed")}
                </span>
              </Hint>
              <button
                type="button"
                onClick={catalog.retryLoadMore}
                className="ml-auto shrink-0 rounded-md font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("common.retry")}
              </button>
            </>
          ) : catalog.items.length === 0 ? null : (
            <>
              <Hint
                content={t("community.shown", {
                  shown: catalog.items.length,
                  total: catalog.total,
                })}
                variant="text"
                truncatedOnly
              >
                <span className="min-w-0 truncate">
                  {t("community.shown", {
                    shown: catalog.items.length,
                    total: catalog.total,
                  })}
                </span>
              </Hint>
              {areFiltersActive && catalog.items.length > 0 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="ml-auto shrink-0 rounded-md font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("community.resetFilters")}
                </button>
              )}
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
