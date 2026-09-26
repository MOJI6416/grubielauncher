import { describe, expect, it, vi } from "vitest";
import { LaunchWatch } from "./launchWatch";
import type { JournalSpan } from "./journal";

function fakeSpan() {
  const calls: Array<{ kind: string; name?: string; data?: any }> = [];
  const span: JournalSpan = {
    id: "span01",
    step: (name, data) => calls.push({ kind: "step", name, data }),
    warn: (name, data) => calls.push({ kind: "warn", name, data }),
    ok: (data) => calls.push({ kind: "ok", data }),
    fail: (error, data) =>
      calls.push({ kind: "fail", name: (error as Error).message, data }),
  };
  return { span, calls };
}

describe("LaunchWatch", () => {
  it("reports a silent process and then a stall with the output tail", () => {
    const { span, calls } = fakeSpan();
    let now = 0;
    const onStall = vi.fn();
    const watch = new LaunchWatch({
      span,
      isAlive: () => true,
      onStall,
      now: () => now,
      tickMs: 0,
    });

    watch.spawned(4242);
    now = 50_000;
    watch.check();
    expect(calls.map((call) => call.name)).toContain(
      "no output from the game process yet",
    );

    watch.line("err", "[authlib-injector] [INFO] Fetching metadata");
    now = 200_000;
    watch.check();

    expect(onStall).toHaveBeenCalledTimes(1);
    expect(onStall.mock.calls[0][0]).toMatchObject({
      alive: true,
      errLines: 1,
      tail: ["[authlib-injector] [INFO] Fetching metadata"],
    });

    watch.check();
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it("does not report a stall while output keeps flowing", () => {
    const { span } = fakeSpan();
    let now = 0;
    const onStall = vi.fn();
    const watch = new LaunchWatch({
      span,
      isAlive: () => true,
      onStall,
      now: () => now,
      tickMs: 0,
    });

    watch.spawned(1);
    for (now = 1000; now <= 300_000; now += 20_000) {
      watch.line("out", "Loading mods");
      watch.check();
    }

    expect(onStall).not.toHaveBeenCalled();
  });

  it("stops watching once the game is ready and finishes cleanly", () => {
    const { span, calls } = fakeSpan();
    let now = 0;
    const onStall = vi.fn();
    const watch = new LaunchWatch({
      span,
      isAlive: () => true,
      onStall,
      now: () => now,
      tickMs: 0,
    });

    watch.spawned(1);
    watch.line("out", "Setting user: Steve");
    watch.ready("Setting user");
    now = 500_000;
    watch.check();
    watch.exited(0, null, false);

    expect(onStall).not.toHaveBeenCalled();
    expect(calls.at(-1)).toMatchObject({ kind: "ok", data: { ready: true } });
  });

  it("fails the span with the tail when the game exits before it is ready", () => {
    const { span, calls } = fakeSpan();
    const watch = new LaunchWatch({
      span,
      isAlive: () => false,
      now: () => 0,
      tickMs: 0,
    });

    watch.spawned(1);
    watch.line("err", "Error: could not find or load main class");
    watch.exited(1, null, false);

    const failure = calls.find((call) => call.kind === "fail");
    expect(failure?.name).toBe(
      "Game exited with code 1 before it finished starting",
    );
    expect(failure?.data.tail).toEqual([
      "Error: could not find or load main class",
    ]);
  });
});
