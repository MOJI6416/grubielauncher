import { redactNickname, redactSecrets } from "@/shared/logSanitizer";
import { LogEntry, entryText } from "./logParse";

const MAX_EXTRA_LINES = 8;

export function collectProblemLines(
  entries: LogEntry[],
  maxLines: number,
): string[] {
  const picked: string[] = [];

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.level !== "error" && entry.level !== "fatal") continue;

    const block = [entry.raw, ...entry.extra.slice(0, MAX_EXTRA_LINES)];
    if (picked.length + block.length > maxLines) break;

    picked.unshift(...block);
  }

  if (picked.length > 0) return picked;

  return entries
    .slice(-maxLines)
    .map((entry) => entryText(entry))
    .join("\n")
    .split("\n")
    .slice(-maxLines);
}

export interface SupportReportInput {
  launcherVersion: string;
  os: string;
  instanceName: string;
  mcVersion: string;
  loader: string;
  loaderVersion?: string;
  modsCount?: number;
  memoryMb?: number;
  startedAt?: number | null;
  durationSec?: number | null;
  exitCode?: number | null;
  exitLabel?: string;
  server?: string | null;
  diagnosis?: string | null;
  culprits?: string[];
  logName?: string;
  lines: string[];
  labels: Record<string, string>;
  nickname?: string;
}

function field(label: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  return `${label}: ${value}`;
}

export function buildSupportReport(input: SupportReportInput): string {
  const l = input.labels;

  const loader = [input.loader, input.loaderVersion].filter(Boolean).join(" ");
  const started = input.startedAt
    ? new Date(input.startedAt).toISOString().replace("T", " ").slice(0, 19)
    : null;

  const header = [
    field(l.launcher, input.launcherVersion),
    field(l.os, input.os),
    field(l.instance, input.instanceName),
    field(l.minecraft, input.mcVersion),
    field(l.loader, loader),
    field(l.mods, input.modsCount),
    field(l.memory, input.memoryMb ? `${input.memoryMb} MB` : null),
    field(l.started, started),
    field(
      l.duration,
      typeof input.durationSec === "number" ? `${input.durationSec}s` : null,
    ),
    field(
      l.exit,
      typeof input.exitCode === "number"
        ? [input.exitCode, input.exitLabel].filter(Boolean).join(" — ")
        : null,
    ),
    field(l.server, input.server),
  ].filter(Boolean) as string[];

  const diagnosis = [
    input.diagnosis ? `${l.diagnosis}: ${input.diagnosis}` : null,
    input.culprits && input.culprits.length
      ? `${l.culprits}: ${input.culprits.join(", ")}`
      : null,
  ].filter(Boolean) as string[];

  const body = [
    header.join("\n"),
    diagnosis.length ? diagnosis.join("\n") : null,
    [`${l.log}${input.logName ? ` (${input.logName})` : ""}:`, ...input.lines]
      .join("\n")
      .trimEnd(),
  ]
    .filter(Boolean)
    .join("\n\n");

  return redactNickname(redactSecrets(body), input.nickname);
}
