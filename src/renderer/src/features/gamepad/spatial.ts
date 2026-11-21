export type Direction = "up" | "down" | "left" | "right";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const MINOR_GAP_WEIGHT = 3;
const MINOR_CENTER_WEIGHT = 0.25;
const EDGE_SLACK = 1;

function isAhead(from: Box, box: Box, direction: Direction): boolean {
  switch (direction) {
    case "down":
      return (
        box.top >= from.bottom - EDGE_SLACK ||
        (box.top > from.top + EDGE_SLACK &&
          box.bottom > from.bottom + EDGE_SLACK)
      );
    case "up":
      return (
        box.bottom <= from.top + EDGE_SLACK ||
        (box.bottom < from.bottom - EDGE_SLACK &&
          box.top < from.top - EDGE_SLACK)
      );
    case "right":
      return (
        box.left >= from.right - EDGE_SLACK ||
        (box.left > from.left + EDGE_SLACK &&
          box.right > from.right + EDGE_SLACK)
      );
    case "left":
      return (
        box.right <= from.left + EDGE_SLACK ||
        (box.right < from.right - EDGE_SLACK &&
          box.left < from.left - EDGE_SLACK)
      );
  }
}

function majorGap(from: Box, box: Box, direction: Direction): number {
  switch (direction) {
    case "down":
      return Math.max(0, box.top - from.bottom);
    case "up":
      return Math.max(0, from.top - box.bottom);
    case "right":
      return Math.max(0, box.left - from.right);
    case "left":
      return Math.max(0, from.left - box.right);
  }
}

function intervalGap(a1: number, a2: number, b1: number, b2: number): number {
  if (b2 < a1) return a1 - b2;
  if (b1 > a2) return b1 - a2;
  return 0;
}

export function spatialScore(
  from: Box,
  box: Box,
  direction: Direction,
): number | null {
  if (!isAhead(from, box, direction)) return null;

  const vertical = direction === "up" || direction === "down";
  const major = majorGap(from, box, direction);
  const minorGap = vertical
    ? intervalGap(from.left, from.right, box.left, box.right)
    : intervalGap(from.top, from.bottom, box.top, box.bottom);
  const minorCenter = vertical
    ? Math.abs((from.left + from.right) / 2 - (box.left + box.right) / 2)
    : Math.abs((from.top + from.bottom) / 2 - (box.top + box.bottom) / 2);

  return (
    major + minorGap * MINOR_GAP_WEIGHT + minorCenter * MINOR_CENTER_WEIGHT
  );
}

export function pickSpatial(
  from: Box,
  boxes: readonly Box[],
  direction: Direction,
): number {
  let best = -1;
  let bestScore = Infinity;

  boxes.forEach((box, index) => {
    const score = spatialScore(from, box, direction);
    if (score === null || score >= bestScore) return;
    best = index;
    bestScore = score;
  });

  return best;
}

export function pickEntry(boxes: readonly Box[]): number {
  let best = -1;
  let bestScore = Infinity;

  boxes.forEach((box, index) => {
    const score = box.top * 2 + box.left;
    if (score >= bestScore) return;
    best = index;
    bestScore = score;
  });

  return best;
}
