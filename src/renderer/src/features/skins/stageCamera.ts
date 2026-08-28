export const STAGE_REFERENCE_HALF_HEIGHT = 16.5;

export const MIN_STAGE_ZOOM = 0.2;
export const MAX_STAGE_ZOOM = 1;

const RESTING_HALF_HEIGHT = 19;
const RESTING_HALF_WIDTH = 10;
const NAME_TAG_HALF_HEIGHT = 24;
const RAISED_ARM_HALF_WIDTH = 12;
const ELYTRA_HALF_WIDTH = 13.5;

export interface StageFit {
  width: number;
  height: number;
  hasNameTag?: boolean;
  hasElytra?: boolean;
  raisesArm?: boolean;
}

export interface StageExtents {
  halfHeight: number;
  halfWidth: number;
}

export function stageExtents({
  hasNameTag = false,
  hasElytra = false,
  raisesArm = false,
}: Omit<StageFit, "width" | "height">): StageExtents {
  return {
    halfHeight: Math.max(
      RESTING_HALF_HEIGHT,
      hasNameTag ? NAME_TAG_HALF_HEIGHT : 0,
    ),
    halfWidth: Math.max(
      RESTING_HALF_WIDTH,
      hasElytra ? ELYTRA_HALF_WIDTH : 0,
      raisesArm ? RAISED_ARM_HALF_WIDTH : 0,
    ),
  };
}

export function stageZoom(fit: StageFit): number {
  const { width, height } = fit;
  if (!(width > 0) || !(height > 0)) return MIN_STAGE_ZOOM;

  const { halfHeight, halfWidth } = stageExtents(fit);
  const aspect = width / height;

  const byHeight = STAGE_REFERENCE_HALF_HEIGHT / halfHeight;
  const byWidth = (STAGE_REFERENCE_HALF_HEIGHT * aspect) / halfWidth;

  return Math.min(MAX_STAGE_ZOOM, Math.max(MIN_STAGE_ZOOM, Math.min(byHeight, byWidth)));
}

export function visibleHalfSize(
  zoom: number,
  width: number,
  height: number,
): StageExtents {
  const halfHeight = STAGE_REFERENCE_HALF_HEIGHT / zoom;

  return { halfHeight, halfWidth: (halfHeight * width) / height };
}
