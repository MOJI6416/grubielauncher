const ASTRAL = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
const LONE_SURROGATE = /[\uD800-\uDFFF]/g;

export function toNbtSafeText(value: string): string {
  if (!value) return "";

  return value.replace(ASTRAL, "").replace(LONE_SURROGATE, "");
}

export function isNbtSafeText(value: string): boolean {
  return toNbtSafeText(value) === value;
}
