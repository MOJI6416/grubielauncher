import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { IWorld } from "@/types/World";
import { ILocalProject, ProjectType } from "@/types/ModManager";
import { Version } from "@renderer/classes/Version";
import { accountAtom } from "@renderer/stores/atoms";
import { useInstanceDataRevision } from "@renderer/features/instances/instanceRevision";

const api = window.api;

const READ_WORLD_CONCURRENCY = 4;

export type WorldsStatus = "loading" | "ready" | "error";

export interface DatapackOption {
  mod: ILocalProject;
  file: NonNullable<ILocalProject["version"]>["files"][number];
  path: string;
  filename: string;
}

export function useWorldsData(version: Version | undefined) {
  const account = useAtomValue(accountAtom);
  const revision = useInstanceDataRevision();
  const [worlds, setWorlds] = useState<IWorld[]>([]);
  const [status, setStatus] = useState<WorldsStatus>("loading");
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [backups, setBackups] = useState<Record<string, number>>({});

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const loadCounters = useCallback(async () => {
    if (!version) return;

    const [nextSizes, nextBackups] = await Promise.all([
      api.worlds.folderSizes(version.versionPath).catch(() => ({})),
      api.worlds.countBackups(version.versionPath).catch(() => ({})),
    ]);

    if (!mounted.current) return;

    setSizes(nextSizes ?? {});
    setBackups(nextBackups ?? {});
  }, [version]);

  const load = useCallback(async (quiet = false) => {
    if (!version || !account) {
      setWorlds([]);
      setStatus("ready");
      return;
    }

    if (!quiet) setStatus("loading");

    try {
      const savesPath = await api.path.join(version.versionPath, "saves");

      if (!(await api.fs.pathExists(savesPath))) {
        if (!mounted.current) return;
        setWorlds([]);
        setStatus("ready");
        return;
      }

      const folders = await api.fs.getDirectories(savesPath);
      const results: (IWorld | null)[] = new Array(folders.length).fill(null);
      let cursor = 0;

      await Promise.all(
        Array.from(
          { length: Math.min(READ_WORLD_CONCURRENCY, folders.length) },
          async () => {
            while (cursor < folders.length) {
              const index = cursor++;
              const worldPath = await api.path.join(savesPath, folders[index]);
              results[index] = await api.worlds.readWorld(worldPath, account);
            }
          },
        ),
      );

      if (!mounted.current) return;

      setWorlds(results.filter(Boolean) as IWorld[]);
      setStatus("ready");
    } catch (error) {
      console.error(error);
      if (!mounted.current) return;
      setStatus("error");
    }
  }, [version, account]);

  useEffect(() => {
    void load();
  }, [load]);

  const seenRevision = useRef(revision);

  useEffect(() => {
    if (seenRevision.current === revision) return;
    seenRevision.current = revision;
    void load(true);
  }, [load, revision]);

  const folderKey = worlds.map((world) => world.folderName).join("\u0000");

  useEffect(() => {
    void loadCounters();
  }, [loadCounters, folderKey]);

  const refreshWorld = useCallback(
    async (worldPath: string) => {
      if (!account) return;

      const refreshed = await api.worlds.readWorld(worldPath, account);
      if (!refreshed || !mounted.current) return;

      setWorlds((previous) =>
        previous.map((entry) =>
          entry.path === worldPath ? refreshed : entry,
        ),
      );
    },
    [account],
  );

  return {
    worlds,
    setWorlds,
    status,
    sizes,
    backups,
    reload: load,
    reloadCounters: loadCounters,
    refreshWorld,
  };
}

export function useDatapackOptions(
  version: Version | undefined,
  mods?: ILocalProject[],
) {
  const [options, setOptions] = useState<DatapackOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!version) {
        setOptions([]);
        return;
      }

      try {
        const candidates = (
          mods ??
          version.version.loader.mods ??
          []
        ).filter((entry) => entry.projectType === ProjectType.DATAPACK);

        const folderPath = await api.path.join(
          version.versionPath,
          await api.modManager.ptToFolder(ProjectType.DATAPACK),
        );

        const list: DatapackOption[] = [];
        const seen = new Set<string>();

        for (const mod of candidates) {
          for (const file of mod.version?.files ?? []) {
            const filename = file.filename;
            if (!filename || seen.has(filename)) continue;

            seen.add(filename);

            const storagePath = await api.path.join(folderPath, filename);
            const hasStorage = await api.fs.pathExists(storagePath);
            const localPath =
              file.localPath && (await api.fs.pathExists(file.localPath))
                ? file.localPath
                : undefined;

            list.push({
              mod,
              file,
              filename,
              path: hasStorage ? storagePath : localPath || storagePath,
            });
          }
        }

        if (!cancelled) setOptions(list);
      } catch (error) {
        console.error(error);
        if (!cancelled) setOptions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [version, mods]);

  return options;
}
