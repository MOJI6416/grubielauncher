import { Suspense, useEffect, useState } from "react";
import type { SkinViewer } from "skinview3d";
import { cn } from "@/lib/utils";
import { Version } from "@renderer/classes/Version";
import { loaderTint } from "@renderer/features/instances/InstanceArt";
import { useInstanceScreenshots } from "@renderer/features/instances/useInstanceScreenshots";
import { useOwnSkin } from "@renderer/features/skins/useOwnSkin";
import { lazyWithPreload } from "@renderer/utilities/lazyPreload";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import { usePageVisible } from "@renderer/utilities/usePageVisible";

const LazySkinCanvas = lazyWithPreload(
  () => import("@renderer/features/skins/SkinCanvas"),
);

const SLIDE_MS = 5000;
const RUNNER_TURN = 0.6;

function poseRunner({ viewer }: { viewer: SkinViewer }) {
  viewer.controls.enabled = false;
  viewer.playerWrapper.rotation.y = RUNNER_TURN;
}

function preloadTexture(url: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = resolveLocalImage(url);
  });
}

function useRunnerReady(skinUrl?: string, capeUrl?: string): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    if (!skinUrl) return;

    let cancelled = false;
    void Promise.all([
      LazySkinCanvas.preload(),
      preloadTexture(skinUrl),
      capeUrl ? preloadTexture(capeUrl) : null,
    ])
      .catch(() => {})
      .then(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [skinUrl, capeUrl]);

  return ready;
}

export function LaunchCompanion({
  instance,
  caption,
}: {
  instance: Version;
  caption?: string;
}) {
  const visible = usePageVisible();
  const screenshots = useInstanceScreenshots(instance.versionPath, true);
  const skin = useOwnSkin(true);
  const runnerReady = useRunnerReady(skin?.skin, skin?.cape);
  const [slides, setSlides] = useState({ current: 0, previous: -1 });

  useEffect(() => {
    if (screenshots.length < 2 || !visible) return;

    const timer = window.setInterval(() => {
      setSlides((state) => ({
        current: (state.current + 1) % screenshots.length,
        previous: state.current,
      }));
    }, SLIDE_MS);

    return () => window.clearInterval(timer);
  }, [screenshots.length, visible]);

  const art = resolveLocalImage(instance.version.image);

  return (
    <div className="relative h-full overflow-hidden border-l border-border bg-surface-1">
      {screenshots.length > 0 ? (
        screenshots.map((url, index) => (
          <img
            key={url}
            src={url}
            alt=""
            aria-hidden
            draggable={false}
            decoding="async"
            className={cn(
              "pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-1000 select-none",
              index === slides.current ? "opacity-60" : "opacity-0",
              (index === slides.current || index === slides.previous) &&
                "slide-drift",
            )}
          />
        ))
      ) : art ? (
        <img
          src={art}
          alt=""
          aria-hidden
          draggable={false}
          className="hero-drift pointer-events-none absolute inset-0 size-full object-cover opacity-40 blur-xl select-none"
        />
      ) : (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent",
            loaderTint(instance.version.loader.name),
          )}
        />
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-1 via-surface-1/25 to-surface-1/10" />

      {skin?.skin && runnerReady && (
        <div className="pointer-events-none absolute inset-x-0 top-3 bottom-6 animate-in duration-500 fade-in">
          <Suspense fallback={null}>
            <LazySkinCanvas
              skinUrl={skin.skin}
              capeUrl={skin.cape}
              animation="run"
              width={240}
              height={150}
              fillContainer
              paused={!visible}
              onReady={poseRunner}
            />
          </Suspense>
        </div>
      )}

      {caption && (
        <p className="absolute inset-x-3 bottom-2 truncate text-center text-[0.65rem] text-muted-foreground">
          {caption}
        </p>
      )}
    </div>
  );
}
