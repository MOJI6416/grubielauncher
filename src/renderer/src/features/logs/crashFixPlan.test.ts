import { describe, expect, it } from "vitest";
import { matchCulprits, planCrashFixes } from "./crashFixPlan";

const identities = [
  { title: "Sodium", ids: ["sodium"] },
  { title: "Create", ids: ["create"] },
  { title: "Iris Shaders", ids: ["iris", "irisshaders"] },
];

const base = {
  ruleId: null,
  culprits: [],
  identities,
  memoryMb: 4096,
  totalMemoryMb: 16384,
};

describe("matchCulprits", () => {
  it("finds installed mods by mod id, display name or jar name", () => {
    expect(
      matchCulprits(["sodium", "Iris Shaders", "create-1.20.1.jar"], identities),
    ).toEqual(["Sodium", "Iris Shaders", "Create"]);
  });

  it("keeps digits that belong to a mod id", () => {
    expect(
      matchCulprits(["c2me"], [{ title: "C2ME", ids: ["c2me"] }]),
    ).toEqual(["C2ME"]);
  });

  it("skips names it cannot place and does not repeat a mod", () => {
    expect(matchCulprits(["unknownmod", "Sodium", "sodium"], identities)).toEqual([
      "Sodium",
    ]);
  });
});

describe("planCrashFixes", () => {
  it("adds two gigabytes when the game ran out of memory", () => {
    expect(planCrashFixes({ ...base, ruleId: "out_of_memory" })).toEqual([
      { kind: "memory", fromMb: 4096, toMb: 6144 },
    ]);
  });

  it("never eats into what the system needs", () => {
    expect(
      planCrashFixes({
        ...base,
        ruleId: "out_of_memory",
        memoryMb: 6144,
        totalMemoryMb: 8192,
      }),
    ).toEqual([]);
  });

  it("offers to turn off the mod a mixin failed in", () => {
    expect(
      planCrashFixes({ ...base, ruleId: "mixin_error", culprits: ["sodium"] }),
    ).toEqual([{ kind: "disableMod", title: "Sodium" }]);
  });

  it("does not guess a mod for rules whose culprit is not a mod", () => {
    expect(
      planCrashFixes({
        ...base,
        ruleId: "ticking_entity",
        culprits: ["minecraft:zombie"],
      }),
    ).toEqual([]);
  });

  it("offers a file check for corrupted jars", () => {
    expect(planCrashFixes({ ...base, ruleId: "corrupted_files" })).toEqual([
      { kind: "integrity" },
    ]);
  });

  it("uses the suspects of the AI analysis when there is no rule", () => {
    expect(
      planCrashFixes({ ...base, culprits: ["Create", "Sodium", "Iris"] }),
    ).toEqual([
      { kind: "disableMod", title: "Create" },
      { kind: "disableMod", title: "Sodium" },
    ]);
  });
});
