import { describe, expect, it } from "vitest";
import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";
import {
  createInstallErrorResult,
  createInstallRuntimeOptions,
  getInstallErrorMessage,
} from "./versionInstallOrchestration";

describe("version install orchestration helpers", () => {
  it("maps an aborted install to a cancelled result", () => {
    expect(createInstallErrorResult(new Error("Network error"), true)).toEqual({
      success: false,
      cancelled: true,
      error: VERSION_INSTALL_CANCELLED,
    });
  });

  it("maps VERSION_INSTALL_CANCELLED to a cancelled result", () => {
    expect(
      createInstallErrorResult(new Error(VERSION_INSTALL_CANCELLED), false),
    ).toEqual({
      success: false,
      cancelled: true,
      error: VERSION_INSTALL_CANCELLED,
    });
  });

  it("maps normal install failures to regular errors", () => {
    expect(
      createInstallErrorResult(new Error("Manifest failed"), false),
    ).toEqual({
      success: false,
      error: "Manifest failed",
    });
  });

  it("preserves install options when attaching the runtime abort signal", () => {
    const controller = new AbortController();

    expect(
      createInstallRuntimeOptions(
        {
          operation: "integrity",
          cleanupOnCancel: true,
          keepProgressOpen: true,
        },
        controller.signal,
      ),
    ).toEqual({
      operation: "integrity",
      cleanupOnCancel: true,
      keepProgressOpen: true,
      signal: controller.signal,
    });
  });

  it("keeps unknown install errors readable", () => {
    expect(getInstallErrorMessage("plain failure")).toBe("plain failure");
    expect(getInstallErrorMessage({ message: "nested" })).toBe(
      '{"message":"nested"}',
    );
  });
});
