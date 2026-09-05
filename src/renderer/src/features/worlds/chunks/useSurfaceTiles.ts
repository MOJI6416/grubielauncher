import { useCallback, useEffect, useRef, useState } from "react";
import { parseRegionKey } from "./chunkModel";

const api = window.api;

const CONCURRENCY = 2;
/** Full-size region images kept in memory; older ones are re-fetched on demand. */
const MAX_TILES = 192;

export type SurfaceTiles = ReadonlyMap<string, ImageBitmap>;

interface Store {
  tiles: Map<string, ImageBitmap>;
  loading: Set<string>;
  failed: Set<string>;
  queue: string[];
  generation: number;
}

function emptyStore(): Store {
  return {
    tiles: new Map(),
    loading: new Set(),
    failed: new Set(),
    queue: [],
    generation: 0,
  };
}

function disposeTiles(tiles: Map<string, ImageBitmap>): void {
  for (const bitmap of tiles.values()) bitmap.close();
  tiles.clear();
}

async function decodePng(bytes: Uint8Array): Promise<ImageBitmap> {
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy], { type: "image/png" });
  return createImageBitmap(blob);
}

/**
 * Loads satellite images for regions on demand and keeps them as bitmaps.
 * `version` changes whenever a tile arrives or goes away, so consumers can
 * redraw without diffing the map itself.
 */
export function useSurfaceTiles(
  worldPath: string,
  dimension: string | null,
  enabled: boolean,
) {
  const storeRef = useRef<Store>(emptyStore());
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      storeRef.current.generation += 1;
      disposeTiles(storeRef.current.tiles);
    };
  }, []);

  useEffect(() => {
    const store = storeRef.current;
    store.generation += 1;
    disposeTiles(store.tiles);
    store.loading.clear();
    store.failed.clear();
    store.queue = [];
    setPending(0);
    setVersion((value) => value + 1);
  }, [worldPath, dimension]);

  const pump = useCallback(() => {
    const store = storeRef.current;
    if (!dimension || !enabled) return;

    while (store.loading.size < CONCURRENCY && store.queue.length > 0) {
      const key = store.queue.shift();
      if (!key || store.tiles.has(key) || store.loading.has(key)) continue;

      const generation = store.generation;
      const { x, z } = parseRegionKey(key);
      store.loading.add(key);

      api.worldChunks
        .renderSurface(worldPath, dimension, x, z)
        .then(async (bytes) => {
          if (!bytes) throw new Error("no surface");
          const bitmap = await decodePng(bytes);
          if (store.generation !== generation || !mounted.current) {
            bitmap.close();
            return;
          }

          if (store.tiles.size >= MAX_TILES) {
            const oldest = store.tiles.keys().next().value;
            if (oldest !== undefined) {
              store.tiles.get(oldest)?.close();
              store.tiles.delete(oldest);
            }
          }
          store.tiles.set(key, bitmap);
        })
        .catch((error) => {
          if (store.generation !== generation) return;
          console.warn("Surface render failed:", key, error);
          store.failed.add(key);
        })
        .finally(() => {
          store.loading.delete(key);
          if (store.generation !== generation || !mounted.current) return;
          setPending(store.loading.size + store.queue.length);
          setVersion((value) => value + 1);
          pump();
        });
    }

    setPending(store.loading.size + store.queue.length);
  }, [dimension, enabled, worldPath]);

  /** Asks for the given regions, most recently requested first. */
  const request = useCallback(
    (keys: string[]) => {
      const store = storeRef.current;
      if (!enabled) return;

      const wanted = keys.filter(
        (key) =>
          !store.tiles.has(key) &&
          !store.loading.has(key) &&
          !store.failed.has(key),
      );
      if (wanted.length === 0) return;

      const wantedSet = new Set(wanted);
      store.queue = [
        ...wanted,
        ...store.queue.filter((key) => !wantedSet.has(key)),
      ];
      pump();
    },
    [enabled, pump],
  );

  /** Forgets the images of regions whose files changed. */
  const invalidate = useCallback(
    (keys: string[]) => {
      const store = storeRef.current;
      for (const key of keys) {
        store.tiles.get(key)?.close();
        store.tiles.delete(key);
        store.failed.delete(key);
      }
      setVersion((value) => value + 1);
      request(keys);
    },
    [request],
  );

  useEffect(() => {
    if (enabled) pump();
  }, [enabled, pump]);

  return {
    tiles: storeRef.current.tiles as SurfaceTiles,
    version,
    pending,
    request,
    invalidate,
  };
}
