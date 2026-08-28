import { describe, expect, it } from "vitest";
import { resolveInstanceStatuses } from "./instanceStatus";

describe("resolveInstanceStatuses", () => {
  it("says nothing about a plain idle instance", () => {
    expect(resolveInstanceStatuses({ installed: true })).toEqual([]);
  });

  it("puts a running game before everything else", () => {
    expect(
      resolveInstanceStatuses({
        running: true,
        installed: true,
        update: "behind",
      }),
    ).toEqual(["running", "update"]);
  });

  it("reports a folder that was never installed", () => {
    expect(resolveInstanceStatuses({ installed: false })).toEqual(["broken"]);
  });

  it("hides the downloaded mark while an update is pending", () => {
    expect(
      resolveInstanceStatuses({
        installed: true,
        downloaded: true,
        update: "behind",
      }),
    ).toEqual(["update"]);

    expect(
      resolveInstanceStatuses({ installed: true, downloaded: true }),
    ).toEqual(["downloaded"]);
  });

  it("ignores update states that are not behind", () => {
    expect(
      resolveInstanceStatuses({ installed: true, update: "sync" }),
    ).toEqual([]);
  });
});
