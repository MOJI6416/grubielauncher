import { IGameLogFile } from "@/types/GameLog";
import { IVersionSession } from "@/types/VersionStatistics";

export type RunStatus = "running" | "stopped" | "error";

export interface LogRunSources {
  log?: IGameLogFile;
  debug?: IGameLogFile;
  report?: IGameLogFile;
  native?: IGameLogFile;
}

export interface LogRun {
  key: string;
  kind: "live" | "session" | "file";
  instance: number | null;
  status: RunStatus | null;
  startedAt: number;
  endedAt: number | null;
  durationSec: number | null;
  exitCode: number | null;
  crashed: boolean;
  recovered: boolean;
  account: string | null;
  server: string | null;
  sources: LogRunSources;
}

export interface LiveRunInput {
  instance: number;
  status: RunStatus;
  startTime: number;
  crashed?: boolean;
}

export interface BuildRunsInput {
  live: LiveRunInput[];
  sessions: IVersionSession[];
  files: IGameLogFile[];
}

const MATCH_WINDOW_MS = 15 * 60 * 1000;
const ORPHAN_GROUP_MS = 2 * 60 * 1000;
const LIVE_MATCH_MS = 30 * 60 * 1000;
const LIVE_SLACK_MS = 60 * 1000;

function toMs(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function slotOf(file: IGameLogFile): keyof LogRunSources {
  if (file.kind === "crash") return "report";
  if (file.kind === "debug") return "debug";
  if (file.kind === "native") return "native";
  return "log";
}

function assign(run: LogRun, file: IGameLogFile): boolean {
  const slot = slotOf(file);
  if (run.sources[slot]) return false;
  run.sources[slot] = file;
  return true;
}

function sessionRun(session: IVersionSession): LogRun {
  const startedAt = toMs(session.startedAt);
  const endedAt = toMs(session.endedAt) || null;

  return {
    key: `session:${session.id}`,
    kind: "session",
    instance: null,
    status: null,
    startedAt,
    endedAt,
    durationSec: typeof session.durationSec === "number" ? session.durationSec : null,
    exitCode: typeof session.exitCode === "number" ? session.exitCode : null,
    crashed: session.crashed === true,
    recovered: session.recovered === true,
    account: session.account || null,
    server: session.server || null,
    sources: {},
  };
}

function liveRun(entry: LiveRunInput): LogRun {
  return {
    key: `live:${entry.instance}`,
    kind: "live",
    instance: entry.instance,
    status: entry.status,
    startedAt: entry.startTime,
    endedAt: null,
    durationSec: null,
    exitCode: null,
    crashed: entry.status === "error",
    recovered: false,
    account: null,
    server: null,
    sources: {},
  };
}

function fileRun(files: IGameLogFile[]): LogRun {
  const newest = files.reduce((best, file) =>
    file.modifiedAt > best.modifiedAt ? file : best,
  );

  const run: LogRun = {
    key: `file:${newest.name}`,
    kind: "file",
    instance: null,
    status: null,
    startedAt: newest.modifiedAt,
    endedAt: newest.modifiedAt,
    durationSec: null,
    exitCode: null,
    crashed: files.some(
      (file) => file.kind === "crash" || file.kind === "native",
    ),
    recovered: false,
    account: null,
    server: null,
    sources: {},
  };

  for (const file of files) assign(run, file);
  return run;
}

export function buildRuns(input: BuildRunsInput): LogRun[] {
  const sessions = [...input.sessions]
    .map(sessionRun)
    .sort((a, b) => b.startedAt - a.startedAt);

  const live: LogRun[] = [];

  for (const entry of [...input.live].sort((a, b) => b.startTime - a.startTime)) {
    if (entry.status !== "running") {
      let best: LogRun | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const session of sessions) {
        if (session.instance !== null) continue;
        if (session.startedAt + LIVE_SLACK_MS < entry.startTime) continue;

        const distance = Math.abs(session.startedAt - entry.startTime);
        if (distance > LIVE_MATCH_MS || distance >= bestDistance) continue;

        best = session;
        bestDistance = distance;
      }

      if (best) {
        best.instance = entry.instance;
        best.status = entry.status;
        continue;
      }
    }

    live.push(liveRun(entry));
  }

  const running = live.find((run) => run.status === "running") ?? null;
  const pending = [...input.files].sort((a, b) => b.modifiedAt - a.modifiedAt);
  const leftovers: IGameLogFile[] = [];

  for (const file of pending) {
    if (running && (file.kind === "latest" || file.kind === "debug")) {
      if (assign(running, file)) continue;
    }

    let best: LogRun | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const run of sessions) {
      if (run.endedAt === null) continue;
      if (run.sources[slotOf(file)]) continue;

      const offset = file.modifiedAt - run.endedAt;
      if (file.kind === "archive" && offset < 0) continue;

      const distance = Math.abs(offset);
      if (distance > MATCH_WINDOW_MS || distance >= bestDistance) continue;

      best = run;
      bestDistance = distance;
    }

    if (best) {
      assign(best, file);
      continue;
    }

    leftovers.push(file);
  }

  const orphans: LogRun[] = [];
  let group: IGameLogFile[] = [];

  for (const file of leftovers) {
    const head = group[0];
    if (head && head.modifiedAt - file.modifiedAt <= ORPHAN_GROUP_MS) {
      if (!group.some((item) => slotOf(item) === slotOf(file))) {
        group.push(file);
        continue;
      }
    }

    if (group.length) orphans.push(fileRun(group));
    group = [file];
  }
  if (group.length) orphans.push(fileRun(group));

  const history = [...sessions, ...orphans].sort(
    (a, b) => b.startedAt - a.startedAt,
  );

  return [...live, ...history];
}

export function hasSources(run: LogRun): boolean {
  return Boolean(
    run.sources.log ||
      run.sources.debug ||
      run.sources.report ||
      run.sources.native,
  );
}

export function hasConsole(run: LogRun): boolean {
  return run.instance !== null;
}

export type ExitVerdict =
  | "ok"
  | "stopped"
  | "generic"
  | "terminated"
  | "accessViolation"
  | "stackOverflow"
  | "bufferOverrun"
  | "heapCorruption"
  | "killed"
  | "unknown";

const EXIT_CODES: Record<number, ExitVerdict> = {
  0: "ok",
  1: "generic",
  [-1]: "terminated",
  4294967295: "terminated",
  3221225477: "accessViolation",
  [-1073741819]: "accessViolation",
  3221225725: "stackOverflow",
  [-1073741571]: "stackOverflow",
  3221226505: "bufferOverrun",
  [-1073740791]: "bufferOverrun",
  3221226356: "heapCorruption",
  [-1073740940]: "heapCorruption",
  130: "stopped",
  137: "killed",
  139: "accessViolation",
  143: "stopped",
};

export interface ExitCodeInfo {
  verdict: ExitVerdict;
  hex: string | null;
}

export function describeExitCode(code: number | null): ExitCodeInfo {
  if (code === null || !Number.isFinite(code)) {
    return { verdict: "unknown", hex: null };
  }

  const verdict = EXIT_CODES[code] ?? "unknown";
  const unsigned = code < 0 ? code >>> 0 : code;
  const hex =
    unsigned > 0xffff
      ? `0x${unsigned.toString(16).toUpperCase().padStart(8, "0")}`
      : null;

  return { verdict, hex };
}
