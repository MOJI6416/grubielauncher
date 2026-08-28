import { useEffect } from "react";
import { atom, useSetAtom } from "jotai";
import { selectAtom } from "jotai/utils";
import { IVersionStatistics } from "@/types/VersionStatistics";
import { Version } from "@renderer/classes/Version";
import { consolesAtom } from "@renderer/stores/atoms";
import { InstanceFlags, instanceFlagsAtom } from "./atoms";
import { resolveLastLaunch } from "./contentCounts";
import { useInstanceDataRevision } from "./instanceRevision";
import { instanceKey } from "./selectors";

const api = window.api;

export interface RunningSession {
  versionName: string;
  instance: number;
  startTime: number;
}

export const instanceStatsAtom = atom<Record<string, IVersionStatistics>>({});

export const instancePlaytimeAtom = selectAtom(
  instanceStatsAtom,
  (stats): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(stats)) {
      result[key] = value.playTime || 0;
    }
    return result;
  },
);

export const instanceLastLaunchAtom = selectAtom(
  instanceStatsAtom,
  (stats): Record<string, number> => {
    const result: Record<string, number> = {};

    for (const [key, value] of Object.entries(stats)) {
      const launched = resolveLastLaunch(
        value.lastLaunched,
        null,
        value.launches,
      );
      if (launched) result[key] = launched.getTime();
    }

    return result;
  },
);

function sameSessions(a: RunningSession[], b: RunningSession[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (session, index) =>
      session.versionName === b[index].versionName &&
      session.instance === b[index].instance &&
      session.startTime === b[index].startTime,
  );
}

export const runningSessionsAtom = selectAtom(
  consolesAtom,
  (state): RunningSession[] =>
    state.consoles
      .filter((console) => console.status === "running")
      .map(({ versionName, instance, startTime }) => ({
        versionName,
        instance,
        startTime,
      })),
  sameSessions,
);

async function readInstanceEntry(
  instance: Version,
): Promise<{
  key: string;
  statistics: IVersionStatistics | null;
  hasServer: boolean;
  hasSaves: boolean;
}> {
  const key = instanceKey(instance);

  try {
    const [statisticsPath, serverPath, savesPath] = await Promise.all([
      api.path.join(instance.versionPath, "statistics.json"),
      api.path.join(instance.versionPath, "server"),
      api.path.join(instance.versionPath, "saves"),
    ]);

    const [hasStatistics, hasServer, hasSaves] = await Promise.all([
      api.fs.pathExists(statisticsPath),
      api.fs.pathExists(serverPath),
      api.fs.pathExists(savesPath),
    ]);

    const statistics = hasStatistics
      ? await api.fs.readJSON<IVersionStatistics>(statisticsPath, "utf-8")
      : null;

    return { key, statistics: statistics ?? null, hasServer, hasSaves };
  } catch {
    return { key, statistics: null, hasServer: false, hasSaves: false };
  }
}

export function useInstanceStatsSync(instances: Version[]): void {
  const setStats = useSetAtom(instanceStatsAtom);
  const setFlags = useSetAtom(instanceFlagsAtom);
  const revision = useInstanceDataRevision();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const entries = await Promise.all(instances.map(readInstanceEntry));
      if (cancelled) return;

      const stats: Record<string, IVersionStatistics> = {};
      const flags: Record<string, InstanceFlags> = {};

      for (const entry of entries) {
        if (entry.statistics) stats[entry.key] = entry.statistics;
        flags[entry.key] = {
          hasStatistics: !!entry.statistics,
          hasServer: entry.hasServer,
          hasSaves: entry.hasSaves,
        };
      }

      setStats(stats);
      setFlags(flags);
    })();

    return () => {
      cancelled = true;
    };
  }, [instances, revision, setFlags, setStats]);
}
