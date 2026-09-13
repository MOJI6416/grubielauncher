import { useCallback, useEffect, useState } from "react";
import type { Loader } from "@/types/Loader";
import type { LoaderVersion } from "@/types/VersionsService";
import {
  LoaderRequirementsScan,
  isModdedLoader,
} from "@/shared/loaderCompat";

const api = window.api;

export function useLoaderCatalog(
  loader: Loader | undefined,
  minecraftVersion: string | undefined,
) {
  const [versions, setVersions] = useState<LoaderVersion[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isModdedLoader(loader) || !minecraftVersion) {
      setVersions(null);
      setFailed(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setFailed(false);

    api.versions
      .getLoaderVersions(loader, minecraftVersion)
      .then((list) => {
        if (cancelled) return;
        setVersions(list ?? null);
        setFailed(!list);
      })
      .catch(() => {
        if (cancelled) return;
        setVersions(null);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loader, minecraftVersion, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return { versions, isLoading, failed, reload };
}

export function useLoaderRequirements(
  versionPath: string | undefined,
  loader: Loader | undefined,
  enabled: boolean,
  revision: number,
) {
  const key = versionPath && loader ? `${versionPath}|${loader}` : "";
  const [result, setResult] = useState<{
    key: string;
    scan: LoaderRequirementsScan | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !versionPath || !isModdedLoader(loader)) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    api.version
      .loaderRequirements(versionPath, loader)
      .then((scan) => {
        if (!cancelled) setResult({ key, scan });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, scan: null });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, key, revision]);

  return {
    scan: result?.key === key ? result.scan : null,
    isLoading,
  };
}
