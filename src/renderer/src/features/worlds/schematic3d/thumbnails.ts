import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { ISchematicFile } from "@/types/Schematic";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { fitRange } from "./mesher";
import { prepareSchematic } from "./prepare";
import type { SchematicScene } from "./SchematicScene";
import { webglAvailable } from "./webgl";

const api = window.api;

export const THUMBNAIL_SIZE = 128;
const AUTO_MAX_BYTES = 2 * 1024 * 1024;
const THUMBNAIL_QUADS = 400_000;
const IDLE_DISPOSE_MS = 15_000;

const cache = new Map<string, string | null>();
const asked = new Set<string>();
const listeners = new Set<() => void>();
const queue: { file: ISchematicFile; versionPath: string }[] = [];
let running = false;
let scene: SchematicScene | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

export function thumbnailKey(file: ISchematicFile): string {
  return `${file.path}\0${file.size}\0${file.modifiedAt}`;
}

function notify() {
  for (const listener of listeners) listener();
}

function remember(file: ISchematicFile, url: string | null) {
  cache.set(thumbnailKey(file), url);
  notify();
}

export async function storeThumbnail(file: ISchematicFile, png: Uint8Array) {
  const saved = await api.schematics.saveThumbnail(file.path, png).catch(ignoreFailure);
  if (!saved) return;
  const blob = new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" });
  const url = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
  remember(file, url);
}

export function hasThumbnail(file: ISchematicFile): boolean {
  return !!cache.get(thumbnailKey(file));
}

async function render(file: ISchematicFile, versionPath: string): Promise<Uint8Array | null> {
  const result = await prepareSchematic(file.path, versionPath);
  if (!result.ok) return null;
  const { prepared } = result;
  if (!scene) {
    const { SchematicScene } = await import("./SchematicScene");
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    scene = new SchematicScene(canvas, { interactive: false });
  }
  scene.setAtlas(prepared.atlas.canvas);
  const layerQuads = await scene.load(prepared.grid, prepared.models);
  const range = fitRange(layerQuads, prepared.grid.yFrom, THUMBNAIL_QUADS, {
    lo: prepared.grid.yFrom,
    hi: prepared.grid.yFrom + prepared.grid.sy - 1,
  });
  await scene.setRange(range, { immediate: true });
  return scene.snapshot(THUMBNAIL_SIZE);
}

async function drain() {
  if (running) return;
  running = true;
  if (idleTimer) clearTimeout(idleTimer);
  try {
    while (queue.length) {
      const job = queue.shift()!;
      if (cache.get(thumbnailKey(job.file))) continue;
      const png = await render(job.file, job.versionPath).catch(ignoreFailure);
      if (png) await storeThumbnail(job.file, png);
      else remember(job.file, null);
    }
  } finally {
    running = false;
    idleTimer = setTimeout(() => {
      scene?.dispose();
      scene = null;
    }, IDLE_DISPOSE_MS);
  }
}

function request(file: ISchematicFile, versionPath: string) {
  const key = thumbnailKey(file);
  if (asked.has(key)) return;
  asked.add(key);
  void api.schematics
    .thumbnail(file.path)
    .catch(ignoreFailure)
    .then((url) => {
      if (url) {
        remember(file, url);
        return;
      }
      if (file.size > AUTO_MAX_BYTES || !webglAvailable()) return;
      queue.push({ file, versionPath });
      void drain();
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSchematicThumbnail(
  file: ISchematicFile,
  versionPath: string,
  visible: boolean,
): string | null {
  const key = thumbnailKey(file);
  const url = useSyncExternalStore(
    subscribe,
    useCallback(() => cache.get(key) ?? null, [key]),
  );

  useEffect(() => {
    if (visible) request(file, versionPath);
  }, [file, key, versionPath, visible]);

  return url;
}
