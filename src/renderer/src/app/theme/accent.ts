import {
  DEFAULT_ACCENT,
  accentVariables,
  isAccentId,
} from "@/shared/accents";

export function applyAccent(value: unknown): void {
  const root = document.documentElement;
  const accent = isAccentId(value) ? value : DEFAULT_ACCENT;
  const variables = accentVariables(accent);

  for (const [name, color] of Object.entries(variables)) {
    if (accent === DEFAULT_ACCENT) root.style.removeProperty(name);
    else root.style.setProperty(name, color);
  }

  root.dataset.accent = accent;
}
