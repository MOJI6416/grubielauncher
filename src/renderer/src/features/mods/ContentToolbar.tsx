import { Dispatch, SetStateAction } from "react";
import { SiCurseforge, SiModrinth } from "react-icons/si";
import {
  FilePlus2,
  Library,
  Loader2,
  Package,
  RotateCw,
  ScanSearch,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { ProjectType, Provider } from "@/types/ModManager";
import { IVersion } from "@/types/IVersion";
import { Loader } from "@/types/Loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VirtualizedSelect } from "@/components/ui/virtualized-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LoaderLabel } from "@renderer/components/Loaders";
import { AskAgentButton } from "@renderer/features/agent/AskAgentButton";
import { ContentEntry } from "./entries";
import { catalogLoaderHintKey } from "./catalogLoader";
import {
  LIBRARY_FACETS,
  LIBRARY_SORTS,
  LibraryFacet,
  LibrarySort,
  catalogFilterKey,
  catalogFilterLabel,
  categoryLocaleKey,
  humanizeFilterName,
  toggleValue,
} from "./filters";
import { SlidingIndicator } from "@renderer/components/SlidingIndicator";
import {
  PROJECT_TYPE_ICONS,
  type Scope,
  ScopeButton,
} from "./contentManagerParts";

import type { RefObject } from "react";
import type { TFunction } from "i18next";
import type { LibraryFacetCounts } from "./filters";
import type { IFilterGroup } from "@/types/ModManager";
import type { UpdateCheckResult } from "./useUpdateCheck";
import type { IndicatorBox } from "@renderer/utilities/useSlidingIndicator";

export interface ContentToolbarProps {
  browseLoader: Loader | undefined;
  canBrowse: boolean;
  canEdit: boolean;
  catalogFilters: string[];
  catalogProvider: Provider;
  catalogSort: string;
  facetCounts: LibraryFacetCounts;
  filterGroups: IFilterGroup[];
  filterQuery: string;
  gameVersions: IVersion[];
  identifiable: ContentEntry[];
  identifyLocal: (onlyKeys?: ReadonlySet<string>) => Promise<void>;
  isBusy: boolean;
  isIdentifying: boolean;
  isModpacks: boolean;
  isOnline: boolean;
  libraryEntries: ContentEntry[];
  libraryFacets: LibraryFacet[];
  librarySort: LibrarySort;
  listBusy: boolean;
  loader: Loader | undefined;
  loaderOptions: Loader[];
  meta: { sorts: string[]; filters: IFilterGroup[]; isReady: boolean };
  pickLocalFiles: () => Promise<void>;
  projectType: ProjectType;
  projectTypes: ProjectType[];
  providers: readonly Provider[];
  rawQuery: string;
  scope: Scope;
  scopeIndicator: {
    containerRef: RefObject<HTMLDivElement | null>;
    box: IndicatorBox | null;
    visible: boolean;
    transition: string;
  };
  searchRef: RefObject<HTMLInputElement | null>;
  setCatalogFilters: Dispatch<SetStateAction<string[]>>;
  setCatalogLoader: Dispatch<SetStateAction<Loader | null>>;
  setCatalogSort: Dispatch<SetStateAction<string>>;
  setFilterQuery: Dispatch<SetStateAction<string>>;
  setLibraryFacets: Dispatch<SetStateAction<LibraryFacet[]>>;
  setLibrarySort: Dispatch<SetStateAction<LibrarySort>>;
  setLoader: (loader: Loader | undefined) => void;
  setProjectType: Dispatch<SetStateAction<ProjectType>>;
  setRawQuery: Dispatch<SetStateAction<string>>;
  setScope: (scope: Scope) => void;
  setVersion: (version: IVersion | undefined) => void;
  t: TFunction<"translation", undefined>;
  translateCategory: (key: string, fallback: string) => string;
  typeCounts: Map<ProjectType, number>;
  typeIndicator: {
    containerRef: RefObject<HTMLDivElement | null>;
    box: IndicatorBox | null;
    visible: boolean;
    transition: string;
  };
  updateCheck: UpdateCheckResult;
  version: IVersion | undefined;
}

export function ContentToolbar({
  browseLoader,
  canBrowse,
  canEdit,
  catalogFilters,
  catalogProvider,
  catalogSort,
  facetCounts,
  filterGroups,
  filterQuery,
  gameVersions,
  identifiable,
  identifyLocal,
  isBusy,
  isIdentifying,
  isModpacks,
  isOnline,
  libraryEntries,
  libraryFacets,
  librarySort,
  listBusy,
  loader,
  loaderOptions,
  meta,
  pickLocalFiles,
  projectType,
  projectTypes,
  providers,
  rawQuery,
  scope,
  scopeIndicator,
  searchRef,
  setCatalogFilters,
  setCatalogLoader,
  setCatalogSort,
  setFilterQuery,
  setLibraryFacets,
  setLibrarySort,
  setLoader,
  setProjectType,
  setRawQuery,
  setScope,
  setVersion,
  t,
  translateCategory,
  typeCounts,
  typeIndicator,
  updateCheck,
  version,
}: ContentToolbarProps) {
  return (
    <>
      <div className="@container flex shrink-0 flex-wrap items-center gap-2 pb-2.5">
        <div
          ref={scopeIndicator.containerRef}
          className="relative flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5"
        >
          <SlidingIndicator
            indicator={scopeIndicator}
            variant="fill"
            className="rounded-md bg-surface-3"
          />
          {!isModpacks && (
            <ScopeButton
              active={scope === "library"}
              label={t("modManager.library")}
              compact
              count={
                projectTypes.length > 1 ? undefined : libraryEntries.length
              }
              onClick={() => setScope("library")}
            >
              <Library className="size-4" />
            </ScopeButton>
          )}

          {providers.includes(Provider.CURSEFORGE) && (
            <ScopeButton
              active={scope === Provider.CURSEFORGE}
              label="CurseForge"
              compact
              disabled={!canBrowse}
              onClick={() => setScope(Provider.CURSEFORGE)}
            >
              <SiCurseforge className="size-4" />
            </ScopeButton>
          )}

          {providers.includes(Provider.MODRINTH) && (
            <ScopeButton
              active={scope === Provider.MODRINTH}
              label="Modrinth"
              compact
              disabled={!canBrowse}
              onClick={() => setScope(Provider.MODRINTH)}
            >
              <SiModrinth className="size-4" />
            </ScopeButton>
          )}
        </div>

        {!isModpacks && projectTypes.length > 1 && (
          <div
            ref={typeIndicator.containerRef}
            role="tablist"
            aria-label={t("modManager.contentType")}
            className="relative flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5"
          >
            <SlidingIndicator
              indicator={typeIndicator}
              variant="fill"
              className="rounded-md bg-surface-3"
            />
            {projectTypes.map((type) => {
              const Icon = PROJECT_TYPE_ICONS[type] ?? Package;
              return (
                <ScopeButton
                  key={type}
                  active={projectType === type}
                  label={t(`modManager.projectTypes.${type}`)}
                  count={
                    scope === "library"
                      ? (typeCounts.get(type) ?? 0)
                      : undefined
                  }
                  onClick={() => setProjectType(type)}
                >
                  <Icon className="size-4" />
                </ScopeButton>
              );
            })}
          </div>
        )}

        {isModpacks && (
          <>
            <div className="w-28 shrink-0">
              <VirtualizedSelect
                size="sm"
                aria-label={t("versions.version")}
                value={version?.id || ""}
                placeholder={t("versions.version")}
                searchPlaceholder={t("common.search")}
                emptyText={t("common.notFound")}
                options={gameVersions.map((item) => ({
                  value: item.id,
                  label: item.id,
                }))}
                onValueChange={(value) =>
                  setVersion(gameVersions.find((item) => item.id === value))
                }
              />
            </div>

            <Select
              value={loader || ""}
              onValueChange={(value: Loader) => setLoader(value)}
            >
              <SelectTrigger size="sm" className="w-32 shrink-0">
                <SelectValue placeholder={t("versions.loader")} />
              </SelectTrigger>
              <SelectContent>
                {(["forge", "neoforge", "fabric", "quilt"] as Loader[]).map(
                  (item) => (
                    <SelectItem key={item} value={item}>
                      <LoaderLabel loader={item} />
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </>
        )}

        <div className="relative min-w-32 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <Input
            ref={searchRef}
            value={rawQuery}
            className="h-8 pr-8 pl-8"
            placeholder={
              scope === "library"
                ? t("modManager.searchLibrary")
                : t("browser.search")
            }
            onChange={(event) => setRawQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && rawQuery) {
                event.preventDefault();
                event.stopPropagation();
                setRawQuery("");
              }
            }}
          />
          {(listBusy || (scope === "library" && updateCheck.isChecking)) && (
            <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-faint" />
          )}
        </div>

        {scope === "library" ? (
          <Select
            value={librarySort}
            onValueChange={(value: LibrarySort) => setLibrarySort(value)}
          >
            <SelectTrigger size="sm" className="w-44 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIBRARY_SORTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`modManager.librarySorts.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Select value={catalogSort} onValueChange={setCatalogSort}>
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
        )}

        {scope !== "library" && loaderOptions.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="shrink-0">
                <Select
                  value={browseLoader ?? loaderOptions[0]}
                  onValueChange={(value: Loader) =>
                    setCatalogLoader(value === loader ? null : value)
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="w-fit min-w-32"
                    aria-label={t("modManager.catalogLoader")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {loaderOptions.map((item) => (
                      <SelectItem key={item} value={item}>
                        <LoaderLabel loader={item} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64">
              {t(catalogLoaderHintKey(loader))}
            </TooltipContent>
          </Tooltip>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 px-2.5"
              aria-label={t("modManager.filter")}
            >
              <SlidersHorizontal className="size-4" />
              <span className="hidden @5xl:inline">
                {t("modManager.filter")}
              </span>
              {(scope === "library"
                ? libraryFacets.length
                : catalogFilters.length) > 0 && (
                <span className="ml-0.5 rounded-sm bg-primary-soft px-1 font-mono text-[0.625rem] tabular-nums">
                  {scope === "library"
                    ? libraryFacets.length
                    : catalogFilters.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0">
            {scope === "library" ? (
              <div className="max-h-80 overflow-y-auto p-1.5">
                {LIBRARY_FACETS.map((facet) => (
                  <button
                    key={facet}
                    type="button"
                    disabled={
                      facetCounts[facet] === 0 && !libraryFacets.includes(facet)
                    }
                    onClick={() =>
                      setLibraryFacets(
                        (prev) => toggleValue(prev, facet) as LibraryFacet[],
                      )
                    }
                    className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-surface-3 disabled:opacity-40"
                  >
                    <Checkbox
                      checked={libraryFacets.includes(facet)}
                      className="pointer-events-none"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {t(`modManager.facets.${facet}`)}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
                      {facetCounts[facet]}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="border-b border-border p-1.5">
                  <Input
                    value={filterQuery}
                    className="h-8"
                    placeholder={t("common.search")}
                    onChange={(event) => setFilterQuery(event.target.value)}
                  />
                </div>
                <div className="max-h-72 overflow-y-auto p-1.5">
                  {!meta.isReady ? (
                    <div className="flex h-20 items-center justify-center">
                      <Loader2 className="size-4 animate-spin text-faint" />
                    </div>
                  ) : filterGroups.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                      {t("common.notFound")}
                    </p>
                  ) : (
                    filterGroups.map((group) => (
                      <div key={group.title} className="mb-1">
                        <p className="px-2 py-1 text-[0.6875rem] font-medium text-faint uppercase">
                          {translateCategory(
                            categoryLocaleKey(group.title),
                            humanizeFilterName(group.title),
                          )}
                        </p>
                        {group.items.map((item) => {
                          const key = catalogFilterKey(item, catalogProvider);
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() =>
                                setCatalogFilters((prev) =>
                                  toggleValue(prev, key),
                                )
                              }
                              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-surface-3"
                            >
                              <Checkbox
                                checked={catalogFilters.includes(key)}
                                className="pointer-events-none"
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {catalogFilterLabel(
                                  item,
                                  catalogProvider,
                                  translateCategory,
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>

        {canEdit && !isModpacks && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="outline"
                className="size-8 shrink-0"
                disabled={isBusy}
                aria-label={t("modManager.selectLocals")}
                onClick={pickLocalFiles}
              >
                <FilePlus2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("modManager.selectLocals")}
            </TooltipContent>
          </Tooltip>
        )}

        {scope === "library" &&
          canEdit &&
          !isModpacks &&
          isOnline &&
          identifiable.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="outline"
                  className="size-8 shrink-0"
                  disabled={isBusy || isIdentifying}
                  aria-label={t("modManager.identifyAction")}
                  onClick={() => void identifyLocal()}
                >
                  {isIdentifying ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ScanSearch className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isIdentifying
                  ? t("modManager.identifySearching")
                  : t("modManager.identifyAction")}
              </TooltipContent>
            </Tooltip>
          )}

        {scope === "library" && canEdit && !isModpacks && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="outline"
                className="size-8 shrink-0"
                disabled={isBusy || updateCheck.isChecking}
                aria-label={t("modManager.checkUpdates")}
                onClick={() => updateCheck.check(true)}
              >
                {updateCheck.isChecking ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RotateCw className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("modManager.checkUpdates")}
            </TooltipContent>
          </Tooltip>
        )}

        {!isModpacks && (
          <AskAgentButton
            className="size-8 shrink-0"
            prompt={t("agent.prompts.mods", {
              loader: loader ?? "",
              version: version?.id ?? "",
            })}
          />
        )}
      </div>
    </>
  );
}
