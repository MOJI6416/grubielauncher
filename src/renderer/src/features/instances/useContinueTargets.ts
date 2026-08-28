import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { IWorld } from "@/types/World";
import { IServer } from "@/types/ServersList";
import { Version } from "@renderer/classes/Version";
import { accountAtom } from "@renderer/stores/atoms";
import { accountIdentity } from "@renderer/features/accounts/identity";
import {
  ContinueSource,
  readContinueCache,
  writeContinueCache,
} from "./continueCache";
import {
  ContinueTarget,
  buildContinueTargets,
  continueCacheKey,
} from "./continueTargets";
import { useInstanceDataRevision } from "./instanceRevision";

const api = window.api;

const MAX_WORLD_FOLDERS = 40;
const READ_CONCURRENCY = 4;

export type ContinueStatus = "loading" | "ready";

async function readWorlds(
  instance: Version,
  account: Parameters<typeof api.worlds.readWorld>[1],
): Promise<{ worlds: IWorld[]; total: number; hasSaves: boolean }> {
  const savesPath = await api.path.join(instance.versionPath, "saves");
  if (!(await api.fs.pathExists(savesPath))) {
    return { worlds: [], total: 0, hasSaves: false };
  }

  const all = (await api.fs.getDirectories(savesPath)).filter(
    (folder) => !folder.startsWith("."),
  );
  const folders = all.slice(0, MAX_WORLD_FOLDERS);
  const results: (IWorld | null)[] = new Array(folders.length).fill(null);
  let cursor = 0;

  await Promise.all(
    Array.from(
      { length: Math.min(READ_CONCURRENCY, folders.length) },
      async () => {
        while (cursor < folders.length) {
          const index = cursor++;
          const worldPath = await api.path.join(savesPath, folders[index]);
          results[index] = await api.worlds.readWorld(worldPath, account);
        }
      },
    ),
  );

  const worlds = results.filter((world): world is IWorld => world !== null);
  const counted = await api.worlds.count(instance.versionPath);

  return {
    worlds,
    total: counted ?? worlds.length + (all.length - folders.length),
    hasSaves: true,
  };
}

async function readServers(instance: Version): Promise<IServer[]> {
  const serversPath = await api.path.join(instance.versionPath, "servers.dat");
  if (!(await api.fs.pathExists(serversPath))) return [];

  try {
    return (await api.servers.read(serversPath)) ?? [];
  } catch {
    return [];
  }
}

export function useContinueTargets(
  instance: Version | undefined,
  limit = 3,
): {
  status: ContinueStatus;
  targets: ContinueTarget[];
  total: number;
  worlds: number;
  hasSaves: boolean;
  servers: number;
} {
  const account = useAtomValue(accountAtom);
  const revision = useInstanceDataRevision();
  const [source, setSource] = useState<ContinueSource | null>(null);
  const [status, setStatus] = useState<ContinueStatus>("loading");
  const versionPath = instance?.versionPath ?? "";

  useEffect(() => {
    if (!versionPath || !instance || !account) {
      setSource(null);
      setStatus("ready");
      return;
    }

    const key = continueCacheKey(accountIdentity(account), versionPath);
    const cached = readContinueCache(key);
    if (cached) {
      setSource(cached);
      setStatus("ready");
      return;
    }

    let cancelled = false;
    setSource(null);
    setStatus("loading");

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const [saves, servers] = await Promise.all([
            readWorlds(instance, account).catch(() => ({
              worlds: [],
              total: 0,
              hasSaves: false,
            })),
            readServers(instance),
          ]);

          const next = {
            worlds: saves.worlds,
            worldCount: saves.total,
            hasSaves: saves.hasSaves,
            servers,
          };
          writeContinueCache(key, next);

          if (cancelled) return;
          setSource(next);
        } catch {
          if (!cancelled) {
            setSource({
              worlds: [],
              worldCount: 0,
              hasSaves: false,
              servers: [],
            });
          }
        } finally {
          if (!cancelled) setStatus("ready");
        }
      })();
    }, 160);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [versionPath, instance, account, revision]);

  const targets = buildContinueTargets({
    worlds: source?.worlds,
    servers: source?.servers,
    quickServer: instance?.version.quickServer,
    limit,
  });

  const worlds = source?.worldCount ?? 0;
  const servers = source?.servers.length ?? 0;

  return {
    status,
    targets,
    total: worlds + servers,
    worlds,
    hasSaves: source?.hasSaves === true,
    servers,
  };
}
