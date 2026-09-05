import { CHUNKS_PER_REGION_AXIS } from "@/types/WorldChunks";
import { ChunkBounds } from "./chunkModel";

/** Where the map looks: the chunk under the viewport centre and pixels per chunk. */
export interface Camera {
  x: number;
  z: number;
  scale: number;
}

export const MIN_SCALE = 0.125;
export const MAX_SCALE = 64;
export const DEFAULT_CAMERA: Camera = { x: 0, z: 0, scale: 4 };

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_CAMERA.scale;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function worldToScreen(
  camera: Camera,
  width: number,
  height: number,
  x: number,
  z: number,
): [number, number] {
  return [
    (x - camera.x) * camera.scale + width / 2,
    (z - camera.z) * camera.scale + height / 2,
  ];
}

/** Fractional chunk coordinates under a screen point. */
export function screenToWorld(
  camera: Camera,
  width: number,
  height: number,
  sx: number,
  sy: number,
): [number, number] {
  return [
    (sx - width / 2) / camera.scale + camera.x,
    (sy - height / 2) / camera.scale + camera.z,
  ];
}

export function chunkUnder(
  camera: Camera,
  width: number,
  height: number,
  sx: number,
  sy: number,
): { x: number; z: number } {
  const [wx, wz] = screenToWorld(camera, width, height, sx, sy);
  return { x: Math.floor(wx), z: Math.floor(wz) };
}

/** Zooms so the world point under the cursor stays put. */
export function zoomAt(
  camera: Camera,
  width: number,
  height: number,
  sx: number,
  sy: number,
  factor: number,
): Camera {
  const scale = clampScale(camera.scale * factor);
  if (scale === camera.scale) return camera;

  const [wx, wz] = screenToWorld(camera, width, height, sx, sy);
  const ratio = camera.scale / scale;

  return {
    x: wx - (wx - camera.x) * ratio,
    z: wz - (wz - camera.z) * ratio,
    scale,
  };
}

export function panBy(
  camera: Camera,
  dxPixels: number,
  dyPixels: number,
): Camera {
  return {
    ...camera,
    x: camera.x - dxPixels / camera.scale,
    z: camera.z - dyPixels / camera.scale,
  };
}

export function centerOn(camera: Camera, x: number, z: number): Camera {
  return { ...camera, x, z };
}

export function fitBounds(
  bounds: ChunkBounds,
  width: number,
  height: number,
  padding = 32,
): Camera {
  const spanX = bounds.maxX - bounds.minX + 1;
  const spanZ = bounds.maxZ - bounds.minZ + 1;
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);

  return {
    x: bounds.minX + spanX / 2,
    z: bounds.minZ + spanZ / 2,
    scale: clampScale(Math.min(usableWidth / spanX, usableHeight / spanZ)),
  };
}

export function visibleChunks(
  camera: Camera,
  width: number,
  height: number,
): ChunkBounds {
  const [x0, z0] = screenToWorld(camera, width, height, 0, 0);
  const [x1, z1] = screenToWorld(camera, width, height, width, height);

  return {
    minX: Math.floor(x0),
    minZ: Math.floor(z0),
    maxX: Math.ceil(x1),
    maxZ: Math.ceil(z1),
  };
}

export function visibleRegions(
  camera: Camera,
  width: number,
  height: number,
): ChunkBounds {
  const chunks = visibleChunks(camera, width, height);

  return {
    minX: Math.floor(chunks.minX / CHUNKS_PER_REGION_AXIS),
    minZ: Math.floor(chunks.minZ / CHUNKS_PER_REGION_AXIS),
    maxX: Math.floor(chunks.maxX / CHUNKS_PER_REGION_AXIS),
    maxZ: Math.floor(chunks.maxZ / CHUNKS_PER_REGION_AXIS),
  };
}
