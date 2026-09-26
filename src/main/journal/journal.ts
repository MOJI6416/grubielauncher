import { app } from "electron";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { JournalWriter } from "./journalCore";
import { redactCredentials } from "@/shared/logSanitizer";
import { classifyError } from "@/shared/errors";
import type {
  JournalEntry,
  JournalLevel,
  JournalSource,
  JournalStatus,
  JournalUiEntry,
} from "@/types/Journal";

export type JournalData = Record<string, unknown>;

export interface JournalSpan {
  readonly id: string;
  step(name: string, data?: JournalData): void;
  warn(name: string, data?: JournalData): void;
  ok(data?: JournalData): void;
  fail(error: unknown, data?: JournalData): void;
}

const LEVEL_RANK: Record<JournalLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MAX_MESSAGE_CHARS = 4000;
const MAX_STRING_CHARS = 2000;
const MAX_DEPTH = 5;
const MAX_KEYS = 80;
const MAX_ARRAY_ITEMS = 80;
const MAX_STACK_LINES = 14;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 150;
const RATE_KEYS_CAP = 2000;
const MAX_VERBOSE_MINUTES = 24 * 60;
const SECRET_KEY =
  /token|secret|password|passwd|api[-_]?key|authorization|cookie|credential/i;

export const journalSessionId = randomBytes(4).toString("hex");

let writer: JournalWriter | null | undefined;
let verboseUntil: number | null = null;
const rateWindows = new Map<
  string,
  { start: number; count: number; dropped: number }
>();

function resolveLogsDir(): string | null {
  if (process.env.VITEST) return null;
  try {
    if (typeof app?.getPath !== "function") return null;
    return path.join(app.getPath("logs"), "launcher");
  } catch {
    return null;
  }
}

function optionsPath(dir: string): string {
  return path.join(dir, "options.json");
}

function loadOptions(dir: string): void {
  try {
    const raw = JSON.parse(fs.readFileSync(optionsPath(dir), "utf8")) as {
      verboseUntil?: unknown;
    };
    verboseUntil =
      typeof raw.verboseUntil === "number" && raw.verboseUntil > Date.now()
        ? raw.verboseUntil
        : null;
  } catch {
    verboseUntil = null;
  }
}

function getWriter(): JournalWriter | null {
  if (writer !== undefined) return writer;

  const dir = resolveLogsDir();
  writer = new JournalWriter({ dir: dir ?? "" });
  if (dir) loadOptions(dir);
  return writer;
}

function isVerbose(): boolean {
  if (verboseUntil === null) return false;
  if (Date.now() < verboseUntil) return true;
  verboseUntil = null;
  return false;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… [+${text.length - max} chars]`;
}

export function sanitizeJournalValue(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null) return null;

  switch (typeof value) {
    case "string":
      return redactCredentials(truncate(value, MAX_STRING_CHARS));
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "undefined":
    case "function":
    case "symbol":
      return undefined;
  }

  if (value instanceof Error) return describeError(value);
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `<buffer ${value.byteLength} bytes>`;

  const objectValue = value as object;
  if (seen.has(objectValue)) return "[circular]";
  if (depth >= MAX_DEPTH) return "[depth]";
  seen.add(objectValue);

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeJournalValue(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`… +${value.length - MAX_ARRAY_ITEMS} more`);
    }
    return items;
  }

  const result: Record<string, unknown> = {};
  const keys = Object.keys(objectValue);

  for (const key of keys.slice(0, MAX_KEYS)) {
    const raw = (objectValue as Record<string, unknown>)[key];
    if (SECRET_KEY.test(key) && raw !== null && raw !== undefined && raw !== "") {
      result[key] = "<secret>";
      continue;
    }
    const sanitized = sanitizeJournalValue(raw, depth + 1, seen);
    if (sanitized !== undefined) result[key] = sanitized;
  }

  if (keys.length > MAX_KEYS) result["…"] = `+${keys.length - MAX_KEYS} keys`;

  return result;
}

function stripQuery(url: unknown): string | undefined {
  if (typeof url !== "string" || !url) return undefined;
  const index = url.indexOf("?");
  return redactCredentials(index === -1 ? url : url.slice(0, index));
}

export function describeError(
  error: unknown,
  depth = 0,
): Record<string, unknown> {
  if (error === null || error === undefined) {
    return { message: String(error) };
  }

  if (typeof error !== "object") {
    return { message: redactCredentials(truncate(String(error), MAX_STRING_CHARS)) };
  }

  const anyError = error as Record<string, any>;
  const described: Record<string, unknown> = {};

  if (typeof anyError.name === "string") described.name = anyError.name;
  if (typeof anyError.message === "string") {
    described.message = redactCredentials(
      truncate(anyError.message, MAX_STRING_CHARS),
    );
  }

  for (const key of ["code", "errno", "syscall", "status", "exitCode"]) {
    const value = anyError[key];
    if (typeof value === "string" || typeof value === "number") {
      described[key] = value;
    }
  }

  if (typeof anyError.path === "string") described.path = anyError.path;

  if (anyError.isAxiosError) {
    described.status = anyError.response?.status;
    described.method = anyError.config?.method?.toUpperCase();
    described.url = stripQuery(
      anyError.config?.baseURL && !/^https?:/i.test(anyError.config?.url ?? "")
        ? `${anyError.config.baseURL}${anyError.config.url ?? ""}`
        : anyError.config?.url,
    );
  } else if (typeof anyError.stack === "string") {
    described.stack = redactCredentials(
      anyError.stack.split("\n").slice(0, MAX_STACK_LINES).join("\n"),
    );
  }

  if (depth === 0) {
    try {
      const failure = classifyError(error);
      if (failure.code) described.failureCode = failure.code;
    } catch {}
  }

  if (anyError.cause && depth < 2) {
    described.cause = describeError(anyError.cause, depth + 1);
  }

  if (!("message" in described)) {
    described.message = redactCredentials(
      truncate(String(error), MAX_STRING_CHARS),
    );
  }

  return described;
}

function passesRateLimit(
  level: JournalLevel,
  source: JournalSource,
  scope: string,
  message: string,
): boolean {
  const key = `${source}|${scope}|${message.slice(0, 120)}`;
  const now = Date.now();
  const window = rateWindows.get(key);

  if (!window || now - window.start >= RATE_WINDOW_MS) {
    if (window && window.dropped > 0) {
      writeEntry({
        t: now,
        l: "warn",
        src: source,
        sid: journalSessionId,
        s: "journal",
        m: "repeated entries suppressed",
        d: { scope, message: message.slice(0, 200), dropped: window.dropped },
      });
    }
    if (rateWindows.size >= RATE_KEYS_CAP) rateWindows.clear();
    rateWindows.set(key, { start: now, count: 1, dropped: 0 });
    return true;
  }

  window.count += 1;
  const limit = level === "error" ? RATE_LIMIT * 2 : RATE_LIMIT;
  if (window.count <= limit) return true;

  window.dropped += 1;
  return false;
}

function writeEntry(entry: JournalEntry): void {
  try {
    getWriter()?.write(entry);
  } catch {}
}

function emit(
  level: JournalLevel,
  source: JournalSource,
  scope: string,
  message: string,
  data?: JournalData,
  extra: { sp?: string; ms?: number; t?: number } = {},
): void {
  if (LEVEL_RANK[level] < LEVEL_RANK.info && !isVerbose()) return;

  const safeScope = truncate(scope || "app", 60);
  const safeMessage = redactCredentials(truncate(message, MAX_MESSAGE_CHARS));
  if (!passesRateLimit(level, source, safeScope, safeMessage)) return;

  const entry: JournalEntry = {
    t: extra.t ?? Date.now(),
    l: level,
    src: source,
    sid: journalSessionId,
    s: safeScope,
    m: safeMessage,
  };

  if (data && Object.keys(data).length > 0) {
    const sanitized = sanitizeJournalValue(data) as JournalData;
    if (sanitized && Object.keys(sanitized).length > 0) entry.d = sanitized;
  }
  if (extra.sp) entry.sp = extra.sp;
  if (typeof extra.ms === "number") entry.ms = Math.round(extra.ms);

  writeEntry(entry);
}

function createSpan(
  scope: string,
  name: string,
  data?: JournalData,
): JournalSpan {
  const id = randomBytes(3).toString("hex");
  const startedAt = Date.now();
  let finished = false;

  emit("info", "main", scope, `${name}: start`, data, { sp: id });

  return {
    id,
    step(step, stepData) {
      emit("info", "main", scope, `${name}: ${step}`, stepData, {
        sp: id,
        ms: Date.now() - startedAt,
      });
    },
    warn(step, stepData) {
      emit("warn", "main", scope, `${name}: ${step}`, stepData, {
        sp: id,
        ms: Date.now() - startedAt,
      });
    },
    ok(okData) {
      if (finished) return;
      finished = true;
      emit("info", "main", scope, `${name}: done`, okData, {
        sp: id,
        ms: Date.now() - startedAt,
      });
    },
    fail(error, failData) {
      if (finished) return;
      finished = true;
      emit(
        "error",
        "main",
        scope,
        `${name}: failed`,
        { ...failData, error: describeError(error) },
        { sp: id, ms: Date.now() - startedAt },
      );
    },
  };
}

export const journal = {
  debug(scope: string, message: string, data?: JournalData): void {
    emit("debug", "main", scope, message, data);
  },
  info(scope: string, message: string, data?: JournalData): void {
    emit("info", "main", scope, message, data);
  },
  warn(scope: string, message: string, data?: JournalData): void {
    emit("warn", "main", scope, message, data);
  },
  error(scope: string, message: string, data?: JournalData): void {
    emit("error", "main", scope, message, data);
  },
  failure(
    scope: string,
    message: string,
    error: unknown,
    data?: JournalData,
  ): void {
    emit("error", "main", scope, message, {
      ...data,
      error: describeError(error),
    });
  },
  span: createSpan,
  entry(
    level: JournalLevel,
    scope: string,
    message: string,
    data?: JournalData,
    extra?: { sp?: string; ms?: number },
  ): void {
    emit(level, "main", scope, message, data, extra);
  },
  timed(
    level: JournalLevel,
    scope: string,
    message: string,
    ms: number,
    data?: JournalData,
  ): void {
    emit(level, "main", scope, message, data, { ms });
  },
  ui(entry: JournalUiEntry): void {
    const now = Date.now();
    const t =
      Number.isFinite(entry.t) && Math.abs(now - entry.t) < 10 * 60_000
        ? entry.t
        : now;
    emit(entry.l, "ui", entry.s, entry.m, entry.d, { t });
  },
  isVerbose,
  flush(): Promise<void> {
    return getWriter()?.flush() ?? Promise.resolve();
  },
  flushSync(): void {
    getWriter()?.flushSync();
  },
};

export function getJournalWriter(): JournalWriter | null {
  return getWriter();
}

export function setJournalVerbose(minutes: number | null): number | null {
  const current = getWriter();

  verboseUntil =
    minutes && minutes > 0
      ? Date.now() + Math.min(minutes, MAX_VERBOSE_MINUTES) * 60_000
      : null;

  if (current && current.dir) {
    try {
      fs.mkdirSync(current.dir, { recursive: true });
      fs.writeFileSync(
        optionsPath(current.dir),
        JSON.stringify({ verboseUntil }),
        "utf8",
      );
    } catch {}
  }

  journal.info("journal", verboseUntil ? "verbose mode on" : "verbose mode off", {
    until: verboseUntil ? new Date(verboseUntil).toISOString() : null,
  });

  return verboseUntil;
}

export async function getJournalStatus(): Promise<JournalStatus> {
  const current = getWriter();
  const files = current && current.dir ? await current.listFiles() : [];

  return {
    dir: current?.dir ?? "",
    sessionId: journalSessionId,
    verboseUntil: isVerbose() ? verboseUntil : null,
    files: files.length,
    sizeBytes: files.reduce((sum, file) => sum + file.size, 0),
  };
}
