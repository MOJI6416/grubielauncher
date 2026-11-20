import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";

const { analyzeGameCrash, info } = vi.hoisted(() => ({
  analyzeGameCrash: vi.fn(),
  info: vi.fn(),
}));

vi.mock("./crashAnalyzer", () => ({ analyzeGameCrash }));
vi.mock("../journal/journal", () => ({ journal: { info } }));

import { GameExitTrace, hasCrashReportSince, reportGameExit } from "./gameExit";

const TMP = path.join(
  os.tmpdir(),
  `grubie-game-exit-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
);
const versionPath = path.join(TMP, "NeoForge 1.21.1");

const ANALYSIS = {
  ruleId: "neoforge_dep_version",
  messages: { en: "e", ru: "r", uk: "u" },
  culprits: ["villagerguardgunners"],
  reportPath: null,
};

function traceOf(lines: string[], startedAt = Date.now()): GameExitTrace {
  const trace = new GameExitTrace(startedAt);
  for (const line of lines) trace.line(line);
  return trace;
}

async function exit(code: number, trace: GameExitTrace) {
  const send = vi.fn();
  await reportGameExit({
    versionPath,
    versionName: "NeoForge 1.21.1",
    instance: 0,
    code,
    trace,
    send,
  });
  return send;
}

beforeEach(async () => {
  analyzeGameCrash.mockReset();
  info.mockReset();
  await fs.remove(versionPath);
  await fs.ensureDir(versionPath);
});

afterAll(async () => {
  await fs.remove(TMP);
});

describe("reportGameExit", () => {
  it("analyses a clean exit after NeoForge showed its mod loading failures", async () => {
    analyzeGameCrash.mockResolvedValue(ANALYSIS);
    const trace = traceOf([
      "[02:03:02] [Render thread/FATAL] [ne.ne.fm.ModLoader/CORE]: Error during pre-loading phase: Mod villagerguardgunners requires tacz 1.2.0",
      "[02:03:32] [Render thread/INFO] [minecraft/Minecraft]: Stopping!",
    ]);

    const send = await exit(0, trace);

    expect(analyzeGameCrash).toHaveBeenCalledWith(versionPath, 0, "");
    expect(send).toHaveBeenCalledWith(
      "crashAnalysis",
      "NeoForge 1.21.1",
      0,
      ANALYSIS,
    );
  });

  it("analyses a clean exit when this launch left a crash report", async () => {
    analyzeGameCrash.mockResolvedValue(ANALYSIS);
    const trace = traceOf([], Date.now() - 60_000);
    await fs.ensureDir(path.join(versionPath, "crash-reports"));
    await fs.writeFile(
      path.join(versionPath, "crash-reports", "crash-2026-11-19_02.03.16-fml.txt"),
      "Description: Mod loading failures have occurred; consult the issue messages for more details",
    );

    const send = await exit(0, trace);
    expect(send).toHaveBeenCalledWith(
      "crashAnalysis",
      "NeoForge 1.21.1",
      0,
      ANALYSIS,
    );
  });

  it("leaves an ordinary clean exit alone, even with an older crash report", async () => {
    await fs.ensureDir(path.join(versionPath, "crash-reports"));
    const old = path.join(versionPath, "crash-reports", "crash-old.txt");
    await fs.writeFile(old, "Description: Ticking entity");
    const past = new Date(Date.now() - 3_600_000);
    await fs.utimes(old, past, past);

    const send = await exit(
      0,
      traceOf(["[20:07:23] [Render thread/INFO]: Stopping!"]),
    );

    expect(analyzeGameCrash).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not call an exit after Stopping! a crash when nothing is found", async () => {
    analyzeGameCrash.mockResolvedValue(null);
    const send = await exit(
      1,
      traceOf([
        "[19:58:29] [Render thread/INFO]: Loaded 405 advancements",
        "[20:01:33] [Render thread/INFO]: Stopping!",
      ]),
    );

    expect(send).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("game", "exit after shutdown", {
      versionName: "NeoForge 1.21.1",
      instance: 0,
      code: 1,
    });
  });

  it("still shows what the analysis found after Stopping!", async () => {
    analyzeGameCrash.mockResolvedValue(ANALYSIS);
    const send = await exit(
      1,
      traceOf(["[20:01:33] [Render thread/INFO]: Stopping!"]),
    );
    expect(send).toHaveBeenCalledWith(
      "crashAnalysis",
      "NeoForge 1.21.1",
      0,
      ANALYSIS,
    );
  });

  it("offers the unresolved card for an unexplained crash", async () => {
    analyzeGameCrash.mockResolvedValue(null);
    const send = await exit(1, traceOf(["[main/INFO]: Loading"]));
    expect(send).toHaveBeenCalledWith("crashUnresolved", {
      versionName: "NeoForge 1.21.1",
      instance: 0,
      versionPath,
      exitCode: 1,
    });
  });

  it("hands authlib-injector's errors to the analysis", async () => {
    analyzeGameCrash.mockResolvedValue(null);
    const error =
      "[authlib-injector] [ERROR] Failed to fetch metadata: java.net.SocketException: Попытка установить соединение была безуспешной";
    await exit(
      1,
      traceOf([
        "[authlib-injector] [INFO] Authentication server: https://ely.by",
        error,
      ]),
    );
    expect(analyzeGameCrash).toHaveBeenCalledWith(versionPath, 1, error);
  });
});

describe("hasCrashReportSince", () => {
  it("is false without a crash-reports folder", async () => {
    expect(await hasCrashReportSince(versionPath, 0)).toBe(false);
  });
});
