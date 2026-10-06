import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Loader2,
  Minus,
  Plus,
  RotateCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { useLatestRef } from "@renderer/utilities/useLatestRef";
import {
  FIT_VIEW,
  actualScale,
  clampView,
  fitSize,
  isZoomed,
  stepScale,
  toggleTarget,
  wheelScale,
  zoomAt,
  zoomLimit,
  zoomPercent,
  type Point,
  type Size,
  type View,
} from "./zoom";

export interface MediaViewerItem {
  key: string;
  src: string;
  thumbnail?: string;
  alt?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
}

interface MediaViewerProps {
  title: string;
  items: MediaViewerItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  actions?: (item: MediaViewerItem) => ReactNode;
  onKeyDown?: (event: KeyboardEvent, item: MediaViewerItem) => boolean;
  keysDisabled?: boolean;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
  onImage: boolean;
}

const EMPTY_SIZE: Size = { width: 0, height: 0 };
const DRAG_THRESHOLD = 4;

export function MediaViewerAction({
  label,
  onClick,
  danger,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Hint content={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "size-8 text-muted-foreground hover:text-foreground",
          danger && "hover:bg-destructive/15 hover:text-destructive",
        )}
      >
        {children}
      </Button>
    </Hint>
  );
}

function pointFromEvent(
  stage: HTMLElement,
  event: { clientX: number; clientY: number },
): Point {
  const rect = stage.getBoundingClientRect();
  return {
    x: event.clientX - rect.left - rect.width / 2,
    y: event.clientY - rect.top - rect.height / 2,
  };
}

export function MediaViewer({
  title,
  items,
  index,
  onIndexChange,
  onClose,
  actions,
  onKeyDown,
  keysDisabled = false,
}: MediaViewerProps) {
  const { t } = useTranslation();
  const count = items.length;
  const current = items[Math.min(Math.max(index, 0), Math.max(count - 1, 0))];
  const currentKey = current?.key ?? "";

  const [stageNode, setStageNode] = useState<HTMLDivElement | null>(null);
  const [stripNode, setStripNode] = useState<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const [stage, setStage] = useState<Size>(EMPTY_SIZE);
  const [natural, setNatural] = useState<{ key: string; size: Size } | null>(
    null,
  );
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View>(FIT_VIEW);
  const [isDragging, setIsDragging] = useState(false);

  const naturalSize =
    natural && natural.key === currentKey ? natural.size : EMPTY_SIZE;
  const fit = fitSize(naturalSize, stage);
  const limit = zoomLimit(naturalSize, fit);
  const isLoaded = fit.width > 0;
  const isFailed = failedKey === currentKey;
  const zoomed = isZoomed(view);
  const pixelated = isLoaded && view.scale / actualScale(naturalSize, fit) >= 2;

  const layoutRef = useLatestRef({ fit, stage, limit, view, isLoaded, naturalSize });

  const applyView = useCallback(
    (next: View) => {
      const { fit, stage, limit } = layoutRef.current;
      setView(clampView(next, fit, stage, limit));
    },
    [layoutRef],
  );

  useEffect(() => {
    setView(FIT_VIEW);
    setFailedKey(null);
  }, [currentKey]);

  useEffect(() => {
    const node = stageNode;
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStage({ width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [stageNode]);

  useEffect(() => {
    setView((value) => clampView(value, fit, stage, limit));
  }, [fit.width, fit.height, stage, limit]);

  useEffect(() => {
    if (count < 2) return;
    for (const offset of [1, -1]) {
      const neighbour = items[(index + offset + count) % count];
      if (neighbour) new Image().src = neighbour.src;
    }
  }, [count, index, items]);

  useEffect(() => {
    const active = stripNode?.querySelector<HTMLElement>(
      `[data-index="${index}"]`,
    );
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [index, count, stripNode]);

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      onIndexChange((index + delta + count) % count);
    },
    [count, index, onIndexChange],
  );

  const zoomBy = useCallback(
    (direction: 1 | -1) => {
      const { view, isLoaded } = layoutRef.current;
      if (!isLoaded) return;
      applyView(zoomAt(view, stepScale(view.scale, direction), { x: 0, y: 0 }));
    },
    [applyView, layoutRef],
  );

  const resetView = useCallback(() => setView(FIT_VIEW), []);

  useEffect(() => {
    const node = stageNode;
    if (!node) return;

    const onWheel = (event: WheelEvent) => {
      const { view, isLoaded } = layoutRef.current;
      if (!isLoaded) return;
      event.preventDefault();

      const unit = event.deltaMode === 1 ? 16 : 1;
      const delta = event.deltaY * unit * (event.ctrlKey ? 6 : 1);
      applyView(
        zoomAt(view, wheelScale(view.scale, delta), pointFromEvent(node, event)),
      );
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [applyView, layoutRef, stageNode]);

  useEffect(() => {
    if (keysDisabled || !current) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (onKeyDown?.(event, current)) {
        event.preventDefault();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === "Home") onIndexChange(0);
      else if (event.key === "End") onIndexChange(Math.max(0, count - 1));
      else if (event.key === "+" || event.key === "=") zoomBy(1);
      else if (event.key === "-" || event.key === "_") zoomBy(-1);
      else if (event.key === "0") resetView();
      else return;
      event.preventDefault();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    count,
    current,
    go,
    keysDisabled,
    onIndexChange,
    onKeyDown,
    resetView,
    zoomBy,
  ]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
      moved: false,
      onImage: target.tagName === "IMG",
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!zoomed) return;

    if (!drag.moved) {
      drag.moved = true;
      setIsDragging(true);
    }
    applyView({ scale: view.scale, x: drag.originX + dx, y: drag.originY + dy });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.moved || Math.hypot(dx, dy) >= DRAG_THRESHOLD) return;

    const node = stageNode;
    if (zoomed) {
      resetView();
      return;
    }
    if (drag.onImage && node && isLoaded) {
      applyView(
        zoomAt(view, toggleTarget(naturalSize, fit), pointFromEvent(node, event)),
      );
      return;
    }
    if (!drag.onImage) onClose();
  };

  const handlePointerCancel = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const percent = zoomPercent(view, naturalSize, fit);

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        style={{
          top: "calc(env(titlebar-area-height, 0px))",
          left: 0,
          right: 0,
          bottom: 0,
          width: "auto",
          height: "auto",
          maxWidth: "none",
          maxHeight: "none",
          margin: 0,
          transform: "none",
        }}
        className="flex flex-col gap-0 rounded-none border-0 bg-background/90 p-0 shadow-none ring-0 backdrop-blur-md"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (!zoomed) return;
          event.preventDefault();
          resetView();
        }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>

        <div className="z-10 mx-auto mt-3 flex w-[min(100%-2rem,60rem)] shrink-0 items-center gap-2 rounded-xl border border-border bg-surface-1/95 py-1.5 pr-1.5 pl-2.5 shadow-lg">
          {current?.leading}
          <div className="flex min-w-0 flex-1 flex-col">
            {current?.title && (
              <span className="min-w-0 truncate text-sm leading-5 text-foreground">
                {current.title}
              </span>
            )}
            {current?.subtitle && (
              <span className="min-w-0 truncate text-[11px] leading-4 text-muted-foreground">
                {current.subtitle}
              </span>
            )}
          </div>

          {count > 1 && (
            <span className="shrink-0 px-1 font-mono text-xs tabular-nums text-faint">
              {index + 1} / {count}
            </span>
          )}

          <div className="flex shrink-0 items-center rounded-lg border border-border bg-surface-2/60">
            <MediaViewerAction
              label={t("mediaViewer.zoomOut")}
              disabled={!isLoaded || !zoomed}
              onClick={() => zoomBy(-1)}
            >
              <Minus />
            </MediaViewerAction>
            <Hint content={t("mediaViewer.fit")}>
              <button
                type="button"
                disabled={!isLoaded}
                aria-label={t("mediaViewer.fit")}
                className="h-8 min-w-12 rounded-md px-1 font-mono text-[11px] tabular-nums text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                onClick={resetView}
              >
                {isLoaded ? `${percent}%` : "—"}
              </button>
            </Hint>
            <MediaViewerAction
              label={t("mediaViewer.zoomIn")}
              disabled={!isLoaded || view.scale >= limit}
              onClick={() => zoomBy(1)}
            >
              <Plus />
            </MediaViewerAction>
          </div>

          {current && actions && (
            <div className="flex shrink-0 items-center gap-0.5">
              {actions(current)}
            </div>
          )}

          <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />
          <MediaViewerAction label={t("common.close")} onClick={onClose}>
            <X />
          </MediaViewerAction>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            ref={setStageNode}
            className={cn(
              "absolute inset-y-3 touch-none",
              count > 1 ? "inset-x-20" : "inset-x-4",
              isLoaded &&
                (isDragging
                  ? "cursor-grabbing"
                  : zoomed
                    ? "cursor-grab"
                    : "cursor-zoom-in"),
            )}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {current && !isFailed && (
                <img
                  key={`${current.key}-${attempt}`}
                  src={current.src}
                  alt={current.alt ?? ""}
                  draggable={false}
                  decoding="async"
                  className={cn(
                    "pointer-events-auto max-w-none rounded-lg bg-surface-2/40 shadow-2xl select-none",
                    isLoaded ? "animate-in fade-in-0 duration-150" : "invisible",
                  )}
                  style={{
                    width: isLoaded ? fit.width : undefined,
                    height: isLoaded ? fit.height : undefined,
                    transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
                    transition: isDragging ? "none" : "transform 140ms ease-out",
                    imageRendering: pixelated ? "pixelated" : undefined,
                    willChange: "transform",
                  }}
                  onLoad={(event) => {
                    const { naturalWidth, naturalHeight } = event.currentTarget;
                    setNatural({
                      key: current.key,
                      size: { width: naturalWidth, height: naturalHeight },
                    });
                  }}
                  onError={() => setFailedKey(current.key)}
                />
              )}
            </div>

            {current && !isLoaded && !isFailed && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {isFailed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                <span className="flex size-10 items-center justify-center rounded-lg bg-surface-2">
                  <ImageOff className="size-5 text-faint" />
                </span>
                <p className="text-xs text-muted-foreground">
                  {t("mediaViewer.loadError")}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => {
                    setFailedKey(null);
                    setAttempt((value) => value + 1);
                  }}
                >
                  <RotateCw className="size-3.5" />
                  {t("common.retry")}
                </Button>
              </div>
            )}
          </div>

          {count > 1 && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => go(-1)}
                className="absolute top-1/2 left-5 -translate-y-1/2 rounded-full shadow-lg"
                aria-label={t("common.previous")}
              >
                <ChevronLeft className="size-5" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => go(1)}
                className="absolute top-1/2 right-5 -translate-y-1/2 rounded-full shadow-lg"
                aria-label={t("common.next")}
              >
                <ChevronRight className="size-5" />
              </Button>
            </>
          )}
        </div>

        {count > 1 && (
          <div
            ref={setStripNode}
            className="z-10 mx-auto mb-3 flex max-w-[calc(100%-2rem)] shrink-0 gap-1.5 overflow-x-auto rounded-xl border border-border bg-surface-1/95 p-1.5 shadow-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {items.map((item, position) => (
              <button
                key={item.key}
                type="button"
                data-index={position}
                aria-label={`${position + 1} / ${count}`}
                aria-current={position === index}
                onClick={() => onIndexChange(position)}
                className={cn(
                  "h-12 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-surface-2 transition-opacity focus-visible:outline-none",
                  position === index
                    ? "border-primary"
                    : "border-transparent opacity-55 hover:opacity-100",
                )}
              >
                <img
                  src={item.thumbnail ?? item.src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="size-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
