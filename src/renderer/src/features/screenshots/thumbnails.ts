import { useEffect, useState } from "react";
import ThumbnailWorker from "./thumbnailWorker?worker";

const THUMB_WIDTH = 384;
const MAX_CACHED = 400;
const MAX_PARALLEL = 2;

type Pending = {
  resolve: (url: string | null) => void;
};

const cache = new Map<string, string>();
const failed = new Set<string>();
const inflight = new Map<string, Promise<string | null>>();
const waiting: (() => void)[] = [];
const callbacks = new Map<number, Pending>();

let worker: Worker | null = null;
let active = 0;
let nextId = 1;

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new ThumbnailWorker();
  worker.onmessage = (
    event: MessageEvent<{ id: number; blob?: Blob; error?: string }>,
  ) => {
    const pending = callbacks.get(event.data.id);
    if (!pending) return;
    callbacks.delete(event.data.id);
    pending.resolve(
      event.data.blob ? URL.createObjectURL(event.data.blob) : null,
    );
  };
  return worker;
}

function remember(path: string, url: string) {
  cache.set(path, url);
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    const stale = cache.get(oldest);
    cache.delete(oldest);
    if (stale) URL.revokeObjectURL(stale);
  }
}

async function slot(): Promise<() => void> {
  if (active >= MAX_PARALLEL) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active += 1;
  return () => {
    active -= 1;
    waiting.shift()?.();
  };
}

async function render(path: string): Promise<string | null> {
  const release = await slot();
  try {
    const bytes = await window.api.fs.readFileBuffer(path);
    if (!bytes) return null;

    const copy = bytes.slice().buffer;
    const id = nextId++;
    return await new Promise<string | null>((resolve) => {
      callbacks.set(id, { resolve });
      ensureWorker().postMessage({ id, bytes: copy, width: THUMB_WIDTH }, [
        copy,
      ]);
    });
  } catch (error) {
    console.warn("[screenshots] thumbnail failed", path, error);
    return null;
  } finally {
    release();
  }
}

export function loadThumbnail(path: string): Promise<string | null> {
  const known = cache.get(path);
  if (known) {
    cache.delete(path);
    cache.set(path, known);
    return Promise.resolve(known);
  }
  if (failed.has(path)) return Promise.resolve(null);

  let request = inflight.get(path);
  if (!request) {
    request = render(path)
      .then((url) => {
        if (url) remember(path, url);
        else failed.add(path);
        return url;
      })
      .finally(() => inflight.delete(path));
    inflight.set(path, request);
  }
  return request;
}

export function forgetThumbnail(path: string) {
  const url = cache.get(path);
  cache.delete(path);
  failed.delete(path);
  if (url) URL.revokeObjectURL(url);
}

export function useThumbnail(path: string): {
  url: string | null;
  failed: boolean;
} {
  const [state, setState] = useState<{
    path: string;
    url: string | null;
    failed: boolean;
  }>(() => ({ path, url: cache.get(path) ?? null, failed: false }));

  useEffect(() => {
    const known = cache.get(path);
    if (known) {
      setState({ path, url: known, failed: false });
      return;
    }

    let alive = true;
    setState({ path, url: null, failed: false });
    void loadThumbnail(path).then((url) => {
      if (alive) setState({ path, url, failed: !url });
    });
    return () => {
      alive = false;
    };
  }, [path]);

  return state.path === path
    ? { url: state.url, failed: state.failed }
    : { url: cache.get(path) ?? null, failed: false };
}
