import { useEffect, useState } from "react";
import { specPaths, type TexturePack } from "./gameTextures";
import { LOGO_PRESETS } from "./logoCatalog";
import type { Texture } from "./pixelArt";

const api = window.api;

export type PackState =
  | { status: "loading" }
  | { status: "ready"; pack: TexturePack | null };

let loading: Promise<TexturePack | null> | null = null;
let settled: PackState = { status: "loading" };

async function decode(bytes: Uint8Array): Promise<Texture | null> {
  try {
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: "image/png" }),
    );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return {
      width: canvas.width,
      height: canvas.height,
      pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
    };
  } catch {
    return null;
  }
}

async function loadPack(): Promise<TexturePack | null> {
  const names = [
    ...new Set(LOGO_PRESETS.flatMap((preset) => specPaths(preset.spec))),
  ];
  const result = await api.other.gameTextures(names).catch(() => null);
  if (!result) return null;

  const textures = new Map<string, Texture>();
  await Promise.all(
    Object.entries(result.files).map(async ([name, bytes]) => {
      const texture = await decode(bytes);
      if (texture) textures.set(name, texture);
    }),
  );

  return textures.size > 0 ? { id: result.version, textures } : null;
}

export function preloadTexturePack(): Promise<TexturePack | null> {
  if (settled.status === "ready" && settled.pack) {
    return Promise.resolve(settled.pack);
  }
  loading ??= loadPack().then((pack) => {
    settled = { status: "ready", pack };
    if (!pack) loading = null;
    return pack;
  });
  return loading;
}

export function useTexturePack(): PackState {
  const [state, setState] = useState(settled);

  useEffect(() => {
    let active = true;
    void preloadTexturePack().then(() => {
      if (active) setState(settled);
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
