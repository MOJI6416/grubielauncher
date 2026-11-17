import i18n from "@renderer/i18n";
import { formatNumber, playerLocale } from "./numbers";

export interface DurationLabels {
  h: string;
  m: string;
  s: string;
}

const NBSP = " ";

export function durationLabels(): DurationLabels {
  return { h: i18n.t("time.h"), m: i18n.t("time.m"), s: i18n.t("time.s") };
}

export function formatDurationWith(
  seconds: number | undefined,
  labels: DurationLabels,
  {
    withSeconds = false,
    empty = "—",
    locale = "en",
  }: { withSeconds?: boolean; empty?: string; locale?: string } = {},
): string {
  const total = Math.floor(seconds ?? 0);
  if (!Number.isFinite(total) || total < 0) return empty;
  if (total === 0 && !withSeconds) return empty;

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const unit = (value: number, label: string) =>
    `${formatNumber(value, locale)}${NBSP}${label}`;

  if (hours > 0) {
    return minutes > 0 && hours < 100
      ? `${unit(hours, labels.h)} ${unit(minutes, labels.m)}`
      : unit(hours, labels.h);
  }
  if (minutes > 0) {
    return withSeconds && rest > 0
      ? `${unit(minutes, labels.m)} ${unit(rest, labels.s)}`
      : unit(minutes, labels.m);
  }

  return withSeconds ? unit(rest, labels.s) : `<${NBSP}${unit(1, labels.m)}`;
}

export function formatDuration(
  seconds: number | undefined,
  options: { withSeconds?: boolean; empty?: string } = {},
): string {
  return formatDurationWith(seconds, durationLabels(), {
    ...options,
    locale: playerLocale(),
  });
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (value: number) => String(value).padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}
