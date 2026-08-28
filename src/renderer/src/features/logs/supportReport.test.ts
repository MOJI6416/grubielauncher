import { describe, expect, it } from "vitest";
import { parseLogText } from "./logParse";
import { buildSupportReport, collectProblemLines } from "./supportReport";

const labels = {
  launcher: "Launcher",
  os: "OS",
  instance: "Instance",
  minecraft: "Minecraft",
  loader: "Loader",
  mods: "Mods",
  memory: "Memory",
  started: "Started",
  duration: "Duration",
  exit: "Exit code",
  server: "Server",
  diagnosis: "Diagnosis",
  culprits: "Likely culprit",
  log: "Log",
};

describe("collectProblemLines", () => {
  const entries = parseLogText(
    [
      "[10:00:01] [main/INFO]: Loading",
      "[10:00:02] [main/ERROR]: Failed to load mod sodium",
      "\tat net.fabricmc.Knot.launch(Knot.java:72)",
      "[10:00:03] [main/INFO]: still going",
    ].join("\n"),
  );

  it("prefers the failing entries with their stack traces", () => {
    expect(collectProblemLines(entries, 20)).toEqual([
      "[10:00:02] [main/ERROR]: Failed to load mod sodium",
      "\tat net.fabricmc.Knot.launch(Knot.java:72)",
    ]);
  });

  it("falls back to the tail when nothing failed", () => {
    const clean = parseLogText(
      ["[10:00:01] [main/INFO]: a", "[10:00:02] [main/INFO]: b"].join("\n"),
    );

    expect(collectProblemLines(clean, 1)).toEqual(["[10:00:02] [main/INFO]: b"]);
  });
});

describe("buildSupportReport", () => {
  it("puts the context first and redacts the log", () => {
    const report = buildSupportReport({
      launcherVersion: "1.9.3",
      os: "win32",
      instanceName: "Fabric 26.2",
      mcVersion: "26.2",
      loader: "fabric",
      loaderVersion: "0.19.3",
      modsCount: 14,
      memoryMb: 4096,
      startedAt: Date.parse("2026-08-15T20:26:50.813Z"),
      durationSec: 5,
      exitCode: 4294967295,
      exitLabel: "terminated",
      server: null,
      diagnosis: "Mod conflict",
      culprits: ["sodium"],
      logName: "latest.log",
      nickname: "moji6416",
      labels,
      lines: [
        "[10:00:02] [main/ERROR]: user moji6416 in C:\\Users\\profi\\AppData",
        "accessToken: eyJhbGciOiJIUzI1NiJ9.payload.signature",
      ],
    });

    expect(report).toContain("Launcher: 1.9.3");
    expect(report).toContain("Instance: Fabric 26.2");
    expect(report).toContain("Loader: fabric 0.19.3");
    expect(report).toContain("Exit code: 4294967295 — terminated");
    expect(report).toContain("Likely culprit: sodium");
    expect(report).toContain("Log (latest.log):");
    expect(report).not.toContain("moji6416");
    expect(report).not.toContain("profi");
    expect(report).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  it("drops empty fields instead of printing blanks", () => {
    const report = buildSupportReport({
      launcherVersion: "1.9.3",
      os: "linux",
      instanceName: "Vanilla",
      mcVersion: "26.2",
      loader: "vanilla",
      labels,
      lines: [],
    });

    expect(report).not.toContain("Mods:");
    expect(report).not.toContain("Server:");
    expect(report).not.toContain("Exit code:");
  });
});
