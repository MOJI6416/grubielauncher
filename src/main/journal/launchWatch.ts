import { journal, type JournalSpan } from "./journal";

export interface LaunchStallInfo {
  afterMs: number;
  alive: boolean;
  outLines: number;
  errLines: number;
  quietMs: number;
  tail: string[];
}

export function launchStallHint(info: LaunchStallInfo): "auth" | undefined {
  if (info.outLines > 0) return undefined;
  const last = info.tail[info.tail.length - 1] ?? "";
  return last.startsWith("[authlib-injector]") ? "auth" : undefined;
}

export interface LaunchWatchOptions {
  span: JournalSpan;
  isAlive: () => boolean;
  onStall?: (info: LaunchStallInfo) => void;
  now?: () => number;
  silentAfterMs?: number;
  stallAfterMs?: number;
  quietForMs?: number;
  tickMs?: number;
  maxLoggedLines?: number;
  tailSize?: number;
}

export class LaunchWatch {
  private readonly span: JournalSpan;
  private readonly now: () => number;
  private readonly silentAfterMs: number;
  private readonly stallAfterMs: number;
  private readonly quietForMs: number;
  private readonly maxLoggedLines: number;
  private readonly tailSize: number;

  private spawnedAt: number;
  private firstOutputAt: number | null = null;
  private lastOutputAt: number | null = null;
  private readyAt: number | null = null;
  private outLines = 0;
  private errLines = 0;
  private loggedLines = 0;
  private tail: string[] = [];
  private silentReported = false;
  private stallReported = false;
  private finished = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: LaunchWatchOptions) {
    this.span = options.span;
    this.now = options.now ?? Date.now;
    this.silentAfterMs = options.silentAfterMs ?? 45_000;
    this.stallAfterMs = options.stallAfterMs ?? 150_000;
    this.quietForMs = options.quietForMs ?? 60_000;
    this.maxLoggedLines = options.maxLoggedLines ?? 300;
    this.tailSize = options.tailSize ?? 40;
    this.spawnedAt = this.now();

    const tickMs = options.tickMs ?? 5_000;
    if (tickMs > 0) {
      this.timer = setInterval(() => this.check(), tickMs);
      this.timer.unref?.();
    }
  }

  get isReady(): boolean {
    return this.readyAt !== null;
  }

  spawned(pid: number | undefined): void {
    this.spawnedAt = this.now();
    this.span.step("process spawned", { pid });
  }

  line(stream: "out" | "err", text: string): void {
    if (this.finished) return;

    const at = this.now();
    if (stream === "out") this.outLines += 1;
    else this.errLines += 1;

    this.tail.push(text.length > 500 ? `${text.slice(0, 500)}…` : text);
    if (this.tail.length > this.tailSize) this.tail.shift();

    if (this.firstOutputAt === null) {
      this.firstOutputAt = at;
      this.span.step("first output", {
        stream,
        afterMs: at - this.spawnedAt,
      });
    }
    this.lastOutputAt = at;

    if (this.readyAt !== null) return;

    if (this.loggedLines < this.maxLoggedLines) {
      this.loggedLines += 1;
      journal.entry(
        stream === "err" ? "warn" : "info",
        stream === "err" ? "game.err" : "game.out",
        text,
        undefined,
        { sp: this.span.id },
      );
      if (this.loggedLines === this.maxLoggedLines) {
        journal.entry(
          "info",
          "game.out",
          "further startup output is kept only in the game log",
          undefined,
          { sp: this.span.id },
        );
      }
    }
  }

  ready(marker: string): void {
    if (this.readyAt !== null || this.finished) return;
    this.readyAt = this.now();
    this.span.step("game ready", {
      marker,
      afterMs: this.readyAt - this.spawnedAt,
      outLines: this.outLines,
      errLines: this.errLines,
    });
    this.stopTimer();
  }

  exited(code: number, signal: string | null, killedByUser: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.stopTimer();

    const summary = {
      code,
      signal: signal ?? undefined,
      killedByUser: killedByUser || undefined,
      ready: this.readyAt !== null,
      uptimeMs: this.now() - this.spawnedAt,
      outLines: this.outLines,
      errLines: this.errLines,
    };

    if (killedByUser || code === 0) {
      this.span.ok(summary);
      return;
    }

    this.span.fail(
      new Error(
        this.readyAt === null
          ? `Game exited with code ${code} before it finished starting`
          : `Game exited with code ${code}`,
      ),
      { ...summary, tail: [...this.tail] },
    );
  }

  failedToStart(error: unknown): void {
    if (this.finished) return;
    this.finished = true;
    this.stopTimer();
    this.span.fail(error, { stage: "spawn" });
  }

  check(): void {
    if (this.finished || this.readyAt !== null) {
      this.stopTimer();
      return;
    }

    const now = this.now();
    const afterMs = now - this.spawnedAt;

    if (
      !this.silentReported &&
      this.firstOutputAt === null &&
      afterMs >= this.silentAfterMs
    ) {
      this.silentReported = true;
      this.span.warn("no output from the game process yet", {
        afterMs,
        alive: this.options.isAlive(),
      });
    }

    const quietMs = now - (this.lastOutputAt ?? this.spawnedAt);
    if (
      !this.stallReported &&
      afterMs >= this.stallAfterMs &&
      quietMs >= this.quietForMs
    ) {
      this.stallReported = true;
      const info: LaunchStallInfo = {
        afterMs,
        alive: this.options.isAlive(),
        outLines: this.outLines,
        errLines: this.errLines,
        quietMs,
        tail: this.tail.slice(-30),
      };
      this.span.warn("launch looks stuck", { ...info });
      this.options.onStall?.(info);
    }
  }

  dispose(): void {
    this.stopTimer();
  }

  private stopTimer(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
