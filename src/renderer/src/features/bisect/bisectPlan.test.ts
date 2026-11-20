import { describe, expect, it } from "vitest";
import {
  MAX_CULPRITS,
  buildBisectPlan,
  contradictionOf,
  estimateTotalRuns,
  nextBisectStep,
  type BisectAnswer,
  type BisectPlan,
  type BisectStep,
} from "./bisectPlan";

const mods = (count: number) =>
  Array.from({ length: count }, (_, index) => `mod${String(index).padStart(3, "0")}.jar`);

function simulate(
  plan: BisectPlan,
  problem: (enabled: ReadonlySet<string>) => boolean,
): { step: BisectStep; runs: number; tested: string[][] } {
  const answers: BisectAnswer[] = [];
  const tested: string[][] = [];
  for (let runs = 0; runs < 200; runs++) {
    const step = nextBisectStep(plan, answers);
    if (step.kind !== "test") return { step, runs, tested };
    const enabled = new Set([...plan.kept, ...step.enabled]);
    for (const file of step.enabled)
      for (const dependency of plan.dependencies[file] ?? [])
        expect(enabled.has(dependency)).toBe(true);
    tested.push(step.enabled);
    answers.push({ enabled: step.enabled, problem: problem(enabled) });
  }
  throw new Error("bisect did not finish");
}

const needs =
  (...culprits: string[]) =>
  (enabled: ReadonlySet<string>) =>
    culprits.every((file) => enabled.has(file));

describe("splitting with dependencies", () => {
  it("puts every dependency before the mods that need it", () => {
    const plan = buildBisectPlan({
      candidates: ["addon.jar", "api.jar", "core.jar", "solo.jar"],
      kept: [],
      dependencies: {
        "addon.jar": ["api.jar"],
        "api.jar": ["core.jar"],
      },
    });
    const at = (file: string) => plan.order.indexOf(file);
    expect(at("core.jar")).toBeLessThan(at("api.jar"));
    expect(at("api.jar")).toBeLessThan(at("addon.jar"));
    expect(plan.order).toHaveLength(4);
  });

  it("keeps the player's mods and everything they need switched on", () => {
    const plan = buildBisectPlan({
      candidates: ["a.jar", "b.jar", "lib.jar", "base.jar", "x.jar"],
      kept: ["a.jar"],
      dependencies: { "a.jar": ["lib.jar"], "lib.jar": ["base.jar"] },
    });
    expect(plan.kept.sort()).toEqual(["a.jar", "base.jar", "lib.jar"]);
    expect(plan.order.sort()).toEqual(["b.jar", "x.jar"]);
  });

  it("drops edges to mods that are not suspects and survives cycles", () => {
    const plan = buildBisectPlan({
      candidates: ["a.jar", "b.jar", "c.jar"],
      kept: [],
      dependencies: {
        "a.jar": ["b.jar", "gone.jar"],
        "b.jar": ["a.jar"],
        "c.jar": ["c.jar"],
      },
    });
    expect(plan.order.sort()).toEqual(["a.jar", "b.jar", "c.jar"]);
    expect(plan.dependencies["a.jar"]).toEqual(["b.jar"]);
    expect(plan.dependencies["c.jar"]).toBeUndefined();
  });

  it("never switches a mod on without its dependencies", () => {
    const candidates = mods(40);
    const dependencies: Record<string, string[]> = {};
    candidates.forEach((file, index) => {
      if (index % 3 === 1) dependencies[file] = [candidates[index - 1]];
      if (index % 5 === 4) dependencies[file] = [candidates[0], candidates[2]];
    });
    const plan = buildBisectPlan({ candidates, kept: [], dependencies });
    const { step } = simulate(plan, needs(candidates[22]));
    expect(step).toEqual({ kind: "found", culprits: [candidates[22]] });
  });

  it("blames a library when only the library is broken", () => {
    const plan = buildBisectPlan({
      candidates: ["lib.jar", "a.jar", "b.jar", "c.jar", "d.jar"],
      kept: [],
      dependencies: {
        "a.jar": ["lib.jar"],
        "b.jar": ["lib.jar"],
        "c.jar": ["lib.jar"],
      },
    });
    expect(simulate(plan, needs("lib.jar")).step).toEqual({
      kind: "found",
      culprits: ["lib.jar"],
    });
  });

  it("blames the mod, not the library it pulls in", () => {
    const plan = buildBisectPlan({
      candidates: ["lib.jar", "a.jar", "b.jar", "c.jar", "d.jar"],
      kept: [],
      dependencies: { "a.jar": ["lib.jar"], "b.jar": ["lib.jar"] },
    });
    expect(simulate(plan, needs("b.jar")).step).toEqual({
      kind: "found",
      culprits: ["b.jar"],
    });
  });
});

describe("finding the culprit", () => {
  it.each([1, 2, 7, 64, 100, 300])(
    "finds one mod among %i in about log2 runs",
    (count) => {
      const candidates = mods(count);
      for (const culprit of [candidates[0], candidates[count >> 1], candidates[count - 1]]) {
        const plan = buildBisectPlan({ candidates, kept: [], dependencies: {} });
        const { step, runs } = simulate(plan, needs(culprit));
        expect(step).toEqual({ kind: "found", culprits: [culprit] });
        expect(runs).toBeLessThanOrEqual(estimateTotalRuns(count) + 2);
      }
    },
  );

  it("finds a pair of mods that only break together", () => {
    const candidates = mods(120);
    const plan = buildBisectPlan({ candidates, kept: [], dependencies: {} });
    const { step, runs } = simulate(plan, needs(candidates[17], candidates[93]));
    expect(step.kind).toBe("found");
    if (step.kind === "found")
      expect([...step.culprits].sort()).toEqual([candidates[17], candidates[93]]);
    expect(runs).toBeLessThanOrEqual(2 * estimateTotalRuns(120) + 1);
  });

  it("finds a pair that sits next to each other", () => {
    const candidates = mods(16);
    const plan = buildBisectPlan({ candidates, kept: [], dependencies: {} });
    const { step } = simulate(plan, needs(candidates[0], candidates[1]));
    expect(step.kind).toBe("found");
    if (step.kind === "found")
      expect([...step.culprits].sort()).toEqual([candidates[0], candidates[1]]);
  });

  it("finds three mods and stops past the limit", () => {
    const candidates = mods(50);
    const plan = buildBisectPlan({ candidates, kept: [], dependencies: {} });
    const three = simulate(plan, needs(candidates[3], candidates[20], candidates[41]));
    expect(three.step.kind).toBe("found");
    const four = simulate(
      plan,
      needs(candidates[3], candidates[20], candidates[30], candidates[41]),
    );
    expect(four.step.kind).toBe("tooMany");
    if (four.step.kind === "tooMany") expect(four.step.found).toHaveLength(MAX_CULPRITS);
  });

  it("says the problem is not in the suspects when it never goes away", () => {
    const plan = buildBisectPlan({ candidates: mods(30), kept: [], dependencies: {} });
    const { step, tested } = simulate(plan, () => true);
    expect(step).toEqual({ kind: "notInSuspects" });
    expect(tested[tested.length - 1]).toEqual([]);
  });

  it("checks with all mods on before blaming the last one", () => {
    const plan = buildBisectPlan({ candidates: mods(30), kept: [], dependencies: {} });
    const { step, tested } = simulate(plan, () => false);
    expect(step).toEqual({ kind: "notReproduced" });
    expect(tested[tested.length - 1]).toHaveLength(30);
  });

  it("only reports a culprit it saw fail on its own", () => {
    const candidates = mods(32);
    const plan = buildBisectPlan({ candidates, kept: [], dependencies: {} });
    const answers: BisectAnswer[] = [];
    const seen = new Map<string, boolean>();
    for (;;) {
      const step = nextBisectStep(plan, answers);
      if (step.kind !== "test") {
        if (step.kind === "found")
          expect(seen.get([...step.culprits].sort().join("\n"))).toBe(true);
        break;
      }
      const problem = step.enabled.includes(candidates[9]);
      seen.set([...step.enabled].sort().join("\n"), problem);
      answers.push({ enabled: step.enabled, problem });
    }
  });

  it("replays the same answers to the same step after a restart", () => {
    const candidates = mods(60);
    const plan = buildBisectPlan({ candidates, kept: [], dependencies: {} });
    const answers: BisectAnswer[] = [];
    for (let index = 0; index < 4; index++) {
      const step = nextBisectStep(plan, answers);
      if (step.kind !== "test") break;
      answers.push({ enabled: step.enabled, problem: index % 2 === 0 });
    }
    const restored = JSON.parse(JSON.stringify({ plan, answers }));
    expect(nextBisectStep(restored.plan, restored.answers)).toEqual(
      nextBisectStep(plan, answers),
    );
  });
});

describe("contradictions", () => {
  it("notices when a smaller set breaks but a larger one did not", () => {
    expect(
      contradictionOf([
        { enabled: ["a.jar", "b.jar"], problem: false },
        { enabled: ["c.jar"], problem: true },
        { enabled: ["a.jar"], problem: true },
      ]),
    ).toBe(0);
    expect(
      contradictionOf([
        { enabled: ["a.jar"], problem: true },
        { enabled: ["a.jar", "b.jar"], problem: false },
      ]),
    ).toBe(0);
    expect(
      contradictionOf([
        { enabled: ["a.jar"], problem: false },
        { enabled: ["b.jar"], problem: true },
      ]),
    ).toBeNull();
  });
});
