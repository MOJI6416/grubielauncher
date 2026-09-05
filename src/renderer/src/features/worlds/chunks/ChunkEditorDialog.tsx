import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  Globe,
  Hand,
  Layers,
  Loader2,
  Locate,
  Maximize,
  MousePointer2,
  RefreshCw,
  TriangleAlert,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { IWorld } from "@/types/World";
import {
  BLOCKS_PER_CHUNK,
  CHUNKS_PER_REGION_AXIS,
  END_ID,
  IChunkDetails,
  NETHER_ID,
  OVERWORLD_ID,
  chunkCoordinate,
} from "@/types/WorldChunks";
import { normalizeWorldBackupKeep } from "@/types/WorldBackup";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { Hint } from "@renderer/components/Hint";
import { settingsAtom } from "@renderer/stores/atoms";
import { registerNavigationBlocker } from "@renderer/navigation/guards";
import { showFailureToast } from "@renderer/utilities/failures";
import { formatBytes } from "@renderer/utilities/file";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { WorldIcon } from "../WorldIcon";
import { ChunkMap, ChunkPoint, ChunkTool, ClickModifiers } from "./ChunkMap";
import { ChunkInspector, DetailsStatus } from "./ChunkInspector";
import { ChunkFilterPopover } from "./ChunkFilterPopover";
import {
  Camera,
  DEFAULT_CAMERA,
  centerOn,
  clampScale,
  fitBounds,
} from "./chunkCamera";
import {
  CHUNK_COLOR_MODES,
  ChunkColorMode,
  colorContextFrom,
  legendEntries,
  rgbCss,
} from "./chunkColors";
import { ChunkFilter, chunkMatches } from "./chunkFilters";
import { ChunkBounds, chunkAt, worldBounds } from "./chunkModel";
import {
  SelectMode,
  emptySelection,
  invertSelection,
  pruneSelection,
  selectAll,
  selectRect,
  selectWhere,
  selectionCoords,
  selectionCount,
  selectionStats,
  setChunks,
} from "./chunkSelection";
import { useChunkWorld } from "./useChunkWorld";
import { useSurfaceTiles } from "./useSurfaceTiles";

const api = window.api;

type EditKind = "delete" | "reset";

const DIMENSION_LABELS: Record<string, string> = {
  [OVERWORLD_ID]: "overworld",
  [NETHER_ID]: "nether",
  [END_ID]: "end",
};

export function ChunkEditorDialog({
  world,
  locked,
  lockReason,
  locale,
  onClose,
  onChanged,
}: {
  world: IWorld;
  locked: boolean;
  lockReason?: string;
  locale: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const settings = useAtomValue(settingsAtom);
  const chunkWorld = useChunkWorld(world.path);
  const {
    dimensions,
    dimension,
    currentDimension,
    setDimension,
    state,
    regionsStatus,
    progress,
    totals,
    reload,
    rescan,
  } = chunkWorld;

  const [selection, setSelection] = useState(emptySelection);
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [tool, setTool] = useState<ChunkTool>("select");
  const [colorMode, setColorMode] = useState<ChunkColorMode>("status");
  const [hovered, setHovered] = useState<ChunkPoint | null>(null);
  const [focused, setFocused] = useState<ChunkPoint | null>(null);
  const [details, setDetails] = useState<IChunkDetails | null>(null);
  const [detailsStatus, setDetailsStatus] = useState<DetailsStatus>("idle");
  const [gotoX, setGotoX] = useState("");
  const [gotoZ, setGotoZ] = useState("");
  const [pending, setPending] = useState<EditKind | null>(null);
  const [backupWanted, setBackupWanted] = useState(true);
  const [busy, setBusy] = useState(false);

  const satellite = colorMode === "satellite";
  const surfaces = useSurfaceTiles(world.path, dimension, satellite);

  const fittedFor = useRef<string | null>(null);
  const detailsToken = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(
    () => registerNavigationBlocker("chunk-editor", () => busy),
    [busy],
  );

  const colorContext = useMemo(() => colorContextFrom(totals), [totals]);
  const stats = useMemo(
    () => selectionStats(selection, state),
    [selection, state],
  );
  const count = stats.count;
  const spawn = useMemo(
    () =>
      world.spawn
        ? {
            x: world.spawn.x / BLOCKS_PER_CHUNK,
            z: world.spawn.z / BLOCKS_PER_CHUNK,
          }
        : null,
    [world.spawn],
  );
  const legend = useMemo(() => legendEntries(colorMode), [colorMode]);
  const focusedLookup = focused ? chunkAt(state, focused.x, focused.z) : null;

  const sizeLabels = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];
  const nf = (value: number) => new Intl.NumberFormat(locale).format(value);

  const fitToWorld = useCallback(
    (size = mapSize) => {
      const bounds = worldBounds(state);
      if (!bounds || size.width === 0 || size.height === 0) return false;
      setCamera(fitBounds(bounds, size.width, size.height));
      return true;
    },
    [mapSize, state],
  );

  useEffect(() => {
    if (regionsStatus !== "ready" || !dimension) return;
    if (fittedFor.current === dimension) return;
    if (fitToWorld()) fittedFor.current = dimension;
  }, [dimension, fitToWorld, regionsStatus]);

  useEffect(() => {
    setSelection(emptySelection());
    setFocused(null);
    setDetails(null);
    setDetailsStatus("idle");
  }, [dimension]);

  useEffect(() => {
    if (!focused || !dimension) {
      setDetails(null);
      setDetailsStatus("idle");
      return;
    }

    const token = ++detailsToken.current;
    setDetailsStatus("loading");

    api.worldChunks
      .inspect(world.path, dimension, focused.x, focused.z)
      .then((result) => {
        if (detailsToken.current !== token || !mounted.current) return;
        setDetails(result);
        setDetailsStatus(result ? "ready" : "missing");
      })
      .catch((error) => {
        console.error(error);
        if (detailsToken.current !== token || !mounted.current) return;
        setDetails(null);
        setDetailsStatus("error");
      });
  }, [dimension, focused, world.path]);

  const handleResize = useCallback(
    (size: { width: number; height: number }) => {
      setMapSize(size);
    },
    [],
  );

  const handleSelectRect = useCallback(
    (bounds: ChunkBounds, mode: SelectMode) => {
      setSelection((previous) => selectRect(previous, state, bounds, mode));
    },
    [state],
  );

  const handleClickChunk = useCallback(
    (chunk: ChunkPoint, modifiers: ClickModifiers) => {
      const lookup = chunkAt(state, chunk.x, chunk.z);
      const present = Boolean(lookup?.present);

      if (modifiers.ctrl || modifiers.shift || modifiers.alt) {
        if (!present) return;
        const mode: SelectMode = modifiers.alt
          ? "subtract"
          : modifiers.ctrl
            ? "toggle"
            : "add";
        setSelection((previous) =>
          setChunks(previous, [[chunk.x, chunk.z]], mode),
        );
        return;
      }

      setFocused(present ? chunk : null);
      setSelection(
        present
          ? setChunks(emptySelection(), [[chunk.x, chunk.z]], "add")
          : emptySelection(),
      );
    },
    [state],
  );

  const applyFilter = useCallback(
    (filter: ChunkFilter, mode: SelectMode) => {
      const next = selectWhere(
        selection,
        state,
        (chunk) => chunkMatches(chunk, filter),
        mode,
      );
      setSelection(next);
      return selectionCount(next);
    },
    [selection, state],
  );

  const selectRegionOf = useCallback(
    (chunk: ChunkPoint) => {
      const rx = chunk.x >> 5;
      const rz = chunk.z >> 5;
      setSelection((previous) =>
        selectRect(
          previous,
          state,
          {
            minX: rx * CHUNKS_PER_REGION_AXIS,
            minZ: rz * CHUNKS_PER_REGION_AXIS,
            maxX: rx * CHUNKS_PER_REGION_AXIS + CHUNKS_PER_REGION_AXIS - 1,
            maxZ: rz * CHUNKS_PER_REGION_AXIS + CHUNKS_PER_REGION_AXIS - 1,
          },
          "add",
        ),
      );
    },
    [state],
  );

  const zoomBy = (factor: number) => {
    setCamera((previous) => ({
      ...previous,
      scale: clampScale(previous.scale * factor),
    }));
  };

  const goTo = () => {
    const x = Number(gotoX);
    const z = Number(gotoZ);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;

    const chunk = { x: chunkCoordinate(x), z: chunkCoordinate(z) };
    setCamera((previous) => ({
      ...centerOn(previous, chunk.x + 0.5, chunk.z + 0.5),
      scale: Math.max(previous.scale, 8),
    }));
    if (chunkAt(state, chunk.x, chunk.z)?.present) setFocused(chunk);
  };

  const runEdit = async (kind: EditKind) => {
    if (!dimension || count === 0 || locked) return;

    setPending(null);
    setBusy(true);

    const coords = selectionCoords(selection);
    const keys = [...selection.keys()];
    const options = {
      backup: backupWanted,
      keep: normalizeWorldBackupKeep(settings.worldBackupKeep),
    };

    try {
      const result =
        kind === "delete"
          ? await api.worldChunks.delete(world.path, dimension, coords, options)
          : await api.worldChunks.resetInhabited(
              world.path,
              dimension,
              coords,
              options,
            );

      if (!result?.ok) {
        if (result?.error === "backupFailed") {
          showFailureToast(t("worldChunks.errors.backupTitle"), undefined, {
            channels: ["worlds:"],
            fallbackDescription: t(
              `worldBackups.errors.${result.backupError ?? "failed"}`,
            ),
          });
        } else {
          showFailureToast(t(`worldChunks.errors.${kind}Title`), undefined, {
            channels: ["worldChunks:"],
            fallbackDescription: t(
              `worldChunks.errors.${result?.error ?? "failed"}`,
            ),
          });
        }
        return;
      }

      const freed = result.bytesBefore - result.bytesAfter;
      const notes = [
        freed > 0
          ? t("worldChunks.done.freed", {
              size: formatBytes(freed, sizeLabels, 1),
            })
          : null,
        result.backupId ? t("worldChunks.done.backup") : null,
        result.skipped > 0
          ? t("worldChunks.done.skipped", { count: result.skipped })
          : null,
      ].filter(Boolean);

      toast.success(t(`worldChunks.done.${kind}`, { count: result.affected }), {
        description: notes.length ? notes.join(" · ") : undefined,
      });

      if (kind === "delete") {
        setSelection(emptySelection());
        setFocused(null);
      }

      await rescan(keys);
      if (!mounted.current) return;
      surfaces.invalidate(keys);

      if (kind === "reset") {
        setSelection((previous) => pruneSelection(previous, state));
        if (focused) setFocused({ ...focused });
      }

      onChanged();
    } catch (error) {
      showFailureToast(t(`worldChunks.errors.${kind}Title`), error, {
        fallbackDescription: t("worldChunks.errors.failed"),
      });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable ||
        target.getAttribute("role") === "combobox")
    ) {
      return;
    }

    const modifier = event.ctrlKey || event.metaKey;

    if (modifier && event.code === "KeyA") {
      event.preventDefault();
      setSelection(selectAll(state));
      return;
    }
    if (modifier && event.code === "KeyI") {
      event.preventDefault();
      setSelection((previous) => invertSelection(previous, state));
      return;
    }
    if (modifier && event.code === "KeyD") {
      event.preventDefault();
      setSelection(emptySelection());
      return;
    }
    if (modifier) return;

    switch (event.code) {
      case "KeyV":
        setTool("select");
        break;
      case "KeyH":
        setTool("pan");
        break;
      case "KeyF":
        fitToWorld();
        break;
      case "Equal":
      case "NumpadAdd":
        zoomBy(1.25);
        break;
      case "Minus":
      case "NumpadSubtract":
        zoomBy(0.8);
        break;
      case "Delete":
      case "Backspace":
        if (!locked && !busy && count > 0) setPending("delete");
        break;
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        const step = Math.max(
          1,
          Math.round(Math.min(mapSize.width, mapSize.height) * 0.1),
        );
        const dx =
          event.code === "ArrowLeft"
            ? -step
            : event.code === "ArrowRight"
              ? step
              : 0;
        const dz =
          event.code === "ArrowUp"
            ? -step
            : event.code === "ArrowDown"
              ? step
              : 0;
        setCamera((previous) => ({
          ...previous,
          x: previous.x + dx / previous.scale,
          z: previous.z + dz / previous.scale,
        }));
        break;
      }
      default:
        return;
    }

    event.preventDefault();
  };

  const dimensionLabel = (id: string) => {
    const key = DIMENSION_LABELS[id];
    return key ? t(`worldChunks.dimensions.${key}`) : id;
  };

  const scanning = progress.running && progress.total > 0;
  const hoveredBlock = hovered
    ? `${hovered.x * BLOCKS_PER_CHUNK}, ${hovered.z * BLOCKS_PER_CHUNK}`
    : null;

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
      >
        <DialogContent
          className="flex h-[calc(100%-2.5rem)] w-[calc(100%-3rem)] max-w-[1440px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1440px]"
          onKeyDown={handleKeyDown}
          onEscapeKeyDown={(event) => {
            if (busy || count > 0 || focused) {
              event.preventDefault();
              if (!busy) {
                setSelection(emptySelection());
                setFocused(null);
              }
            }
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogHeader className="shrink-0 gap-0 border-b px-4 py-2.5">
            <div className="flex items-center gap-3 pr-8">
              <WorldIcon
                icon={world.icon}
                size={36}
                className="size-9 rounded-md"
                iconClassName="size-4"
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <DialogTitle className="truncate text-sm">
                  {t("worldChunks.title")}
                </DialogTitle>
                <DialogDescription className="truncate text-xs">
                  {world.name}
                  {currentDimension
                    ? ` · ${t("worldChunks.summary", {
                        regions: nf(totals.regions),
                        chunks: nf(totals.chunks),
                        size: formatBytes(totals.sizeBytes, sizeLabels, 1),
                      })}`
                    : ""}
                </DialogDescription>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <Select
                  value={dimension ?? ""}
                  onValueChange={setDimension}
                  disabled={dimensions.length === 0}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-48 text-xs"
                    aria-label={t("worldChunks.dimension")}
                  >
                    <Globe className="size-3.5 text-muted-foreground" />
                    <SelectValue placeholder={t("worldChunks.dimension")} />
                  </SelectTrigger>
                  <SelectContent>
                    {dimensions.map((entry) => (
                      <SelectItem
                        key={entry.id}
                        value={entry.id}
                        className="text-xs"
                      >
                        <span className="flex items-center gap-2">
                          <span>{dimensionLabel(entry.id)}</span>
                          <span className="font-mono text-[0.65rem] text-faint">
                            {nf(entry.chunkCount)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={colorMode}
                  onValueChange={(value) =>
                    setColorMode(value as ChunkColorMode)
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="w-44 text-xs"
                    aria-label={t("worldChunks.colorMode")}
                  >
                    <Layers className="size-3.5 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHUNK_COLOR_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode} className="text-xs">
                        {t(`worldChunks.colorModes.${mode}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogHeader>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
            <div className="flex items-center rounded-lg bg-surface-3 p-0.5">
              <ToolButton
                active={tool === "select"}
                label={`${t("worldChunks.tools.select")} · V`}
                onClick={() => setTool("select")}
              >
                <MousePointer2 className="size-3.5" />
              </ToolButton>
              <ToolButton
                active={tool === "pan"}
                label={`${t("worldChunks.tools.pan")} · H`}
                onClick={() => setTool("pan")}
              >
                <Hand className="size-3.5" />
              </ToolButton>
            </div>

            <Divider />

            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setSelection(selectAll(state))}
            >
              {t("worldChunks.tools.all")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              disabled={count === 0}
              onClick={() => setSelection(emptySelection())}
            >
              {t("worldChunks.tools.none")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() =>
                setSelection((previous) => invertSelection(previous, state))
              }
            >
              {t("worldChunks.tools.invert")}
            </Button>
            <ChunkFilterPopover
              disabled={totals.scannedRegions === 0}
              worldDataVersion={totals.dominantDataVersion}
              spawn={spawn}
              onApply={applyFilter}
            />

            <Divider />

            <div className="flex items-center gap-1">
              <Input
                type="number"
                className="h-8 w-20 text-xs"
                placeholder="X"
                aria-label={t("worldChunks.tools.gotoX")}
                value={gotoX}
                onChange={(event) => setGotoX(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") goTo();
                }}
              />
              <Input
                type="number"
                className="h-8 w-20 text-xs"
                placeholder="Z"
                aria-label={t("worldChunks.tools.gotoZ")}
                value={gotoZ}
                onChange={(event) => setGotoZ(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") goTo();
                }}
              />
              <Hint content={t("worldChunks.tools.goto")}>
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="size-8"
                  aria-label={t("worldChunks.tools.goto")}
                  onClick={goTo}
                >
                  <Locate className="size-3.5" />
                </Button>
              </Hint>
            </div>

            <Hint content={`${t("worldChunks.tools.fit")} · F`}>
              <Button
                variant="outline"
                size="icon-sm"
                className="size-8"
                aria-label={t("worldChunks.tools.fit")}
                onClick={() => fitToWorld()}
              >
                <Maximize className="size-3.5" />
              </Button>
            </Hint>
            <Hint content={t("worldChunks.tools.zoomIn")}>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-8"
                aria-label={t("worldChunks.tools.zoomIn")}
                onClick={() => zoomBy(1.25)}
              >
                <ZoomIn className="size-3.5" />
              </Button>
            </Hint>
            <Hint content={t("worldChunks.tools.zoomOut")}>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-8"
                aria-label={t("worldChunks.tools.zoomOut")}
                onClick={() => zoomBy(0.8)}
              >
                <ZoomOut className="size-3.5" />
              </Button>
            </Hint>

            <div className="ml-auto flex items-center gap-2">
              {scanning ? (
                <div className="flex w-52 items-center gap-2">
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                  <Progress
                    value={(progress.done / Math.max(1, progress.total)) * 100}
                    className="h-1.5"
                  />
                  <span className="shrink-0 font-mono text-[0.65rem] text-faint">
                    {progress.done}/{progress.total}
                  </span>
                </div>
              ) : (
                <Hint content={t("worldChunks.tools.rescan")}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-8"
                    aria-label={t("worldChunks.tools.rescan")}
                    disabled={busy}
                    onClick={() => {
                      fittedFor.current = null;
                      reload();
                    }}
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                </Hint>
              )}
            </div>
          </div>

          {locked && lockReason && (
            <div className="flex shrink-0 items-center gap-2 border-b bg-warning/10 px-3 py-1.5 text-[0.7rem] text-warning">
              <TriangleAlert className="size-3.5 shrink-0" />
              {t("worldChunks.readOnly", { reason: lockReason })}
            </div>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_18.5rem]">
            <div className="relative min-h-0 min-w-0">
              <ChunkMap
                className="h-full w-full"
                state={state}
                selection={selection}
                colorMode={colorMode}
                colorContext={colorContext}
                surfaces={satellite ? surfaces.tiles : null}
                surfaceVersion={surfaces.version}
                onVisibleRegions={surfaces.request}
                camera={camera}
                onCameraChange={setCamera}
                tool={tool}
                spawn={spawn}
                focused={focused}
                onHover={setHovered}
                onSelectRect={handleSelectRect}
                onClickChunk={handleClickChunk}
                onResize={handleResize}
              />

              {regionsStatus === "ready" && totals.regions === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <p className="rounded-lg bg-surface-2/90 px-3 py-2 text-xs text-muted-foreground">
                    {t("worldChunks.noRegions")}
                  </p>
                </div>
              )}

              {regionsStatus === "error" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <p className="rounded-lg bg-surface-2/90 px-3 py-2 text-xs text-destructive">
                    {t("worldChunks.loadError")}
                  </p>
                </div>
              )}

              {regionsStatus === "loading" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            <aside className="min-h-0 overflow-y-auto border-l bg-card">
              <ChunkInspector
                locale={locale}
                stats={stats}
                locked={locked}
                lockReason={lockReason}
                busy={busy}
                focused={focused}
                lookup={focusedLookup}
                details={details}
                detailsStatus={detailsStatus}
                onDelete={() => setPending("delete")}
                onReset={() => setPending("reset")}
                onSelectRegion={selectRegionOf}
              />
            </aside>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-1.5 text-[0.65rem] text-faint">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {legend.map((entry) => (
                <span key={entry.key} className="flex items-center gap-1">
                  <span
                    className="size-2.5 rounded-sm"
                    style={{ backgroundColor: rgbCss(entry.rgb) }}
                  />
                  {t(`worldChunks.legend.${entry.key}`)}
                </span>
              ))}
            </div>

            <span className="ml-auto flex items-center gap-3 font-mono">
              {satellite && surfaces.pending > 0 && (
                <span className="flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  {t("worldChunks.rendering", { count: surfaces.pending })}
                </span>
              )}
              {totals.problems > 0 && (
                <span className="text-destructive">
                  {t("worldChunks.problemsCount", { count: totals.problems })}
                </span>
              )}
              {hovered && hoveredBlock && (
                <span>
                  {t("worldChunks.hover", {
                    x: hovered.x,
                    z: hovered.z,
                    block: hoveredBlock,
                  })}
                </span>
              )}
            </span>
          </div>
        </DialogContent>
      </Dialog>

      {pending && (
        <Confirmation
          title={t(`worldChunks.confirm.${pending}Title`)}
          reversible={backupWanted}
          content={[
            {
              text: t(`worldChunks.confirm.${pending}`, {
                count,
                regions: stats.regions,
                size: formatBytes(stats.sizeBytes, sizeLabels, 1),
              }),
            },
            ...(pending === "delete"
              ? [
                  {
                    text: t("worldChunks.confirm.deleteHint"),
                    color: "warning" as const,
                  },
                ]
              : []),
            ...(stats.unscanned > 0
              ? [
                  {
                    text: t("worldChunks.selection.unscanned", {
                      count: stats.unscanned,
                    }),
                    color: "warning" as const,
                  },
                ]
              : []),
          ]}
          buttons={[
            {
              text: t(`worldChunks.actions.${pending}`),
              color: pending === "delete" ? "danger" : "primary",
              onClick: () => runEdit(pending),
            },
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setPending(null),
            },
          ]}
          onClose={() => setPending(null)}
        >
          <label className="flex cursor-pointer items-start gap-2 text-xs">
            <Checkbox
              checked={backupWanted}
              onCheckedChange={(value) => setBackupWanted(value === true)}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span>{t("worldChunks.confirm.backup")}</span>
              <span className="text-[0.65rem] leading-4 text-muted-foreground">
                {t("worldChunks.confirm.backupHint")}
              </span>
            </span>
          </label>
        </Confirmation>
      )}
    </>
  );
}

function ToolButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Hint content={label}>
      <button
        type="button"
        aria-pressed={active}
        aria-label={label}
        onClick={onClick}
        className={cn(
          "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground",
          active && "bg-primary-soft-raised text-foreground",
        )}
      >
        {children}
      </button>
    </Hint>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-border" />;
}
