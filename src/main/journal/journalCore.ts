import fs from "fs";
import path from "path";
import type { JournalEntry } from "@/types/Journal";

const FILE_PATTERN = /^launcher-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.jsonl$/;
const MAX_WRITE_FAILURES = 3;
const DRAIN_BATCH = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface JournalFileInfo {
  name: string;
  path: string;
  size: number;
  mtimeMs: number;
  day: string;
  part: number;
}

export interface JournalWriterOptions {
  dir: string;
  now?: () => number;
  maxFileBytes?: number;
  maxAgeDays?: number;
  maxTotalBytes?: number;
  flushDelayMs?: number;
  recentCapacity?: number;
}

export interface JournalTail {
  files: string[];
  lines: string[];
  truncated: boolean;
}

export function journalDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function journalFileName(day: string, part: number): string {
  return part > 0 ? `launcher-${day}.${part}.jsonl` : `launcher-${day}.jsonl`;
}

export function parseJournalFileName(
  name: string,
): { day: string; part: number } | null {
  const match = FILE_PATTERN.exec(name);
  if (!match) return null;
  return { day: match[1], part: match[2] ? Number(match[2]) : 0 };
}

function compareFiles(
  a: Pick<JournalFileInfo, "day" | "part">,
  b: Pick<JournalFileInfo, "day" | "part">,
): number {
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return a.part - b.part;
}

export function sliceTailLines(text: string, maxBytes: number): string[] {
  const buffer = Buffer.from(text, "utf8");
  if (buffer.byteLength <= maxBytes) {
    return text.split("\n").filter((line) => line.length > 0);
  }

  const tail = buffer.subarray(buffer.byteLength - maxBytes).toString("utf8");
  const firstBreak = tail.indexOf("\n");
  const whole = firstBreak === -1 ? "" : tail.slice(firstBreak + 1);
  return whole.split("\n").filter((line) => line.length > 0);
}

export class JournalWriter {
  private pending: string[] = [];
  private recentLines: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private writing: Promise<void> = Promise.resolve();
  private current: { day: string; part: number; size: number } | null = null;
  private dirReady = false;
  private failures = 0;
  private disabled = false;

  private readonly now: () => number;
  private readonly maxFileBytes: number;
  private readonly maxAgeDays: number;
  private readonly maxTotalBytes: number;
  private readonly flushDelayMs: number;
  private readonly recentCapacity: number;

  constructor(private readonly options: JournalWriterOptions) {
    this.now = options.now ?? Date.now;
    this.maxFileBytes = options.maxFileBytes ?? 8 * 1024 * 1024;
    this.maxAgeDays = options.maxAgeDays ?? 10;
    this.maxTotalBytes = options.maxTotalBytes ?? 80 * 1024 * 1024;
    this.flushDelayMs = options.flushDelayMs ?? 250;
    this.recentCapacity = options.recentCapacity ?? 3000;
    this.disabled = !options.dir;
  }

  get dir(): string {
    return this.options.dir;
  }

  get isDisabled(): boolean {
    return this.disabled;
  }

  write(entry: JournalEntry): void {
    const line = JSON.stringify(entry);

    this.recentLines.push(line);
    if (this.recentLines.length > this.recentCapacity) {
      this.recentLines.splice(0, this.recentLines.length - this.recentCapacity);
    }

    if (this.disabled) return;

    this.pending.push(line);
    this.scheduleFlush();
  }

  recent(): string[] {
    return [...this.recentLines];
  }

  flush(): Promise<void> {
    this.clearTimer();
    this.writing = this.writing.then(() => this.drain()).catch(() => {});
    return this.writing;
  }

  flushSync(): void {
    this.clearTimer();
    if (this.disabled || this.pending.length === 0) return;

    const lines = this.pending.splice(0);
    try {
      if (!this.dirReady) {
        fs.mkdirSync(this.dir, { recursive: true });
        this.dirReady = true;
      }
      const chunk = `${lines.join("\n")}\n`;
      fs.appendFileSync(this.target(Buffer.byteLength(chunk)), chunk, "utf8");
    } catch {}
  }

  async listFiles(): Promise<JournalFileInfo[]> {
    const names = await fs.promises.readdir(this.dir).catch(() => []);
    const files: JournalFileInfo[] = [];

    for (const name of names) {
      const parsed = parseJournalFileName(name);
      if (!parsed) continue;

      const filePath = path.join(this.dir, name);
      const stats = await fs.promises.stat(filePath).catch(() => null);
      if (!stats?.isFile()) continue;

      files.push({
        name,
        path: filePath,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        ...parsed,
      });
    }

    return files.sort(compareFiles);
  }

  async prune(): Promise<void> {
    await this.flush();

    const files = await this.listFiles();
    const oldestDay = journalDay(this.now() - this.maxAgeDays * DAY_MS);
    const currentName = this.current
      ? journalFileName(this.current.day, this.current.part)
      : null;

    const kept: JournalFileInfo[] = [];
    for (const file of files) {
      if (file.day < oldestDay && file.name !== currentName) {
        await fs.promises.rm(file.path, { force: true }).catch(() => {});
        continue;
      }
      kept.push(file);
    }

    let total = kept.reduce((sum, file) => sum + file.size, 0);
    for (const file of kept) {
      if (total <= this.maxTotalBytes) break;
      if (file.name === currentName) continue;

      await fs.promises.rm(file.path, { force: true }).catch(() => {});
      total -= file.size;
    }
  }

  async readTail(options: {
    maxBytes: number;
    sinceMs?: number;
  }): Promise<JournalTail> {
    await this.flush();

    const files = await this.listFiles();
    const sinceDay =
      options.sinceMs !== undefined ? journalDay(options.sinceMs) : null;

    const chunks: string[][] = [];
    const used: string[] = [];
    let budget = options.maxBytes;
    let truncated = false;

    for (let index = files.length - 1; index >= 0; index -= 1) {
      const file = files[index];
      if (sinceDay && file.day < sinceDay) {
        truncated = true;
        break;
      }
      if (budget <= 0) {
        truncated = true;
        break;
      }

      const text = await fs.promises
        .readFile(file.path, "utf8")
        .catch(() => "");
      const bytes = Buffer.byteLength(text, "utf8");
      const lines = sliceTailLines(text, budget);

      if (bytes > budget) truncated = true;
      budget -= Math.min(bytes, budget);

      chunks.unshift(lines);
      used.unshift(file.name);
    }

    let lines = chunks.flat();

    if (lines.length === 0 && this.recentLines.length > 0) {
      lines = this.recent();
    }

    if (options.sinceMs !== undefined) {
      const since = options.sinceMs;
      lines = lines.filter((line) => {
        const match = /^\{"t":(\d+)/.exec(line);
        return !match || Number(match[1]) >= since;
      });
    }

    return { files: used, lines, truncated };
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushDelayMs);
    this.flushTimer.unref?.();
  }

  private clearTimer(): void {
    if (!this.flushTimer) return;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private async drain(): Promise<void> {
    while (this.pending.length > 0 && !this.disabled) {
      const lines = this.pending.splice(0, DRAIN_BATCH);
      const chunk = `${lines.join("\n")}\n`;

      try {
        if (!this.dirReady) {
          await fs.promises.mkdir(this.dir, { recursive: true });
          this.dirReady = true;
        }
        await fs.promises.appendFile(
          this.target(Buffer.byteLength(chunk)),
          chunk,
          "utf8",
        );
        this.failures = 0;
      } catch {
        this.failures += 1;
        this.dirReady = false;
        this.current = null;
        if (this.failures >= MAX_WRITE_FAILURES) {
          this.disabled = true;
          this.pending = [];
        } else {
          this.pending.unshift(...lines);
        }
        return;
      }
    }
  }

  private target(bytes: number): string {
    const day = journalDay(this.now());

    if (!this.current || this.current.day !== day) {
      this.current = this.resolveCurrent(day);
    }

    if (
      this.current.size > 0 &&
      this.current.size + bytes > this.maxFileBytes
    ) {
      this.current = { day, part: this.current.part + 1, size: 0 };
    }

    this.current.size += bytes;
    return path.join(this.dir, journalFileName(day, this.current.part));
  }

  private resolveCurrent(day: string): {
    day: string;
    part: number;
    size: number;
  } {
    let part = 0;

    try {
      for (const name of fs.readdirSync(this.dir)) {
        const parsed = parseJournalFileName(name);
        if (parsed && parsed.day === day && parsed.part > part) {
          part = parsed.part;
        }
      }
    } catch {}

    let size = 0;
    try {
      size = fs.statSync(path.join(this.dir, journalFileName(day, part))).size;
    } catch {}

    return { day, part, size };
  }
}
