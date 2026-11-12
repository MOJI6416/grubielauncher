import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { BackdropFrame, ThemeBackdrop } from "@/shared/themes";
import { BackdropPicture } from "@renderer/components/BackdropPicture";
import { backdropUrl } from "./themesStore";

type Size = { width: number; height: number };

const KEY_STEP = 5;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function useNaturalSize(url: string): Size | null {
  const [size, setSize] = useState<Size | null>(null);

  useEffect(() => {
    setSize(null);
    const image = new Image();
    image.onload = () => setSize({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = url;
    return () => {
      image.onload = null;
    };
  }, [url]);

  return size;
}

function coverOverflow(natural: Size, box: Size): Size {
  const scale = Math.max(box.width / natural.width, box.height / natural.height);
  return {
    width: natural.width * scale - box.width,
    height: natural.height * scale - box.height,
  };
}

export function BackdropFramer({
  backdrop,
  onChange,
}: {
  backdrop: ThemeBackdrop;
  onChange: (frame: Partial<BackdropFrame>) => void;
}) {
  const { t } = useTranslation();
  const url = backdropUrl(backdrop.path);
  const natural = useNaturalSize(url);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Size | null>(null);
  const dragRef = useRef<{ x: number; y: number; focusX: number; focusY: number } | null>(null);
  const isCover = backdrop.fit === "cover";
  const overflow = natural && box ? coverOverflow(natural, box) : null;
  const canPan = isCover && !!overflow && (overflow.width > 1 || overflow.height > 1);
  const isCentered = backdrop.focusX === 50 && backdrop.focusY === 50;

  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const measure = () => setBox({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canPan || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      focusX: backdrop.focusX,
      focusY: backdrop.focusY,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !overflow) return;
    const focusX =
      overflow.width > 1
        ? clampPercent(drag.focusX - ((event.clientX - drag.x) / overflow.width) * 100)
        : backdrop.focusX;
    const focusY =
      overflow.height > 1
        ? clampPercent(drag.focusY - ((event.clientY - drag.y) / overflow.height) * 100)
        : backdrop.focusY;
    if (focusX !== backdrop.focusX || focusY !== backdrop.focusY) onChange({ focusX, focusY });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canPan) return;
    const moves: Record<string, Partial<BackdropFrame>> = {
      ArrowLeft: { focusX: clampPercent(backdrop.focusX - KEY_STEP) },
      ArrowRight: { focusX: clampPercent(backdrop.focusX + KEY_STEP) },
      ArrowUp: { focusY: clampPercent(backdrop.focusY - KEY_STEP) },
      ArrowDown: { focusY: clampPercent(backdrop.focusY + KEY_STEP) },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onChange(move);
  };

  return (
    <div className="flex w-44 shrink-0 flex-col gap-1.5">
      <div
        ref={boxRef}
        role="group"
        tabIndex={canPan ? 0 : -1}
        aria-label={t("theme.editor.framing")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => canPan && onChange({ focusX: 50, focusY: 50 })}
        className={cn(
          "@container relative isolate w-full touch-none overflow-hidden rounded-md border border-border bg-background select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          canPan && "cursor-grab active:cursor-grabbing",
        )}
        style={{ aspectRatio: `${window.innerWidth} / ${window.innerHeight}` }}
      >
        <BackdropPicture url={url} frame={backdrop} blur={backdrop.blur} unit="cqw" />
      </div>
      {canPan && (
        <div className="flex min-w-0 items-center gap-2 text-[0.65rem] leading-tight text-faint">
          <span className="min-w-0 flex-1">{t("theme.editor.framingHint")}</span>
          {!isCentered && (
            <button
              type="button"
              onClick={() => onChange({ focusX: 50, focusY: 50 })}
              className="shrink-0 rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t("theme.editor.framingCenter")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
