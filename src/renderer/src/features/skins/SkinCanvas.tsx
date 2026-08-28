import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  CrouchAnimation,
  FlyingAnimation,
  IdleAnimation,
  RunningAnimation,
  SkinViewer,
  WalkingAnimation,
  WaveAnimation,
  type PlayerAnimation,
  type SkinViewerOptions,
} from "skinview3d";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import { stageExtents, stageZoom } from "./stageCamera";

export type SkinAnimation =
  | "none"
  | "idle"
  | "walk"
  | "run"
  | "fly"
  | "wave"
  | "crouch";

export const SKIN_ANIMATIONS: SkinAnimation[] = [
  "none",
  "idle",
  "walk",
  "run",
  "fly",
  "wave",
  "crouch",
];

type ViewerOptions = Omit<SkinViewerOptions, "canvas" | "width" | "height">;

const CAMERA_DEPTH_OFFSET = 4.5;

function closestDistance(fov: number, halfHeight: number): number {
  return (
    CAMERA_DEPTH_OFFSET + halfHeight / Math.tan(((fov / 180) * Math.PI) / 2)
  );
}

function createAnimation(animation: SkinAnimation): PlayerAnimation | null {
  switch (animation) {
    case "idle":
      return new IdleAnimation();
    case "walk":
      return new WalkingAnimation();
    case "run":
      return new RunningAnimation();
    case "fly":
      return new FlyingAnimation();
    case "wave":
      return new WaveAnimation();
    case "crouch":
      return new CrouchAnimation();
    default:
      return null;
  }
}

export interface SkinCanvasProps {
  className?: string;
  width: number;
  height: number;
  fillContainer?: boolean;
  skinUrl?: string;
  capeUrl?: string;
  model?: "classic" | "slim" | "auto";
  showOuterLayer?: boolean;
  backEquipment?: "cape" | "elytra";
  animation?: SkinAnimation;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  nameTag?: string | null;
  paused?: boolean;
  options?: ViewerOptions;
  onReady?: (payload: { viewer: SkinViewer; canvas: HTMLCanvasElement }) => void;
  onTextureError?: (kind: "skin" | "cape") => void;
}

export default function SkinCanvas({
  className,
  width,
  height,
  fillContainer = false,
  skinUrl,
  capeUrl,
  model = "auto",
  showOuterLayer = true,
  backEquipment = "cape",
  animation = "none",
  autoRotate = false,
  autoRotateSpeed = 1,
  nameTag = null,
  paused = false,
  options,
  onReady,
  onTextureError,
}: SkinCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const onReadyRef = useRef(onReady);
  const onTextureErrorRef = useRef(onTextureError);
  const visibleRef = useRef(true);
  const pausedRef = useRef(paused);

  onReadyRef.current = onReady;
  onTextureErrorRef.current = onTextureError;
  pausedRef.current = paused;

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

    viewerRef.current = viewer;
    onReadyRef.current?.({ viewer, canvas });

    const syncPaused = () => {
      if (viewer.disposed) return;
      viewer.renderPaused =
        document.hidden || pausedRef.current || !visibleRef.current;
    };

    document.addEventListener("visibilitychange", syncPaused);
    syncPaused();

    const intersection = new IntersectionObserver((entries) => {
      visibleRef.current = entries.some((entry) => entry.isIntersecting);
      syncPaused();
    });
    intersection.observe(canvas);

    return () => {
      intersection.disconnect();
      document.removeEventListener("visibilitychange", syncPaused);
      viewerRef.current = null;
      viewer.dispose();

      try {
        viewer.renderer.forceContextLoss();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.disposed) return;

    viewer.renderPaused = document.hidden || paused || !visibleRef.current;
  }, [paused]);

  const skinTokenRef = useRef(0);
  const capeTokenRef = useRef(0);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.disposed) return;

    const token = ++skinTokenRef.current;

    if (!skinUrl) {
      viewer.resetSkin();
      return;
    }

    void Promise.resolve(
      viewer.loadSkin(resolveLocalImage(skinUrl), {
        model: model === "auto" ? "auto-detect" : model === "slim" ? "slim" : "default",
      }),
    )
      .then(() => {
        const current = viewerRef.current;
        if (!current || current.disposed) return;
        if (skinTokenRef.current !== token) return;

        current.playerObject.skin.setOuterLayerVisible(showOuterLayer);
      })
      .catch(() => {
        if (skinTokenRef.current !== token) return;

        const current = viewerRef.current;
        if (current && !current.disposed) current.resetSkin();
        onTextureErrorRef.current?.("skin");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skinUrl, model]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.disposed) return;

    const token = ++capeTokenRef.current;

    if (!capeUrl) {
      viewer.resetCape();
      return;
    }

    void Promise.resolve(
      viewer.loadCape(resolveLocalImage(capeUrl), { backEquipment }),
    ).catch(() => {
      if (capeTokenRef.current !== token) return;

      const current = viewerRef.current;
      if (current && !current.disposed) current.resetCape();
      onTextureErrorRef.current?.("cape");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capeUrl]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.disposed || !capeUrl) return;

    viewer.playerObject.backEquipment = backEquipment;
  }, [backEquipment, capeUrl]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.disposed) return;

    viewer.playerObject.skin.setOuterLayerVisible(showOuterLayer);
  }, [showOuterLayer]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.disposed) return;

    viewer.animation = createAnimation(animation);
  }, [animation]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.disposed) return;

    viewer.autoRotate = autoRotate;
    viewer.autoRotateSpeed = autoRotateSpeed;
  }, [autoRotate, autoRotateSpeed]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.disposed) return;

    viewer.nameTag = nameTag || null;
  }, [nameTag]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.disposed) return;

    viewer.setSize(viewWidth, viewHeight);
  }, [viewWidth, viewHeight]);

  const fit = {
    width: viewWidth,
    height: viewHeight,
    hasNameTag: Boolean(nameTag),
    hasElytra: Boolean(capeUrl) && backEquipment === "elytra",
    raisesArm: animation === "wave",
  };
  const zoom = stageZoom(fit);
  const { halfHeight } = stageExtents(fit);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.disposed) return;

    viewer.zoom = zoom;
    viewer.controls.minDistance = closestDistance(viewer.fov, halfHeight * 0.4);
  }, [zoom, halfHeight]);

  const canvasElement = <canvas className={className} ref={canvasRef} />;

  if (!fillContainer) return canvasElement;

  return (
    <div
      ref={wrapperRef}
      className="flex h-full min-h-0 w-full min-w-0"
      style={{ minHeight: Number(height) }}
    >
      {canvasElement}
    </div>
  );
}
