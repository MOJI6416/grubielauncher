import { describe, expect, it, vi } from "vitest";
import { formatBytes, revokePreviousBlobUrl } from "./file";

const sizes = ["B", "KB", "MB", "GB", "TB"];

describe("formatBytes", () => {
  it("formats whole units", () => {
    expect(formatBytes(0, sizes)).toBe("0 B");
    expect(formatBytes(1024, sizes)).toBe("1 KB");
    expect(formatBytes(5 * 1024 * 1024, sizes)).toBe("5 MB");
  });

  it("never prints undefined for a stalled transfer speed", () => {
    expect(formatBytes(0.5, sizes)).toBe("0.5 B");
    expect(formatBytes(1, sizes)).toBe("1 B");
  });

  it("stays inside the unit list for absurd values", () => {
    expect(formatBytes(1024 ** 8, sizes)).toContain("TB");
  });

  it("does not blow up on invalid input", () => {
    expect(formatBytes(-1, sizes)).not.toContain("undefined");
    expect(formatBytes(Number.NaN, sizes)).not.toContain("undefined");
  });

  it("uses the player's decimal separator", () => {
    const worldSize = 24.2 * 1024 * 1024;
    expect(formatBytes(worldSize, ["Б", "КБ", "МБ"], 1, "ru")).toBe("24,2 МБ");
    expect(formatBytes(worldSize, sizes, 1, "de")).toBe("24,2 MB");
    expect(formatBytes(worldSize, sizes, 1, "en")).toBe("24.2 MB");
  });

  it("drops trailing zeros and never groups thousands", () => {
    expect(formatBytes(2 * 1024 * 1024, sizes, 1, "ru")).toBe("2 MB");
    expect(formatBytes(1023 * 1024, sizes, 1, "en")).toBe("1023 KB");
    expect(formatBytes(1024 ** 4 * 1536, sizes, 1, "de")).toBe("1536 TB");
  });
});

describe("revokePreviousBlobUrl", () => {
  it("releases the replaced blob url and returns the new one", () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", { revokeObjectURL: revoke });

    expect(revokePreviousBlobUrl("blob:old", "blob:new")).toBe("blob:new");
    expect(revoke).toHaveBeenCalledWith("blob:old");

    vi.unstubAllGlobals();
  });

  it("leaves remote and identical urls alone", () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", { revokeObjectURL: revoke });

    revokePreviousBlobUrl("https://cdn.example/a.png", "blob:new");
    revokePreviousBlobUrl("blob:same", "blob:same");
    revokePreviousBlobUrl(null, "blob:new");

    expect(revoke).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
