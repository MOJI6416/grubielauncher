import { useEffect, useRef } from "react";
import { SkinViewer, type SkinViewerOptions } from "skinview3d";
import { resolveLocalImage } from "@renderer/utilities/localMedia";

type ViewerOptions = Omit<SkinViewerOptions, "canvas" | "width" | "height">;

export interface SkinCanvasProps {
  className?: string;
  width: number;
  height: number;
  skinUrl?: string;
  capeUrl?: string;
  options?: ViewerOptions;
  onReady?: (payload: { viewer: SkinViewer; canvas: HTMLCanvasElement }) => void;
}

export default function SkinCanvas({
  className,
  width,
  height,
  skinUrl,
  capeUrl,
  options,
  onReady,
}: SkinCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const viewer = new SkinViewer({
      canvas,
      width: Number(width),
      height: Number(height),
      ...options,
    });
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
    viewerRef.current?.setSize(Number(width), Number(height));
  }, [width, height]);

  return <canvas className={className} ref={canvasRef} />;
}
