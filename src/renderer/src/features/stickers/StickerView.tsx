import { memo, useEffect, useRef, useState } from "react";
import type { AnimationItem } from "lottie-web";
import { cn } from "@/lib/utils";
import type { StickerItem } from "./catalog";
import { loadLottie, loadStickerData, stickerPoster } from "./stickerData";

const EMOJI_FONT =
  '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

export type StickerMode = "inline" | "preview";

function restFrame(animation: AnimationItem, position: number) {
  return Math.min(
    animation.totalFrames - 1,
    Math.max(0, Math.floor(animation.totalFrames * position)),
  );
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function StickerViewComponent({
  sticker,
  size,
  mode = "preview",
  playOnAppear = false,
  className,
}: {
  sticker: StickerItem;
  size: number;
  mode?: StickerMode;
  playOnAppear?: boolean;
  className?: string;
}) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const animationRef = useRef<AnimationItem | null>(null);
  const hoverRef = useRef(false);
  const settlingRef = useRef(false);
  const pendingPlayRef = useRef(false);
  const [isLive, setLive] = useState(false);
  const [isReady, setReady] = useState(false);
  const poster = stickerPoster(sticker);

  useEffect(() => {
    const root = rootRef.current;
    if (mode !== "inline" || !root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        if (playOnAppear && !prefersReducedMotion()) pendingPlayRef.current = true;
        setLive(true);
      },
      { threshold: 0.6 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [mode, playOnAppear]);

  useEffect(() => {
    const host = hostRef.current;
    if (!isLive || !host) return;

    let cancelled = false;
    let animation: AnimationItem | null = null;

    const release = () => {
      if (mode === "preview") setLive(false);
    };

    void Promise.all([loadLottie(), loadStickerData(sticker)])
      .then(([lottie, data]) => {
        if (cancelled) return;
        animation = lottie.loadAnimation({
          container: host,
          renderer: "svg",
          loop: false,
          autoplay: false,
          animationData: structuredClone(data),
          rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
        });

        const current = animation;
        const rest = restFrame(current, sticker.rest);
        current.addEventListener("enterFrame", () => {
          if (!settlingRef.current || hoverRef.current) return;
          if (current.currentFrame < rest) return;
          settlingRef.current = false;
          current.goToAndStop(rest, true);
          release();
        });
        current.addEventListener("complete", () => {
          if (hoverRef.current) {
            current.goToAndPlay(0, true);
            return;
          }
          if (rest === 0) {
            current.goToAndStop(0, true);
            release();
            return;
          }
          settlingRef.current = true;
          current.goToAndPlay(0, true);
        });

        current.goToAndStop(rest, true);
        animationRef.current = current;
        setReady(true);

        const shouldPlay = pendingPlayRef.current || hoverRef.current;
        pendingPlayRef.current = false;
        if (shouldPlay && !prefersReducedMotion()) {
          settlingRef.current = false;
          current.goToAndPlay(rest, true);
        } else {
          release();
        }
      })
      .catch(() => release());

    return () => {
      cancelled = true;
      animation?.destroy();
      animationRef.current = null;
      settlingRef.current = false;
      setReady(false);
    };
  }, [isLive, mode, sticker]);

  const handleEnter = () => {
    hoverRef.current = true;
    if (prefersReducedMotion()) return;

    const animation = animationRef.current;
    if (!animation) {
      setLive(true);
      return;
    }
    if (!animation.isPaused) return;
    settlingRef.current = false;
    animation.goToAndPlay(restFrame(animation, sticker.rest), true);
  };

  const handleLeave = () => {
    hoverRef.current = false;
  };

  return (
    <span
      ref={rootRef}
      role="img"
      aria-label={sticker.emoji}
      className={cn("relative inline-block shrink-0 select-none", className)}
      style={{ width: size, height: size }}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
    >
      {poster ? (
        <img
          src={poster}
          alt=""
          draggable={false}
          decoding="async"
          className={cn("absolute inset-0 size-full", isReady && "invisible")}
        />
      ) : (
        !isReady && (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center leading-none"
            style={{ fontFamily: EMOJI_FONT, fontSize: Math.round(size * 0.72) }}
          >
            {sticker.emoji}
          </span>
        )
      )}
      {isLive && (
        <span
          ref={hostRef}
          aria-hidden
          className={cn(
            "absolute inset-0 [&>svg]:block",
            !isReady && "invisible",
          )}
        />
      )}
    </span>
  );
}

export const StickerView = memo(StickerViewComponent);
