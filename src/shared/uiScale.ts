export const UI_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;

export const DEFAULT_UI_SCALE = 1;

export type UiScaleArea = { width: number; height: number };

export type UiScaleOption = { value: number; fits: boolean };

export type UiScaleState = {
  scale: number;
  effective: number;
  options: UiScaleOption[];
};

export function normalizeUiScale(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_UI_SCALE;

  return UI_SCALES.reduce((best, scale) =>
    Math.abs(scale - number) < Math.abs(best - number) ? scale : best,
  );
}

export function scaledSize(scale: number, base: UiScaleArea): UiScaleArea {
  return {
    width: Math.round(base.width * scale),
    height: Math.round(base.height * scale),
  };
}

export function uiScaleFits(
  scale: number,
  area: UiScaleArea,
  base: UiScaleArea,
): boolean {
  const size = scaledSize(scale, base);
  return size.width <= area.width && size.height <= area.height;
}

export function fitUiScale(
  scale: number,
  area: UiScaleArea,
  base: UiScaleArea,
): number {
  const wanted = normalizeUiScale(scale);
  const fitting = UI_SCALES.filter(
    (value) => value <= wanted && uiScaleFits(value, area, base),
  );
  return fitting.length ? fitting[fitting.length - 1] : UI_SCALES[0];
}

export function uiScaleOptions(
  area: UiScaleArea,
  base: UiScaleArea,
): UiScaleOption[] {
  return UI_SCALES.map((value, index) => ({
    value,
    fits: index === 0 || uiScaleFits(value, area, base),
  }));
}

export function stepUiScale(
  scale: number,
  direction: 1 | -1,
  options: UiScaleOption[],
): number {
  const allowed = options.filter((option) => option.fits).map((o) => o.value);
  const current = normalizeUiScale(scale);
  const index = allowed.indexOf(current);

  if (index === -1) {
    const lower = allowed.filter((value) => value < current);
    const higher = allowed.filter((value) => value > current);
    if (direction === 1) return higher[0] ?? allowed[allowed.length - 1];
    return lower[lower.length - 1] ?? allowed[0];
  }

  const next = allowed[index + direction];
  return next ?? current;
}

export function formatUiScale(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}
