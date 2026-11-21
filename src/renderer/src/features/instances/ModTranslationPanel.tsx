import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Blocks,
  BookOpen,
  CircleCheck,
  Clock3,
  ExternalLink,
  Globe,
  Languages,
  Layers,
  Package,
  RotateCw,
  ScrollText,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { FactRow, FactRows } from "@renderer/components/FactRows";
import { formatRelative } from "@renderer/utilities/date";
import { formatNumber } from "@renderer/utilities/numbers";
import { onRadioKeyDown } from "@renderer/utilities/radioKeys";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import type {
  ModTranslationFormat,
  ModTranslationGroup,
  ModTranslationItem,
} from "@/types/ModTranslations";
import {
  describeTranslation,
  useModTranslationStatus,
} from "./useModTranslationStatus";

const api = window.api;

const GROUPS: Array<{ id: ModTranslationGroup; icon: LucideIcon }> = [
  { id: "mods", icon: Blocks },
  { id: "packs", icon: Layers },
  { id: "books", icon: BookOpen },
  { id: "quests", icon: ScrollText },
];

const GROUP_IDS = GROUPS.map((group) => group.id);

const FORMAT_LABELS: Record<ModTranslationFormat, string> = {
  lavender: "Lavender",
  patchouli: "Patchouli",
  guideme: "GuideME",
  ftbquests: "FTB Quests",
  questz: "QuestZ",
};

interface Totals {
  items: number;
  strings: number;
  translated: number;
  pending: number;
  failed: number;
}

function totalsOf(items: ModTranslationItem[]): Totals {
  return items.reduce<Totals>(
    (sum, item) => ({
      items: sum.items + 1,
      strings: sum.strings + item.strings,
      translated: sum.translated + item.translated,
      pending: sum.pending + item.pending,
      failed: sum.failed + item.failed,
    }),
    { items: 0, strings: 0, translated: 0, pending: 0, failed: 0 },
  );
}

function StateMark({ totals, withLabel }: { totals: Totals; withLabel?: boolean }) {
  const { t } = useTranslation();
  if (totals.strings === 0) return null;
  const state =
    totals.pending > 0
      ? { icon: Clock3, tone: "text-info", label: t("modTranslations.panel.state.queued") }
      : totals.failed > 0 && totals.translated === 0
        ? { icon: TriangleAlert, tone: "text-warning", label: t("modTranslations.panel.state.failed") }
        : totals.failed > 0
          ? { icon: TriangleAlert, tone: "text-warning", label: t("modTranslations.panel.state.partial") }
          : { icon: CircleCheck, tone: "text-success", label: t("modTranslations.panel.state.done") };
  const Icon = state.icon;
  if (!withLabel) {
    return (
      <Hint content={state.label}>
        <Icon aria-label={state.label} className={cn("size-3.5 shrink-0", state.tone)} />
      </Hint>
    );
  }
  return (
    <span className={cn("flex shrink-0 items-center gap-1 text-2xs whitespace-nowrap", state.tone)}>
      <Icon className="size-3.5" />
      {state.label}
    </span>
  );
}

function Meter({ totals }: { totals: Totals }) {
  const done = totals.strings > 0 ? (totals.translated / totals.strings) * 100 : 0;
  const failed = totals.strings > 0 ? (totals.failed / totals.strings) * 100 : 0;
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-3">
      <div className="bg-success" style={{ width: `${done}%` }} />
      <div className="bg-warning" style={{ width: `${failed}%` }} />
    </div>
  );
}

export function ModTranslationPanel({
  versionPath,
  lockedReason,
  onClose,
}: {
  versionPath: string;
  lockedReason?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { status, switching, refreshing, busy, toggle, refresh } =
    useModTranslationStatus(versionPath, true);
  const [selected, setSelected] = useState<ModTranslationGroup>("mods");

  const enabled = status?.enabled ?? false;
  const items = status?.items ?? [];
  const byGroup = (group: ModTranslationGroup) =>
    items.filter((item) => item.group === group);
  const all = totalsOf(items);
  const current = byGroup(selected);
  const currentTotals = totalsOf(current);
  const packs = status?.packs ?? [];
  const line = describeTranslation(status, t);
  const strings = (count: number) =>
    t("modTranslations.panel.strings", { count, value: formatNumber(count) });

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex h-7 shrink-0 items-center gap-2">
        <Languages className="size-3.5 shrink-0 text-faint" />
        <Hint content={t("modTranslations.panel.title")} variant="text" truncatedOnly>
          <span className="min-w-0 flex-1 truncate text-2xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {t("modTranslations.panel.title")}
          </span>
        </Hint>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-2xs text-faint"
          onClick={onClose}
        >
          <X />
          {t("common.close")}
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,280px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div
            role="radiogroup"
            aria-label={t("modTranslations.panel.parts")}
            className="flex flex-col gap-0.5 p-1.5"
            onKeyDown={(event) =>
              onRadioKeyDown(event, GROUP_IDS, selected, setSelected)
            }
          >
            {GROUPS.map(({ id, icon: Icon }) => {
              const totals = totalsOf(byGroup(id));
              const active = selected === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setSelected(id)}
                  className={cn(
                    "flex h-12 items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors duration-(--dur-fast)",
                    active ? "bg-row-selected" : "hover:bg-row-hover",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">
                      {t(`modTranslations.panel.group.${id}`)}
                    </span>
                    <span className="truncate font-mono text-2xs text-faint tabular-nums">
                      {totals.strings > 0
                        ? t("modTranslations.panel.progress", {
                            done: formatNumber(totals.translated),
                            total: formatNumber(totals.strings),
                          })
                        : t("modTranslations.panel.none")}
                    </span>
                  </span>
                  <StateMark totals={totals} />
                </button>
              );
            })}
          </div>
          <FactRows surface="card" className="mt-auto border-t border-border">
            <FactRow
              icon={<Globe className="size-3.5" />}
              label={t("modTranslations.panel.fact.locale")}
              value={
                <span className="font-mono text-xs text-muted-foreground">
                  {status?.locale ?? "—"}
                </span>
              }
            />
            <FactRow
              icon={<Blocks className="size-3.5" />}
              label={t("modTranslations.panel.fact.mods")}
              value={
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatNumber(status?.mods ?? 0)}
                </span>
              }
            />
            <FactRow
              icon={<Package className="size-3.5" />}
              label={t("modTranslations.panel.fact.packs")}
              value={
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatNumber(packs.length)}
                </span>
              }
            />
            <FactRow
              icon={<Clock3 className="size-3.5" />}
              label={t("modTranslations.panel.fact.updated")}
              value={
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {status?.updatedAt ? formatRelative(new Date(status.updatedAt)) : "—"}
                </span>
              }
            />
          </FactRows>
          <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2.5">
            <div className="flex items-center gap-2 text-2xs">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {t("modTranslations.panel.total")}
              </span>
              <span className="shrink-0 font-mono whitespace-nowrap text-faint tabular-nums">
                {t("modTranslations.panel.progress", {
                  done: formatNumber(all.translated),
                  total: formatNumber(all.strings),
                })}
              </span>
            </div>
            <Meter totals={all} />
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex shrink-0 flex-col gap-1 border-b border-border px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {t(`modTranslations.panel.group.${selected}`)}
              </span>
              <StateMark totals={currentTotals} withLabel />
            </div>
            <p className="text-2xs leading-snug text-faint">
              {t(`modTranslations.panel.hint.${selected}`)}
            </p>
          </div>

          {selected === "mods" && packs.length > 0 && (
            <div className="flex shrink-0 flex-col gap-0.5 border-b border-border px-3.5 py-2">
              <span className="text-2xs text-faint">
                {t("modTranslations.packsHint")}
              </span>
              {packs.map((pack) => (
                <div key={pack.key} className="flex h-8 items-center gap-2">
                  <Hint content={pack.title} variant="text" truncatedOnly>
                    <span className="min-w-0 truncate text-sm">{pack.title}</span>
                  </Hint>
                  <Hint
                    content={`${pack.author} · ${pack.license}`}
                    variant="text"
                    truncatedOnly
                  >
                    <span className="min-w-0 flex-1 truncate text-2xs text-faint">
                      {pack.author} · {pack.license}
                    </span>
                  </Hint>
                  <Hint content={t("modTranslations.panel.openPack")}>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground"
                      aria-label={t("modTranslations.panel.openPack")}
                      onClick={() =>
                        void api.shell.openExternal(pack.url).catch(ignoreFailure)
                      }
                    >
                      <ExternalLink />
                    </Button>
                  </Hint>
                </div>
              ))}
            </div>
          )}

          {!enabled ? (
            <Empty className="min-h-0 flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Languages />
                </EmptyMedia>
                <EmptyTitle>{t("modTranslations.panel.off")}</EmptyTitle>
                <EmptyDescription>{t("modTranslations.panel.offHint")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : current.length === 0 ? (
            <Empty className="min-h-0 flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {(() => {
                    const Icon = GROUPS.find((group) => group.id === selected)!.icon;
                    return <Icon />;
                  })()}
                </EmptyMedia>
                <EmptyTitle>{t(`modTranslations.panel.empty.${selected}`)}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {current.map((item) => (
                <li
                  key={`${item.format ?? ""}:${item.title}`}
                  className="flex h-10 items-center gap-2 border-b border-border/60 px-3.5 last:border-b-0"
                >
                  <Hint content={item.title} variant="text" truncatedOnly>
                    <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                  </Hint>
                  {item.format && (
                    <span className="shrink-0 rounded-md bg-surface-3 px-1.5 py-0.5 text-3xs text-muted-foreground">
                      {FORMAT_LABELS[item.format]}
                    </span>
                  )}
                  <span className="shrink-0 font-mono text-2xs whitespace-nowrap text-faint tabular-nums">
                    {item.pending > 0 || item.failed > 0
                      ? t("modTranslations.panel.progress", {
                          done: formatNumber(item.translated),
                          total: formatNumber(item.strings),
                        })
                      : strings(item.strings)}
                  </span>
                  <StateMark totals={{ ...item, items: 1 }} withLabel />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex h-9 shrink-0 items-center gap-2">
        <Hint content={lockedReason ?? line.text} variant="text" truncatedOnly>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs",
              lockedReason || line.tone === "warning"
                ? "text-warning"
                : "text-muted-foreground",
            )}
          >
            {lockedReason ?? line.text}
          </span>
        </Hint>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!enabled || refreshing || busy || !!lockedReason}
          onClick={refresh}
        >
          <RotateCw className={cn(refreshing && "animate-spin")} />
          {t("modTranslations.panel.refresh")}
        </Button>
        <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <Switch
            disabled={switching || !status || !!lockedReason}
            checked={enabled}
            onCheckedChange={toggle}
          />
          {t("modTranslations.title")}
        </label>
      </div>
    </div>
  );
}
