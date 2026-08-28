import { Dispatch, useCallback, useEffect, useRef, useState } from "react";
import type { Loader } from "@/types/Loader";
import {
  canLoadLoaderData,
  type ConnectivityState,
} from "@renderer/utilities/connectivity";
import type { NewInstanceAction, NewInstanceState } from "./state";

const api = window.api;

export interface VersionCatalogState {
  isLoadingVersions: boolean;
  isLoadingLoaderVersions: boolean;
  versionsFailed: boolean;
  loaderVersionsFailed: boolean;
  reload: () => void;
}

export function useVersionCatalog(
  state: NewInstanceState,
  dispatch: Dispatch<NewInstanceAction>,
  connectivity: ConnectivityState,
  enabled: boolean,
): VersionCatalogState {
  const [isLoadingVersions, setLoadingVersions] = useState(false);
  const [isLoadingLoaderVersions, setLoadingLoaderVersions] = useState(false);
  const [versionsFailed, setVersionsFailed] = useState(false);
  const [loaderVersionsFailed, setLoaderVersionsFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const versionRequestRef = useRef(0);
  const loaderRequestRef = useRef(0);

  const loader: Loader = state.loader;
  const canLoad = canLoadLoaderData(loader, connectivity);
  const selectedVersionId = state.minecraftVersion?.id;
  const hasVersions = state.versions.length > 0;
  const hasLoaderVersions = state.loaderVersions.length > 0;

  useEffect(() => {
    if (!enabled || !canLoad || hasVersions) {
      setLoadingVersions(false);
      return;
    }

    const requestId = ++versionRequestRef.current;
    setLoadingVersions(true);
    setVersionsFailed(false);

    void api.versions
      .getList(loader, state.showSnapshots)
      .then((list) => {
        if (requestId !== versionRequestRef.current) return;

        setVersionsFailed(!list || list.length === 0);
        dispatch({ type: "versionsLoaded", versions: list ?? [] });
      })
      .catch(() => {
        if (requestId !== versionRequestRef.current) return;
        setVersionsFailed(true);
      })
      .finally(() => {
        if (requestId !== versionRequestRef.current) return;
        setLoadingVersions(false);
      });

    return () => {
      versionRequestRef.current += 1;
    };
  }, [
    attempt,
    canLoad,
    dispatch,
    enabled,
    hasVersions,
    loader,
    state.showSnapshots,
  ]);

  useEffect(() => {
    if (
      !enabled ||
      !canLoad ||
      loader === "vanilla" ||
      !selectedVersionId ||
      hasLoaderVersions
    ) {
      setLoadingLoaderVersions(false);
      return;
    }

    const requestId = ++loaderRequestRef.current;
    setLoadingLoaderVersions(true);
    setLoaderVersionsFailed(false);

    void api.versions
      .getLoaderVersions(loader, selectedVersionId)
      .then((list) => {
        if (requestId !== loaderRequestRef.current) return;

        setLoaderVersionsFailed(!list || list.length === 0);
        dispatch({ type: "loaderVersionsLoaded", versions: list ?? [] });
      })
      .catch(() => {
        if (requestId !== loaderRequestRef.current) return;
        setLoaderVersionsFailed(true);
      })
      .finally(() => {
        if (requestId !== loaderRequestRef.current) return;
        setLoadingLoaderVersions(false);
      });

    return () => {
      loaderRequestRef.current += 1;
    };
  }, [
    attempt,
    canLoad,
    dispatch,
    enabled,
    hasLoaderVersions,
    loader,
    selectedVersionId,
  ]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    isLoadingVersions,
    isLoadingLoaderVersions,
    versionsFailed,
    loaderVersionsFailed,
    reload,
  };
}
