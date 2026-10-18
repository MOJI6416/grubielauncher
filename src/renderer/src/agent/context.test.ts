import { describe, expect, it } from "vitest";

(globalThis as any).window = {
  api: {
    platform: "win32",
    os: { totalmem: async () => 16 * 1024 * 1024 * 1024 },
    other: { getVersion: async () => "9.9.9" },
  },
};

const { getDefaultStore } = await import("jotai");
const atoms = await import("@renderer/stores/atoms");
const { buildSystemPrompt, describeRecentRuns } = await import("./context");

const store = getDefaultStore();

function at(hours: number, minutes: number): number {
  return new Date(2026, 9, 18, hours, minutes).getTime();
}

function session(versionName: string, instance: number, status: "running" | "stopped" | "error", startTime: number) {
  return { versionName, instance, status, startTime, messages: [] };
}

describe("describeRecentRuns", () => {
  it("says so when nothing was launched", () => {
    store.set(atoms.consolesAtom, { consoles: [] });

    expect(describeRecentRuns()).toBe(
      "No game was launched since the launcher started.",
    );
  });

  it("lists sessions newest first with the crash verdict", () => {
    store.set(atoms.consolesAtom, {
      consoles: [
        session("Old", 1, "stopped", at(9, 5)),
        session("Broken", 2, "error", at(12, 30)),
        session("Live", 3, "running", at(13, 0)),
        session("Silent", 4, "error", at(11, 0)),
      ],
    });
    store.set(atoms.crashAnalysesAtom, {
      [atoms.aiCrashKey("Broken", 2)]: {
        analysis: {
          ruleId: "out_of_memory",
          messages: { en: "", ru: "", uk: "" },
          culprits: [],
          reportPath: null,
        },
        time: at(12, 31),
      },
    });
    store.set(atoms.aiCrashesAtom, {
      [atoms.aiCrashKey("Silent", 4)]: {
        crash: { versionName: "Silent", instance: 4, versionPath: "", exitCode: -1 },
        analysis: null,
        time: at(11, 1),
      },
    } as any);

    expect(describeRecentRuns().split("\n")).toEqual([
      "- Live: started at 13:00, still running",
      '- Broken: started at 12:30, crashed, the launcher crash rules matched "out_of_memory"',
      "- Silent: started at 11:00, crashed, exit code -1, no crash rule matched",
      "- Old: started at 09:05, closed",
    ]);
  });

  it("puts the sessions into the system prompt", async () => {
    store.set(atoms.consolesAtom, {
      consoles: [session("Broken", 2, "error", at(12, 30))],
    });

    const prompt = await buildSystemPrompt();

    expect(prompt).toContain("Recent game sessions in this launcher run");
    expect(prompt).toContain("- Broken: started at 12:30, crashed");
  });
});
