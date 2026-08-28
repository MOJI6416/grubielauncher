export interface PlaytimeLabels {
  h: string;
  m: string;
}

export function formatPlaytime(
  seconds: number | undefined,
  labels: PlaytimeLabels,
  emptyLabel = "—",
): string {
  const total = Math.floor(seconds ?? 0);
  if (!Number.isFinite(total) || total <= 0) return emptyLabel;

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours <= 0 && minutes <= 0) return `< 1 ${labels.m}`;
  if (hours <= 0) return `${minutes} ${labels.m}`;
  if (hours >= 100 || minutes === 0) return `${hours} ${labels.h}`;

  return `${hours} ${labels.h} ${minutes} ${labels.m}`;
}

export function formatSessionClock(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}
