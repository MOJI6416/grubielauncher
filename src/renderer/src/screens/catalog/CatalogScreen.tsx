import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, Loader2, Package, Search } from "lucide-react";
import { PROJECT_TYPE_ICONS } from "@renderer/features/mods/contentManagerParts";
import { IProject, ProjectType, Provider } from "@/types/ModManager";
import type { IVersion } from "@/types/IVersion";
import type { Loader } from "@/types/Loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VirtualizedSelect } from "@/components/ui/virtualized-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty";
import { Hint } from "@renderer/components/Hint";
import { ListSkeleton } from "@renderer/components/ListSkeleton";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { ContentProviderIcon } from "@renderer/components/ContentProviderIcon";
import { LoaderLabel } from "@renderer/components/Loaders";
import { formatCompactNumber } from "@renderer/utilities/numbers";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { useEntranceWave } from "@renderer/utilities/useEntranceWave";
import { useCatalogSearch } from "@renderer/features/mods/useCatalogSearch";
import { ProjectIcon } from "@renderer/features/mods/ProjectIcon";
import { displayTitle } from "@renderer/features/mods/titles";
import { parseProjectLink } from "@renderer/features/mods/projectLinks";
import { openCatalogInstall } from "@renderer/features/catalogInstall/catalogInstallStore";
import { useAtomValue } from "jotai";
import { internetAtom, settingsAtom } from "@renderer/stores/atoms";
import { countFeature } from "@renderer/features/usage/usage";

const api = window.api;

const PROVIDERS = [Provider.MODRINTH, Provider.CURSEFORGE] as const;
const TYPES = [
  ProjectType.MOD,
  ProjectType.RESOURCEPACK,
  ProjectType.SHADER,
  ProjectType.DATAPACK,
] as const;
const LOADERS: Loader[] = ["fabric", "neoforge", "forge", "quilt"];
const ANY = "any";

export function CatalogScreen() {
  const { t } = useTranslation();
  const settings = useAtomValue(settingsAtom);
  const isOnline = useAtomValue(internetAtom);
  const [provider, setProvider] = useState<Provider>(Provider.MODRINTH);
  const [projectType, setProjectType] = useState<ProjectType>(ProjectType.MOD);
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [gameVersion, setGameVersion] = useState<string>(ANY);
  const [loader, setLoader] = useState<string>(ANY);
  const [versions, setVersions] = useState<IVersion[]>([]);

  useEffect(() => {
    let cancelled = false;
    void api.versions
      .getList("vanilla")
      .then((list) => {
        if (!cancelled) {
          setVersions((list ?? []).filter((item) => item.type === "release"));
        }
      })
      .catch(ignoreFailure);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const text = rawQuery.trim();
    if (/^https?:\/\//i.test(text)) {
      const link = parseProjectLink(text);
      if (!link) return;
      countFeature("mods.catalogLink");
      setRawQuery("");
      void api.modManager
        .resolveLink(link.provider, link.ref, link.projectType)
        .catch(ignoreFailure)
        .then((project) => {
          if (!project) {
            toast.warning(t("modManager.linkNotFound"));
            return;
          }
          openCatalogInstall(
            project.projectType === ProjectType.MODPACK
              ? {
                  kind: "link",
                  link: { provider: link.provider, target: "modpack", id: project.id },
                }
              : { kind: "project", project },
          );
        });
      return;
    }
    const timer = setTimeout(() => setQuery(rawQuery), 350);
    return () => clearTimeout(timer);
  }, [rawQuery, t]);

  const request = useMemo(
    () => ({
      provider,
      projectType,
      query,
      sort: "",
      filters: [],
      gameVersion: gameVersion === ANY ? undefined : gameVersion,
      loader:
        projectType === ProjectType.MOD && loader !== ANY
          ? (loader as Loader)
          : undefined,
    }),
    [gameVersion, loader, projectType, provider, query],
  );
  const catalog = useCatalogSearch(request, isOnline);
  const isWave = useEntranceWave(catalog.isLoading);
  const lang = settings.lang || "en";

  const open = (project: IProject) =>
    openCatalogInstall({ kind: "project", project });

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 p-[18px]">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <SegmentedControl<Provider>
          iconOnly
          ariaLabel={t("modManager.source")}
          value={provider}
          onChange={setProvider}
          options={PROVIDERS.map((item) => ({
            value: item,
            label: item === Provider.MODRINTH ? "Modrinth" : "CurseForge",
            icon: <ContentProviderIcon provider={item} className="size-4" />,
          }))}
        />
        <SegmentedControl<ProjectType>
          iconOnly="inactive"
          ariaLabel={t("modManager.contentType")}
          value={projectType}
          onChange={setProjectType}
          options={TYPES.map((type) => {
            const Icon = PROJECT_TYPE_ICONS[type] ?? Package;
            return {
              value: type,
              label: t(`modManager.projectTypes.${type}`),
              icon: <Icon className="size-4" />,
            };
          })}
        />
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <Input
            value={rawQuery}
            className="h-8 pl-8"
            placeholder={t("catalog.searchPlaceholder")}
            onChange={(event) => setRawQuery(event.target.value)}
          />
        </div>
        <div className="w-40 shrink-0">
          <VirtualizedSelect
            size="sm"
            aria-label={t("versions.version")}
            value={gameVersion}
            searchPlaceholder={t("common.search")}
            emptyText={t("common.notFound")}
            options={[
              { value: ANY, label: t("catalog.anyVersion") },
              ...versions.map((item) => ({ value: item.id, label: item.id })),
            ]}
            onValueChange={setGameVersion}
          />
        </div>
        {projectType === ProjectType.MOD && (
          <Select value={loader} onValueChange={setLoader}>
            <SelectTrigger
              size="sm"
              className="w-44 shrink-0"
              aria-label={t("versions.loader")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("catalog.anyLoader")}</SelectItem>
              {LOADERS.map((item) => (
                <SelectItem key={item} value={item}>
                  <LoaderLabel loader={item} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {!isOnline ? (
          <Empty className="mt-6 gap-2">
            <EmptyTitle className="text-sm">{t("catalog.offline")}</EmptyTitle>
          </Empty>
        ) : catalog.isLoading ? (
          <ListSkeleton rows={9} />
        ) : catalog.error ? (
          <Empty className="mt-6 gap-2">
            <EmptyTitle className="text-sm">
              {t("catalog.failed", {
                source: provider === Provider.MODRINTH ? "Modrinth" : "CurseForge",
              })}
            </EmptyTitle>
            <Button size="sm" variant="outline" onClick={catalog.reload}>
              {t("common.retry")}
            </Button>
          </Empty>
        ) : catalog.items.length === 0 ? (
          <Empty className="mt-6 gap-2">
            <EmptyDescription className="text-xs">
              {t("common.notFound")}
            </EmptyDescription>
          </Empty>
        ) : (
          <div className={isWave ? "result-wave flex flex-col gap-0.5" : "flex flex-col gap-0.5"}>
            {catalog.items.map((project, index) => {
              const title = displayTitle(project.title);
              const downloads = formatCompactNumber(project.stats?.downloads, lang);
              return (
                <div
                  key={`${project.provider}:${project.id}`}
                  data-wave-row={index}
                  className="group flex h-14 min-w-0 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-row-hover"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-1 text-faint">
                    <ProjectIcon src={project.iconUrl} size={36} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <Hint content={project.title} variant="text" truncatedOnly={title === project.title}>
                        <span className="truncate text-sm leading-4 text-foreground">{title}</span>
                      </Hint>
                      {project.author?.name && (
                        <span className="max-w-32 shrink-0 truncate text-xs text-faint">
                          {project.author.name}
                        </span>
                      )}
                    </span>
                    <Hint content={project.description} variant="text" truncatedOnly>
                      <span className="truncate text-xs leading-4 text-muted-foreground">
                        {project.description}
                      </span>
                    </Hint>
                  </div>
                  {downloads && (
                    <span className="flex shrink-0 items-center gap-1 text-xs whitespace-nowrap text-faint tabular-nums">
                      <Download className="size-3" />
                      {downloads}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 px-2.5 text-xs"
                    onClick={() => open(project)}
                  >
                    {t("catalog.installTo")}
                  </Button>
                </div>
              );
            })}
            {catalog.hasMore && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 self-center"
                disabled={catalog.isLoadingMore}
                onClick={() => catalog.loadMore()}
              >
                {catalog.isLoadingMore && <Loader2 className="size-3.5 animate-spin" />}
                {t("catalog.more")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
