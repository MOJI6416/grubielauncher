import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpToLine,
  CircleCheck,
  Info,
  Layers,
  ListChecks,
  Loader2,
  RotateCw,
  ShieldCheck,
  TriangleAlert,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { LoaderVersion } from "@/types/VersionsService";
import type { LoaderRequirementsScan } from "@/shared/loaderCompat";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Version } from "@renderer/classes/Version";
import { FactRow, FactRows } from "@renderer/components/FactRows";
import { Hint } from "@renderer/components/Hint";
import { LoaderIcon, getLoaderInfo } from "@renderer/components/Loaders";
import {
  PickerItem,
  PickerList,
} from "@renderer/features/newInstance/PickerList";
import {
  LoaderDirection,
  buildLoaderVersionOptions,
  pickSuggestedLoaderVersion,
  resolveLoaderChangeBlock,
} from "./loaderUpdate";

type LoaderBlockInput = Omit<
  Parameters<typeof resolveLoaderChangeBlock>[0],
  "needsNetwork"
>;

const DIRECTION_TONE: Record<LoaderDirection, string> = {
  upgrade: "border-success/30 bg-success/12 text-success",
  downgrade: "border-warning/30 bg-warning/12 text-warning",
  current: "border-border bg-surface-3 text-muted-foreground",
};

function Note({
  icon: Icon,
  tone,
  children,
}: {
  icon: LucideIcon;
  tone?: "warning";
  children: ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 text-xs leading-snug",
        tone === "warning" ? "text-warning" : "text-muted-foreground",
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export function LoaderVersionPanel({
  instance,
  versions,
  isCatalogLoading,
  catalogFailed,
  onReloadCatalog,
  scan,
  isScanning,
  modTitles,
  blockInput,
  isChanging,
  isPublishedByOwner,
  hasServer,
  onChange,
  onClose,
}: {
  instance: Version;
  versions: LoaderVersion[] | null;
  isCatalogLoading: boolean;
  catalogFailed: boolean;
  onReloadCatalog: () => void;
  scan: LoaderRequirementsScan | null;
  isScanning: boolean;
  modTitles: Map<string, string>;
  blockInput: LoaderBlockInput;
  isChanging: boolean;
  isPublishedByOwner: boolean;
  hasServer: boolean;
  onChange: (targetId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const conf = instance.version;
  const loader = conf.loader.name;
  const info = getLoaderInfo(loader);
  const currentId = conf.loader.version?.id;
  const rollbackId =
    instance.loaderRollbackId && instance.loaderRollbackId !== currentId
      ? instance.loaderRollbackId
      : undefined;

  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const pickedByUser = useRef(false);

  const options = useMemo(
    () =>
      buildLoaderVersionOptions({
        versions: versions ?? [],
        currentId,
        rollbackId,
        requirements: scan?.requirements,
        minecraftVersion: conf.version.id,
      }),
    [versions, currentId, rollbackId, scan, conf.version.id],
  );

  useEffect(() => {
    if (
      pickedByUser.current &&
      options.some((option) => option.id === selectedId)
    ) {
      return;
    }

    setSelectedId(pickSuggestedLoaderVersion(options));
  }, [options]);

  const selected = options.find((option) => option.id === selectedId);
  const currentOption = options.find((option) => option.isCurrent);
  const hiddenBetaCount = options.filter(
    (option) => !option.stable && !option.isCurrent,
  ).length;
  const needle = query.trim().toLowerCase();

  const items: PickerItem[] = options
    .filter(
      (option) =>
        showAll ||
        hiddenBetaCount === 0 ||
        option.stable ||
        option.isCurrent ||
        option.isRollback ||
        option.id === selectedId,
    )
    .filter((option) => !needle || option.id.toLowerCase().includes(needle))
    .map((option) => ({
      id: option.id,
      label: option.id,
      badge: option.isCurrent
        ? t("loaderUpdate.badge.current")
        : option.isRollback
          ? t("loaderUpdate.badge.previous")
          : option.isLatest
            ? t("loaderUpdate.badge.latest")
            : option.stable
              ? undefined
              : t("loaderUpdate.badge.beta"),
      tone:
        !option.stable && !option.isCurrent && !option.isRollback
          ? ("warning" as const)
          : undefined,
      meta: option.blocked.length
        ? t("loaderUpdate.breaks", { count: option.blocked.length })
        : undefined,
      metaTone: option.blocked.length ? ("warning" as const) : undefined,
    }));

  const changeBlock = resolveLoaderChangeBlock({
    ...blockInput,
    needsNetwork: !!selected && selected.id !== rollbackId,
  });
  const rollbackBlock = resolveLoaderChangeBlock({
    ...blockInput,
    needsNetwork: false,
  });

  const conflicts = selected?.isCurrent
    ? (currentOption?.blocked ?? [])
    : (selected?.blocked ?? []);

  const requirementRows = useMemo(() => {
    const blocked = new Set(conflicts);
    const titleOf = (file: string, name: string | null, modId: string | null) =>
      modTitles.get(file) ?? name ?? modId ?? file;

    return (scan?.requirements ?? [])
      .map((requirement) => ({
        requirement,
        title: titleOf(requirement.file, requirement.name, requirement.modId),
        isBlocked: blocked.has(requirement),
      }))
      .sort(
        (left, right) =>
          Number(right.isBlocked) - Number(left.isBlocked) ||
          left.title.localeCompare(right.title),
      );
  }, [scan, conflicts, modTitles]);

  const modsValue = isScanning ? (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <Loader2 className="size-3 animate-spin" />
      {t("loaderUpdate.mods.checking")}
    </span>
  ) : !scan ? (
    <span className="text-faint">—</span>
  ) : scan.scanned === 0 ? (
    <span className="text-muted-foreground">{t("loaderUpdate.mods.empty")}</span>
  ) : conflicts.length > 0 ? (
    <span className="text-warning">
      {t("loaderUpdate.mods.blocked", { count: conflicts.length })}
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-success">
      <CircleCheck className="size-3" />
      {t("loaderUpdate.mods.ok", { count: scan.scanned })}
    </span>
  );

  const rollbackValue =
    !selected || selected.isCurrent
      ? rollbackId
        ? t("loaderUpdate.rollback.ready", { version: rollbackId })
        : t("loaderUpdate.rollback.none")
      : currentId
        ? t("loaderUpdate.rollback.kept", { version: currentId })
        : "—";

  const primaryLabel = isChanging
    ? t("loaderUpdate.changing")
    : !selected
      ? t("loaderUpdate.change")
      : selected.isCurrent
        ? t("loaderUpdate.actions.installed")
        : selected.direction === "upgrade"
          ? t("loaderUpdate.actions.update", { version: selected.id })
          : t("loaderUpdate.actions.install", { version: selected.id });

  const footerMessage = isChanging
    ? null
    : changeBlock && (changeBlock === "readOnly" || !selected?.isCurrent)
      ? t(`loaderUpdate.blocked.${changeBlock}`)
      : selected && !selected.isCurrent && selected.blocked.length > 0
        ? t("loaderUpdate.breaksWarning", { count: selected.blocked.length })
        : null;

  const notes: ReactNode[] = [];
  if (selected && !selected.isCurrent && !selected.stable) {
    notes.push(
      <Note key="beta" icon={TriangleAlert} tone="warning">
        {t("loaderUpdate.notes.beta")}
      </Note>,
    );
  }
  if (selected?.direction === "downgrade") {
    notes.push(
      <Note key="downgrade" icon={TriangleAlert} tone="warning">
        {t("loaderUpdate.notes.downgrade")}
      </Note>,
    );
  }
  if (isPublishedByOwner) {
    notes.push(
      <Note key="published" icon={Info}>
        {t("loaderUpdate.notes.published")}
      </Note>,
    );
  }
  if (hasServer) {
    notes.push(
      <Note key="server" icon={Info}>
        {t("loaderUpdate.notes.server")}
      </Note>,
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex h-7 shrink-0 items-center gap-2">
        <Layers className="size-3.5 shrink-0 text-faint" />
        <span className="min-w-0 flex-1 truncate text-[0.68rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {t("versions.loaderVersion")}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[0.7rem] text-faint"
          onClick={onClose}
        >
          <X />
          {t("common.close")}
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,300px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3">
        <PickerList
          label={t("loaderUpdate.listLabel")}
          items={items}
          total={options.length}
          value={selectedId}
          query={query}
          onQueryChange={setQuery}
          isLoading={isCatalogLoading}
          isDisabled={isChanging}
          emptyText={
            catalogFailed
              ? t("versions.loaderListLoadError")
              : t("loaderUpdate.empty", { version: conf.version.id })
          }
          emptyAction={
            catalogFailed ? (
              <Button size="sm" variant="outline" onClick={onReloadCatalog}>
                <RotateCw />
                {t("common.retry")}
              </Button>
            ) : undefined
          }
          filters={
            hiddenBetaCount > 0
              ? (["stable", "all"] as const).map((filter) => {
                  const isActive = filter === "all" ? showAll : !showAll;

                  return (
                    <button
                      key={filter}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setShowAll(filter === "all")}
                      className={cn(
                        "flex h-6 items-center gap-1 rounded-md px-1.5 text-[0.65rem] transition-colors",
                        isActive
                          ? "bg-surface-3 text-foreground"
                          : "text-faint hover:text-muted-foreground",
                      )}
                    >
                      {t(`loaderUpdate.filters.${filter}`)}
                      {filter === "all" && (
                        <span className="font-mono tabular-nums text-faint">
                          +{hiddenBetaCount}
                        </span>
                      )}
                    </button>
                  );
                })
              : undefined
          }
          onSelect={(id) => {
            pickedByUser.current = true;
            setSelectedId(id);
          }}
        />

        <div className="flex min-h-0 flex-col gap-3">
          <section className="shrink-0 overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                <LoaderIcon loader={loader} className="size-6" />
              </span>

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-xs text-muted-foreground">
                  {info.name} · Minecraft {conf.version.id}
                </span>
                <span className="flex min-w-0 items-center gap-2 font-mono text-lg leading-tight font-semibold tabular-nums">
                  <span
                    className={cn(
                      "shrink-0",
                      selected &&
                        !selected.isCurrent &&
                        "text-muted-foreground",
                    )}
                  >
                    {currentId ?? "—"}
                  </span>
                  {selected && !selected.isCurrent && (
                    <>
                      <ArrowRight className="size-4 shrink-0 text-faint" />
                      <Hint content={selected.id} variant="text" truncatedOnly>
                        <span className="min-w-0 truncate">{selected.id}</span>
                      </Hint>
                    </>
                  )}
                </span>
              </div>

              {selected && (
                <span
                  className={cn(
                    "flex h-5 shrink-0 items-center rounded-md border px-1.5 text-[0.65rem] font-medium whitespace-nowrap",
                    DIRECTION_TONE[selected.direction],
                  )}
                >
                  {t(`loaderUpdate.direction.${selected.direction}`)}
                </span>
              )}
            </div>

            <FactRows surface="card" className="border-t border-border">
              <FactRow
                icon={<ShieldCheck className="size-3.5" />}
                label={t("loaderUpdate.facts.channel")}
                value={
                  selected && !selected.stable ? (
                    <span className="text-warning">
                      {t("loaderUpdate.channel.beta")}
                    </span>
                  ) : (
                    t("loaderUpdate.channel.stable")
                  )
                }
              />
              <FactRow
                icon={<Layers className="size-3.5" />}
                label={t("loaderUpdate.facts.mods")}
                value={modsValue}
              />
              <FactRow
                icon={<Undo2 className="size-3.5" />}
                label={t("loaderUpdate.facts.rollback")}
                value={rollbackValue}
              />
            </FactRows>
          </section>

          <ol className="grid shrink-0 grid-cols-3 gap-2">
            {(["stage", "verify", "swap"] as const).map((step, index) => (
              <li
                key={step}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[0.7rem] text-muted-foreground"
              >
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-[0.6rem] text-foreground tabular-nums">
                  {index + 1}
                </span>
                <Hint
                  content={t(`loaderUpdate.steps.${step}`)}
                  variant="text"
                  truncatedOnly
                >
                  <span className="min-w-0 truncate">
                    {t(`loaderUpdate.steps.${step}`)}
                  </span>
                </Hint>
              </li>
            ))}
          </ol>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
            <header className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3">
              <ListChecks className="size-3.5 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate text-[0.68rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {t("loaderUpdate.requirements.title")}
              </span>
              {requirementRows.length > 0 && (
                <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-faint">
                  {requirementRows.length}
                </span>
              )}
            </header>

            {notes.length > 0 && (
              <ul className="grid shrink-0 gap-1.5 border-b border-border/60 px-3 py-2">
                {notes}
              </ul>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {isScanning && !scan ? (
                <p className="flex h-full items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  {t("loaderUpdate.mods.checking")}
                </p>
              ) : requirementRows.length === 0 ? (
                <p className="flex h-full items-center justify-center px-4 text-center text-xs text-faint">
                  {t("loaderUpdate.requirements.empty")}
                </p>
              ) : (
                <ul className="grid gap-px">
                  {requirementRows.map(({ requirement, title, isBlocked }) => (
                    <li
                      key={`${requirement.file}|${requirement.ranges.join("|")}`}
                      className="flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-xs transition-colors hover:bg-surface-2"
                    >
                      {isBlocked ? (
                        <TriangleAlert className="size-3 shrink-0 text-warning" />
                      ) : (
                        <CircleCheck className="size-3 shrink-0 text-faint" />
                      )}
                      <Hint content={title} variant="text" truncatedOnly>
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate",
                            isBlocked
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {title}
                        </span>
                      </Hint>
                      <span
                        className={cn(
                          "shrink-0 font-mono text-[0.7rem]",
                          isBlocked ? "text-warning" : "text-faint",
                        )}
                      >
                        {requirement.ranges.join(" | ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <div className="flex h-9 shrink-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-warning">
              {footerMessage}
            </span>

            {rollbackId && (
              <Hint
                content={
                  rollbackBlock
                    ? t(`loaderUpdate.blocked.${rollbackBlock}`)
                    : undefined
                }
              >
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!!rollbackBlock || isChanging}
                  onClick={() => onChange(rollbackId)}
                >
                  <Undo2 />
                  {t("loaderUpdate.actions.rollback", { version: rollbackId })}
                </Button>
              </Hint>
            )}

            <Button
              type="button"
              variant="secondary"
              disabled={
                !selected || selected.isCurrent || !!changeBlock || isChanging
              }
              onClick={() => selected && onChange(selected.id)}
            >
              {isChanging ? (
                <Loader2 className="animate-spin" />
              ) : selected?.direction === "downgrade" ? (
                <ArrowDownToLine />
              ) : (
                <ArrowUpToLine />
              )}
              {primaryLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
