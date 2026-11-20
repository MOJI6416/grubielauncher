export const MAX_CULPRITS = 3;

export interface BisectPlan {
  order: string[];
  kept: string[];
  dependencies: Record<string, string[]>;
}

export interface BisectAnswer {
  enabled: string[];
  problem: boolean;
}

export type BisectStep =
  | { kind: "test"; enabled: string[]; found: string[]; runsLeft: number }
  | { kind: "found"; culprits: string[] }
  | { kind: "notInSuspects" }
  | { kind: "notReproduced" }
  | { kind: "inconsistent"; found: string[] }
  | { kind: "tooMany"; found: string[] };

export function closeOver(
  dependencies: Record<string, string[]>,
  keys: Iterable<string>,
  within: ReadonlySet<string>,
): Set<string> {
  const result = new Set<string>();
  const queue = [...keys].filter((key) => within.has(key));
  for (const key of queue) result.add(key);
  for (let index = 0; index < queue.length; index++) {
    for (const dependency of dependencies[queue[index]] ?? []) {
      if (!within.has(dependency) || result.has(dependency)) continue;
      result.add(dependency);
      queue.push(dependency);
    }
  }
  return result;
}

export function buildBisectPlan(input: {
  candidates: string[];
  kept: string[];
  dependencies: Record<string, string[]>;
}): BisectPlan {
  const candidates = [...new Set(input.candidates)];
  const all = new Set(candidates);
  const kept = closeOver(input.dependencies, input.kept, all);
  const suspects = candidates.filter((key) => !kept.has(key));
  const suspectSet = new Set(suspects);
  const dependencies: Record<string, string[]> = {};
  for (const key of suspects) {
    const edges = (input.dependencies[key] ?? []).filter(
      (dependency) => dependency !== key && suspectSet.has(dependency),
    );
    if (edges.length > 0) dependencies[key] = [...new Set(edges)];
  }
  const order: string[] = [];
  const visited = new Set<string>();
  const visit = (root: string) => {
    if (visited.has(root)) return;
    visited.add(root);
    const stack: { key: string; next: number }[] = [{ key: root, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const edges = dependencies[frame.key] ?? [];
      if (frame.next < edges.length) {
        const dependency = edges[frame.next++];
        if (visited.has(dependency)) continue;
        visited.add(dependency);
        stack.push({ key: dependency, next: 0 });
        continue;
      }
      order.push(frame.key);
      stack.pop();
    }
  };
  for (const key of suspects) visit(key);
  return {
    order,
    kept: candidates.filter((key) => kept.has(key)),
    dependencies,
  };
}

export function configKey(enabled: Iterable<string>): string {
  return [...enabled].sort().join("\n");
}

function runsFor(span: number): number {
  return span > 1 ? Math.ceil(Math.log2(span)) : 0;
}

export function nextBisectStep(
  plan: BisectPlan,
  answers: readonly BisectAnswer[],
): BisectStep {
  const known = new Map<string, boolean>();
  for (const answer of answers) known.set(configKey(answer.enabled), answer.problem);
  const suspects = new Set(plan.order);
  const position = new Map(plan.order.map((key, index) => [key, index]));
  const config = (keys: Iterable<string>) =>
    [...closeOver(plan.dependencies, keys, suspects)].sort(
      (a, b) => (position.get(a) ?? 0) - (position.get(b) ?? 0),
    );
  const test = (
    enabled: string[],
    found: string[],
    runsLeft: number,
  ): BisectStep => ({
    kind: "test",
    enabled,
    found,
    runsLeft: Math.max(1, runsLeft),
  });

  let found: string[] = [];
  let upper = plan.order.length;
  for (;;) {
    if (found.length > 0) {
      const alone = config(found);
      const result = known.get(configKey(alone));
      if (result === undefined) return test(alone, found, 1 + runsFor(upper));
      if (result) return { kind: "found", culprits: found };
      if (upper === 0) return { kind: "inconsistent", found };
      if (found.length >= MAX_CULPRITS) return { kind: "tooMany", found };
    } else if (upper === 0) {
      return { kind: "notInSuspects" };
    }

    let low = 0;
    let high = upper;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      const enabled = config([...plan.order.slice(0, middle), ...found]);
      const result = known.get(configKey(enabled));
      if (result === undefined)
        return test(enabled, found, runsFor(high - low) + 1);
      if (result) high = middle;
      else low = middle;
    }

    if (high === upper) {
      const enabled = config([...plan.order.slice(0, high), ...found]);
      const result = known.get(configKey(enabled));
      if (result === undefined) return test(enabled, found, 1);
      if (!result)
        return found.length === 0
          ? { kind: "notReproduced" }
          : { kind: "inconsistent", found };
    }

    if (found.length === 0 && high === 1) {
      const result = known.get(configKey([]));
      if (result === undefined) return test([], found, 2);
      if (result) return { kind: "notInSuspects" };
    }

    found = [...found, plan.order[high - 1]];
    upper = high - 1;
  }
}

export function contradictionOf(
  answers: readonly BisectAnswer[],
): number | null {
  const last = answers[answers.length - 1];
  if (!last) return null;
  const lastSet = new Set(last.enabled);
  const contains = (outer: ReadonlySet<string>, inner: readonly string[]) =>
    inner.every((key) => outer.has(key));
  for (let index = answers.length - 2; index >= 0; index--) {
    const earlier = answers[index];
    if (earlier.problem === last.problem) continue;
    const earlierSet = new Set(earlier.enabled);
    if (last.problem && contains(earlierSet, last.enabled)) return index;
    if (!last.problem && contains(lastSet, earlier.enabled)) return index;
  }
  return null;
}

export function estimateTotalRuns(suspects: number): number {
  return suspects > 0 ? runsFor(suspects) + 1 : 0;
}
