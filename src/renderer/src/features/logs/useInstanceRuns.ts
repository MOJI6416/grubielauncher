import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { IGameLogFile } from "@/types/GameLog";
import { IVersionSession } from "@/types/VersionStatistics";
import { Version } from "@renderer/classes/Version";
import { consolesAtom } from "@renderer/stores/atoms";
import { LogRun, buildRuns } from "./runs";

const api = window.api;

export interface InstanceRuns {
  runs: LogRun[];
  loading: boolean;
  revision: number;
  reload: () => void;
}

export function useInstanceRuns(version: Version | undefined): InstanceRuns {
  const consoles = useAtomValue(consolesAtom);
  const [files, setFiles] = useState<IGameLogFile[]>([]);
  const [sessions, setSessions] = useState<IVersionSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const settledRef = useRef("");

  const versionPath = version?.versionPath;
  const versionName = version?.version.name;

  const live = useMemo(
    () =>
      consoles.consoles
        .filter((entry) => entry.versionName === versionName)
        .map((entry) => ({
          instance: entry.instance,
          status: entry.status,
          startTime: entry.startTime,
        })),
    [consoles.consoles, versionName],
  );

  const liveSignature = live
    .map((entry) => `${entry.instance}:${entry.status}`)
    .join(",");

  useEffect(() => {
    if (!versionPath) {
      setFiles([]);
      setSessions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      const [logFiles, stored] = await Promise.all([
        api.logs.list(versionPath).catch(() => [] as IGameLogFile[]),
        (async () => {
          try {
            const file = api.path.join(versionPath, "sessions.json");
            if (!(await api.fs.pathExists(file))) return [];
            const loaded = await api.fs.readJSON<IVersionSession[]>(file, "utf-8");
            return Array.isArray(loaded) ? loaded : [];
          } catch {
            return [];
          }
        })(),
      ]);

      if (cancelled) return;
      setFiles(logFiles);
      setSessions(stored);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [versionPath, nonce, liveSignature]);

  useEffect(() => {
    if (settledRef.current === liveSignature) return;
    settledRef.current = liveSignature;
    if (liveSignature.includes("running")) return;

    const timer = setTimeout(() => setNonce((value) => value + 1), 2500);
    return () => clearTimeout(timer);
  }, [liveSignature]);

  const runs = useMemo(
    () => buildRuns({ live, sessions, files }),
    [live, sessions, files],
  );

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { runs, loading, revision: nonce, reload };
}
