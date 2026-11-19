import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  FileCog,
  FolderOpen,
  History,
  ListChecks,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { getLoaderInfo } from "@renderer/components/Loaders";
import { formatDate } from "@renderer/features/mods/format";
import { SectionCard } from "@renderer/features/instances/SectionCard";
import { modpackProjectKey } from "@/shared/modpackMerge";
import { isProjectEnabled } from "@/shared/modpackOptional";
import {
  PackContentList,
  type PackContentItem,
} from "@renderer/features/newInstance/PackContentList";
import { ArchiveSourceForm } from "./ArchiveSourceForm";
import { ModpackFlowDialogs } from "./ModpackFlowDialogs";
import { ModpackUpdatePreview } from "./ModpackUpdatePreview";
import type { ModpackPanelProps } from "./ModpackPanel";
import { useModpackUpdateFlow } from "./useModpackUpdateFlow";

function HowRow({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <li className="flex items-start gap-2.5 px-3.5 py-2 text-xs leading-snug">
      <Icon className="mt-px size-3.5 shrink-0 text-faint" />
      <span className="min-w-0 text-muted-foreground">{text}</span>
    </li>
  );
}

export function ModpackArchivePanel(props: ModpackPanelProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { instance, state } = props;
  const conf = instance.version;
  const base = state.base;
  const currentLabel = base?.label || t("modpack.archive.noLabel");
  const title = base?.title || conf.name;

  const flow = useModpackUpdateFlow({
    instance,
    state,
    account: props.account,
    server: props.server,
    site: t("modpack.archive.source"),
    currentLabel,
    onUpdated: props.onUpdated,
  });
  const { phase, prepared, stageText } = flow;

  const actionBlocked = props.isReadOnly
    ? t("versions.readOnlyHint")
    : props.hasUnsavedChanges
      ? t("modpack.blocked.unsaved")
      : props.isRunning
        ? t("modpack.blocked.running")
        : props.isBusy || phase !== "idle"
          ? t("versions.installBusy")
          : undefined;
  const disabled = !!actionBlocked || !props.account;

  const rollbackSummary = state.rollback
    ? t("modpack.rollback.summary", {
        from: state.rollback.fromVersion || "—",
        to: state.rollback.toVersion,
        date: formatDate(state.rollback.createdAt, lang) ?? "",
      })
    : "";

  const loaderInfo = getLoaderInfo(conf.loader.name);
  const mods = conf.loader.mods;
  const contentItems = useMemo(
    (): PackContentItem[] =>
      (mods ?? []).map((mod) => ({
        key: modpackProjectKey(mod),
        title: mod.title,
        iconUrl: mod.iconUrl,
        provider: mod.provider,
        projectType: mod.projectType,
        enabled: isProjectEnabled(mod),
      })),
    [mods],
  );

  const leftColumn =
    phase === "preview" || (phase === "applying" && prepared) ? (
      prepared && (
        <ModpackUpdatePreview
          update={prepared}
          currentLabel={currentLabel}
          isOlder={false}
          restoreRemoved={flow.restoreRemoved}
          isApplying={phase === "applying"}
          onRestoreRemovedChange={flow.changeRestoreRemoved}
          onCancel={flow.cancelPreview}
          onApply={() => void flow.apply()}
        />
      )
    ) : (
      <>
        <div className="surface-lit shrink-0 rounded-xl border border-border bg-card px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Hint content={currentLabel} variant="text" truncatedOnly>
              <span className="min-w-0 truncate font-mono text-base font-medium">
                {currentLabel}
              </span>
            </Hint>
            <span className="flex h-5 shrink-0 items-center rounded-md border border-success/30 bg-success/12 px-1.5 text-3xs font-medium whitespace-nowrap text-success">
              {t("modpack.current")}
            </span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-faint">
            <span className="font-mono">MC {conf.version.id}</span>
            <span>
              {loaderInfo.name}
              {conf.loader.version?.id && (
                <span className="ml-1 font-mono">{conf.loader.version.id}</span>
              )}
            </span>
          </p>

          {stageText ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {stageText}
            </p>
          ) : actionBlocked ? (
            <p className="mt-2 text-xs text-faint">{actionBlocked}</p>
          ) : null}
        </div>

        <PackContentList
          title={t("addVersion.preview.content")}
          items={contentItems}
          emptyText={t("newInstance.emptyContent")}
        />

        {state.rollback && (
          <div className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3.5">
            <History className="size-3.5 shrink-0 text-faint" />
            <Hint content={rollbackSummary} variant="text" truncatedOnly>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {rollbackSummary}
              </span>
            </Hint>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void flow.openBackups()}
            >
              <FolderOpen />
              {t("modpack.rollback.backups")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => void flow.rollback()}
            >
              {phase === "rollingBack" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RotateCcw />
              )}
              {t("modpack.rollback.action", {
                version: state.rollback.fromVersion || "—",
              })}
            </Button>
          </div>
        )}
      </>
    );

  return (
    <>
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_306px] grid-rows-[minmax(0,1fr)] gap-3">
        <div className="flex min-h-0 flex-col gap-3">{leftColumn}</div>

        <div className="flex min-h-0 flex-col gap-3">
          <section className="surface-lit shrink-0 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-surface-3">
                <Archive className="size-5 text-faint" />
              </span>
              <div className="min-w-0 flex-1">
                <Hint content={title} variant="text" truncatedOnly>
                  <p className="truncate text-sm font-medium">{title}</p>
                </Hint>
                <p className="text-xs text-faint">{t("modpack.archive.source")}</p>
              </div>
            </div>
          </section>

          <SectionCard
            title={t("modpack.archive.title")}
            icon={Archive}
            className="shrink-0"
            bodyClassName="px-3 py-3"
          >
            <ArchiveSourceForm
              key={base?.url ?? ""}
              initialUrl={base?.url ?? ""}
              disabled={disabled}
              offline={!props.isOnline}
              onPickFile={() => void flow.startFromFile()}
              onSubmitUrl={(url) => void flow.startFromUrl(url)}
            />
          </SectionCard>

          <SectionCard
            title={t("modpack.archive.how")}
            icon={ListChecks}
            className="min-h-0 shrink"
            bodyClassName="overflow-y-auto py-1"
          >
            <ul>
              <HowRow icon={Archive} text={t("modpack.archive.howMods")} />
              <HowRow icon={FileCog} text={t("modpack.archive.howConfigs")} />
              <HowRow icon={ShieldCheck} text={t("modpack.archive.howKept")} />
              <HowRow icon={Undo2} text={t("modpack.archive.howPreview")} />
            </ul>
          </SectionCard>
        </div>
      </div>

      <ModpackFlowDialogs
        flow={flow}
        gameVersion={conf.version.id}
        loader={conf.loader.name}
      />
    </>
  );
}
