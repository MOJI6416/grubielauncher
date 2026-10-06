import { describe, expect, it, vi } from "vitest";
import type { FailureInfo } from "@/shared/errors";

vi.stubGlobal("window", { api: {} });

const { consumeRecentFailure, pushIpcFailure } = await import("./failures");

function failure(status: number): FailureInfo {
  return {
    code: `GRB-${status}`,
    side: "grubie",
    cause: status === 409 ? "conflict" : "serverError",
    status,
    channel: "backend:shareModpack",
    message: `Request failed with status code ${status}`,
    time: Date.now(),
  };
}

describe("consumeRecentFailure", () => {
  it("leaves a failure with another status for the general toast", () => {
    pushIpcFailure(failure(503));

    expect(
      consumeRecentFailure({
        channels: ["backend:shareModpack"],
        status: 409,
      }),
    ).toBeNull();
    expect(
      consumeRecentFailure({ channels: ["backend:shareModpack"] })?.status,
    ).toBe(503);
  });

  it("takes the failure with the requested status", () => {
    pushIpcFailure(failure(409));

    expect(
      consumeRecentFailure({
        channels: ["backend:shareModpack"],
        status: 409,
      })?.code,
    ).toBe("GRB-409");
    expect(
      consumeRecentFailure({ channels: ["backend:shareModpack"] }),
    ).toBeNull();
  });
});
