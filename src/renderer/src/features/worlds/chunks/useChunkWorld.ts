import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IChunkDimension,
  IChunkRegionScan,
  OVERWORLD_ID,
} from "@/types/WorldChunks";
import {
  ChunkWorldState,
  applyRegionScan,
  parseRegionKey,
  removeRegion,
  stateFromRegions,
  summarizeWorld,
} from "./chunkModel";

const api = window.api;

const SCAN_CONCURRENCY = 2;

export type LoadStatus = "loading" | "ready" | "error";

export interface ScanProgress {
  done: number;
  total: number;
  running: boolean;
}

function pickDimension(
  dimensions: IChunkDimension[],
  current: string | null,
): string | null {
  if (current && dimensions.some((dimension) => dimension.id === current)) {
    return current;
  }
  const overworld = dimensions.find(
    (dimension) => dimension.id === OVERWORLD_ID,
  );
  return overworld?.id ?? dimensions[0]?.id ?? null;
}

export function useChunkWorld(worldPath: string) {
  const [dimensions, setDimensions] = useState<IChunkDimension[]>([]);
  const [dimensionsStatus, setDimensionsStatus] =
    useState<LoadStatus>("loading");
  const [dimension, setDimensionState] = useState<string | null>(null);
  const [state, setState] = useState<ChunkWorldState>(() => new Map());
  const [regionsStatus, setRegionsStatus] = useState<LoadStatus>("loading");
  const [progress, setProgress] = useState<ScanProgress>({
    done: 0,
    total: 0,
    running: false,
  });
  const [revision, setRevision] = useState(0);

  const mounted = useRef(true);
  const scanToken = useRef(0);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      scanToken.current += 1;
    };
  }, []);

  const loadDimensions = useCallback(async () => {
    try {
      const list = await api.worldChunks.dimensions(worldPath);
      if (!mounted.current) return;

      setDimensions(list ?? []);
      setDimensionState((current) => pickDimension(list ?? [], current));
      setDimensionsStatus("ready");
    } catch (error) {
      console.error(error);
      if (!mounted.current) return;
      setDimensionsStatus("error");
    }
  }, [worldPath]);

  useEffect(() => {
    setDimensionsStatus("loading");
    void loadDimensions();
  }, [loadDimensions]);

  const scanRegions = useCallback(
    async (keys: string[], token: number) => {
      if (keys.length === 0 || !dimension) return;

      const queue = [...keys];
      let finished = 0;

      setProgress({ done: 0, total: queue.length, running: true });

      const worker = async () => {
        while (queue.length > 0 && scanToken.current === token) {
          const key = queue.shift();
          if (!key) break;

          const { x, z } = parseRegionKey(key);
          let scan: IChunkRegionScan | null = null;
          try {
            scan = await api.worldChunks.scanRegion(worldPath, dimension, x, z);
          } catch (error) {
            console.error(error);
          }

          if (scanToken.current !== token || !mounted.current) return;

          setState((previous) =>
            scan
              ? applyRegionScan(previous, scan)
              : removeRegion(previous, key),
          );
          finished += 1;
          setProgress({ done: finished, total: keys.length, running: true });
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(SCAN_CONCURRENCY, queue.length) },
          worker,
        ),
      );

      if (scanToken.current === token && mounted.current) {
        setProgress({ done: finished, total: keys.length, running: false });
      }
    },
    [dimension, worldPath],
  );

  useEffect(() => {
    if (!dimension) return;

    const token = ++scanToken.current;
    setRegionsStatus("loading");
    setState(new Map());
    setProgress({ done: 0, total: 0, running: false });

    (async () => {
      try {
        const regions = await api.worldChunks.regions(worldPath, dimension);
        if (scanToken.current !== token || !mounted.current) return;

        const next = stateFromRegions(regions ?? []);
        setState(next);
        setRegionsStatus("ready");

        const keys = [...next.values()]
          .sort(
            (a, b) =>
              Math.abs(a.x) + Math.abs(a.z) - (Math.abs(b.x) + Math.abs(b.z)),
          )
          .map((region) => region.key);
        await scanRegions(keys, token);
      } catch (error) {
        console.error(error);
        if (scanToken.current !== token || !mounted.current) return;
        setRegionsStatus("error");
      }
    })();
  }, [dimension, scanRegions, worldPath, revision]);

  const setDimension = useCallback((next: string) => {
    setDimensionState(next);
  }, []);

  const reload = useCallback(() => {
    setRevision((value) => value + 1);
    void loadDimensions();
  }, [loadDimensions]);

  /** Refreshes the given regions after an edit, dropping the ones that vanished. */
  const rescan = useCallback(
    async (keys: string[]) => {
      const token = scanToken.current;
      await scanRegions(keys, token);
      void loadDimensions();
    },
    [loadDimensions, scanRegions],
  );

  const totals = useMemo(() => summarizeWorld(state), [state]);
  const currentDimension =
    dimensions.find((entry) => entry.id === dimension) ?? null;

  return {
    dimensions,
    dimensionsStatus,
    dimension,
    currentDimension,
    setDimension,
    state,
    regionsStatus,
    progress,
    totals,
    reload,
    rescan,
  };
}
