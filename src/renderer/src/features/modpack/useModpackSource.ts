import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IVersionConf } from "@/types/IVersion";
import type {
  ModpackBase,
  ModpackRollbackInfo,
} from "@/types/ModpackSource";
import { Version } from "@renderer/classes/Version";
import { instanceKey } from "@renderer/features/instances/selectors";
import {
  loadModpackCatalog,
  recordModpackUpdate,
  type ModpackCatalog,
} from "./modpackCatalog";
import {
  findModpackUpdate,
  installedModpackVersion,
  modpackVersionLabel,
} from "./modpackVersions";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";

const api = window.api;

export function canFollowModpack(conf: IVersionConf): boolean {
  return !!conf.modpack && !conf.downloadedVersion;
}

export function canUpdateFromArchive(
  conf: IVersionConf,
  hasBase: boolean | null,
): boolean {
  return !conf.modpack && !conf.downloadedVersion && hasBase === true;
}

async function hasModpackBase(versionPath: string): Promise<boolean> {
  const target = await api.path.join(
    versionPath,
    "storage",
    "modpack",
    "base.json",
  );
  return (await api.fs.pathExists(target).catch(ignoreFailure)) === true;
}

export function useModpackSource(instance: Version | undefined, isOnline: boolean) {
  const source = instance?.version.modpack;
  const loader = instance?.version.loader.name;
  const gameVersion = instance?.version.version.id ?? "";
  const versionPath = instance?.versionPath;

  const [catalog, setCatalog] = useState<ModpackCatalog | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [base, setBase] = useState<ModpackBase | null | undefined>(undefined);
  const [rollback, setRollback] = useState<ModpackRollbackInfo | null>(null);
  const [revision, setRevision] = useState(0);
  const forceRef = useRef(false);

  useEffect(() => {
    if (!versionPath) return;
    let cancelled = false;

    void (async () => {
      const [nextBase, info] = await Promise.all([
        api.modpack
          .readBase(versionPath)
          .catch(ignoreFailure)
          .then((value) => value ?? null),
        api.modpack
          .rollbackInfo(versionPath)
          .catch(ignoreFailure)
          .then((info) => info ?? null),
      ]);
      if (cancelled) return;
      setBase(nextBase);
      setRollback(info);
    })();

    return () => {
      cancelled = true;
    };
  }, [versionPath, revision]);

  useEffect(() => {
    if (!source || !loader || !isOnline) return;
    let cancelled = false;

    const force = forceRef.current;
    forceRef.current = false;

    setIsLoading(true);
    void loadModpackCatalog(source, loader, force)
      .then((next) => {
        if (!cancelled) setCatalog(next);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [source?.provider, source?.projectId, loader, isOnline, revision]);

  const hasBase = base === undefined ? null : base !== null;

  const update = useMemo(
    () =>
      source && catalog && hasBase && instance && canFollowModpack(instance.version)
        ? findModpackUpdate(
            catalog.versions,
            installedModpackVersion(source),
            gameVersion,
          )
        : null,
    [catalog, gameVersion, hasBase, instance, source],
  );

  useEffect(() => {
    if (!instance || !catalog) return;
    recordModpackUpdate(
      instanceKey(instance),
      update ? modpackVersionLabel(update) : null,
    );
  }, [catalog, instance, update]);

  const reload = useCallback((refetch = false) => {
    forceRef.current = refetch;
    setRevision((value) => value + 1);
  }, []);

  return {
    source,
    project: catalog?.project ?? null,
    versions: catalog?.versions ?? [],
    failed: !isOnline || catalog?.failed === true,
    isLoading,
    hasBase,
    base: base ?? null,
    rollback,
    update,
    reload,
  };
}

export type ModpackSourceState = ReturnType<typeof useModpackSource>;

export function useModpackUpdateCheck(instances: Version[], isOnline: boolean) {
  const linked = useMemo(
    () => instances.filter((instance) => canFollowModpack(instance.version)),
    [instances],
  );

  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;

    void (async () => {
      for (const instance of linked) {
        if (cancelled) return;

        const source = instance.version.modpack;
        if (!source) continue;

        const [base, catalog] = await Promise.all([
          hasModpackBase(instance.versionPath),
          loadModpackCatalog(source, instance.version.loader.name),
        ]);
        if (cancelled) return;

        const update = base
          ? findModpackUpdate(
              catalog.versions,
              installedModpackVersion(source),
              instance.version.version.id,
            )
          : null;
        recordModpackUpdate(
          instanceKey(instance),
          update ? modpackVersionLabel(update) : null,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [linked, isOnline]);
}
