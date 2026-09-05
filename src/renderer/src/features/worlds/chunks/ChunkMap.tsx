import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CHUNKS_PER_REGION_AXIS } from "@/types/WorldChunks";
import { cn } from "@/lib/utils";
import {
  Camera,
  chunkUnder,
  panBy,
  visibleChunks,
  visibleRegions,
  worldToScreen,
  zoomAt,
} from "./chunkCamera";
import {
  ChunkColorMode,
  ColorContext,
  PROBLEM_RGB,
  UNSUPPORTED_RGB,
  chunkRgb,
  rgbCss,
} from "./chunkColors";
import { ChunkBounds, ChunkWorldState, RegionState } from "./chunkModel";
import { ChunkSelection, SelectMode } from "./chunkSelection";
import { SurfaceTiles } from "./useSurfaceTiles";

export type ChunkTool = "select" | "pan";

export interface ChunkPoint {
  x: number;
  z: number;
}

export interface ClickModifiers {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

export interface ChunkMapProps {
  state: ChunkWorldState;
  selection: ChunkSelection;
  colorMode: ChunkColorMode;
  colorContext: ColorContext;
  /** Rendered region images for the satellite view; null turns the view off. */
  surfaces: SurfaceTiles | null;
  /** Bumps whenever a surface image arrives or is dropped. */
  surfaceVersion: number;
  onVisibleRegions?: (keys: string[]) => void;
  camera: Camera;
  onCameraChange: (camera: Camera) => void;
  tool: ChunkTool;
  /** Spawn point in chunk units; drawn as a marker. */
  spawn: ChunkPoint | null;
  focused: ChunkPoint | null;
  onHover: (chunk: ChunkPoint | null) => void;
  onSelectRect: (bounds: ChunkBounds, mode: SelectMode) => void;
  onClickChunk: (chunk: ChunkPoint, modifiers: ClickModifiers) => void;
  onResize: (size: { width: number; height: number }) => void;
  className?: string;
}

interface TileEntry {
  canvas: HTMLCanvasElement;
  region: RegionState;
  signature: string;
}

interface SelectionTileEntry {
  canvas: HTMLCanvasElement;
  tile: Uint8Array;
  color: string;
}

interface ProblemTileEntry {
  canvas: HTMLCanvasElement;
  region: RegionState;
}

interface DragState {
  kind: "pan" | "select";
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  camera: Camera;
  moved: boolean;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

const CLICK_SLOP_PX = 4;
const REGION_LABEL_MIN_PX = 56;
const REGION_GRID_MIN_PX = 10;
const CHUNK_GRID_MIN_SCALE = 14;
const SELECTION_ALPHA = 0.62;
const PLACEHOLDER_ALPHA = 0.45;
const PROBLEM_ALPHA = 0.8;
/** Pixels per region in the satellite images. */
const SURFACE_PIXELS = 512;
const TILE = CHUNKS_PER_REGION_AXIS;

function colorSignature(mode: ChunkColorMode, context: ColorContext): string {
  switch (mode) {
    case "updated":
      return `${mode}|${context.minTimestamp}|${context.maxTimestamp}`;
    case "dataVersion":
      return `${mode}|${context.worldDataVersion}`;
    case "size":
      return `${mode}|${context.maxSectors}`;
    default:
      return mode;
  }
}

function paintRegionTile(
  canvas: HTMLCanvasElement,
  region: RegionState,
  mode: ChunkColorMode,
  context: ColorContext,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const image = ctx.createImageData(TILE, TILE);
  const pixels = image.data;

  for (let index = 0; index < region.present.length; index += 1) {
    if (!region.present[index]) continue;

    const rgb = chunkRgb(
      region.chunks ? region.chunks[index] : null,
      mode,
      context,
    );
    const offset = index * 4;
    pixels[offset] = rgb[0];
    pixels[offset + 1] = rgb[1];
    pixels[offset + 2] = rgb[2];
    pixels[offset + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
}

/** Marks damaged and unreadable chunks so they show through a satellite image. */
function paintProblemTile(
  canvas: HTMLCanvasElement,
  region: RegionState,
): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  ctx.clearRect(0, 0, TILE, TILE);
  if (!region.chunks) return false;

  let any = false;
  for (let index = 0; index < region.chunks.length; index += 1) {
    const chunk = region.chunks[index];
    if (!chunk?.problem) continue;

    ctx.fillStyle = rgbCss(
      chunk.problem === "unsupported" ? UNSUPPORTED_RGB : PROBLEM_RGB,
    );
    ctx.fillRect(index & 31, index >> 5, 1, 1);
    any = true;
  }

  return any;
}

function paintSelectionTile(
  canvas: HTMLCanvasElement,
  tile: Uint8Array,
  color: string,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, TILE, TILE);
  ctx.fillStyle = color;

  for (let index = 0; index < tile.length; index += 1) {
    if (tile[index]) ctx.fillRect(index & 31, index >> 5, 1, 1);
  }
}

function makeTile(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  return canvas;
}

function cssVar(element: HTMLElement, name: string, fallback: string): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return value || fallback;
}

function selectModeFor(modifiers: ClickModifiers): SelectMode {
  if (modifiers.alt) return "subtract";
  if (modifiers.ctrl) return "toggle";
  if (modifiers.shift) return "add";
  return "replace";
}

export function ChunkMap({
  state,
  selection,
  colorMode,
  colorContext,
  surfaces,
  surfaceVersion,
  onVisibleRegions,
  camera,
  onCameraChange,
  tool,
  spawn,
  focused,
  onHover,
  onSelectRect,
  onClickChunk,
  onResize,
  className,
}: ChunkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tilesRef = useRef(new Map<string, TileEntry>());
  const selectionTilesRef = useRef(new Map<string, SelectionTileEntry>());
  const problemTilesRef = useRef(new Map<string, ProblemTileEntry | null>());
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const spaceRef = useRef(false);
  const hoveredRef = useRef<ChunkPoint | null>(null);
  const visibleKeysRef = useRef("");

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<ChunkPoint | null>(null);
  const [dragRect, setDragRect] = useState<ChunkBounds | null>(null);
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(0, Math.floor(entry.contentRect.width));
      const height = Math.max(0, Math.floor(entry.contentRect.height));
      setSize({ width, height });
      onResize({ width, height });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [onResize]);

  useEffect(() => {
    // Space pans only when nothing that consumes Space itself has focus:
    // inputs keep typing, buttons keep activating.
    const consumesSpace = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return false;
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.tagName === "BUTTON" ||
        target.tagName === "A" ||
        target.isContentEditable ||
        target.getAttribute("role") === "button" ||
        target.getAttribute("role") === "combobox" ||
        target.getAttribute("role") === "checkbox"
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || consumesSpace(event)) {
        return;
      }
      spaceRef.current = true;
      setSpaceHeld(true);
      event.preventDefault();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      spaceRef.current = false;
      setSpaceHeld(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const { width, height } = size;
    if (width === 0 || height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const background = cssVar(container, "--surface-1", "#18181b");
    const grid = cssVar(container, "--border", "#3f3f46");
    const label = cssVar(container, "--faint", "#a1a1aa");
    const selectionColor = cssVar(container, "--primary", "#7c5cff");
    const focusColor = cssVar(container, "--foreground", "#fafafa");
    const spawnColor = cssVar(container, "--warning", "#f5b342");

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;

    const regionPx = TILE * camera.scale;
    const visible = visibleRegions(camera, width, height);
    const signature = colorSignature(colorMode, colorContext);
    const tiles = tilesRef.current;
    const selectionTiles = selectionTilesRef.current;
    const problemTiles = problemTilesRef.current;
    const satellite = surfaces !== null;

    for (const key of tiles.keys()) {
      if (!state.has(key)) tiles.delete(key);
    }
    for (const key of selectionTiles.keys()) {
      if (!selection.has(key)) selectionTiles.delete(key);
    }
    for (const key of problemTiles.keys()) {
      if (!state.has(key)) problemTiles.delete(key);
    }

    const drawRegionGrid = regionPx >= REGION_GRID_MIN_PX;
    const drawLabels = regionPx >= REGION_LABEL_MIN_PX;
    const visibleKeys: string[] = [];

    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textBaseline = "top";

    for (const region of state.values()) {
      if (
        region.x < visible.minX ||
        region.x > visible.maxX ||
        region.z < visible.minZ ||
        region.z > visible.maxZ
      ) {
        continue;
      }

      visibleKeys.push(region.key);

      const [sx, sy] = worldToScreen(
        camera,
        width,
        height,
        region.x * TILE,
        region.z * TILE,
      );

      let tile = tiles.get(region.key);
      if (!tile || tile.region !== region || tile.signature !== signature) {
        const canvasTile = tile?.canvas ?? makeTile();
        paintRegionTile(canvasTile, region, colorMode, colorContext);
        tile = { canvas: canvasTile, region, signature };
        tiles.set(region.key, tile);
      }

      const surface = satellite ? surfaces.get(region.key) : undefined;

      if (surface) {
        // Downscaling averages blocks together; upscaling keeps them crisp.
        ctx.imageSmoothingEnabled = regionPx < SURFACE_PIXELS;
        ctx.drawImage(surface, sx, sy, regionPx, regionPx);
        ctx.imageSmoothingEnabled = false;
      } else {
        ctx.globalAlpha = satellite ? PLACEHOLDER_ALPHA : 1;
        ctx.drawImage(tile.canvas, sx, sy, regionPx, regionPx);
        ctx.globalAlpha = 1;
      }

      if (satellite && region.scanned) {
        let problemTile = problemTiles.get(region.key);
        if (
          problemTile === undefined ||
          (problemTile && problemTile.region !== region)
        ) {
          const canvasTile = problemTile?.canvas ?? makeTile();
          problemTile = paintProblemTile(canvasTile, region)
            ? { canvas: canvasTile, region }
            : null;
          problemTiles.set(region.key, problemTile);
        }

        if (problemTile) {
          ctx.globalAlpha = PROBLEM_ALPHA;
          ctx.drawImage(problemTile.canvas, sx, sy, regionPx, regionPx);
          ctx.globalAlpha = 1;
        }
      }

      const selected = selection.get(region.key);
      if (selected) {
        let selectionTile = selectionTiles.get(region.key);
        if (
          !selectionTile ||
          selectionTile.tile !== selected ||
          selectionTile.color !== selectionColor
        ) {
          const canvasTile = selectionTile?.canvas ?? makeTile();
          paintSelectionTile(canvasTile, selected, selectionColor);
          selectionTile = {
            canvas: canvasTile,
            tile: selected,
            color: selectionColor,
          };
          selectionTiles.set(region.key, selectionTile);
        }

        ctx.globalAlpha = SELECTION_ALPHA;
        ctx.drawImage(selectionTile.canvas, sx, sy, regionPx, regionPx);
        ctx.globalAlpha = 1;
      }

      if (drawRegionGrid) {
        ctx.strokeStyle = grid;
        ctx.lineWidth = 1;
        ctx.globalAlpha = satellite ? 0.5 : 1;
        ctx.strokeRect(
          Math.round(sx) + 0.5,
          Math.round(sy) + 0.5,
          Math.round(regionPx),
          Math.round(regionPx),
        );
        ctx.globalAlpha = 1;
      }

      if (drawLabels) {
        ctx.fillStyle = label;
        ctx.globalAlpha = 0.8;
        ctx.fillText(`r.${region.x}.${region.z}`, sx + 4, sy + 3);
        ctx.globalAlpha = 1;
      }
    }

    if (camera.scale >= CHUNK_GRID_MIN_SCALE) {
      const area = visibleChunks(camera, width, height);
      ctx.strokeStyle = grid;
      ctx.globalAlpha = satellite ? 0.2 : 0.35;
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let x = area.minX; x <= area.maxX; x += 1) {
        const [sx] = worldToScreen(camera, width, height, x, 0);
        const px = Math.round(sx) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
      }
      for (let z = area.minZ; z <= area.maxZ; z += 1) {
        const [, sy] = worldToScreen(camera, width, height, 0, z);
        const py = Math.round(sy) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
      }

      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const outlineChunk = (
      point: ChunkPoint,
      color: string,
      lineWidth: number,
    ) => {
      const [sx, sy] = worldToScreen(camera, width, height, point.x, point.z);
      const px = Math.max(camera.scale, 3);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(
        Math.round(sx) + 0.5 - (px - camera.scale) / 2,
        Math.round(sy) + 0.5 - (px - camera.scale) / 2,
        Math.round(px),
        Math.round(px),
      );
    };

    if (hovered && !dragRect) outlineChunk(hovered, label, 1);
    if (focused) outlineChunk(focused, focusColor, 2);

    if (dragRect) {
      const [x0, y0] = worldToScreen(
        camera,
        width,
        height,
        Math.min(dragRect.minX, dragRect.maxX),
        Math.min(dragRect.minZ, dragRect.maxZ),
      );
      const [x1, y1] = worldToScreen(
        camera,
        width,
        height,
        Math.max(dragRect.minX, dragRect.maxX) + 1,
        Math.max(dragRect.minZ, dragRect.maxZ) + 1,
      );

      ctx.fillStyle = selectionColor;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = selectionColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(
        Math.round(x0) + 0.5,
        Math.round(y0) + 0.5,
        Math.round(x1 - x0),
        Math.round(y1 - y0),
      );
      ctx.setLineDash([]);
    }

    if (spawn) {
      const [sx, sy] = worldToScreen(camera, width, height, spawn.x, spawn.z);
      if (sx >= -12 && sy >= -12 && sx <= width + 12 && sy <= height + 12) {
        ctx.strokeStyle = spawnColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 6, 0, Math.PI * 2);
        ctx.moveTo(sx - 10, sy);
        ctx.lineTo(sx + 10, sy);
        ctx.moveTo(sx, sy - 10);
        ctx.lineTo(sx, sy + 10);
        ctx.stroke();
      }
    }

    if (onVisibleRegions && satellite) {
      // Regions nearest the centre of the view are requested first.
      const [centerX, centerZ] = [camera.x / TILE, camera.z / TILE];
      const ordered = visibleKeys
        .map((key) => {
          const region = state.get(key)!;
          const dx = region.x + 0.5 - centerX;
          const dz = region.z + 0.5 - centerZ;
          return { key, distance: dx * dx + dz * dz };
        })
        .sort((a, b) => a.distance - b.distance)
        .map((entry) => entry.key);

      const joined = ordered.join("|");
      if (joined !== visibleKeysRef.current) {
        visibleKeysRef.current = joined;
        onVisibleRegions(ordered);
      }
    }
  }, [
    camera,
    colorContext,
    colorMode,
    dragRect,
    focused,
    hovered,
    onVisibleRegions,
    selection,
    size,
    spawn,
    state,
    surfaceVersion,
    surfaces,
  ]);

  useEffect(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      draw();
    });

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0016);
      onCameraChange(
        zoomAt(
          camera,
          rect.width,
          rect.height,
          event.clientX - rect.left,
          event.clientY - rect.top,
          factor,
        ),
      );
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [camera, onCameraChange]);

  const localPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const updateHover = (chunk: ChunkPoint | null) => {
    const previous = hoveredRef.current;
    if (previous?.x === chunk?.x && previous?.z === chunk?.z) return;
    hoveredRef.current = chunk;
    setHovered(chunk);
    onHover(chunk);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;

    const point = localPoint(event);
    const pan =
      event.button !== 0 || tool === "pan" || spaceRef.current || event.metaKey;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: pan ? "pan" : "select",
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      camera,
      moved: false,
      shift: event.shiftKey,
      ctrl: event.ctrlKey,
      alt: event.altKey,
    };

    if (pan) setPanning(true);
    event.preventDefault();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event);
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      updateHover(
        chunkUnder(camera, size.width, size.height, point.x, point.y),
      );
      return;
    }

    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) >= CLICK_SLOP_PX) drag.moved = true;
    drag.lastX = point.x;
    drag.lastY = point.y;

    if (drag.kind === "pan") {
      onCameraChange(panBy(drag.camera, dx, dy));
      return;
    }

    const start = chunkUnder(
      drag.camera,
      size.width,
      size.height,
      drag.startX,
      drag.startY,
    );
    const end = chunkUnder(camera, size.width, size.height, point.x, point.y);
    updateHover(end);

    if (drag.moved) {
      setDragRect({ minX: start.x, minZ: start.z, maxX: end.x, maxZ: end.z });
    }
  };

  const finishDrag = (
    event: ReactPointerEvent<HTMLCanvasElement>,
    cancelled: boolean,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setPanning(false);
    setDragRect(null);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (cancelled || drag.kind === "pan") return;

    const modifiers = { shift: drag.shift, ctrl: drag.ctrl, alt: drag.alt };
    const start = chunkUnder(
      drag.camera,
      size.width,
      size.height,
      drag.startX,
      drag.startY,
    );

    if (!drag.moved) {
      onClickChunk(start, modifiers);
      return;
    }

    const end = chunkUnder(
      camera,
      size.width,
      size.height,
      drag.lastX,
      drag.lastY,
    );
    onSelectRect(
      { minX: start.x, minZ: start.z, maxX: end.x, maxZ: end.z },
      selectModeFor(modifiers),
    );
  };

  const cursor = panning
    ? "cursor-grabbing"
    : tool === "pan" || spaceHeld
      ? "cursor-grab"
      : "cursor-crosshair";

  return (
    <div
      ref={containerRef}
      className={cn("relative min-h-0 min-w-0 overflow-hidden", className)}
    >
      <canvas
        ref={canvasRef}
        className={cn("block touch-none select-none", cursor)}
        style={{ width: size.width, height: size.height }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishDrag(event, false)}
        onPointerCancel={(event) => finishDrag(event, true)}
        onPointerLeave={() => {
          if (!dragRef.current) updateHover(null);
        }}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}
