import { app } from "electron";
import fs from "fs";
import path from "path";
import { redactCredentials } from "@/shared/logSanitizer";
import { buildLaunchAliasName } from "../game/launchAlias";

const HEAD_LIMIT_BYTES = 4 * 1024 * 1024;
const TAIL_LINES = 4000;
const MAX_LINE_CHARS = 4000;
const MAY_HOLD_CREDENTIALS =
  /bearer|eyJ|sk-|token|secret|passw|api[_-]?key|credential|authoriz|--session/i;

export interface GameOutputFile {
  path: string;
  instance: number;
  previous: boolean;
  mtimeMs: number;
}

export function gameOutputDir(): string | null {
  if (process.env.VITEST) return null;
  try {
    if (typeof app?.getPath !== "function") return null;
    return path.join(app.getPath("logs"), "game");
  } catch {
    return null;
  }
}

function fileBase(versionPath: string): string {
  return buildLaunchAliasName(versionPath);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clock(at: Date): string {
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}.${pad(at.getMilliseconds(), 3)}`;
}

export function gameOutputPaths(
  dir: string,
  versionPath: string,
  instance: number,
): { current: string; previous: string } {
  const base = `${fileBase(versionPath)}-${instance}`;
  return {
    current: path.join(dir, `${base}.log`),
    previous: path.join(dir, `${base}.prev.log`),
  };
}

export async function findGameOutputFiles(
  dir: string,
  versionPath: string,
): Promise<GameOutputFile[]> {
  const pattern = new RegExp(
    `^${escapeRegExp(fileBase(versionPath))}-(\\d+)(\\.prev)?\\.log$`,
  );
  const names = await fs.promises.readdir(dir).catch(() => [] as string[]);
  const found: GameOutputFile[] = [];

  for (const name of names) {
    const match = pattern.exec(name);
    if (!match) continue;
    const filePath = path.join(dir, name);
    const stats = await fs.promises.stat(filePath).catch(() => null);
    if (!stats?.isFile()) continue;
    found.push({
      path: filePath,
      instance: Number(match[1]),
      previous: !!match[2],
      mtimeMs: stats.mtimeMs,
    });
  }

  return found.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

class LineRing {
  private readonly items: string[] = [];
  private start = 0;

  constructor(private readonly size: number) {}

  push(item: string): void {
    if (this.items.length < this.size) {
      this.items.push(item);
      return;
    }
    this.items[this.start] = item;
    this.start = (this.start + 1) % this.size;
  }

  get length(): number {
    return this.items.length;
  }

  values(): string[] {
    return [...this.items.slice(this.start), ...this.items.slice(0, this.start)];
  }
}

export class GameOutputLog {
  private stream: fs.WriteStream | null;
  private written = 0;
  private overflow = 0;
  private readonly tail = new LineRing(TAIL_LINES);
  private readonly finished: Promise<void>;

  private constructor(
    stream: fs.WriteStream,
    private readonly now: () => Date,
  ) {
    this.stream = stream;
    this.finished = new Promise((resolve) => {
      stream.once("close", resolve);
      stream.once("error", () => resolve());
    });
  }

  static open(options: {
    dir: string | null;
    versionPath: string;
    instance: number;
    header: Record<string, unknown>;
    now?: () => Date;
  }): GameOutputLog | null {
    if (!options.dir) return null;

    try {
      fs.mkdirSync(options.dir, { recursive: true });
      const files = gameOutputPaths(
        options.dir,
        options.versionPath,
        options.instance,
      );
      try {
        fs.renameSync(files.current, files.previous);
      } catch {}

      const stream = fs.createWriteStream(files.current, { flags: "w" });
      stream.on("error", () => {});

      const log = new GameOutputLog(stream, options.now ?? (() => new Date()));
      log.write(
        `# start ${JSON.stringify({
          ...options.header,
          startedAt: log.now().toISOString(),
        })}`,
      );
      return log;
    } catch {
      return null;
    }
  }

  line(stream: "out" | "err", text: string): void {
    if (!this.stream) return;

    const clipped =
      text.length > MAX_LINE_CHARS ? `${text.slice(0, MAX_LINE_CHARS)}…` : text;
    const safe = MAY_HOLD_CREDENTIALS.test(clipped)
      ? redactCredentials(clipped)
      : clipped;
    const entry = `${clock(this.now())} ${stream} ${safe}`;

    if (this.written < HEAD_LIMIT_BYTES) {
      this.write(entry);
      return;
    }

    this.overflow += 1;
    this.tail.push(entry);
  }

  close(summary: Record<string, unknown>): Promise<void> {
    if (!this.stream) return this.finished;

    const dropped = this.overflow - this.tail.length;
    if (dropped > 0) this.write(`# … ${dropped} lines skipped …`);
    for (const entry of this.tail.values()) this.write(entry);
    this.write(
      `# exit ${JSON.stringify({ ...summary, endedAt: this.now().toISOString() })}`,
    );

    this.stream.end();
    this.stream = null;
    return this.finished;
  }

  private write(entry: string): void {
    if (!this.stream) return;
    const line = `${entry}\n`;
    this.written += Buffer.byteLength(line, "utf8");
    this.stream.write(line);
  }
}
