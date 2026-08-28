export function serverIconDataUrl(icon?: string): string | undefined {
  const value = (icon ?? "").trim();
  if (!value) return undefined;

  if (value.startsWith("data:image/")) return value;

  return value.length >= 64 && /^[A-Za-z0-9+/=]+$/.test(value)
    ? `data:image/png;base64,${value}`
    : undefined;
}
