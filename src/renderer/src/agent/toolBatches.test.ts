import { describe, expect, it } from "vitest";
import { MAX_PARALLEL_READS, planToolBatches } from "./toolBatches";

const tools = [
  { name: "list_instances", risk: "read" as const },
  { name: "get_instance", risk: "read" as const },
  { name: "ask_user", risk: "read" as const },
  { name: "add_mods", risk: "write" as const },
];

function call(name: string, id = name) {
  return { id, name, arguments: "{}" };
}

function names(batches: ReturnType<typeof planToolBatches>) {
  return batches.map((batch) => batch.map((entry) => entry.id));
}

describe("planToolBatches", () => {
  it("runs neighbouring reads together", () => {
    const batches = planToolBatches(
      [call("list_instances"), call("get_instance", "a"), call("get_instance", "b")],
      tools,
    );

    expect(names(batches)).toEqual([["list_instances", "a", "b"]]);
  });

  it("keeps writes and questions on their own and in order", () => {
    const batches = planToolBatches(
      [
        call("get_instance", "a"),
        call("add_mods"),
        call("get_instance", "b"),
        call("ask_user"),
        call("get_instance", "c"),
      ],
      tools,
    );

    expect(names(batches)).toEqual([["a"], ["add_mods"], ["b"], ["ask_user"], ["c"]]);
  });

  it("caps how many reads run at once", () => {
    const calls = Array.from({ length: MAX_PARALLEL_READS + 2 }, (_, index) =>
      call("get_instance", `r${index}`),
    );

    const batches = planToolBatches(calls, tools);

    expect(batches.map((batch) => batch.length)).toEqual([MAX_PARALLEL_READS, 2]);
  });

  it("treats an unknown tool as sequential", () => {
    const batches = planToolBatches(
      [call("get_instance", "a"), call("nope"), call("get_instance", "b")],
      tools,
    );

    expect(names(batches)).toEqual([["a"], ["nope"], ["b"]]);
  });
});
