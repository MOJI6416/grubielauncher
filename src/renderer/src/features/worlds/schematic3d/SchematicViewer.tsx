import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, MousePointer2, RotateCcw, TriangleAlert } from "lucide-react";
import type { BlockInfo, ISchematicFile } from "@/types/Schematic";
import { blockBaseId, materialOf } from "@/shared/blockState";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Hint } from "@renderer/components/Hint";
import { formatNumber } from "@renderer/utilities/numbers";
import { countFeature } from "@renderer/features/usage/usage";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { fitRange, totalQuads, type LayerRange } from "./mesher";
import { prepareSchematic, QUAD_BUDGET, type PreparedSchematic } from "./prepare";
import {
  SchematicScene,
  type BuildProgress,
  type CameraView,
} from "./SchematicScene";
import { webglAvailable } from "./webgl";
import { hasThumbnail, storeThumbnail, THUMBNAIL_SIZE } from "./thumbnails";
import { BlockIcon } from "./MaterialsList";

type Status =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; error: "missing" | "tooLarge" | "unreadable" | "failed" }
  | { kind: "noWebgl" };

interface Hover {
  state: string;
  x: number;
  y: number;
  z: number;
}

const VIEWS: Exclude<CameraView, "reset">[] = ["top", "front", "side"];

function sceneColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    grid: style.getPropertyValue("--muted-foreground").trim() || "#888",
    highlight: style.getPropertyValue("--foreground").trim() || "#fff",
  };
}

export function SchematicViewer({
  file,
  versionPath,
  info,
  onPick,
  onPalette,
}: {
  file: ISchematicFile;
  versionPath: string;
  info: (id: string) => BlockInfo;
  onPick: (materialId: string) => void;
  onPalette: (ids: string[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SchematicScene | null>(null);
  const preparedRef = useRef<PreparedSchematic | null>(null);
  const loadingWindow = useRef(false);
  const counted = useRef(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const hoverFrame = useRef(0);

  const [status, setStatus] = useState<Status>(() =>
    webglAvailable() ? { kind: "loading" } : { kind: "noWebgl" },
  );
  const [height, setHeight] = useState(0);
  const [requested, setRequested] = useState<LayerRange>({ lo: 0, hi: 0 });
  const [shown, setShown] = useState<LayerRange>({ lo: 0, hi: 0 });
  const [fullFits, setFullFits] = useState(true);
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [notes, setNotes] = useState<{ textures: "instance" | "other" | "none"; colorOnly: number }>({
    textures: "instance",
    colorOnly: 0,
  });

  const touch = useCallback(() => {
    if (counted.current) return;
    counted.current = true;
    countFeature("schematics.viewer");
  }, []);

  const applyRange = useCallback(
    async (
      wanted: LayerRange,
      options: { immediate?: boolean; anchor?: "lo" | "hi" } = {},
    ) => {
      const scene = sceneRef.current;
      const prepared = preparedRef.current;
      if (!scene || !prepared) return;
      const fitted = fitRange(
        scene.layerQuads,
        prepared.grid.yFrom,
        QUAD_BUDGET,
        wanted,
        options.anchor,
      );
      setShown(fitted);
      setRequested(fitted);
      scene.showHighlight(null);
      setHover(null);
      await scene.setRange(fitted, options);
    },
    [],
  );

  const loadWindow = useCallback(
    async (yFrom: number, wanted: LayerRange | null) => {
      const scene = sceneRef.current;
      if (!scene) return false;
      loadingWindow.current = true;
      try {
        const result = await prepareSchematic(file.path, versionPath, yFrom).catch(ignoreFailure);
        if (sceneRef.current !== scene) return false;
        if (!result?.ok) {
          setStatus({ kind: "error", error: result?.error ?? "failed" });
          return false;
        }
        const prepared = result.prepared;
        preparedRef.current = prepared;
        setNotes({ textures: prepared.vanillaSource, colorOnly: prepared.colorOnly });
        setHeight(prepared.volume.size.y);
        onPalette([...new Set(prepared.volume.palette.map(blockBaseId))]);
        scene.setAtlas(prepared.atlas.canvas);
        const layerQuads = await scene.load(prepared.grid, prepared.models);
        if (sceneRef.current !== scene) return false;
        setFullFits(
          totalQuads(layerQuads) <= QUAD_BUDGET &&
            prepared.volume.yFrom === 0 &&
            prepared.volume.yTo === prepared.volume.size.y - 1,
        );
        const target = wanted ?? {
          lo: prepared.volume.yFrom,
          hi: prepared.volume.size.y - 1,
        };
        setRequested(target);
        setStatus({ kind: "ready" });
        const build = applyRange(target, { immediate: true });
        if (!wanted) scene.setView("reset");
        await build;
        return true;
      } finally {
        loadingWindow.current = false;
      }
    },
    [applyRange, file.path, onPalette, versionPath],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !webglAvailable()) return;

    let scene: SchematicScene;
    try {
      scene = new SchematicScene(canvas, { interactive: true });
    } catch {
      setStatus({ kind: "noWebgl" });
      return;
    }
    sceneRef.current = scene;
    scene.observe(container);
    scene.setColors(sceneColors());
    scene.onProgress = (next) => {
      setProgress((previous) =>
        previous &&
        previous.built === next.built &&
        previous.total === next.total &&
        previous.elapsed === next.elapsed
          ? previous
          : next,
      );
    };

    const themeObserver = new MutationObserver(() => scene.setColors(sceneColors()));
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class", "data-theme", "data-theme-mode"],
    });

    void loadWindow(0, null).then(async (ok) => {
      if (!ok || sceneRef.current !== scene || hasThumbnail(file)) return;
      const png = await scene.snapshot(THUMBNAIL_SIZE).catch(ignoreFailure);
      if (png) await storeThumbnail(file, png);
    });

    return () => {
      themeObserver.disconnect();
      cancelAnimationFrame(hoverFrame.current);
      sceneRef.current = null;
      preparedRef.current = null;
      scene.dispose();
    };
  }, [file, loadWindow]);

  const changeRange = (values: number[]) => {
    touch();
    const prepared = preparedRef.current;
    if (!prepared || values.length < 2) return;
    const wanted = { lo: Math.min(values[0], values[1]), hi: Math.max(values[0], values[1]) };
    const anchor = wanted.hi !== requested.hi ? "hi" : "lo";
    setRequested(wanted);
    const inside = wanted.lo >= prepared.volume.yFrom && wanted.hi <= prepared.volume.yTo;
    if (inside) {
      void applyRange(wanted, { anchor });
      return;
    }
    if (loadingWindow.current) return;
    const from = wanted.lo < prepared.volume.yFrom ? wanted.lo : Math.max(0, wanted.hi - (prepared.volume.yTo - prepared.volume.yFrom));
    void loadWindow(from, wanted);
  };

  const view = (kind: CameraView) => {
    touch();
    sceneRef.current?.setView(kind);
  };

  const updateHover = (clientX: number, clientY: number) => {
    cancelAnimationFrame(hoverFrame.current);
    hoverFrame.current = requestAnimationFrame(() => {
      const scene = sceneRef.current;
      const prepared = preparedRef.current;
      if (!scene || !prepared) return;
      const hit = scene.pick(clientX, clientY);
      scene.showHighlight(hit);
      setHover(
        hit
          ? { state: prepared.volume.palette[hit.state] ?? "", x: hit.x, y: hit.y, z: hit.z }
          : null,
      );
    });
  };

  const total = height;
  const built = progress && progress.total > 0 ? progress.built / progress.total : 1;
  const building = status.kind === "ready" && progress !== null && progress.built < progress.total;
  const limited = status.kind === "ready" && total > 0 && !fullFits;
  const hoverId = hover ? blockBaseId(hover.state) : null;
  const hoverInfo = hoverId ? info(hoverId) : null;

  const nf = (value: number) => formatNumber(value, locale);
  const controlsHint = t("schematics.viewer.controls");

  return (
    <div
      ref={containerRef}
      className="relative min-h-0 flex-1 overflow-hidden rounded-xl border bg-surface-1"
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label={`${t("schematics.viewer.title")}. ${controlsHint}`}
        className="absolute top-0 left-0 size-full touch-none outline-none"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          touch();
          pointer.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = pointer.current;
          pointer.current = null;
          if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
          const scene = sceneRef.current;
          const prepared = preparedRef.current;
          const hit = scene?.pick(event.clientX, event.clientY);
          if (!hit || !prepared) return;
          onPick(materialOf(prepared.volume.palette[hit.state] ?? "").id);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 0) updateHover(event.clientX, event.clientY);
        }}
        onPointerLeave={() => {
          cancelAnimationFrame(hoverFrame.current);
          sceneRef.current?.showHighlight(null);
          setHover(null);
        }}
      />

      {status.kind === "loading" && (
        <div className="absolute top-0 left-0 flex size-full flex-col items-center justify-center gap-2 bg-surface-1">
          <Skeleton className="size-24 rounded-xl" />
          <span className="text-2xs text-faint">{t("schematics.viewer.loading")}</span>
        </div>
      )}

      {(status.kind === "error" || status.kind === "noWebgl") && (
        <Empty className="absolute top-0 left-0 size-full bg-surface-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {status.kind === "noWebgl" ? <Box /> : <TriangleAlert />}
            </EmptyMedia>
            <EmptyTitle>
              {t(status.kind === "noWebgl" ? "schematics.viewer.noWebgl" : "schematics.viewer.failed")}
            </EmptyTitle>
            <EmptyDescription>
              {status.kind === "noWebgl"
                ? t("schematics.viewer.noWebglHint")
                : t(`schematics.errors.${status.error === "failed" ? "unreadable" : status.error}`)}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {status.kind === "ready" && (
        <>
          <div className="pointer-events-none absolute top-2 left-2 flex max-w-[60%] flex-col items-start gap-1">
            {building && (
              <span className="rounded-md bg-surface-2/90 px-2 py-1 font-mono text-3xs text-muted-foreground tabular-nums">
                {t("schematics.viewer.building", { percent: Math.floor(built * 100) })}
              </span>
            )}
            {limited && (
              <Hint content={t("schematics.viewer.limitedHint")}>
                <span className="pointer-events-auto flex items-center gap-1 rounded-md bg-surface-2/90 px-2 py-1 text-3xs text-warning">
                  <TriangleAlert className="size-3 shrink-0" />
                  <span className="truncate">
                    {t("schematics.viewer.limited", {
                      from: nf(shown.lo + 1),
                      to: nf(shown.hi + 1),
                      total: nf(total),
                    })}
                  </span>
                </span>
              </Hint>
            )}
            {notes.textures !== "instance" && (
              <Hint
                content={t(
                  notes.textures === "none"
                    ? "schematics.viewer.noTexturesHint"
                    : "schematics.viewer.otherTexturesHint",
                )}
              >
                <span className="pointer-events-auto truncate rounded-md bg-surface-2/90 px-2 py-1 text-3xs text-info">
                  {t(
                    notes.textures === "none"
                      ? "schematics.viewer.noTextures"
                      : "schematics.viewer.otherTextures",
                  )}
                </span>
              </Hint>
            )}
          </div>

          <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-lg border bg-surface-2/90 p-0.5">
            {VIEWS.map((kind) => (
              <Button
                key={kind}
                variant="ghost"
                size="sm"
                className="h-6 bg-transparent px-2 text-2xs"
                onClick={() => view(kind)}
              >
                {t(`schematics.viewer.${kind}`)}
              </Button>
            ))}
            <Hint content={t("schematics.viewer.reset")}>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 bg-transparent"
                aria-label={t("schematics.viewer.reset")}
                onClick={() => view("reset")}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </Hint>
          </div>

          {total > 1 && (
            <div className="absolute top-11 right-2 bottom-10 flex w-9 flex-col items-center gap-1.5 rounded-lg border bg-surface-2/90 py-2">
              <span className="font-mono text-3xs text-faint tabular-nums">{nf(requested.hi + 1)}</span>
              <Hint content={t("schematics.viewer.layersHint")} side="left">
                <div className="flex min-h-0 flex-1">
                  <Slider
                    orientation="vertical"
                    min={0}
                    max={total - 1}
                    step={1}
                    minStepsBetweenThumbs={0}
                    value={[requested.lo, requested.hi]}
                    aria-label={t("schematics.viewer.layers", {
                      from: nf(requested.lo + 1),
                      to: nf(requested.hi + 1),
                    })}
                    className="min-h-0 [&_[data-slot=slider-range]]:bg-muted-foreground/60 [&_[data-slot=slider-thumb]]:border-muted-foreground"
                    onValueChange={changeRange}
                  />
                </div>
              </Hint>
              <span className="font-mono text-3xs text-faint tabular-nums">{nf(requested.lo + 1)}</span>
            </div>
          )}

          <div className="pointer-events-none absolute right-2 bottom-2 left-2 flex items-end justify-between gap-2">
            {hover && hoverId && hoverInfo ? (
              <span className="flex min-w-0 items-center gap-1.5 rounded-md bg-surface-2/90 px-2 py-1">
                <BlockIcon id={hoverId} info={hoverInfo} className="size-4" />
                <span className="truncate text-2xs">{hoverInfo.name}</span>
                <span className="shrink-0 font-mono text-3xs text-faint tabular-nums">
                  {t("schematics.viewer.position", { x: hover.x, y: hover.y, z: hover.z })}
                </span>
              </span>
            ) : (
              <span />
            )}
            <Hint content={controlsHint}>
              <span
                aria-label={controlsHint}
                className="pointer-events-auto flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-2/90 text-faint"
              >
                <MousePointer2 className="size-3.5" />
              </span>
            </Hint>
          </div>
        </>
      )}
    </div>
  );
}
