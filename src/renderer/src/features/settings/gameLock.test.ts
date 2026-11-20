import { describe, expect, it } from "vitest";
import { gameLockOf } from "./gameLock";

describe("gameLockOf", () => {
  it("is free when nothing starts or runs", () => {
    expect(gameLockOf(false, [])).toBeNull();
    expect(gameLockOf(false, [{ status: "stopped" }])).toBeNull();
  });

  it("reports a launch in progress first", () => {
    expect(gameLockOf(true, [{ status: "running" }])).toBe("launching");
  });

  it("reports a running instance", () => {
    expect(
      gameLockOf(false, [{ status: "stopped" }, { status: "running" }]),
    ).toBe("playing");
  });
});
