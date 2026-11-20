import { describe, expect, it, vi } from "vitest";
import type { FailureInfo } from "@/shared/errors";

vi.stubGlobal("window", { api: {} });

const shown = vi.hoisted(() => [] as unknown[][]);

vi.mock("./errorToast", () => ({
  showErrorToast: (...args: unknown[]) => {
    shown.push(args);
  },
}));

const { consumeRecentFailure, pushIpcFailure, showFailureToast } =
  await import("./failures");

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

describe("showFailureToast", () => {
  it("leaves an unrelated buffered failure alone when no channels are given", () => {
    shown.length = 0;
    pushIpcFailure({
      code: "DISK-MISSING",
      side: "disk",
      cause: "notFound",
      channel: "fs:readdir",
      message: "ENOENT: no such file or directory, scandir 'storage/trash'",
      time: Date.now(),
    });

    showFailureToast("Name taken", new Error("name_taken"), {
      fallbackDescription: "Rename the build",
    });

    expect(shown[0]?.[1]).toBe("Rename the build");
    expect(consumeRecentFailure({ channels: ["fs:"] })?.code).toBe(
      "DISK-MISSING",
    );
  });

  it("shows the given description even when the error looks like a known cause", () => {
    shown.length = 0;

    showFailureToast(
      "Local mods",
      new Error("local mods upload failed: java-utils.jar: file not found locally"),
      { description: "Missing: java-utils.jar" },
    );

    expect(shown[0]?.[1]).toBe("Missing: java-utils.jar");
    expect(String(shown[0]?.[4])).toContain("java-utils.jar");
  });
});
