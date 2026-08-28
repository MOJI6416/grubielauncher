import { describe, expect, it } from "vitest";
import { resolveDeepLaunch } from "./deepLaunch";

const instances = [
  { version: { name: "Fabulously Optimized" } },
  { version: { name: "Vanilla 26.2" } },
];

describe("resolveDeepLaunch", () => {
  it("does nothing without a pending link", () => {
    expect(resolveDeepLaunch(null, instances, true)).toEqual({ kind: "wait" });
  });

  it("waits while instances are still loading", () => {
    expect(
      resolveDeepLaunch({ versionName: "Vanilla 26.2", instance: 0 }, [], false),
    ).toEqual({ kind: "wait" });
  });

  it("launches once the instance shows up", () => {
    expect(
      resolveDeepLaunch(
        { versionName: "Vanilla 26.2", instance: 2 },
        instances,
        false,
      ),
    ).toEqual({ kind: "launch", version: instances[1], instance: 2 });
  });

  it("reports a missing instance only after loading finished", () => {
    const pending = { versionName: "Ghost", instance: 0 };
    expect(resolveDeepLaunch(pending, instances, false)).toEqual({
      kind: "wait",
    });
    expect(resolveDeepLaunch(pending, instances, true)).toEqual({
      kind: "notFound",
    });
  });
});
