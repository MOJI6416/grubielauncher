import { Dispatch, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Coffee,
  FolderTree,
  Package,
  RotateCw,
  Server,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Loader } from "@/types/Loader";
import { mcVersionToJavaMajor } from "@/shared/javaVersions";
import { LoaderIcon, LoaderPicker } from "@renderer/components/Loaders";
import { Hint } from "@renderer/components/Hint";
import { shortenPath } from "@renderer/features/instances/instanceOverview";
import { PickerList } from "./PickerList";
import { SummaryCard } from "./CreationSummary";
import {
  VersionKind,
  countVersionKinds,
  filterVersionEntries,
  formatReleaseDate,
  toVersionEntries,
} from "./versionCatalog";
import type { NewInstanceAction, NewInstanceState } from "./state";
import type { VersionCatalogState } from "./useVersionCatalog";

const KIND_FILTERS: VersionKind[] = ["release", "snapshot", "old"];

export interface SimilarInstance {
  key: string;
  name: string;
  loader: Loader;
  loaderVersion?: string;
}

export function CustomForm({
  state,
  dispatch,
  catalog,
  unavailableLoaders,
  folderPath,
  language,
  warnings,
  similar,
  unavailableReason,
}: {
  state: NewInstanceState;
  dispatch: Dispatch<NewInstanceAction>;
  catalog: VersionCatalogState;
  unavailableLoaders: Partial<Record<Loader, string>>;
  folderPath: string;
  language: string;
  warnings: string[];
  similar: SimilarInstance[];
  unavailableReason: string | null;
}) {
  const { t } = useTranslation();
  const [versionQuery, setVersionQuery] = useState("");
  const [loaderQuery, setLoaderQuery] = useState("");
  const [kinds, setKinds] = useState<VersionKind[]>(["release"]);

  const entries = useMemo(
    () => toVersionEntries(state.versions),
    [state.versions],
  );
  const counts = useMemo(() => countVersionKinds(entries), [entries]);
  const activeKinds = useMemo(
    () => (state.showSnapshots ? kinds : ["release" as VersionKind]),
    [kinds, state.showSnapshots],
  );

  const visibleEntries = useMemo(
    () =>
      filterVersionEntries(entries, {
        query: versionQuery,
        kinds: activeKinds,
      }),
    [activeKinds, entries, versionQuery],
  );

  const versionItems = useMemo(
    () =>
      visibleEntries.map((entry) => ({
        id: entry.id,
        label: entry.id,
        meta: formatReleaseDate(entry.releaseTime, language),
        badge:
          entry.kind === "release"
            ? undefined
            : t(`newInstance.versionKind.${entry.kind}`),
        tone: entry.kind === "snapshot" ? ("warning" as const) : undefined,
      })),
    [language, t, visibleEntries],
  );

  const loaderItems = useMemo(() => {
    const needle = loaderQuery.trim().toLowerCase();

    return state.loaderVersions
      .filter((item) => !needle || item.id.toLowerCase().includes(needle))
      .map((item, index) => ({
        id: item.id,
        label: item.id,
        badge:
          index === 0 && !needle
            ? t("newInstance.latestLoaderVersion")
            : undefined,
      }));
  }, [loaderQuery, state.loaderVersions, t]);

  const selected = state.minecraftVersion;
  const selectedEntry = entries.find((entry) => entry.id === selected?.id);
  const javaMajor = selected ? mcVersionToJavaMajor(selected.id) : null;

  const summaryRows = [
    {
      key: "version",
      icon: <Tag className="size-3.5" />,
      label: t("versions.version"),
      value: selected ? (
        <span className="font-mono">{selected.id}</span>
      ) : (
        <span className="text-faint">{t("newInstance.notChosen")}</span>
      ),
    },
    {
      key: "kind",
      icon: <Package className="size-3.5" />,
      label: t("newInstance.releasedOn"),
      value: selectedEntry?.releaseTime
        ? formatReleaseDate(selectedEntry.releaseTime, language)
        : "—",
    },
    {
      key: "java",
      icon: <Coffee className="size-3.5" />,
      label: "Java",
      value: javaMajor ? `Java ${javaMajor}` : "—",
    },
    {
      key: "server",
      icon: <Server className="size-3.5" />,
      label: t("newInstance.ownServer"),
      value: !selected
        ? "—"
        : selected.serverManager
          ? t("newInstance.serverSupported")
          : t("newInstance.serverUnsupported"),
    },
    {
      key: "folder",
      icon: <FolderTree className="size-3.5" />,
      label: t("addVersion.preview.folder"),
      value: <span className="font-mono">{shortenPath(folderPath, 2)}</span>,
      title: folderPath,
    },
  ];

  const isModded = state.loader !== "vanilla";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <LoaderPicker
        value={state.loader}
        unavailable={unavailableLoaders}
        onSelect={(loader) => dispatch({ type: "selectLoader", loader })}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_19rem] gap-3">
        <PickerList
          label={t("newInstance.minecraftVersion")}
          items={versionItems}
          total={visibleEntries.length}
          value={selected?.id}
          query={versionQuery}
          onQueryChange={setVersionQuery}
          isLoading={catalog.isLoadingVersions}
          emptyText={
            unavailableReason ??
            (catalog.versionsFailed
              ? t("versions.listLoadError")
              : t("common.notFound"))
          }
          emptyAction={
            catalog.versionsFailed && !unavailableReason ? (
              <Button size="sm" variant="outline" onClick={catalog.reload}>
                <RotateCw />
                {t("common.retry")}
              </Button>
            ) : undefined
          }
          onSelect={(id) => {
            const entry = entries.find((item) => item.id === id);
            if (entry)
              dispatch({ type: "selectVersion", version: entry.version });
          }}
          filters={
            <>
              <button
                type="button"
                aria-pressed={!state.showSnapshots}
                onClick={() => dispatch({ type: "setSnapshots", value: false })}
                className="flex h-6 items-center gap-1.5 rounded-md px-2 text-[0.7rem] text-muted-foreground transition-colors hover:bg-surface-3 aria-pressed:bg-surface-3 aria-pressed:text-foreground"
              >
                {t("newInstance.versionKind.release")}
                <span className="font-mono text-[0.65rem] tabular-nums text-faint">
                  {counts.release}
                </span>
              </button>

              <button
                type="button"
                aria-pressed={state.showSnapshots}
                onClick={() => dispatch({ type: "setSnapshots", value: true })}
                className="flex h-6 items-center gap-1.5 rounded-md px-2 text-[0.7rem] text-muted-foreground transition-colors hover:bg-surface-3 aria-pressed:bg-surface-3 aria-pressed:text-foreground"
              >
                {t("newInstance.allVersions")}
                {state.showSnapshots && (
                  <span className="font-mono text-[0.65rem] tabular-nums text-faint">
                    {counts.release + counts.snapshot + counts.old}
                  </span>
                )}
              </button>

              {state.showSnapshots && (
                <div className="ml-auto flex items-center gap-1">
                  {KIND_FILTERS.filter((kind) => counts[kind] > 0).map(
                    (kind) => (
                      <button
                        key={kind}
                        type="button"
                        aria-pressed={activeKinds.includes(kind)}
                        onClick={() =>
                          setKinds((prev) =>
                            prev.includes(kind)
                              ? prev.length === 1
                                ? prev
                                : prev.filter((item) => item !== kind)
                              : [...prev, kind],
                          )
                        }
                        className={cn(
                          "flex h-6 items-center rounded-md px-1.5 text-[0.65rem] transition-colors",
                          activeKinds.includes(kind)
                            ? "bg-surface-3 text-foreground"
                            : "text-faint hover:text-muted-foreground",
                        )}
                      >
                        {t(`newInstance.versionKind.${kind}`)}
                      </button>
                    ),
                  )}
                </div>
              )}
            </>
          }
        />

        <div className="flex min-h-0 flex-col gap-3">
          {isModded && (
            <PickerList
              label={t("versions.loaderVersion")}
              items={loaderItems}
              total={state.loaderVersions.length}
              value={state.loaderVersion?.id}
              query={loaderQuery}
              onQueryChange={setLoaderQuery}
              isLoading={catalog.isLoadingLoaderVersions}
              isDisabled={!selected}
              emptyText={
                unavailableReason ??
                (catalog.loaderVersionsFailed
                  ? t("versions.loaderListLoadError")
                  : t("newInstance.pickVersionFirst"))
              }
              emptyAction={
                catalog.loaderVersionsFailed && !unavailableReason ? (
                  <Button size="sm" variant="outline" onClick={catalog.reload}>
                    <RotateCw />
                    {t("common.retry")}
                  </Button>
                ) : undefined
              }
              onSelect={(id) => {
                const version = state.loaderVersions.find(
                  (item) => item.id === id,
                );
                if (version) {
                  dispatch({ type: "selectLoaderVersion", version });
                }
              }}
            />
          )}

          <SummaryCard
            title={t("addVersion.preview.title")}
            rows={summaryRows}
            warnings={warnings}
            className={isModded ? "shrink-0" : "min-h-0 flex-1"}
          >
            {!isModded && (
              <>
                <p className="border-t border-border/60 p-2.5 text-[0.7rem] leading-snug text-muted-foreground">
                  {t("newInstance.vanillaNote")}
                </p>

                {similar.length > 0 && (
                  <div className="border-t border-border/60 p-2.5">
                    <p className="pb-1.5 text-[0.65rem] font-semibold tracking-[0.08em] text-faint uppercase">
                      {t("newInstance.similar")}
                    </p>
                    <ul className="grid gap-1">
                      {similar.map((instance) => (
                        <li
                          key={instance.key}
                          className="flex min-w-0 items-center gap-1.5 text-xs"
                        >
                          <LoaderIcon
                            loader={instance.loader}
                            className="size-3 shrink-0"
                          />
                          <Hint
                            content={instance.name}
                            variant="text"
                            truncatedOnly
                          >
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                              {instance.name}
                            </span>
                          </Hint>
                          {instance.loaderVersion && (
                            <span className="shrink-0 font-mono text-[0.65rem] text-faint">
                              {instance.loaderVersion}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </SummaryCard>
        </div>
      </div>
    </div>
  );
}
