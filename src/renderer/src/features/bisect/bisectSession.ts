import {
  MOD_BISECT_VERSION,
  type ModBisectSession,
  type ModIdConflict,
  type ModIdConflictFile,
} from "@/types/ModBisect";
import {
  buildBisectPlan,
  contradictionOf,
  nextBisectStep,
  type BisectStep,
} from "./bisectPlan";

export type SessionStep =
  | { kind: "duplicates"; extras: string[] }
  | { kind: "duplicatesFound"; extras: string[] }
  | BisectStep;

function versionParts(version: string): (number | string)[] {
  return version
    .split(/[^0-9A-Za-z]+/)
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()));
}

export function compareModVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const x = left[index];
    const y = right[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    if (typeof x === "number") return 1;
    if (typeof y === "number") return -1;
    return x < y ? -1 : 1;
  }
  return 0;
}

export function pickKeeper(files: readonly ModIdConflictFile[]): string {
  return [...files].sort(
    (a, b) =>
      compareModVersions(b.version, a.version) ||
      b.modifiedAt - a.modifiedAt ||
      a.fileName.localeCompare(b.fileName),
  )[0].fileName;
}

export function conflictExtras(
  conflicts: readonly ModIdConflict[],
  keepers: Readonly<Record<string, string>> = {},
): string[] {
  const extras = new Set<string>();
  for (const conflict of conflicts) {
    const chosen = keepers[conflict.modId];
    const keeper =
      chosen && conflict.files.some((file) => file.fileName === chosen)
        ? chosen
        : pickKeeper(conflict.files);
    for (const file of conflict.files)
      if (file.fileName !== keeper) extras.add(file.fileName);
  }
  return [...extras].sort((a, b) => a.localeCompare(b));
}

export function draftBisectSession(input: {
  candidates: readonly string[];
  kept: readonly string[];
  dependencies: Record<string, string[]>;
  extras: readonly string[];
  labels: Record<string, string>;
  now?: string;
}): ModBisectSession {
  const extras = new Set(input.extras);
  const plan = buildBisectPlan({
    candidates: input.candidates.filter((file) => !extras.has(file)),
    kept: input.kept.filter((file) => !extras.has(file)),
    dependencies: input.dependencies,
  });
  const session: ModBisectSession = {
    version: MOD_BISECT_VERSION,
    startedAt: input.now ?? new Date().toISOString(),
    snapshot: { enabled: [], disabled: [] },
    plan,
    extras: [...extras].sort((a, b) => a.localeCompare(b)),
    extrasAnswer: null,
    answers: [],
    labels: input.labels,
    applied: [],
  };
  return { ...session, applied: appliedFor(session) };
}

export function sessionStep(session: ModBisectSession): SessionStep {
  if (session.extras.length > 0) {
    if (session.extrasAnswer === null)
      return { kind: "duplicates", extras: session.extras };
    if (session.extrasAnswer === false)
      return { kind: "duplicatesFound", extras: session.extras };
  }
  return nextBisectStep(session.plan, session.answers);
}

export function appliedFor(session: ModBisectSession): string[] {
  const step = sessionStep(session);
  if (step.kind === "duplicates")
    return [...session.plan.kept, ...session.plan.order];
  if (step.kind === "test") return [...session.plan.kept, ...step.enabled];
  return session.applied.length > 0
    ? session.applied
    : [...session.plan.kept, ...session.plan.order];
}

export function answerSession(
  session: ModBisectSession,
  problem: boolean,
  now = new Date().toISOString(),
): ModBisectSession {
  const step = sessionStep(session);
  let next: ModBisectSession;
  if (step.kind === "duplicates") next = { ...session, extrasAnswer: problem };
  else if (step.kind === "test")
    next = {
      ...session,
      answers: [...session.answers, { enabled: step.enabled, problem, at: now }],
    };
  else return session;
  return { ...next, applied: appliedFor(next) };
}

export function undoSession(session: ModBisectSession): ModBisectSession {
  let next: ModBisectSession;
  if (session.answers.length > 0)
    next = { ...session, answers: session.answers.slice(0, -1) };
  else if (session.extrasAnswer !== null)
    next = { ...session, extrasAnswer: null };
  else return session;
  return { ...next, applied: appliedFor({ ...next, applied: [] }) };
}

export function canUndo(session: ModBisectSession): boolean {
  return session.answers.length > 0 || session.extrasAnswer !== null;
}

export function runsDone(session: ModBisectSession): number {
  return session.answers.length + (session.extrasAnswer === null ? 0 : 1);
}

export function lastContradiction(session: ModBisectSession): number | null {
  return contradictionOf(session.answers);
}

export function culpritsOf(step: SessionStep): string[] {
  switch (step.kind) {
    case "found":
      return step.culprits;
    case "duplicatesFound":
      return step.extras;
    case "inconsistent":
    case "tooMany":
      return step.found;
    case "test":
      return step.found;
    default:
      return [];
  }
}

export function isFinished(step: SessionStep): boolean {
  return step.kind !== "test" && step.kind !== "duplicates";
}
