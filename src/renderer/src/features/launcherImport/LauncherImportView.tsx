import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  ArrowRightLeft,
  Check,
  CircleDashed,
  FolderSearch,
  Loader2,
  RefreshCw,
  ShieldQuestion,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { UnknownJarsReview } from "./UnknownJarsReview";
import {
  IMPORT_PARTS,
  type ForeignInstanceSummary,
  type ForeignLauncher,
} from "@/types/LauncherImport";
import { Hint } from "@renderer/components/Hint";
import { ListSkeleton } from "@renderer/components/ListSkeleton";
import { LoaderIcon, LoaderLabel } from "@renderer/components/Loaders";
import { navigate } from "@renderer/navigation/navigate";
import { openTaskCenter } from "@renderer/features/install/installUi";
import type { ImportItemState } from "./importJob";
import { LauncherMark } from "./LauncherMark";
import { LAUNCHER_NAMES, groupState, toggleGroup } from "./selection";
import type { LauncherImportWizard } from "./useLauncherImportWizard";

export function useLauncherName() {
  const { t } = useTranslation();
  return (launcher: ForeignLauncher) =>
    launcher === "official" ? t("launcherImport.official") : LAUNCHER_NAMES[launcher];
}

function countsText(instance: ForeignInstanceSummary, t: TFunction) {
  const { mods, worlds, screenshots, packs } = instance.counts;
  return [
    mods > 0 ? t("launcherImport.counts.mods", { count: mods }) : "",
    worlds > 0 ? t("launcherImport.counts.worlds", { count: worlds }) : "",
    packs > 0 ? t("launcherImport.counts.packs", { count: packs }) : "",
    screenshots > 0 ? t("launcherImport.counts.screenshots", { count: screenshots }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function InstanceRow({
  instance,
  checked,
  imported,
  onToggle,
}: {
  instance: ForeignInstanceSummary;
  checked: boolean;
  imported: boolean;
  onToggle: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const id = `launcher-import-${instance.id}`;
  const counts = countsText(instance, t);

  return (
    <label
      htmlFor={id}
      className="flex h-12 cursor-pointer items-center gap-3 rounded-lg px-3 transition-colors hover:bg-row-hover"
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onToggle(value === true)}
      />
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-3">
        {instance.icon ? (
          <img src={instance.icon} alt="" className="size-full object-cover" />
        ) : (
          <LoaderIcon loader={instance.loader} className="size-4" />
        )}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <Hint content={instance.name} variant="text" truncatedOnly>
          <span className="truncate text-sm leading-5 text-foreground">{instance.name}</span>
        </Hint>
        <span className="flex min-w-0 items-center gap-2 text-xs leading-4 text-muted-foreground">
          <LoaderLabel loader={instance.loader} className="shrink-0" />
          <span className="shrink-0 font-mono tabular-nums">{instance.minecraftVersion}</span>
          {counts && (
            <Hint content={counts} variant="text" truncatedOnly>
              <span className="min-w-0 truncate text-faint">{counts}</span>
            </Hint>
          )}
        </span>
      </span>
      {instance.sharedGameDir && (
        <Hint content={t("launcherImport.sharedHint")}>
          <span className="shrink-0 rounded-md bg-surface-3 px-1.5 py-0.5 text-2xs text-muted-foreground">
            {t("launcherImport.shared")}
          </span>
        </Hint>
      )}
      {imported && (
        <span className="shrink-0 rounded-md bg-info/15 px-1.5 py-0.5 text-2xs text-info">
          {t("launcherImport.imported")}
        </span>
      )}
    </label>
  );
}

function PartsPicker({ wizard }: { wizard: LauncherImportWizard }) {
  const { t } = useTranslation();

  return (
    <fieldset className="grid shrink-0 gap-2 rounded-xl border border-border bg-surface-1 px-3 py-2.5">
      <legend className="sr-only">{t("launcherImport.partsTitle")}</legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs font-medium text-foreground">{t("launcherImport.partsTitle")}</span>
        {IMPORT_PARTS.map((part) => {
          const id = `launcher-import-part-${part}`;
          return (
            <label key={part} htmlFor={id} className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
              <Checkbox
                id={id}
                checked={wizard.parts.has(part)}
                onCheckedChange={(value) => wizard.togglePart(part, value === true)}
              />
              {t(`launcherImport.parts.${part}`)}
            </label>
          );
        })}
      </div>
      <p className="text-2xs leading-snug text-faint">{t("launcherImport.partsHint")}</p>
    </fieldset>
  );
}

function statusIcon(item: ImportItemState) {
  switch (item.status) {
    case "done":
      return <Check className="size-4 text-success" />;
    case "failed":
      return <X className="size-4 text-destructive" />;
    case "reviewing":
      return <ShieldQuestion className="size-4 text-warning" />;
    case "cancelled":
    case "queued":
      return <CircleDashed className="size-4 text-faint" />;
    default:
      return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  }
}

function ProgressRow({ item, onOpen }: { item: ImportItemState; onOpen: (key: string) => void }) {
  const { t } = useTranslation();
  const detail =
    item.status === "failed"
      ? (item.error ?? t("launcherImport.status.failed"))
      : item.status === "done"
        ? [
            item.modCount
              ? t("launcherImport.status.identified", {
                  count: item.identified ?? 0,
                  total: item.modCount,
                })
              : t("launcherImport.status.done"),
            item.loaderFallback
              ? t("launcherImport.status.loaderFallback", { version: item.loaderFallback })
              : "",
            item.copyFailed
              ? t("launcherImport.status.copyFailed", { count: item.copyFailed })
              : "",
          ]
            .filter(Boolean)
            .join(" · ")
        : t(`launcherImport.status.${item.status}`);

  return (
    <div className="flex min-h-12 items-center gap-3 rounded-lg px-3 py-1.5">
      <span className="flex size-5 shrink-0 items-center justify-center">{statusIcon(item)}</span>
      <span className="grid min-w-0 flex-1 gap-1">
        <Hint content={item.name} variant="text" truncatedOnly>
          <span className="truncate text-sm leading-5 text-foreground">{item.name}</span>
        </Hint>
        {item.status === "copying" && item.percent !== undefined ? (
          <span className="flex items-center gap-2">
            <Progress value={item.percent} max={100} className="h-1.5 flex-1" />
            <span className="shrink-0 font-mono text-2xs tabular-nums text-faint">{item.percent}%</span>
          </span>
        ) : (
          <Hint content={detail} variant="text" truncatedOnly>
            <span
              className={cn(
                "truncate text-xs leading-4",
                item.status === "failed" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {detail}
            </span>
          </Hint>
        )}
      </span>
      {item.status === "done" && item.instanceKey && (
        <Button variant="ghost" size="sm" onClick={() => onOpen(item.instanceKey!)}>
          {t("launcherImport.open")}
        </Button>
      )}
    </div>
  );
}

export function LauncherImportBody({
  wizard,
  onOpenInstance,
}: {
  wizard: LauncherImportWizard;
  onOpenInstance: (key: string) => void;
}) {
  const { t } = useTranslation();
  const launcherName = useLauncherName();
  const { job } = wizard;

  if (job) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <header className="grid shrink-0 gap-0.5">
          <h2 className="text-base font-semibold text-foreground">
            {job.running ? t("launcherImport.progressTitle") : t("launcherImport.finishedTitle")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("launcherImport.copyNote")}</p>
        </header>
        <ScrollArea className="min-h-0 flex-1 rounded-xl border border-border bg-surface-1">
          <div className="grid gap-0.5 p-1.5">
            {job.items.map((item) => (
              <div key={item.id} className="grid gap-1">
                <ProgressRow item={item} onOpen={onOpenInstance} />
                {item.status === "reviewing" && item.unknownJars && (
                  <UnknownJarsReview id={item.id} jars={item.unknownJars} />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  const header = (
    <header className="flex shrink-0 items-start gap-3">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <h2 className="text-base font-semibold text-foreground">{t("launcherImport.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("launcherImport.copyNote")}</p>
      </div>
      <Hint content={t("common.refresh")}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("common.refresh")}
          disabled={wizard.status === "scanning"}
          onClick={() => void wizard.scan()}
        >
          <RefreshCw className={cn(wizard.status === "scanning" && "animate-spin")} />
        </Button>
      </Hint>
      <Button
        variant="outline"
        size="sm"
        disabled={wizard.isPickingFolder}
        onClick={() => void wizard.pickFolder()}
      >
        {wizard.isPickingFolder ? <Loader2 className="animate-spin" /> : <FolderSearch />}
        {t("launcherImport.pickFolder")}
      </Button>
    </header>
  );

  if (wizard.status !== "ready") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {header}
        <ListSkeleton rows={7} rowClassName="h-12" iconClassName="size-8 rounded-lg" className="rounded-xl border border-border bg-surface-1 p-1.5" />
      </div>
    );
  }

  if (wizard.instances.length === 0) {
    return (
      <Empty className="min-h-0 flex-1 border border-dashed border-border bg-surface-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ArrowRightLeft />
          </EmptyMedia>
          <EmptyTitle>{t("launcherImport.emptyTitle")}</EmptyTitle>
          <EmptyDescription className="max-w-md">{t("launcherImport.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-none flex-row justify-center">
          <Button variant="secondary" disabled={wizard.isPickingFolder} onClick={() => void wizard.pickFolder()}>
            {wizard.isPickingFolder ? <Loader2 className="animate-spin" /> : <FolderSearch />}
            {t("launcherImport.pickFolder")}
          </Button>
          <Button variant="ghost" onClick={() => void wizard.scan()}>
            <RefreshCw />
            {t("common.refresh")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {header}
      <ScrollArea className="min-h-0 flex-1 rounded-xl border border-border bg-surface-1">
        <div className="grid gap-2 p-1.5">
          {wizard.groups.map((group) => {
            const state = groupState(wizard.selected, group);
            const id = `launcher-import-group-${group.launcher}`;
            return (
              <section
                key={group.launcher}
                aria-labelledby={`${id}-title`}
                className="grid gap-1 rounded-lg bg-surface-2 p-1"
              >
                <label htmlFor={id} className="flex h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 hover:bg-row-hover">
                  <Checkbox
                    id={id}
                    checked={state}
                    onCheckedChange={(value) =>
                      wizard.setSelected(toggleGroup(wizard.selected, group, value === true))
                    }
                  />
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-3">
                    <LauncherMark launcher={group.launcher} />
                  </span>
                  <span id={`${id}-title`} className="min-w-0 truncate text-sm font-semibold text-foreground">
                    {launcherName(group.launcher)}
                  </span>
                  <span className="shrink-0 rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-2xs tabular-nums text-muted-foreground">
                    {group.instances.length}
                  </span>
                </label>
                <div className="ml-[1.0625rem] grid gap-0.5 border-l border-border pl-2">
                  {group.instances.map((instance) => (
                    <InstanceRow
                      key={instance.id}
                      instance={instance}
                      checked={wizard.selected.has(instance.id)}
                      imported={wizard.imported.has(instance.id)}
                      onToggle={(value) => wizard.toggleInstance(instance.id, value)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </ScrollArea>
      <PartsPicker wizard={wizard} />
    </div>
  );
}

export function LauncherImportFooter({
  wizard,
  onClose,
}: {
  wizard: LauncherImportWizard;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { job } = wizard;

  if (job) {
    const done = job.items.filter((item) => item.status === "done").length;
    const failed = job.items.filter((item) => item.status === "failed").length;
    const finished = job.items.filter((item) =>
      ["done", "failed", "cancelled"].includes(item.status),
    ).length;
    const text = job.running
      ? t("launcherImport.footer.running", { count: finished, total: job.items.length })
      : failed > 0
        ? t("launcherImport.result.partial", { count: done, failed })
        : t("launcherImport.result.done", { count: done });

    return (
      <>
        <Hint content={text} variant="text" truncatedOnly>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{text}</span>
        </Hint>
        {job.running ? (
          <>
            <Button variant="ghost" onClick={wizard.stop}>
              {t("launcherImport.stop")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                openTaskCenter();
                onClose();
              }}
            >
              {t("newInstance.minimize")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={wizard.again}>
              {t("launcherImport.again")}
            </Button>
            <Button
              onClick={() => {
                wizard.again();
                onClose();
              }}
            >
              {t("launcherImport.finish")}
            </Button>
          </>
        )}
      </>
    );
  }

  const count = wizard.chosen.length;
  const text =
    wizard.blocker ??
    (wizard.instances.length > 0
      ? t("launcherImport.footer.selected", { count, total: wizard.instances.length })
      : t("launcherImport.footer.empty"));

  return (
    <>
      <Hint content={text} variant="text" truncatedOnly>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-xs",
            wizard.blocker ? "text-muted-foreground" : "text-faint",
          )}
        >
          {text}
        </span>
      </Hint>
      <Button variant="ghost" onClick={onClose}>
        {t("common.cancel")}
      </Button>
      <Button disabled={!!wizard.blocker || count === 0} onClick={wizard.start}>
        <ArrowRightLeft />
        {t("launcherImport.start", { count })}
      </Button>
    </>
  );
}

export function openImportedInstance(key: string, onClose: () => void) {
  onClose();
  navigate({ name: "instance", id: key }, { force: true, replace: true });
}
