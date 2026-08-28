import { useEffect, useState } from "react";
import type { IVersionSession } from "@/types/VersionStatistics";
import { sortScreenshots } from "./instanceOverview";
import { useInstanceDataRevision } from "./instanceRevision";

const api = window.api;

const sizeCache = new Map<string, { revision: number; size: number | null }>();

export function useInstanceDiskUsage(versionPath: string | undefined): {
  size: number | null;
  isUnknown: boolean;
} {
  const revision = useInstanceDataRevision();
  const [size, setSize] = useState<number | null>(null);
  const [isUnknown, setIsUnknown] = useState(false);

  useEffect(() => {
    if (!versionPath) {
      setSize(null);
      setIsUnknown(false);
      return;
    }

    const cached = sizeCache.get(versionPath);
    if (cached && cached.revision === revision) {
      setSize(cached.size);
      setIsUnknown(cached.size === null);
      return;
    }

    let cancelled = false;
    setSize(cached?.size ?? null);
    setIsUnknown(false);

    void (async () => {
      const total = await api.file
        .getTotalSizes([versionPath])
        .catch(() => null);
      if (cancelled) return;
      sizeCache.set(versionPath, { revision, size: total });
      setSize(total);
      setIsUnknown(total === null);
    })();

    return () => {
      cancelled = true;
    };
  }, [versionPath, revision]);

  return { size, isUnknown };
}

export interface InstanceScreenshot {
  name: string;
  path: string;
}

export function useInstanceScreenshots(
  versionPath: string | undefined,
  limit: number,
): { screenshots: InstanceScreenshot[] | null; folder: string } {
  const [screenshots, setScreenshots] = useState<InstanceScreenshot[] | null>(
    null,
  );
  const [folder, setFolder] = useState("");
  const revision = useInstanceDataRevision();

  useEffect(() => {
    if (!versionPath) {
      setScreenshots([]);
      setFolder("");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const directory = await api.path.join(versionPath, "screenshots");
        if (cancelled) return;
        setFolder(directory);

        if (!(await api.fs.pathExists(directory))) {
          if (!cancelled) setScreenshots([]);
          return;
        }

        const names = sortScreenshots(await api.fs.readdir(directory)).slice(
          0,
          limit,
        );

        const entries: InstanceScreenshot[] = [];
        for (const name of names) {
          entries.push({ name, path: await api.path.join(directory, name) });
        }

        if (!cancelled) setScreenshots(entries);
      } catch {
        if (!cancelled) setScreenshots([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [versionPath, limit, revision]);

  return { screenshots, folder };
}

export interface InstanceContents {
  worlds: number;
  hasSaves: boolean;
  hasConfigs: boolean;
  hasStatistics: boolean;
  savesUnknown: boolean;
  ready: boolean;
}

const EMPTY_CONTENTS: InstanceContents = {
  worlds: 0,
  hasSaves: false,
  hasConfigs: false,
  hasStatistics: false,
  savesUnknown: false,
  ready: false,
};

export function useInstanceContents(
  versionPath: string | undefined,
): InstanceContents {
  const [contents, setContents] = useState<InstanceContents>(EMPTY_CONTENTS);
  const revision = useInstanceDataRevision();

  useEffect(() => {
    if (!versionPath) {
      setContents(EMPTY_CONTENTS);
      return;
    }

    let cancelled = false;
    let savesFailed = false;

    void (async () => {
      const next: InstanceContents = { ...EMPTY_CONTENTS, ready: true };

      try {
        const saves = await api.path.join(versionPath, "saves");
        if (await api.fs.pathExists(saves)) {
          next.hasSaves = true;
          const counted = await api.worlds.count(versionPath);
          if (counted === null) savesFailed = true;
          else next.worlds = counted;
        }
      } catch {
        savesFailed = true;
      }

      try {
        const config = await api.path.join(versionPath, "config");
        next.hasConfigs = await api.fs.pathExists(config);
      } catch {}

      try {
        const stats = await api.path.join(versionPath, "statistics.json");
        next.hasStatistics = await api.fs.pathExists(stats);
      } catch {}

      next.savesUnknown = next.hasSaves && savesFailed;

      if (!cancelled) setContents(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [versionPath, revision]);

  return contents;
}

export function useInstanceSessions(
  versionPath: string | undefined,
): IVersionSession[] {
  const [sessions, setSessions] = useState<IVersionSession[]>([]);
  const revision = useInstanceDataRevision();

  useEffect(() => {
    if (!versionPath) {
      setSessions([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const path = await api.path.join(versionPath, "sessions.json");
        if (!(await api.fs.pathExists(path))) {
          if (!cancelled) setSessions([]);
          return;
        }

        const loaded = await api.fs.readJSON<IVersionSession[]>(path, "utf-8");

        if (!cancelled && Array.isArray(loaded)) setSessions(loaded);
      } catch {
        if (!cancelled) setSessions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [versionPath, revision]);

  return sessions;
}
