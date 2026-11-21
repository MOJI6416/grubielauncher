import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
} from "motion/react";
import { useReducedMotionPreference } from "@/lib/motionPreference";

import { cn } from "@/lib/utils";
import { motionTransition } from "@/lib/motion";

const SETTLE_MS = 300;

function useSettled(): boolean {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return settled;
}

export function Collapse({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotionPreference();
  const settled = useSettled();
  const transition = motionTransition(reduced || !settled);
  const node = useRef<HTMLDivElement | null>(null);
  const isOpen = useRef(show);
  isOpen.current = show;

  const clip = (value: "hidden" | "visible") => {
    if (node.current) node.current.style.overflow = value;
  };

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence initial={false}>
        {show && (
          <m.div
            ref={node}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition}
            onAnimationStart={() => {
              if (!isOpen.current) clip("hidden");
            }}
            onAnimationComplete={() => {
              if (isOpen.current) clip("visible");
            }}
            className={cn("shrink-0 overflow-hidden", className)}
          >
            {children}
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}

export function CollapseInline({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotionPreference();
  const settled = useSettled();
  const transition = motionTransition(reduced || !settled);

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence initial={false}>
        {show && (
          <m.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={transition}
            className={cn(
              "flex shrink-0 items-center overflow-hidden",
              className,
            )}
          >
            {children}
          </m.div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
