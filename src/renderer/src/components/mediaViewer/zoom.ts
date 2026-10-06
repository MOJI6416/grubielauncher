export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface View {
  scale: number;
  x: number;
  y: number;
}

export const FIT_VIEW: View = { scale: 1, x: 0, y: 0 };

const MIN_ZOOM_LIMIT = 4;
const PIXEL_ZOOM_LIMIT = 4;
const WHEEL_STEP = 0.0015;
const STEP_FACTOR = 1.25;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function fitSize(natural: Size, stage: Size): Size {
  if (
    natural.width <= 0 ||
    natural.height <= 0 ||
    stage.width <= 0 ||
    stage.height <= 0
  ) {
    return { width: 0, height: 0 };
  }

  const ratio = Math.min(
    1,
    stage.width / natural.width,
    stage.height / natural.height,
  );
  return { width: natural.width * ratio, height: natural.height * ratio };
}

export function actualScale(natural: Size, fit: Size): number {
  return fit.width > 0 ? natural.width / fit.width : 1;
}

export function zoomLimit(natural: Size, fit: Size): number {
  return Math.max(MIN_ZOOM_LIMIT, actualScale(natural, fit) * PIXEL_ZOOM_LIMIT);
}

export function clampView(view: View, fit: Size, stage: Size, limit: number): View {
  const scale = clamp(view.scale, 1, Math.max(1, limit));
  const maxX = Math.max(0, (fit.width * scale - stage.width) / 2);
  const maxY = Math.max(0, (fit.height * scale - stage.height) / 2);

  return {
    scale,
    x: clamp(view.x, -maxX, maxX),
    y: clamp(view.y, -maxY, maxY),
  };
}

export function zoomAt(view: View, scale: number, point: Point): View {
  const ratio = scale / view.scale;
  return {
    scale,
    x: point.x - (point.x - view.x) * ratio,
    y: point.y - (point.y - view.y) * ratio,
  };
}

export function wheelScale(scale: number, deltaY: number): number {
  return scale * Math.exp(-deltaY * WHEEL_STEP);
}

export function stepScale(scale: number, direction: 1 | -1): number {
  return direction > 0 ? scale * STEP_FACTOR : scale / STEP_FACTOR;
}

export function toggleTarget(natural: Size, fit: Size): number {
  const actual = actualScale(natural, fit);
  return actual > 1.25 ? actual : 2;
}

export function isZoomed(view: View): boolean {
  return view.scale > 1.001;
}

export function zoomPercent(view: View, natural: Size, fit: Size): number {
  if (natural.width <= 0) return 100;
  return Math.round(((view.scale * fit.width) / natural.width) * 100);
}
