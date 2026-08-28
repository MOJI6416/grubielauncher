export const MOTION_EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

export const MOTION_DURATION_FAST = 0.12;
export const MOTION_DURATION = 0.18;
export const MOTION_DURATION_SLOW = 0.26;

export function motionTransition(
  reduced: boolean | null,
  duration = MOTION_DURATION,
) {
  return reduced ? { duration: 0 } : { duration, ease: MOTION_EASE };
}
