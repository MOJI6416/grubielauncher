import path from "path";
import fs from "fs-extra";

export interface UpdateAttempt {
  target: string;
  from: string;
  exe: string;
  at: number;
}

const ATTEMPT_FILE = "update-attempt.json";
export const UPDATE_LOOP_WINDOW_MS = 15 * 60 * 1000;

function versionParts(version: string): number[] {
  return String(version)
    .split(/[-+]/)[0]
    .split(".")
    .map((part) => Number(part))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

export function isVersionBelow(current: string, target: string): boolean {
  const left = versionParts(current);
  const right = versionParts(target);
  const length = Math.max(left.length, right.length, 3);

  for (let index = 0; index < length; index++) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a < b;
  }

  return false;
}

function isAttempt(value: unknown): value is UpdateAttempt {
  const attempt = value as Partial<UpdateAttempt> | null;
  return (
    typeof attempt?.target === "string" &&
    typeof attempt.from === "string" &&
    typeof attempt.exe === "string" &&
    typeof attempt.at === "number"
  );
}

export function isUpdateLoop(
  attempt: UpdateAttempt | null,
  current: { version: string; exe: string },
  now: number,
): boolean {
  if (!attempt) return false;
  if (now - attempt.at > UPDATE_LOOP_WINDOW_MS) return false;
  if (attempt.from !== current.version) return false;
  return isVersionBelow(current.version, attempt.target);
}

function attemptPath(dir: string): string {
  return path.join(dir, ATTEMPT_FILE);
}

export async function readUpdateAttempt(
  dir: string,
): Promise<UpdateAttempt | null> {
  const stored = await fs.readJSON(attemptPath(dir)).catch(() => null);
  return isAttempt(stored) ? stored : null;
}

export async function writeUpdateAttempt(
  dir: string,
  attempt: UpdateAttempt,
): Promise<void> {
  await fs.outputJSON(attemptPath(dir), attempt).catch(() => {});
}

export async function clearUpdateAttempt(dir: string): Promise<void> {
  await fs.remove(attemptPath(dir)).catch(() => {});
}
