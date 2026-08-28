import { describe, expect, it } from "vitest";
import { IGameLogFile } from "@/types/GameLog";
import { IVersionSession } from "@/types/VersionStatistics";
import { buildRuns, describeExitCode, hasSources } from "./runs";

const ended = (iso: string) => Date.parse(iso);

const sessions: IVersionSession[] = [
  {
    id: "clean",
    startedAt: "2026-08-15T20:25:36.958Z",
    endedAt: "2026-08-15T20:25:46.936Z",
    durationSec: 9,
    exitCode: 0,
    crashed: false,
    account: "moji6416",
    server: "hypexil.net:25565",
  },
  {
    id: "crashed",
    startedAt: "2026-08-15T20:26:50.813Z",
    endedAt: "2026-08-15T20:26:56.616Z",
    durationSec: 0,
    exitCode: 4294967295,
    crashed: true,
    account: "moji6416",
  },
];

const file = (
  name: string,
  kind: IGameLogFile["kind"],
  at: string,
): IGameLogFile => ({
  name,
  kind,
  size: 1024,
  modifiedAt: ended(at),
});

describe("buildRuns", () => {

  it("marks a session recovered after the launcher was closed mid-game", () => {
    const runs = buildRuns({
      live: [],
      sessions: [
        {
          id: "recovered",
          startedAt: "2026-08-15T20:00:00.000Z",
          endedAt: "2026-08-15T21:00:00.000Z",
          durationSec: 3600,
          exitCode: 0,
          crashed: false,
          recovered: true,
          account: "moji6416",
        },
      ],
      files: [],
    });

    expect(runs).toHaveLength(1);
    expect(runs[0].crashed).toBe(false);
    expect(runs[0].recovered).toBe(true);
  });

  it("does not mark ordinary sessions as recovered", () => {
    const runs = buildRuns({ live: [], sessions, files: [] });

    expect(runs.every((run) => run.recovered === false)).toBe(true);
  });
  it("puts the newest run first and marks the crash", () => {
    const runs = buildRuns({ live: [], sessions, files: [] });

    expect(runs.map((run) => run.key)).toEqual([
      "session:crashed",
      "session:clean",
    ]);
    expect(runs[0].crashed).toBe(true);
    expect(runs[1].server).toBe("hypexil.net:25565");
  });

  it("attaches the crash report and the log to the run that ended next to them", () => {
    const runs = buildRuns({
      live: [],
      sessions,
      files: [
        file("latest.log", "latest", "2026-08-15T20:26:56.700Z"),
        file(
          "crash-2026-08-15_23.26.56-client.txt",
          "crash",
          "2026-08-15T20:26:56.900Z",
        ),
      ],
    });

    expect(runs[0].sources.log?.name).toBe("latest.log");
    expect(runs[0].sources.report?.name).toBe(
      "crash-2026-08-15_23.26.56-client.txt",
    );
  });

  it("gives an archive to the run that finished before it was rotated", () => {
    const runs = buildRuns({
      live: [],
      sessions,
      files: [file("2026-08-15-2.log.gz", "archive", "2026-08-15T20:26:50.900Z")],
    });

    expect(runs[0].key).toBe("session:crashed");
    expect(runs[0].sources.log).toBeUndefined();
    expect(runs[1].key).toBe("session:clean");
    expect(runs[1].sources.log?.name).toBe("2026-08-15-2.log.gz");
    expect(runs.filter(hasSources)).toHaveLength(1);
  });

  it("gives the live run the files that are still being written", () => {
    const runs = buildRuns({
      live: [{ instance: 1, status: "running", startTime: ended("2026-08-15T20:30:00Z") }],
      sessions,
      files: [
        file("latest.log", "latest", "2026-08-15T20:26:56.700Z"),
        file("debug.log", "debug", "2026-08-15T20:26:56.700Z"),
      ],
    });

    expect(runs[0].kind).toBe("live");
    expect(runs[0].sources.log?.name).toBe("latest.log");
    expect(runs[0].sources.debug?.name).toBe("debug.log");
    expect(runs[1].sources.log).toBeUndefined();
  });

  it("folds a finished console into the session it belongs to", () => {
    const runs = buildRuns({
      live: [
        {
          instance: 1,
          status: "error",
          startTime: ended("2026-08-15T20:26:49.000Z"),
        },
      ],
      sessions,
      files: [],
    });

    expect(runs).toHaveLength(2);
    expect(runs[0].key).toBe("session:crashed");
    expect(runs[0].instance).toBe(1);
    expect(runs[0].status).toBe("error");
    expect(runs[1].instance).toBeNull();
  });

  it("keeps a console without a session of its own", () => {
    const runs = buildRuns({
      live: [
        {
          instance: 1,
          status: "error",
          startTime: ended("2026-08-16T10:00:00Z"),
        },
      ],
      sessions,
      files: [],
    });

    expect(runs[0].kind).toBe("live");
    expect(runs[0].crashed).toBe(true);
  });

  it("turns files without a session into their own runs", () => {
    const runs = buildRuns({
      live: [],
      sessions: [],
      files: [
        file("latest.log", "latest", "2026-08-10T10:00:00Z"),
        file("debug.log", "debug", "2026-08-10T10:00:30Z"),
        file("2026-08-01-1.log.gz", "archive", "2026-08-01T09:00:00Z"),
      ],
    });

    expect(runs).toHaveLength(2);
    expect(runs[0].kind).toBe("file");
    expect(runs[0].sources.log?.name).toBe("latest.log");
    expect(runs[0].sources.debug?.name).toBe("debug.log");
    expect(runs[1].sources.log?.name).toBe("2026-08-01-1.log.gz");
  });

  it("does not attach a file that is hours away from any run", () => {
    const runs = buildRuns({
      live: [],
      sessions,
      files: [file("latest.log", "latest", "2026-08-15T23:59:00Z")],
    });

    expect(runs.some((run) => run.kind === "file")).toBe(true);
    expect(runs.find((run) => run.key === "session:crashed")?.sources.log).toBeUndefined();
  });
});

describe("describeExitCode", () => {
  it("names the windows crash codes", () => {
    expect(describeExitCode(3221225477)).toEqual({
      verdict: "accessViolation",
      hex: "0xC0000005",
    });
    expect(describeExitCode(-1073741819).verdict).toBe("accessViolation");
    expect(describeExitCode(4294967295)).toEqual({
      verdict: "terminated",
      hex: "0xFFFFFFFF",
    });
  });

  it("keeps small codes without a hex form", () => {
    expect(describeExitCode(0)).toEqual({ verdict: "ok", hex: null });
    expect(describeExitCode(1)).toEqual({ verdict: "generic", hex: null });
    expect(describeExitCode(143)).toEqual({ verdict: "stopped", hex: null });
  });

  it("falls back to unknown", () => {
    expect(describeExitCode(77).verdict).toBe("unknown");
    expect(describeExitCode(null)).toEqual({ verdict: "unknown", hex: null });
  });
});
