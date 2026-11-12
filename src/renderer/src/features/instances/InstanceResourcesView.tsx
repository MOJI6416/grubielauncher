import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Cpu,
  GitCompareArrows,
  Gauge,
  Lightbulb,
  MemoryStick,
  Package,
  Timer,
  Zap,
} from "lucide-react";
import type { IVersionSession } from "@/types/VersionStatistics";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { formatDay } from "@renderer/utilities/date";
import { toTotalMemoryMb } from "@renderer/features/settings/memory";
import { Fact, Panel } from "./statisticsParts";
import {
  delta,
  measuredSessions,
  usageAdvice,
  type MeasuredSession,
  type SetupChange,
} from "./resourceStats";

const NOTICEABLE_MB = 64;
const CHART_SLOTS = 24;
const NOTICEABLE_SEC = 2;

function useFormatters() {
  const { t, i18n } = useTranslation();
  const number = useMemo(
    () => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }),
    [i18n.language],
  );
  const units = {
    mb: t("versionStatistics.resources.units.mb"),
    gb: t("versionStatistics.resources.units.gb"),
    sec: t("versionStatistics.resources.units.sec"),
    ms: t("versionStatistics.resources.units.ms"),
  };

  const memory = (mb: number | undefined) => {
    if (mb === undefined) return "—";
    const value = Math.abs(mb);
    return value >= 1024
      ? `${number.format(Math.round((value / 1024) * 10) / 10)} ${units.gb}`
      : `${number.format(Math.round(value))} ${units.mb}`;
  };
  const seconds = (sec: number | undefined) =>
    sec === undefined ? "—" : `${number.format(sec)} ${units.sec}`;
  const signed = (value: number, text: string) =>
    `${value > 0 ? "+" : value < 0 ? "−" : "±"}${text}`;

  return { t, memory, seconds, signed, units, number };
}

function DeltaNote({
  value,
  format,
  minimum = 1,
}: {
  value: number | null;
  format: (value: number) => string;
  minimum?: number;
}) {
  if (value === null || Math.abs(value) < minimum) return null;
  return (
    <span className={value > 0 ? "text-warning" : "text-success"}>
      {format(value)}
    </span>
  );
}

function changeText(
  change: SetupChange,
  t: ReturnType<typeof useTranslation>["t"],
  memory: (mb: number) => string,
): string {
  const key = "versionStatistics.resources.change";
  switch (change.kind) {
    case "modsAdded":
      return `${t(`${key}.modsAdded`, { count: change.count })}: ${change.titles.join(", ")}${change.count > change.titles.length ? "…" : ""}`;
    case "modsRemoved":
      return `${t(`${key}.modsRemoved`, { count: change.count })}: ${change.titles.join(", ")}${change.count > change.titles.length ? "…" : ""}`;
    case "memory":
      return t(`${key}.memory`, { from: memory(change.from), to: memory(change.to) });
    case "java":
      return t(`${key}.java`, { from: change.from ?? "?", to: change.to ?? "?" });
    case "loader":
      return t(`${key}.loader`, { from: change.from ?? "?", to: change.to ?? "?" });
    case "minecraft":
      return t(`${key}.minecraft`, { from: change.from, to: change.to });
    case "optimizedJvm":
      return t(change.to ? `${key}.optimizedOn` : `${key}.optimizedOff`);
  }
}

function SessionHint({
  session,
  format,
}: {
  session: MeasuredSession;
  format: ReturnType<typeof useFormatters>;
}) {
  const { t, memory, seconds } = format;
  const resources = session.resources;
  const allocated = session.config?.xmxMb;

  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="font-medium">{formatDay(new Date(session.endedAt))}</span>
      {resources.heapPeakMb !== undefined && (
        <span>
          {t("versionStatistics.resources.hintHeap", {
            typical: memory(resources.heapTypicalMb),
            peak: memory(resources.heapPeakMb),
            allocated: memory(allocated),
          })}
        </span>
      )}
      {resources.loadSec !== undefined && (
        <span>{`${t("versionStatistics.resources.load")}: ${seconds(resources.loadSec)}`}</span>
      )}
      {session.changes.map((change, index) => (
        <span key={index} className="text-muted-foreground">
          {changeText(change, t, memory)}
        </span>
      ))}
    </div>
  );
}

export function InstanceResourcesView({ sessions }: { sessions: IVersionSession[] }) {
  const format = useFormatters();
  const { t, memory, seconds, signed, units } = format;
  const [totalMb, setTotalMb] = useState(0);
  const measured = useMemo(() => measuredSessions(sessions, CHART_SLOTS), [sessions]);
  const advice = useMemo(() => usageAdvice(measured, totalMb), [measured, totalMb]);

  useEffect(() => {
    let cancelled = false;
    void window.api.os
      .totalmem()
      .then((total) => {
        if (!cancelled) setTotalMb(toTotalMemoryMb(total));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (measured.length === 0) {
    return (
      <Empty className="min-h-0 flex-1 border border-dashed border-border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Gauge />
          </EmptyMedia>
          <EmptyTitle>{t("versionStatistics.resources.empty")}</EmptyTitle>
          <EmptyDescription>{t("versionStatistics.resources.emptyHint")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const latest = measured[measured.length - 1];
  const previous = measured.length > 1 ? measured[measured.length - 2] : undefined;
  const current = latest.resources;
  const allocated = latest.config?.xmxMb;
  const pauses = current.pauses;

  const memoryDelta = (value: number) => signed(value, memory(value));
  const secondsDelta = (value: number) => signed(value, seconds(Math.abs(value)));

  const scale = Math.max(
    1,
    ...measured.map((session) =>
      Math.max(
        session.config?.xmxMb ?? 0,
        session.resources.heapCapacityMb ?? 0,
        session.resources.heapPeakMb ?? 0,
      ),
    ),
  );
  const loadPeak = Math.max(1, ...measured.map((session) => session.resources.loadSec ?? 0));
  const changed = measured
    .map((session, index) => ({ session, before: index > 0 ? measured[index - 1] : undefined }))
    .filter((item) => item.session.changes.length > 0)
    .reverse();

  const emptySlots = Array.from({ length: Math.max(0, CHART_SLOTS - measured.length) }, (_, index) => (
    <span key={`empty-${index}`} className="h-[3px] min-w-0 flex-1 self-end rounded-sm bg-surface-3" />
  ));

  const percent = (value: number | undefined, max: number) =>
    `${Math.max(0, Math.min(100, ((value ?? 0) / max) * 100))}%`;

  return (
    <>
      <div className="grid shrink-0 grid-cols-6 gap-2">
        <Hint variant="text" content={t("versionStatistics.resources.heapHint")}>
          <div>
            <Fact
              icon={MemoryStick}
              label={t("versionStatistics.resources.heap")}
              value={memory(current.heapTypicalMb)}
              note={
                <DeltaNote
                  value={delta(current.heapTypicalMb, previous?.resources.heapTypicalMb)}
                  format={memoryDelta}
                  minimum={NOTICEABLE_MB}
                />
              }
            />
          </div>
        </Hint>
        <Fact
          icon={Gauge}
          label={t("versionStatistics.resources.heapPeak")}
          value={memory(current.heapPeakMb)}
          note={
            allocated && current.heapPeakMb !== undefined ? (
              <span className="text-faint">
                {t("versionStatistics.resources.ofAllocated", { allocated: memory(allocated) })}
              </span>
            ) : undefined
          }
        />
        <Hint variant="text" content={t("versionStatistics.resources.processHint")}>
          <div>
            <Fact
              icon={Cpu}
              label={t("versionStatistics.resources.process")}
              value={memory(current.processPeakMb)}
              note={
                <DeltaNote
                  value={delta(current.processPeakMb, previous?.resources.processPeakMb)}
                  format={memoryDelta}
                  minimum={NOTICEABLE_MB}
                />
              }
            />
          </div>
        </Hint>
        <Hint variant="text" content={t("versionStatistics.resources.loadHint")}>
          <div>
            <Fact
              icon={Timer}
              label={t("versionStatistics.resources.load")}
              value={seconds(current.loadSec)}
              note={
                <DeltaNote
                  value={delta(current.loadSec, previous?.resources.loadSec)}
                  format={secondsDelta}
                  minimum={NOTICEABLE_SEC}
                />
              }
            />
          </div>
        </Hint>
        <Hint variant="text" content={t("versionStatistics.resources.pausesHint")}>
          <div>
            <Fact
              icon={Zap}
              label={t("versionStatistics.resources.pauses")}
              value={
                !pauses
                  ? "—"
                  : pauses.long === 0
                    ? t("versionStatistics.resources.pausesNone")
                    : String(pauses.long)
              }
              note={
                pauses && pauses.long > 0 ? (
                  <span className="text-faint">
                    {t("versionStatistics.resources.pausesLongest", {
                      value: `${pauses.longestMs} ${units.ms}`,
                    })}
                  </span>
                ) : undefined
              }
            />
          </div>
        </Hint>
        <Fact
          icon={Package}
          label={t("versionStatistics.resources.mods")}
          value={latest.config ? String(latest.config.mods) : "—"}
          note={
            <DeltaNote
              value={delta(latest.config?.mods, previous?.config?.mods)}
              format={(value) => signed(value, String(Math.abs(value)))}
            />
          }
        />
      </div>

      <div className="grid min-h-[150px] flex-1 grid-cols-[minmax(0,1fr)_340px] grid-rows-[minmax(0,1fr)] gap-3">
        <Panel
          title={t("versionStatistics.resources.memoryChart")}
          icon={MemoryStick}
          hint={
            <span className="flex items-center gap-2.5 font-sans">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-primary/75" />
                {t("versionStatistics.resources.legendTypical")}
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-primary/30" />
                {t("versionStatistics.resources.legendPeak")}
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-surface-3" />
                {t("versionStatistics.resources.legendAllocated")}
              </span>
            </span>
          }
        >
          <div className="flex h-full items-end gap-1 px-3 pt-4 pb-2">
            {measured.map((session) => (
              <Hint key={session.id} content={<SessionHint session={session} format={format} />}>
                <span className="relative h-full min-w-0 flex-1">
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-sm bg-surface-3"
                    style={{ height: percent(session.config?.xmxMb ?? session.resources.heapCapacityMb, scale) }}
                  />
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-sm bg-primary/30"
                    style={{ height: percent(session.resources.heapPeakMb, scale) }}
                  />
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-sm bg-primary/75"
                    style={{ height: percent(session.resources.heapTypicalMb, scale) }}
                  />
                  {session.changes.length > 0 && (
                    <span className="absolute -top-2.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-foreground/70" />
                  )}
                </span>
              </Hint>
            ))}
            {emptySlots}
          </div>
        </Panel>

        <Panel
          title={t("versionStatistics.resources.adviceTitle")}
          icon={Lightbulb}
          bodyClassName="flex flex-col gap-2 p-3"
        >
          <p className="text-xs leading-relaxed text-foreground">
            {!advice
              ? t("versionStatistics.resources.adviceNone")
              : advice.kind === "pauses"
                ? t("versionStatistics.resources.advicePauses", { count: advice.long })
                : t(`versionStatistics.resources.advice.${advice.kind}`, {
                    peak: memory(advice.peakMb),
                    allocated: memory(advice.xmxMb),
                    suggest:
                      advice.kind === "tight" || advice.kind === "excess"
                        ? memory(advice.suggestMb)
                        : "",
                  })}
          </p>
          {advice && (
            <p className="text-[0.7rem] text-faint">
              {t("versionStatistics.resources.basedOn", { count: advice.sessions })}
            </p>
          )}
          <p className="mt-auto text-[0.7rem] leading-snug text-faint">
            {t("versionStatistics.resources.about")}
          </p>
        </Panel>
      </div>

      <div className="grid h-[200px] shrink-0 grid-cols-[minmax(0,1fr)_340px] gap-3">
        <Panel
          title={t("versionStatistics.resources.changesTitle")}
          icon={GitCompareArrows}
          bodyClassName="overflow-y-auto py-1"
        >
          {changed.length === 0 ? (
            <p className="px-3 py-2 text-xs text-faint">
              {t("versionStatistics.resources.changesEmpty")}
            </p>
          ) : (
            changed.map(({ session, before }) => {
              const rawHeap = delta(session.resources.heapTypicalMb, before?.resources.heapTypicalMb);
              const rawLoad = delta(session.resources.loadSec, before?.resources.loadSec);
              const heap = rawHeap !== null && Math.abs(rawHeap) >= NOTICEABLE_MB ? rawHeap : null;
              const load = rawLoad !== null && Math.abs(rawLoad) >= NOTICEABLE_SEC ? rawLoad : null;
              return (
                <div key={session.id} className="flex gap-3 px-3 py-1.5 text-xs">
                  <span className="w-[4.5rem] shrink-0 font-mono text-[0.68rem] text-faint tabular-nums">
                    {formatDay(new Date(session.endedAt))}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    {session.changes.map((change, index) => (
                      <Hint key={index} variant="text" content={changeText(change, t, memory)} truncatedOnly>
                        <span className="truncate text-foreground">{changeText(change, t, memory)}</span>
                      </Hint>
                    ))}
                    {(heap !== null || load !== null) && (
                      <span className="flex flex-wrap gap-x-2 text-[0.68rem] text-muted-foreground tabular-nums">
                        {heap !== null && (
                          <span className={cn(heap > 0 ? "text-warning" : heap < 0 && "text-success")}>
                            {t("versionStatistics.resources.effectHeap", { value: memoryDelta(heap) })}
                          </span>
                        )}
                        {load !== null && (
                          <span className={cn(load > 0 ? "text-warning" : load < 0 && "text-success")}>
                            {t("versionStatistics.resources.effectLoad", { value: secondsDelta(load) })}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </Panel>

        <Panel
          title={t("versionStatistics.resources.loadChart")}
          icon={Timer}
          hint={seconds(loadPeak === 1 ? undefined : loadPeak)}
        >
          <div className="flex h-full items-end gap-1 px-3 pt-3 pb-2">
            {measured.map((session) => (
              <Hint
                key={session.id}
                content={`${formatDay(new Date(session.endedAt))} — ${seconds(session.resources.loadSec)}`}
              >
                <span
                  className={cn(
                    "min-h-[3px] min-w-0 flex-1 rounded-sm",
                    session.resources.loadSec ? "bg-primary/75" : "bg-surface-3",
                  )}
                  style={{ height: percent(session.resources.loadSec ?? loadPeak * 0.03, loadPeak) }}
                />
              </Hint>
            ))}
            {emptySlots}
          </div>
        </Panel>
      </div>
    </>
  );
}
