import { maxMemoryMb, roundToStep } from "@renderer/features/settings/memory";
import type {
  ISessionConfig,
  ISessionResources,
  IVersionSession,
} from "@/types/VersionStatistics";

export type SetupChange =
  | { kind: "modsAdded"; count: number; titles: string[] }
  | { kind: "modsRemoved"; count: number; titles: string[] }
  | { kind: "memory"; from: number; to: number }
  | { kind: "java"; from: number | null; to: number | null }
  | { kind: "loader"; from: string | null; to: string | null }
  | { kind: "minecraft"; from: string; to: string }
  | { kind: "optimizedJvm"; to: boolean };

export interface MeasuredSession {
  id: string;
  endedAt: string;
  durationSec: number;
  crashed: boolean;
  config?: ISessionConfig;
  resources: ISessionResources;
  changes: SetupChange[];
}

export type MemoryAdvice =
  | { kind: "tight"; peakMb: number; xmxMb: number; suggestMb: number; sessions: number }
  | { kind: "tightMax"; peakMb: number; xmxMb: number; sessions: number }
  | { kind: "excess"; peakMb: number; xmxMb: number; suggestMb: number; sessions: number }
  | { kind: "ok"; peakMb: number; xmxMb: number; sessions: number }
  | { kind: "pauses"; long: number; sessions: number };

const TITLES_SHOWN = 12;
const RELIABLE_SESSION_SEC = 120;

function hasMeasurements(resources: ISessionResources | undefined): resources is ISessionResources {
  return !!resources && Object.keys(resources).length > 0;
}

function scalarChanges(previous: ISessionConfig, current: ISessionConfig): SetupChange[] {
  const changes: SetupChange[] = [];
  if (previous.minecraft !== current.minecraft) {
    changes.push({ kind: "minecraft", from: previous.minecraft, to: current.minecraft });
  }
  if ((previous.loaderVersion ?? null) !== (current.loaderVersion ?? null) && previous.minecraft === current.minecraft) {
    changes.push({ kind: "loader", from: previous.loaderVersion ?? null, to: current.loaderVersion ?? null });
  }
  if (previous.xmxMb !== current.xmxMb) {
    changes.push({ kind: "memory", from: previous.xmxMb, to: current.xmxMb });
  }
  if ((previous.javaMajor ?? null) !== (current.javaMajor ?? null)) {
    changes.push({ kind: "java", from: previous.javaMajor ?? null, to: current.javaMajor ?? null });
  }
  if (previous.optimizedJvm !== current.optimizedJvm) {
    changes.push({ kind: "optimizedJvm", to: current.optimizedJvm });
  }
  return changes;
}

export function measuredSessions(sessions: IVersionSession[], limit = 30): MeasuredSession[] {
  const result: MeasuredSession[] = [];
  let baseline: ISessionConfig | undefined;
  let added: string[] = [];
  let removed: string[] = [];
  let addedCount = 0;
  let removedCount = 0;

  for (const session of sessions) {
    const config = session.config;
    if (config) {
      addedCount += config.modsAddedCount ?? 0;
      removedCount += config.modsRemovedCount ?? 0;
      added.push(...(config.modsAdded ?? []));
      removed.push(...(config.modsRemoved ?? []));
    }
    if (!hasMeasurements(session.resources)) continue;

    const changes: SetupChange[] = [];
    if (result.length > 0) {
      if (addedCount > 0) {
        changes.push({ kind: "modsAdded", count: addedCount, titles: [...new Set(added)].slice(0, TITLES_SHOWN) });
      }
      if (removedCount > 0) {
        changes.push({ kind: "modsRemoved", count: removedCount, titles: [...new Set(removed)].slice(0, TITLES_SHOWN) });
      }
      if (baseline && config) changes.push(...scalarChanges(baseline, config));
    }

    result.push({
      id: session.id,
      endedAt: session.endedAt,
      durationSec: session.durationSec,
      crashed: session.crashed,
      config,
      resources: session.resources,
      changes,
    });

    baseline = config ?? baseline;
    added = [];
    removed = [];
    addedCount = 0;
    removedCount = 0;
  }

  return result.slice(-limit);
}

function roundUpTo512(mb: number): number {
  return Math.ceil(mb / 512) * 512;
}

export function usageAdvice(measured: MeasuredSession[], totalMb = 0): MemoryAdvice | null {
  const latest = measured.at(-1);
  const xmxMb = latest?.config?.xmxMb;
  if (!latest || !xmxMb) return null;

  const sameSetup = measured.filter(
    (session) => session.config?.xmxMb === xmxMb && session.resources.heapPeakMb !== undefined,
  );
  const reliable = sameSetup.filter((session) => session.durationSec >= RELIABLE_SESSION_SEC);
  const recent = (reliable.length > 0 ? reliable : sameSetup).slice(-5);
  if (recent.length === 0) return null;

  const capacityMb = Math.max(xmxMb, ...recent.map((session) => session.resources.heapCapacityMb ?? 0));
  const peakMb = Math.max(...recent.map((session) => session.resources.heapPeakMb ?? 0));

  if (peakMb >= capacityMb * 0.9) {
    const wanted = roundUpTo512(Math.max(xmxMb + 1024, peakMb * 1.4));
    const suggestMb = totalMb ? Math.min(wanted, maxMemoryMb(totalMb)) : wanted;
    if (suggestMb <= xmxMb) return { kind: "tightMax", peakMb, xmxMb, sessions: recent.length };
    return { kind: "tight", peakMb, xmxMb, suggestMb: roundToStep(suggestMb), sessions: recent.length };
  }

  const longPauses = recent.map((session) => session.resources.pauses?.long ?? 0);
  if (!latest.config?.optimizedJvm && longPauses.filter((count) => count >= 3).length >= Math.ceil(recent.length / 2)) {
    return { kind: "pauses", long: Math.max(...longPauses), sessions: recent.length };
  }

  const suggestMb = Math.max(2048, roundUpTo512(peakMb * 1.7));
  if (recent.length >= 2 && xmxMb >= 4096 && peakMb <= xmxMb * 0.4 && suggestMb <= xmxMb - 1024) {
    return { kind: "excess", peakMb, xmxMb, suggestMb, sessions: recent.length };
  }

  return { kind: "ok", peakMb, xmxMb, sessions: recent.length };
}

export function delta(
  current: number | undefined,
  previous: number | undefined,
): number | null {
  if (current === undefined || previous === undefined) return null;
  return current - previous;
}
