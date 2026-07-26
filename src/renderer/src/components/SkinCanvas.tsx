import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SkinViewer, type SkinViewerOptions } from "skinview3d";
import { resolveLocalImage } from "@renderer/utilities/localMedia";

type ViewerOptions = Omit<SkinViewerOptions, "canvas" | "width" | "height">;

const CAMERA_DEPTH_OFFSET = 4.5;
const NOMINAL_HALF_HEIGHT = 16.5;
const NAME_TAG_TOP = 22;

function closestDistance(fov: number, hasNameTag: boolean): number {
  const halfHeight = hasNameTag ? NAME_TAG_TOP : NOMINAL_HALF_HEIGHT;

  return (
    CAMERA_DEPTH_OFFSET + halfHeight / Math.tan(((fov / 180) * Math.PI) / 2)
  );
}

export interface SkinCanvasProps {
  className?: string;
  width: number;
  height: number;
  fillContainer?: boolean;
  skinUrl?: string;
  capeUrl?: string;
  options?: ViewerOptions;
  onReady?: (payload: { viewer: SkinViewer; canvas: HTMLCanvasElement }) => void;
}

export default function SkinCanvas({
  className,
  width,
  height,
  fillContainer = false,
  skinUrl,
  capeUrl,
  options,
  onReady,
}: SkinCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const [measured, setMeasured] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!fillContainer) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;

      const nextWidth = Math.max(1, Math.floor(box.width));
      const nextHeight = Math.max(1, Math.floor(box.height));

      setMeasured((prev) =>
        prev && prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight },
      );
    });

    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [fillContainer]);

  const viewWidth = measured?.width ?? Number(width);
  const viewHeight = measured?.height ?? Number(height);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const viewer = new SkinViewer({
      canvas,
      width: viewWidth,
      height: viewHeight,
      ...options,
    });

    viewer.controls.minDistance = closestDistance(
      viewer.fov,
      Boolean(options?.nameTag),
    );

    viewerRef.current = viewer;
    onReadyRef.current?.({ viewer, canvas });

    const handleVisibility = () => {
      viewer.renderPaused = document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibility);
    handleVisibility();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      viewer.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (skinUrl) void viewer.loadSkin(resolveLocalImage(skinUrl));
    else viewer.resetSkin();
  }, [skinUrl]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (capeUrl) void viewer.loadCape(resolveLocalImage(capeUrl));
    else viewer.resetCape();
  }, [capeUrl]);

  useEffect(() => {
    viewerRef.current?.setSize(viewWidth, viewHeight);
  }, [viewWidth, viewHeight]);

  const canvasElement = <canvas className={className} ref={canvasRef} />;

  if (!fillContainer) return canvasElement;

  return (
    <div
      ref={wrapperRef}
      className="flex h-full w-full min-h-0 min-w-0"
      style={{ minHeight: Number(height) }}
    >
      {canvasElement}
    </div>
  );
}
