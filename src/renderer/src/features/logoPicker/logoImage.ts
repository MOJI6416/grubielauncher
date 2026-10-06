import { useEffect, useState } from "react";
import type { TexturePack } from "./gameTextures";
import { resolveSubject, type LogoPreset } from "./logoCatalog";
import { renderBackdropSwatch, renderLogo, type Raster } from "./logoRender";

type Job = { key: string; draw: () => Raster };

const urls = new Map<string, string>();
const listeners = new Map<string, Set<(url: string) => void>>();
const queue: Job[] = [];
let isScheduled = false;
const MAX_CACHED = 600;

function toCanvas(raster: Raster): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = raster.size;
  canvas.height = raster.size;
  canvas
    .getContext("2d")
    ?.putImageData(
      new ImageData(raster.pixels, raster.size, raster.size),
      0,
      0,
    );
  return canvas;
}

function drain() {
  isScheduled = false;
  const deadline = performance.now() + 10;

  while (queue.length > 0 && performance.now() < deadline) {
    const job = queue.shift();
    if (!job || urls.has(job.key)) continue;
    const url = toCanvas(job.draw()).toDataURL("image/png");
    urls.set(job.key, url);
    if (urls.size > MAX_CACHED) urls.delete(urls.keys().next().value as string);
    listeners.get(job.key)?.forEach((notify) => notify(url));
    listeners.delete(job.key);
  }

  if (queue.length > 0) schedule();
}

function schedule() {
  if (isScheduled) return;
  isScheduled = true;
  requestAnimationFrame(drain);
}

function request(
  key: string,
  draw: () => Raster,
  notify: (url: string) => void,
) {
  const ready = urls.get(key);
  if (ready) {
    notify(ready);
    return () => {};
  }

  const waiting = listeners.get(key) ?? new Set();
  waiting.add(notify);
  listeners.set(key, waiting);
  if (!queue.some((job) => job.key === key)) queue.push({ key, draw });
  schedule();

  return () => {
    waiting.delete(notify);
    if (waiting.size > 0) return;
    listeners.delete(key);
    const index = queue.findIndex((job) => job.key === key);
    if (index >= 0) queue.splice(index, 1);
  };
}

function useRendered(key: string, draw: () => Raster): string | null {
  const [url, setUrl] = useState(() => urls.get(key) ?? null);

  useEffect(() => request(key, draw, setUrl), [key]);

  return urls.get(key) ?? url;
}

function subjectKey(preset: LogoPreset | null, pack: TexturePack | null) {
  return `${pack?.id ?? "none"}|${preset?.id ?? "empty"}`;
}

function subjectOf(preset: LogoPreset | null, pack: TexturePack | null) {
  return preset ? resolveSubject(preset, pack) : null;
}

export function useLogoThumb(
  preset: LogoPreset | null,
  pack: TexturePack | null,
  backdropId: string,
  size: number,
) {
  return useRendered(`${subjectKey(preset, pack)}|${backdropId}|${size}`, () =>
    renderLogo(subjectOf(preset, pack), backdropId, size),
  );
}

export function useBackdropSwatch(backdropId: string, size: number) {
  return useRendered(`backdrop|${backdropId}|${size}`, () =>
    renderBackdropSwatch(backdropId, size),
  );
}

export function renderLogoBlob(
  preset: LogoPreset,
  pack: TexturePack | null,
  backdropId: string,
  size: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    toCanvas(renderLogo(subjectOf(preset, pack), backdropId, size)).toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("logo encode failed"));
      },
      "image/png",
    );
  });
}
