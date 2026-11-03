import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {}, BrowserWindow: {}, dialog: {}, ipcMain: {} }));
vi.mock("../utilities/dataRoot", () => ({ getDataRoot: () => "C:/data" }));
vi.mock("../utilities/apiHost", () => ({ attachApiHostFallback: (instance: unknown) => instance }));

const { imageKind, publishFailure } = await import("./themeIpc");

function axiosError(status: number | null, data?: unknown) {
  return Object.assign(new Error("request failed"), {
    isAxiosError: true,
    response: status === null ? undefined : { status, data },
  });
}

describe("imageKind", () => {
  it("recognises pictures by their signature, not their name", () => {
    expect(imageKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe("png");
    expect(imageKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("jpg");
    expect(imageKind(Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBP", "latin1"))).toBe("webp");
  });

  it("refuses anything else hidden behind a picture name", () => {
    expect(imageKind(Buffer.from("<script>alert(1)</script>"))).toBeNull();
    expect(imageKind(Buffer.from("MZ executable...."))).toBeNull();
    expect(imageKind(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe("publishFailure", () => {
  it("passes the gallery's own reasons through to the toast", () => {
    expect(publishFailure(axiosError(403, { code: "publish_banned" }))).toEqual({
      ok: false,
      error: "publish_banned",
      dupStatus: undefined,
      reason: null,
    });
    expect(
      publishFailure(
        axiosError(409, { code: "duplicate", dupStatus: "rejected", reason: "Копия" }),
      ),
    ).toEqual({ ok: false, error: "duplicate", dupStatus: "rejected", reason: "Копия" });
  });

  it("tells a dead connection from a refusal", () => {
    expect(publishFailure(axiosError(null))).toEqual({ ok: false, error: "offline" });
    expect(publishFailure(axiosError(500, { message: "boom" }))).toEqual({
      ok: false,
      error: "failed",
    });
    expect(publishFailure(new Error("other"))).toEqual({ ok: false, error: "failed" });
  });
});
