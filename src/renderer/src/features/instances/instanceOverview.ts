import { IArguments } from "@/types/IArguments";
import { IVersionSession } from "@/types/VersionStatistics";
import {
  InstanceSettingsOverrides,
  OVERRIDABLE_KEYS,
} from "@/shared/instanceSettings";

export type InstanceChangeKind =
  | "name"
  | "content"
  | "servers"
  | "arguments"
  | "logo"
  | "quickServer"
  | "settings";

const CHANGE_ORDER: InstanceChangeKind[] = [
  "name",
  "content",
  "servers",
  "arguments",
  "logo",
  "quickServer",
  "settings",
];

export function collectChangeKinds(
  flags: Partial<Record<InstanceChangeKind, boolean>>,
): InstanceChangeKind[] {
  return CHANGE_ORDER.filter((kind) => flags[kind] === true);
}

export function sameChangeKinds(
  left: InstanceChangeKind[],
  right: InstanceChangeKind[],
): boolean {
  return (
    left.length === right.length &&
    left.every((kind, index) => kind === right[index])
  );
}

export interface ContentChanges {
  mods: boolean;
  servers: boolean;
}

export function sameOverrides(
  left: InstanceSettingsOverrides | undefined,
  right: InstanceSettingsOverrides | undefined,
): boolean {
  return OVERRIDABLE_KEYS.every((key) => (left?.[key] ?? null) === (right?.[key] ?? null));
}

export function sameQuickServer(
  left: string | undefined,
  right: string | undefined,
): boolean {
  return (left ?? "").trim() === (right ?? "").trim();
}

export interface InstanceChangeInput {
  draftName: string;
  currentName: string;
  draftArguments: IArguments;
  currentArguments: IArguments | undefined;
  draftQuickServer: string | undefined;
  currentQuickServer: string | undefined;
  draftOverrides: InstanceSettingsOverrides | undefined;
  currentOverrides: InstanceSettingsOverrides | undefined;
  isLogoChanged: boolean;
  content: ContentChanges;
}

export function collectInstanceChanges(
  input: InstanceChangeInput,
): InstanceChangeKind[] {
  return collectChangeKinds({
    name: input.draftName.trim() !== (input.currentName ?? ""),
    content: input.content.mods,
    servers: input.content.servers,
    arguments:
      input.draftArguments.game !== (input.currentArguments?.game ?? "") ||
      input.draftArguments.jvm !== (input.currentArguments?.jvm ?? ""),
    logo: input.isLogoChanged,
    quickServer: !sameQuickServer(
      input.draftQuickServer,
      input.currentQuickServer,
    ),
    settings: !sameOverrides(input.draftOverrides, input.currentOverrides),
  });
}

const SCREENSHOT_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

export function isScreenshotFile(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  return SCREENSHOT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export function sortScreenshots(names: string[]): string[] {
  return names
    .filter(isScreenshotFile)
    .sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
}

export function screenshotLabel(name: string): string {
  const match = name.match(
    /^(\d{4})-(\d{2})-(\d{2})_(\d{2})[.:-](\d{2})[.:-](\d{2})/,
  );
  if (!match) return name;

  const [, year, month, day, hour, minute] = match;
  return `${day}.${month}.${year} ${hour}:${minute}`;
}

export interface FreshInstanceInput {
  screenshots: number | null;
  contentCount: number;
  launches: number;
  worlds?: number;
}

export function isFreshInstance(input: FreshInstanceInput): boolean {
  if (input.screenshots === null) return false;

  return (
    input.screenshots === 0 &&
    input.contentCount === 0 &&
    input.launches === 0 &&
    (input.worlds ?? 0) === 0
  );
}

export interface DayBucket {
  day: string;
  seconds: number;
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dailyPlaytime(
  sessions: IVersionSession[],
  days: number,
  now = new Date(),
): DayBucket[] {
  const totals = new Map<string, number>();

  for (const session of sessions) {
    const started = new Date(session.startedAt);
    if (Number.isNaN(started.getTime())) continue;

    const duration =
      Number.isFinite(session.durationSec) && session.durationSec > 0
        ? session.durationSec
        : 0;

    const key = dayKey(started);
    totals.set(key, (totals.get(key) ?? 0) + duration);
  }

  const buckets: DayBucket[] = [];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - (days - 1));

  for (let index = 0; index < days; index++) {
    const key = dayKey(cursor);
    buckets.push({ day: key, seconds: totals.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return buckets;
}

export function recentSessions(
  sessions: IVersionSession[],
  limit: number,
): IVersionSession[] {
  return [...sessions]
    .filter((session) => !Number.isNaN(new Date(session.startedAt).getTime()))
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
    .slice(0, limit);
}

export function shortenPath(versionPath: string, segments = 3): string {
  const parts = versionPath.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= segments) return versionPath;

  const separator = versionPath.includes("\\") ? "\\" : "/";

  return `…${separator}${parts.slice(-segments).join(separator)}`;
}
