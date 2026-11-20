import fs from "fs-extra";
import path from "path";
import {
  MOD_BISECT_VERSION,
  type ModBisectAnswer,
  type ModBisectApplyResult,
  type ModBisectBeginResult,
  type ModBisectSession,
  type ModBisectSnapshot,
} from "@/types/ModBisect";
import { writeJsonAtomic } from "../utilities/atomicJson";

const DISABLED_SUFFIX = ".disabled";
const MAX_FILES = 5000;

export function bisectSessionPath(versionPath: string): string {
  return path.join(versionPath, "storage", "bisect.json");
}

export function isJarName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 4 &&
    value.length <= 255 &&
    /\.jar$/i.test(value) &&
    !/[\\/:*?"<>|\0]/.test(value) &&
    value !== "." &&
    !value.startsWith("..")
  );
}

function jarList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_FILES) return null;
  if (!value.every(isJarName)) return null;
  return [...new Set(value)];
}

export function snapshotFromNames(names: readonly string[]): ModBisectSnapshot {
  const enabled = new Set<string>();
  const disabled = new Set<string>();
  for (const name of names) {
    if (/\.jar$/i.test(name)) enabled.add(name);
    else if (/\.jar\.disabled$/i.test(name))
      disabled.add(name.slice(0, -DISABLED_SUFFIX.length));
  }
  for (const name of enabled) disabled.delete(name);
  const sort = (values: Set<string>) =>
    [...values].sort((a, b) => a.localeCompare(b));
  return { enabled: sort(enabled), disabled: sort(disabled) };
}

export function planRenames(
  names: readonly string[],
  wanted: ReadonlyMap<string, boolean>,
): { from: string; to: string; file: string }[] {
  const present = new Set(names);
  const renames: { from: string; to: string; file: string }[] = [];
  for (const [file, enable] of wanted) {
    const parked = `${file}${DISABLED_SUFFIX}`;
    const hasFile = present.has(file);
    const hasParked = present.has(parked);
    if (hasFile === hasParked) continue;
    if (enable && hasParked) renames.push({ from: parked, to: file, file });
    if (!enable && hasFile) renames.push({ from: file, to: parked, file });
  }
  return renames;
}

export function sessionTargets(
  snapshot: ModBisectSnapshot,
  enabled: Iterable<string>,
): Map<string, boolean> {
  const keep = new Set(enabled);
  const wanted = new Map<string, boolean>();
  for (const file of snapshot.enabled) wanted.set(file, keep.has(file));
  return wanted;
}

export function restoreTargets(
  snapshot: ModBisectSnapshot,
  disable: Iterable<string> = [],
): Map<string, boolean> {
  const off = new Set(disable);
  const wanted = new Map<string, boolean>();
  for (const file of snapshot.enabled) wanted.set(file, !off.has(file));
  for (const file of snapshot.disabled) wanted.set(file, false);
  return wanted;
}

async function listModFolder(versionPath: string): Promise<string[]> {
  return fs.readdir(path.join(versionPath, "mods")).catch(() => []);
}

export async function applyModStates(
  versionPath: string,
  wanted: ReadonlyMap<string, boolean>,
): Promise<string[]> {
  const folder = path.join(versionPath, "mods");
  const failed: string[] = [];
  for (const rename of planRenames(await listModFolder(versionPath), wanted)) {
    try {
      await fs.rename(path.join(folder, rename.from), path.join(folder, rename.to));
    } catch {
      failed.push(rename.file);
    }
  }
  return failed;
}

function parseAnswers(value: unknown): ModBisectAnswer[] | null {
  if (!Array.isArray(value) || value.length > 512) return null;
  const answers: ModBisectAnswer[] = [];
  for (const item of value) {
    const enabled = jarList(item?.enabled);
    if (!enabled || typeof item?.problem !== "boolean") return null;
    answers.push({
      enabled,
      problem: item.problem,
      at: typeof item?.at === "string" ? item.at.slice(0, 64) : "",
    });
  }
  return answers;
}

function parseDependencies(value: unknown): Record<string, string[]> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result: Record<string, string[]> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_FILES) return null;
  for (const [file, edges] of entries) {
    const list = jarList(edges);
    if (!isJarName(file) || !list) return null;
    result[file] = list;
  }
  return result;
}

function parseLabels(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [file, label] of Object.entries(value as Record<string, unknown>)) {
    if (isJarName(file) && typeof label === "string")
      result[file] = label.slice(0, 200);
  }
  return result;
}

export function parseBisectSession(value: unknown): ModBisectSession | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, any>;
  if (raw.version !== MOD_BISECT_VERSION) return null;
  const enabled = jarList(raw.snapshot?.enabled ?? []);
  const disabled = jarList(raw.snapshot?.disabled ?? []);
  const order = jarList(raw.plan?.order);
  const kept = jarList(raw.plan?.kept);
  const dependencies = parseDependencies(raw.plan?.dependencies ?? {});
  const extras = jarList(raw.extras ?? []);
  const applied = jarList(raw.applied ?? []);
  const answers = parseAnswers(raw.answers ?? []);
  if (
    !enabled ||
    !disabled ||
    !order ||
    !kept ||
    !dependencies ||
    !extras ||
    !applied ||
    !answers
  )
    return null;
  const extrasAnswer =
    typeof raw.extrasAnswer === "boolean" ? raw.extrasAnswer : null;
  return {
    version: MOD_BISECT_VERSION,
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt.slice(0, 64) : "",
    snapshot: { enabled, disabled },
    plan: { order, kept, dependencies },
    extras,
    extrasAnswer,
    answers,
    labels: parseLabels(raw.labels),
    applied,
  };
}

export async function readBisectSession(
  versionPath: string,
): Promise<ModBisectSession | null> {
  const raw = await fs.readJSON(bisectSessionPath(versionPath)).catch(() => null);
  return raw ? parseBisectSession(raw) : null;
}

function coversSession(session: ModBisectSession): boolean {
  const known = new Set(session.snapshot.enabled);
  return [
    ...session.plan.order,
    ...session.plan.kept,
    ...session.extras,
    ...session.applied,
  ].every((file) => known.has(file));
}

export async function beginBisect(
  versionPath: string,
  draft: unknown,
  isRunning: boolean,
): Promise<ModBisectBeginResult> {
  if (isRunning) return { ok: false, reason: "running" };
  if (await readBisectSession(versionPath)) return { ok: false, reason: "exists" };
  const parsed = parseBisectSession(draft);
  if (!parsed) return { ok: false, reason: "changed" };
  const snapshot = snapshotFromNames(await listModFolder(versionPath));
  const session: ModBisectSession = {
    ...parsed,
    snapshot,
    startedAt: parsed.startedAt || new Date().toISOString(),
  };
  if (!coversSession(session)) return { ok: false, reason: "changed" };
  await fs.ensureDir(path.dirname(bisectSessionPath(versionPath)));
  await writeJsonAtomic(bisectSessionPath(versionPath), session);
  const failed = await applyModStates(
    versionPath,
    sessionTargets(snapshot, session.applied),
  );
  return { ok: true, session, failed };
}

export async function saveBisect(
  versionPath: string,
  next: unknown,
  isRunning: boolean,
): Promise<ModBisectApplyResult> {
  if (isRunning) return { ok: false, reason: "running" };
  const stored = await readBisectSession(versionPath);
  if (!stored) return { ok: false, reason: "missing" };
  const parsed = parseBisectSession({ ...(next as object), snapshot: stored.snapshot });
  if (!parsed) return { ok: false, reason: "changed" };
  const session: ModBisectSession = {
    ...parsed,
    snapshot: stored.snapshot,
    startedAt: stored.startedAt,
  };
  if (!coversSession(session)) return { ok: false, reason: "changed" };
  await writeJsonAtomic(bisectSessionPath(versionPath), session);
  const failed = await applyModStates(
    versionPath,
    sessionTargets(session.snapshot, session.applied),
  );
  return { ok: true, failed };
}

export async function finishBisect(
  versionPath: string,
  disable: unknown,
  isRunning: boolean,
): Promise<ModBisectApplyResult> {
  if (isRunning) return { ok: false, reason: "running" };
  const stored = await readBisectSession(versionPath);
  if (!stored) return { ok: false, reason: "missing" };
  const off = (Array.isArray(disable) ? disable : []).filter(
    (file): file is string =>
      isJarName(file) && stored.snapshot.enabled.includes(file),
  );
  const failed = await applyModStates(
    versionPath,
    restoreTargets(stored.snapshot, off),
  );
  if (failed.length === 0) await fs.remove(bisectSessionPath(versionPath));
  return { ok: true, failed };
}

export async function listBisectSessions(
  versionPaths: readonly string[],
): Promise<string[]> {
  const active: string[] = [];
  for (const versionPath of versionPaths) {
    if (await readBisectSession(versionPath)) active.push(versionPath);
  }
  return active;
}
