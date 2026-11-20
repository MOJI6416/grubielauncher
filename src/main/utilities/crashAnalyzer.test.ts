import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import path from "path";

const { TMP } = vi.hoisted(() => {
  const nodeOs = require("os");
  const nodePath = require("path");
  return {
    TMP: nodePath.join(
      nodeOs.tmpdir(),
      `grubie-crash-analyzer-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ),
  };
});

vi.mock("electron", () => ({
  app: { getPath: () => TMP, getVersion: () => "0.0.0-test" },
}));

const { post } = vi.hoisted(() => ({
  post: vi.fn(async (_url: string, _body: { ruleId: string }) => ({ data: {} })),
}));

vi.mock("axios", () => ({
  default: {
    get: vi.fn(async () => {
      throw new Error("offline");
    }),
    post,
  },
}));

const runCrashRegexJobs = vi.fn();
vi.mock("./crashRegexWorker", () => ({
  CRASH_REGEX_BUDGET_MS: 2000,
  runCrashRegexJobs: (...args: unknown[]) => runCrashRegexJobs(...args),
}));

vi.mock("./crashMappings", () => ({
  readableCrashText: async (_versionPath: string, text: string) => text,
}));

import { analyzeGameCrash } from "./crashAnalyzer";

const versionPath = path.join(TMP, "version");
const OOM_PATTERN = "java\\.lang\\.OutOfMemoryError";
const ACCESS_VIOLATION = -1073741819;

interface Job {
  pattern: string;
}

function answered(jobs: Job[]) {
  return {
    results: jobs.map((job) => job.pattern === OOM_PATTERN),
    stalledAt: null,
  };
}

async function settleTelemetry(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

beforeEach(async () => {
  runCrashRegexJobs.mockReset();
  post.mockClear();
  await fs.remove(versionPath);
  await fs.ensureDir(path.join(versionPath, "logs"));
  await fs.writeFile(
    path.join(versionPath, "logs", "latest.log"),
    "java.lang.OutOfMemoryError: Java heap space\n",
  );
});

afterAll(async () => {
  await fs.remove(TMP);
});

function runInProcess(text: string, jobs: (Job & { flags: string; capture?: boolean })[]) {
  return {
    results: jobs.map((job) => {
      const expression = new RegExp(job.pattern, job.flags);
      if (!job.capture) return expression.test(text);
      const found: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = expression.exec(text)) && found.length < 5) {
        if (match[1] && !found.includes(match[1])) found.push(match[1]);
        if (match.index === expression.lastIndex) expression.lastIndex += 1;
      }
      return found;
    }),
    stalledAt: null,
  };
}

describe("analyzeGameCrash on real report shapes", () => {
  beforeEach(() => {
    runCrashRegexJobs.mockImplementation(async (text: string, jobs) =>
      runInProcess(text, jobs),
    );
  });

  it("lets the launch output outrank a log left over from an earlier run", async () => {
    const analysis = await analyzeGameCrash(
      versionPath,
      1,
      "[authlib-injector] [ERROR] Failed to fetch metadata: java.net.SocketException: Попытка установить соединение была безуспешной",
    );
    expect(analysis?.ruleId).toBe("auth_server_unreachable");
  });

  it("blames a mod built for a newer Java and finds it in the log when the report has no name", async () => {
    await fs.writeJSON(path.join(versionPath, "version.json"), {
      version: { id: "1.21.1" },
      loader: { name: "fabric" },
    });
    await fs.writeJSON(path.join(versionPath, "1.21.1.json"), {
      javaVersion: { majorVersion: 21 },
    });
    await fs.ensureDir(path.join(versionPath, "crash-reports"));
    await fs.writeFile(
      path.join(versionPath, "crash-reports", "crash-2026-11-18_18.43.31-client.txt"),
      [
        "Description: Bootstrap",
        "",
        "java.lang.UnsupportedClassVersionError: net/minecraft/class_2272 has been compiled by a more recent version of the Java Runtime (class file version 69.0), this version of the Java Runtime only recognizes class file versions up to 65.0",
        "\tat java.base/java.lang.ClassLoader.defineClass1(Native Method)",
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(versionPath, "logs", "latest.log"),
      "[18:43:03] [main/ERROR]: Error loading companion plugin class [com.moigferdsrte.kaleidoscopehodgepodge.mixin.plugin.KHMixinPlugin] for mixin config [kaleidoscope_hodgepodge.compat.mixins.json]. The plugin may be out of date: UnsupportedClassVersionError:com/moigferdsrte/kaleidoscopehodgepodge/mixin/plugin/KHMixinPlugin has been compiled by a more recent version of the Java Runtime (class file version 69.0), this version of the Java Runtime only recognizes class file versions up to 65.0\n",
    );

    const analysis = await analyzeGameCrash(versionPath, 4294967295);
    expect(analysis?.ruleId).toBe("mod_newer_java");
    expect(analysis?.culprits).toEqual(["kaleidoscope_hodgepodge"]);
    expect(analysis?.reportPath).toContain("crash-2026-11-18_18.43.31-client.txt");
  });
});

describe("analyzeGameCrash", () => {
  it("answers from the worker's verdicts when it returns them", async () => {
    runCrashRegexJobs.mockImplementation(async (_text: string, jobs: Job[]) =>
      answered(jobs),
    );

    const analysis = await analyzeGameCrash(versionPath, 1);
    expect(analysis?.ruleId).toBe("out_of_memory");

    await settleTelemetry();
    expect(post.mock.calls.at(-1)?.[1]).toMatchObject({
      ruleId: "out_of_memory",
    });
  });

  it("still answers on the exit code when the worker gave nothing back", async () => {
    runCrashRegexJobs.mockImplementation(async (_text: string, jobs: Job[]) => ({
      results: jobs.map(() => null),
      stalledAt: null,
    }));

    const analysis = await analyzeGameCrash(versionPath, ACCESS_VIOLATION);
    expect(analysis?.ruleId).toBe("native_crash");
  });

  it("does not report a rule id when the patterns never ran", async () => {
    runCrashRegexJobs.mockImplementation(async (_text: string, jobs: Job[]) => ({
      results: jobs.map(() => null),
      stalledAt: null,
    }));

    await analyzeGameCrash(versionPath, ACCESS_VIOLATION);

    await settleTelemetry();
    expect(post.mock.calls.at(-1)?.[1]).toMatchObject({
      ruleId: "rules_incomplete",
    });
    expect(post.mock.calls.some((call) => call[1].ruleId === "unknown")).toBe(
      false,
    );
  });

  it("reports nothing when neither the worker nor the exit code matches", async () => {
    runCrashRegexJobs.mockImplementation(async (_text: string, jobs: Job[]) =>
      answered(jobs.map(() => ({ pattern: "" }))),
    );

    expect(await analyzeGameCrash(versionPath, 1)).toBeNull();

    await settleTelemetry();
    expect(post.mock.calls.at(-1)?.[1]).toMatchObject({ ruleId: "unknown" });
  });

  it("keeps what arrived when a job stalls, resumes past it and skips it next time", async () => {
    let stalling = "";
    const jobCounts: number[] = [];

    runCrashRegexJobs.mockImplementation(async (_text: string, jobs: Job[]) => {
      jobCounts.push(jobs.length);
      if (!stalling) stalling = jobs[1].pattern;

      const at = jobs.findIndex((job) => job.pattern === stalling);
      const { results } = answered(jobs);
      if (at === -1) return { results, stalledAt: null };

      return {
        results: results.map((value, index) => (index >= at ? null : value)),
        stalledAt: at,
      };
    });

    const first = await analyzeGameCrash(versionPath, ACCESS_VIOLATION);
    expect(first?.ruleId).toBe("out_of_memory");
    expect(jobCounts).toHaveLength(2);

    await settleTelemetry();
    expect(post.mock.calls.at(-1)?.[1]).toMatchObject({
      ruleId: "rules_incomplete",
    });

    const second = await analyzeGameCrash(versionPath, ACCESS_VIOLATION);
    expect(second?.ruleId).toBe("out_of_memory");
    expect(jobCounts).toHaveLength(3);
    expect(jobCounts[2]).toBeLessThan(jobCounts[0]);
  });
});
