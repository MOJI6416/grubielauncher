import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SiCurseforge, SiModrinth } from "react-icons/si";
import {
  Boxes,
  Download,
  FolderTree,
  HardDrive,
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
import { PlayerHead } from "@renderer/features/accounts/AccountHead";
import { Provider } from "@/types/ModManager";
import { formatBytes } from "@renderer/utilities/file";
import { shortenPath } from "@renderer/features/instances/instanceOverview";
import { getLoaderInfo, LoaderIcon } from "@renderer/components/Loaders";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import { SummaryCard, type SummaryRowData } from "./CreationSummary";
import { summarizePackContent } from "./packSummary";
import type { NewInstanceState } from "./state";

const ROW_HEIGHT = 34;

function ProviderMark({ provider }: { provider: Provider }) {
  if (provider === Provider.CURSEFORGE) {
    return <SiCurseforge className="size-3 text-[#f16436]" />;
  }
  if (provider === Provider.MODRINTH) {
    return <SiModrinth className="size-3 text-[#1bd96a]" />;
  }

  return <HardDrive className="size-3 text-faint" />;
}

export function PackConfirm({
  state,
  folderPath,
  warnings,
  canChangeContent,
  isBusy,
  onRetryVersions,
  onChangePack,
  onOpenContent,
  onOpenServers,
  onOpenArguments,
  onSelectLoaderVersion,
}: {
  state: NewInstanceState;
  folderPath: string;
  warnings: string[];
  canChangeContent: boolean;
  isBusy?: boolean;
  onRetryVersions?: () => void;
  onChangePack?: () => void;
  onOpenContent: () => void;
  onOpenServers: () => void;
  onOpenArguments: () => void;
  onSelectLoaderVersion: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );

  const summary = useMemo(() => summarizePackContent(state.mods), [state.mods]);

  const sizes = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];
  const virtualizer = useVirtualizer({
    count: state.mods.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

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
          {summary.total}
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
    value: <span className="font-mono">{shortenPath(folderPath, 2)}</span>,
    title: folderPath,
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
                  <Hint content={t("addVersion.preview.author")}>
                    <span className="flex max-w-36 shrink-0 items-center gap-1.5">
                      <PlayerHead
                        user={pack.author}
                        size={16}
                        className="rounded"
                      />
                      <span className="min-w-0 truncate text-foreground">
                        {pack.author.nickname}
                      </span>
                    </span>
                  </Hint>
                  <span className="shrink-0 text-faint">·</span>
                </>
              )}
              {pack?.provider && <ProviderMark provider={pack.provider} />}
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
            <span className="text-[0.7rem] font-semibold tracking-[0.08em] text-faint uppercase">
              {t("addVersion.preview.authorNote")}
            </span>
            <p className="max-h-20 overflow-y-auto pr-1 text-xs leading-4 whitespace-pre-line text-muted-foreground">
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

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
          <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border pr-1.5 pl-2.5">
            <span className="shrink-0 text-[0.7rem] font-semibold tracking-[0.08em] text-faint uppercase">
              {t("addVersion.preview.content")}
            </span>
            <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-faint">
              {summary.total}
            </span>

            <div className="ml-auto flex min-w-0 items-center gap-1 overflow-hidden">
              {summary.groups.map((group) => (
                <span
                  key={group.type}
                  className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[0.65rem] text-muted-foreground"
                >
                  {t(`modManager.projectTypes.${group.type}`)}
                  <span className="ml-1 font-mono tabular-nums text-faint">
                    {group.count}
                  </span>
                </span>
              ))}
            </div>
          </header>

          <div
            ref={setScrollElement}
            className="min-h-0 flex-1 overflow-y-auto p-1"
          >
            {state.mods.length === 0 ? (
              <p className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
                {t("newInstance.emptyContent")}
              </p>
            ) : (
              <div
                className="relative w-full"
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualizer.getVirtualItems().map((row) => {
                  const mod = state.mods[row.index];
                  if (!mod) return null;

                  return (
                    <div
                      key={`${mod.provider}-${mod.id}-${row.index}`}
                      style={{
                        height: `${row.size}px`,
                        transform: `translateY(${row.start}px)`,
                      }}
                      className="absolute top-0 left-0 flex w-full items-center gap-2 rounded-lg px-2"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2">
                        {mod.iconUrl ? (
                          <img
                            src={mod.iconUrl}
                            alt=""
                            draggable={false}
                            className="size-full object-cover"
                          />
                        ) : (
                          <Package className="size-3 text-faint" />
                        )}
                      </span>

                      <Hint content={mod.title} variant="text" truncatedOnly>
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                          {mod.title}
                        </span>
                      </Hint>

                      <ProviderMark provider={mod.provider} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <footer className="flex h-10 shrink-0 items-center gap-1.5 border-t border-border px-1.5">
            <Button variant="ghost" size="sm" onClick={onOpenContent}>
              <SlidersHorizontal />
              {canChangeContent
                ? t("newInstance.editContent")
                : t("newInstance.browseContent")}
            </Button>

            {state.servers.length > 0 &&
              state.minecraftVersion?.serverManager && (
                <Button variant="ghost" size="sm" onClick={onOpenServers}>
                  <Server />
                  {t("versions.servers")}
                  <span className="font-mono text-xs tabular-nums text-faint">
                    {state.servers.length}
                  </span>
                </Button>
              )}

            {hasArguments && (
              <Button variant="ghost" size="sm" onClick={onOpenArguments}>
                <SquareTerminal />
                {t("arguments.title")}
              </Button>
            )}
          </footer>
        </section>
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
