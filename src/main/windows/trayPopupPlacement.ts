export interface Point {
  x: number;
  y: number;
}

export interface Box extends Point {
  width: number;
  height: number;
}

export type TaskbarEdge = "top" | "bottom" | "left" | "right";

const EDGE_GAP = 8;
const ICON_SLOP = 8;

export function resolveTrayAnchor(cursor: Point, icon: Box | null): Point {
  if (!icon || icon.width <= 0 || icon.height <= 0) return cursor;

  const nearIcon =
    cursor.x >= icon.x - ICON_SLOP &&
    cursor.x <= icon.x + icon.width + ICON_SLOP &&
    cursor.y >= icon.y - ICON_SLOP &&
    cursor.y <= icon.y + icon.height + ICON_SLOP;

  return nearIcon
    ? cursor
    : { x: icon.x + icon.width / 2, y: icon.y + icon.height / 2 };
}

export function taskbarEdge(bounds: Box, area: Box, point: Point): TaskbarEdge {
  const reserved: Record<TaskbarEdge, number> = {
    top: area.y - bounds.y,
    bottom: bounds.y + bounds.height - (area.y + area.height),
    left: area.x - bounds.x,
    right: bounds.x + bounds.width - (area.x + area.width),
  };
  const widest = (Object.keys(reserved) as TaskbarEdge[]).reduce(
    (best, edge) => (reserved[edge] > reserved[best] ? edge : best),
  );
  if (reserved[widest] > 0) return widest;

  const distance: Record<TaskbarEdge, number> = {
    top: point.y - bounds.y,
    bottom: bounds.y + bounds.height - point.y,
    left: point.x - bounds.x,
    right: bounds.x + bounds.width - point.x,
  };
  return (Object.keys(distance) as TaskbarEdge[]).reduce((best, edge) =>
    distance[edge] < distance[best] ? edge : best,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function placeTrayPopup(
  anchor: Point,
  display: { bounds: Box; workArea: Box },
  size: { width: number; height: number },
): { x: number; y: number } {
  const area = display.workArea;
  const right = area.x + area.width;
  const bottom = area.y + area.height;
  const edge = taskbarEdge(display.bounds, area, anchor);

  let x: number;
  let y: number;

  if (edge === "top" || edge === "bottom") {
    x =
      anchor.x + size.width + EDGE_GAP <= right
        ? anchor.x
        : anchor.x - size.width;
    y =
      edge === "bottom"
        ? Math.min(anchor.y, bottom - EDGE_GAP) - size.height
        : Math.max(anchor.y, area.y + EDGE_GAP);
  } else {
    y =
      anchor.y + size.height + EDGE_GAP <= bottom
        ? anchor.y
        : anchor.y - size.height;
    x =
      edge === "right"
        ? Math.min(anchor.x, right - EDGE_GAP) - size.width
        : Math.max(anchor.x, area.x + EDGE_GAP);
  }

  return {
    x: Math.round(clamp(x, area.x + EDGE_GAP, right - size.width - EDGE_GAP)),
    y: Math.round(clamp(y, area.y + EDGE_GAP, bottom - size.height - EDGE_GAP)),
  };
}
