import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Boxes,
  Download,
  FolderTree,
  Package,
  Repeat,
  RotateCw,
  Server,
  SlidersHorizontal,
  SquareTerminal,
  Tag,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VirtualizedSelect } from "@/components/ui/virtualized-select";
import { Hint } from "@renderer/components/Hint";
import { AuthorLink } from "@renderer/features/profile/AuthorLink";
import { formatBytes } from "@renderer/utilities/file";
import { shortenPath } from "@renderer/features/instances/instanceOverview";
import { getLoaderInfo, LoaderIcon } from "@renderer/components/Loaders";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import { SummaryCard, type SummaryRowData } from "./CreationSummary";
import { summarizePackContent } from "./packSummary";
import type { NewInstanceState } from "./state";
import { useRedact } from "@renderer/features/streamer/streamerMode";
import { ContentProviderIcon } from "@renderer/components/ContentProviderIcon";
import { modpackProjectKey } from "@/shared/modpackMerge";
import { isProjectEnabled, optionalSummary } from "@/shared/modpackOptional";
import { PackContentList, type PackContentItem } from "./PackContentList";
import type { UnknownJar } from "./unknownJars";

export function PackConfirm({
  state,
  folderPath,
  warnings,
  isBusy,
  onRetryVersions,
  onChangePack,
  onSelectLoaderVersion,
  onToggleOptional,
  unknownJars = [],
  installUnknown,
  checkingJars = false,
  onToggleInstall,
}: {
  state: NewInstanceState;
  folderPath: string;
  warnings: string[];
  isBusy?: boolean;
  onRetryVersions?: () => void;
  onChangePack?: () => void;
  onSelectLoaderVersion: (id: string) => void;
  onToggleOptional?: (key: string, enabled: boolean) => void;
  unknownJars?: UnknownJar[];
  installUnknown?: ReadonlySet<string>;
  checkingJars?: boolean;
  onToggleInstall?: (key: string, install: boolean) => void;
}) {
  const { t } = useTranslation();
  const redact = useRedact();

  const summary = useMemo(() => summarizePackContent(state.mods), [state.mods]);
  const optionalKeys = state.pack?.importModpack?.optional;
  const optional = useMemo(
    () => optionalSummary(state.mods, optionalKeys),
    [optionalKeys, state.mods],
  );
  const contentItems = useMemo((): PackContentItem[] => {
    const keys = new Set(optionalKeys ?? []);
    const unknown = new Map(unknownJars.map((jar) => [jar.key, jar]));
    return state.mods.map((mod) => {
      const key = modpackProjectKey(mod);
      const jar = unknown.get(key);
      return {
        key,
        title: mod.title,
        iconUrl: mod.iconUrl,
        provider: mod.provider,
        projectType: mod.projectType,
        optional: keys.has(key),
        enabled: isProjectEnabled(mod),
        ...(jar
          ? {
              unknown: jar.checked ? ("unknown" as const) : ("unchecked" as const),
              install: installUnknown?.has(key) === true,
            }
          : {}),
      };
    });
  }, [installUnknown, optionalKeys, state.mods, unknownJars]);
  const footerText = checkingJars
    ? t("packContent.checkingJars")
    : unknownJars.length > 0
      ? t("packContent.unknownFooter")
      : optional.total > 0
        ? t("packContent.optionalFooter")
        : t("newInstance.afterInstallHint");

  const sizes = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];

  const pack = state.pack;
  const loaderInfo = getLoaderInfo(state.loader);
  const hasArguments =
    state.runArguments.game !== "" || state.runArguments.jvm !== "";

  const rows: SummaryRowData[] = [
    {
      key: "loader",
      icon: <LoaderIcon loader={state.loader} className="size-3.5" />,
      label: t("versions.loader"),
      value: (
        <span>
          {loaderInfo.name}
          {state.loaderVersion && (
            <span className="ml-1.5 font-mono text-faint">
              {state.loaderVersion.id}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "version",
      icon: <Tag className="size-3.5" />,
      label: t("versions.version"),
      value: (
        <span className="font-mono">{state.minecraftVersion?.id ?? "—"}</span>
      ),
    },
    {
      key: "content",
      icon: <Boxes className="size-3.5" />,
      label: t("addVersion.preview.content"),
      value: (
        <span className="font-mono tabular-nums">
          {optional.total > 0
            ? t("packContent.enabledOf", {
                enabled: summary.total - optional.total + optional.enabled,
                total: summary.total,
              })
            : summary.total}
          {summary.bytes > 0 && (
            <span className="ml-1.5 text-faint">
              {formatBytes(summary.bytes, sizes, 0)}
            </span>
          )}
        </span>
      ),
    },
  ];

  if (state.servers.length > 0) {
    rows.push({
      key: "servers",
      icon: <Server className="size-3.5" />,
      label: t("addVersion.preview.servers"),
      value: (
        <span className="font-mono tabular-nums">{state.servers.length}</span>
      ),
    });
  }

  const extraFiles = pack?.shareVersion?.loader.other?.paths?.length ?? 0;

  if (extraFiles > 0) {
    rows.push({
      key: "extraFiles",
      icon: <FolderTree className="size-3.5" />,
      label: t("addVersion.preview.extraFiles"),
      value: <span className="font-mono tabular-nums">{extraFiles}</span>,
    });
  }

  if (state.options.trim() !== "") {
    rows.push({
      key: "gameSettings",
      icon: <SlidersHorizontal className="size-3.5" />,
      label: t("addVersion.preview.gameSettings"),
      value: <span className="font-mono">options.txt</span>,
    });
  }

  if (hasArguments) {
    rows.push({
      key: "arguments",
      icon: <SquareTerminal className="size-3.5" />,
      label: t("addVersion.preview.arguments"),
      value: <span>{t("newInstance.fromPack")}</span>,
    });
  }

  rows.push({
    key: "folder",
    icon: <FolderTree className="size-3.5" />,
    label: t("addVersion.preview.folder"),
    value: (
      <span className="font-mono">
        {shortenPath(redact.path(folderPath), 2)}
      </span>
    ),
    title: redact.path(folderPath),
  });

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_19rem] gap-3">
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-surface-1 p-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2">
            {state.image ? (
              <img
                src={resolveLocalImage(state.image)}
                alt=""
                draggable={false}
                className="size-full object-cover"
              />
            ) : (
              <Package className="size-4 text-faint" />
            )}
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <Hint content={pack?.title} variant="text" truncatedOnly>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {pack?.title || t("addVersion.preview.namePlaceholder")}
                </span>
              </Hint>

              {typeof pack?.downloads === "number" && (
                <Hint content={t("addVersion.preview.installs")}>
                  <span className="flex shrink-0 items-center gap-1 font-mono text-xs tabular-nums text-faint">
                    <Download className="size-3.5" />
                    {pack.downloads}
                  </span>
                </Hint>
              )}
            </div>

            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {pack?.author && (
                <>
                  <AuthorLink
                    author={pack.author}
                    size={16}
                    headClassName="rounded"
                    className="max-w-36 shrink-0 text-foreground"
                  />
                  <span className="shrink-0 text-faint">·</span>
                </>
              )}
              {pack?.provider && (
                <ContentProviderIcon
                  provider={pack.provider}
                  className="size-3"
                />
              )}
              <Hint
                content={t(`newInstance.packKind.${pack?.kind ?? "file"}`)}
                variant="text"
                truncatedOnly
              >
                <span className="min-w-0 truncate">
                  {t(`newInstance.packKind.${pack?.kind ?? "file"}`)}
                </span>
              </Hint>
            </span>
          </div>

          {onChangePack && (
            <Button variant="ghost" size="sm" onClick={onChangePack}>
              <Repeat />
              {t("newInstance.changePack")}
            </Button>
          )}
        </div>

        {pack?.description && (
          <section className="grid shrink-0 gap-1 rounded-xl border border-border bg-surface-1 p-2.5">
            <span className="text-2xs font-semibold tracking-[0.08em] text-faint uppercase">
              {t("addVersion.preview.authorNote")}
            </span>
            <p className="max-h-20 overflow-y-auto pr-1 text-xs leading-4 whitespace-pre-line text-muted-foreground select-text">
              {pack.description}
            </p>
          </section>
        )}

        {!state.minecraftVersion && (
          <div className="grid shrink-0 gap-2 rounded-xl border border-destructive/40 bg-surface-2 p-2.5">
            <p className="flex items-start gap-2 text-xs leading-snug text-foreground">
              <TriangleAlert className="mt-px size-3.5 shrink-0 text-destructive" />
              <span className="min-w-0">
                {state.packVersionIssue === "catalogFailed"
                  ? t("versions.listLoadError")
                  : t("newInstance.packVersionMissing", {
                      version: state.pack?.importModpack?.version ?? "—",
                      loader: loaderInfo.name,
                    })}
              </span>
            </p>

            {state.packVersionIssue === "catalogFailed" && onRetryVersions && (
              <Button
                size="sm"
                variant="outline"
                className="justify-self-start"
                disabled={isBusy}
                onClick={onRetryVersions}
              >
                <RotateCw />
                {t("common.retry")}
              </Button>
            )}
          </div>
        )}

        {state.loaderVersionIssue && (
          <div className="grid shrink-0 gap-2 rounded-xl border border-warning/40 bg-surface-2 p-2.5">
            <p className="flex items-start gap-2 text-xs leading-snug text-foreground">
              <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" />
              <span className="min-w-0">
                {t(
                  state.loaderVersionIssue === "missingRequired"
                    ? "addVersion.fromFile.loaderVersionMissing"
                    : "addVersion.fromFile.loaderVersionNotFound",
                )}
              </span>
            </p>

            {state.loaderVersions.length > 0 && (
              <VirtualizedSelect
                className="min-w-0"
                size="sm"
                aria-label={t("versions.loaderVersion")}
                value={state.loaderVersion?.id ?? ""}
                placeholder={t("versions.loaderVersion")}
                searchPlaceholder={t("common.search")}
                emptyText={t("common.notFound")}
                options={state.loaderVersions.map((item) => ({
                  value: item.id,
                  label: item.id,
                }))}
                onValueChange={onSelectLoaderVersion}
              />
            )}
          </div>
        )}

        <PackContentList
          title={t("addVersion.preview.content")}
          items={contentItems}
          emptyText={t("newInstance.emptyContent")}
          onToggle={onToggleOptional}
          onToggleInstall={onToggleInstall}
          footer={
            <Hint content={footerText} variant="text" truncatedOnly>
              <span className="min-w-0 truncate text-2xs text-faint">
                {footerText}
              </span>
            </Hint>
          }
        />
      </div>

      <SummaryCard
        title={t("addVersion.preview.title")}
        rows={rows}
        warnings={warnings}
        className="min-h-0"
      />
    </div>
  );
}
