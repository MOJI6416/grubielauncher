import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface IndicatorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface IndicatorState {
  box: IndicatorBox | null;
  visible: boolean;
  animate: boolean;
}

const ACTIVE_SELECTOR = '[data-indicator-active="true"]';
const ITEM_SELECTOR = "[data-indicator-active]";
const SLIDE = "var(--dur-slow) var(--ease-swift)";
const FADE = "var(--dur) var(--ease-swift)";

function sameBox(a: IndicatorBox | null, b: IndicatorBox | null): boolean {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.x === b.x &&
      a.y === b.y &&
      a.width === b.width &&
      a.height === b.height)
  );
}

export function indicatorTransition(animate: boolean): string {
  return animate
    ? `transform ${SLIDE}, width ${SLIDE}, height ${SLIDE}, opacity ${FADE}`
    : `opacity ${FADE}`;
}

export function useSlidingIndicator<T extends HTMLElement>({
  activeSelector = ACTIVE_SELECTOR,
  itemSelector = ITEM_SELECTOR,
}: { activeSelector?: string; itemSelector?: string } = {}) {
  const containerRef = useRef<T>(null);
  const [state, setState] = useState<IndicatorState>({
    box: null,
    visible: false,
    animate: false,
  });

  const measure = () => {
    const container = containerRef.current;
    if (!container) return;

    const active = container.querySelector<HTMLElement>(activeSelector);
    if (!active) {
      setState((previous) =>
        previous.visible ? { ...previous, visible: false } : previous,
      );
      return;
    }

    const box = {
      x: active.offsetLeft,
      y: active.offsetTop,
      width: active.offsetWidth,
      height: active.offsetHeight,
    };
    setState((previous) =>
      previous.visible && sameBox(previous.box, box)
        ? previous
        : { box, visible: true, animate: previous.visible },
    );
  };

  const observerRef = useRef<ResizeObserver | null>(null);
  const measureRef = useRef(measure);
  measureRef.current = measure;

  useLayoutEffect(() => {
    measure();

    const container = containerRef.current;
    if (!container) return;

    observerRef.current ??= new ResizeObserver(() => measureRef.current());
    observerRef.current.observe(container);
    container
      .querySelectorAll<HTMLElement>(itemSelector)
      .forEach((item) => observerRef.current?.observe(item));
  });

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return {
    containerRef,
    box: state.box,
    visible: state.visible,
    transition: indicatorTransition(state.animate),
  };
}
