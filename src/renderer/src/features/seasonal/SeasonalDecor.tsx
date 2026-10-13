import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import {
  BAT_DOWN,
  BAT_UP,
  cobwebPath,
  spriteRuns,
  spriteSize,
  type Sprite,
} from "./sprites";
import { batFlockRequestAtom, seasonalEventAtom } from "./seasonalStore";

const COBWEB = cobwebPath();
const FLOCK_LIMIT = 2;
const PATH_STEPS = 14;
const FIRST_FLIGHT_MS = 9000;
const BAT_SCALE = 2;

export function PixelSprite({
  sprite,
  scale = 1,
  className,
}: {
  sprite: Sprite;
  scale?: number;
  className?: string;
}) {
  const { width, height } = spriteSize(sprite);

  return (
    <svg
      aria-hidden
      focusable="false"
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      className={className}
    >
      {spriteRuns(sprite).map((run) => (
        <rect
          key={`${run.x}:${run.y}`}
          x={run.x}
          y={run.y}
          width={run.width}
          height={1}
          fill={run.fill}
        />
      ))}
    </svg>
  );
}

function CornerWeb({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 100 100"
      className={cn("halloween-web pointer-events-none absolute", className)}
    >
      <path
        d={COBWEB}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function useHalloween(): boolean {
  return useAtomValue(seasonalEventAtom)?.id === "halloween";
}

export function SeasonalBackdrop() {
  if (!useHalloween()) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="halloween-glow absolute inset-0" />
      <div className="halloween-fog halloween-fog-far" />
      <div className="halloween-fog halloween-fog-near" />
      <CornerWeb className="right-0 bottom-0 size-32 rotate-180" />
    </div>
  );
}

export function SeasonalSidebarWeb() {
  if (!useHalloween()) return null;

  return <CornerWeb className="top-0 right-0 -z-10 size-24 -scale-x-100" />;
}

interface BatFlight {
  key: string;
  fromLeft: boolean;
  startY: number;
  endY: number;
  waves: number;
  amplitude: number;
  duration: number;
  delay: number;
  scale: number;
}

interface Flock {
  id: number;
  bats: BatFlight[];
}

function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function makeFlock(id: number, height: number): Flock {
  const fromLeft = Math.random() < 0.5;
  const startY = between(0.35, 0.85) * height;
  const endY = startY - between(0.2, 0.5) * height;
  const size = 2 + Math.floor(Math.random() * 3);

  return {
    id,
    bats: Array.from({ length: size }, (_, index) => ({
      key: `${id}:${index}`,
      fromLeft,
      startY: startY + between(-36, 36),
      endY: endY + between(-48, 48),
      waves: between(1.5, 3),
      amplitude: between(8, 22),
      duration: between(5200, 7200),
      delay: index * between(160, 420),
      scale: between(0.9, 1.3),
    })),
  };
}

function flockLifetime(flock: Flock): number {
  return Math.max(...flock.bats.map((bat) => bat.delay + bat.duration)) + 250;
}

function flightKeyframes(flight: BatFlight, width: number): Keyframe[] {
  const margin = 48;
  const from = flight.fromLeft ? -margin : width + margin;
  const to = flight.fromLeft ? width + margin : -margin;

  return Array.from({ length: PATH_STEPS + 1 }, (_, step) => {
    const progress = step / PATH_STEPS;
    const x = from + (to - from) * progress;
    const y =
      flight.startY +
      (flight.endY - flight.startY) * progress +
      Math.sin(progress * Math.PI * 2 * flight.waves) * flight.amplitude;
    return {
      transform: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${flight.scale.toFixed(2)})`,
    };
  });
}

function nextFlightDelay(isPeak: boolean): number {
  return isPeak ? between(25_000, 55_000) : between(70_000, 160_000);
}

function Bat({ flight }: { flight: BatFlight }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const animation = element.animate(
      flightKeyframes(flight, window.innerWidth),
      {
        duration: flight.duration,
        delay: flight.delay,
        easing: "linear",
        fill: "both",
      },
    );

    return () => animation.cancel();
  }, [flight]);

  return (
    <div ref={ref} className="absolute top-0 left-0 will-change-transform">
      <div className="halloween-bat">
        <PixelSprite sprite={BAT_UP} scale={BAT_SCALE} />
        <PixelSprite sprite={BAT_DOWN} scale={BAT_SCALE} />
      </div>
    </div>
  );
}

export function SeasonalBats() {
  const event = useAtomValue(seasonalEventAtom);
  const request = useAtomValue(batFlockRequestAtom);
  const reducedMotion = useReducedMotion() === true;
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<number>());

  const isHalloween = event?.id === "halloween";
  const isPeak = event?.isPeak === true;
  const canFly = isHalloween && !reducedMotion;

  const launch = useCallback(() => {
    if (document.visibilityState !== "visible") return;

    nextId.current += 1;
    const flock = makeFlock(nextId.current, window.innerHeight);

    setFlocks((current) =>
      current.length >= FLOCK_LIMIT ? current : [...current, flock],
    );

    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setFlocks((current) => current.filter((item) => item.id !== flock.id));
    }, flockLifetime(flock));
    timers.current.add(timer);
  }, []);

  useEffect(() => {
    if (!canFly) return;

    let timer = 0;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        launch();
        schedule(nextFlightDelay(isPeak));
      }, delay);
    };

    schedule(FIRST_FLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [canFly, isPeak, launch]);

  useEffect(() => {
    if (request > 0 && canFly) launch();
  }, [request, canFly, launch]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  if (!canFly || flocks.length === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
    >
      {flocks.flatMap((flock) =>
        flock.bats.map((bat) => <Bat key={bat.key} flight={bat} />),
      )}
    </div>
  );
}
