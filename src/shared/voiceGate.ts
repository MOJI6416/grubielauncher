export const GATE_MIN_DB = -60;
export const GATE_MAX_DB = -10;
export const DEFAULT_GATE_DB = -45;

export function clampGateDb(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_GATE_DB;
  }
  return Math.min(GATE_MAX_DB, Math.max(GATE_MIN_DB, Math.round(value)));
}
