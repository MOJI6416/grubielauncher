import { type ReactNode, useRef } from "react";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import { MOTION_DURATION_FAST, MOTION_DURATION_SLOW } from "@/lib/motion";
import { cn } from "@/lib/utils";

type SourceKeys = ReadonlySet<string> | null;

const COLLAPSE_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];

export function RemovalList({
  sourceKeys,
  children,
}: {
  sourceKeys: ReadonlySet<string>;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence initial={false} custom={reduced ? null : sourceKeys}>
        {children}
      </AnimatePresence>
    </LazyMotion>
  );
}

function parentGap(element: HTMLElement | null): number {
  const parent = element?.parentElement;
  if (!parent) return 0;
  const gap = parseFloat(getComputedStyle(parent).rowGap);
  return Number.isFinite(gap) ? gap : 0;
}

export function RemovalItem({
  itemKey,
  className,
  children,
}: {
  itemKey: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <m.div
      ref={ref}
      className={cn("flex flex-col", className)}
      exit="removed"
      variants={{
        removed: (sourceKeys: SourceKeys) =>
          !sourceKeys || sourceKeys.has(itemKey)
            ? { opacity: 0, height: 0, transition: { duration: 0 } }
            : {
                opacity: 0,
                height: 0,
                marginBottom: -parentGap(ref.current),
                overflow: "hidden",
                transition: {
                  duration: MOTION_DURATION_SLOW,
                  ease: COLLAPSE_EASE,
                  opacity: { duration: MOTION_DURATION_FAST },
                },
              },
      }}
    >
      {children}
    </m.div>
  );
}
