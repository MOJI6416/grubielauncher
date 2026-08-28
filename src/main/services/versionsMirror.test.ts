import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ get: vi.fn() }));
const get = hoisted.get;

vi.mock("axios", () => {
  const isAxiosError = (value: unknown) =>
    !!value && typeof value === "object" && (value as any).isAxiosError === true;
  return {
    default: { create: () => ({ get: hoisted.get }), isAxiosError },
    isAxiosError,
  };
});

vi.mock("../utilities/apiHost", () => ({
  attachApiHostFallback: (instance: unknown) => instance,
  getApiBaseUrl: () => "https://api.example.com",
}));

vi.mock("../utilities/mirrors", () => ({
  resolveDownloadCandidates: () => [
    "https://origin.example.com/manifest.json",
    "https://mirror.example.com/manifest.json",
    "https://direct.example.com/manifest.json",
  ],
}));

vi.mock("../utilities/mirrorState", () => ({
  getDownloadSource: () => "auto",
  getMojangReachable: () => true,
  isMirrorDisabled: () => false,
}));

import { VersionsService } from "./Versions";

function axiosError(status?: number, code?: string) {
  return {
    isAxiosError: true,
    code,
    message: code || `status ${status}`,
    response: status ? { status } : undefined,
    config: {},
  };
}

const mirroredGet = (VersionsService as unknown as {
  mirroredGet: (url: string) => Promise<unknown>;
}).mirroredGet.bind(VersionsService);

beforeEach(() => {
  get.mockReset();
});

describe("VersionsService.mirroredGet", () => {
  it("stops after the first candidate answers with a client error", async () => {
    get.mockRejectedValue(axiosError(404));

    await expect(mirroredGet("https://origin.example.com/manifest.json")).rejects.toBeTruthy();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("keeps trying mirrors when the source is unreachable", async () => {
    get.mockRejectedValue(axiosError(undefined, "ECONNREFUSED"));

    await expect(mirroredGet("https://origin.example.com/manifest.json")).rejects.toBeTruthy();
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("reports the network failure, not the mirror's 404", async () => {
    get
      .mockRejectedValueOnce(axiosError(undefined, "ECONNREFUSED"))
      .mockRejectedValueOnce(axiosError(404));

    await expect(
      mirroredGet("https://origin.example.com/manifest.json"),
    ).rejects.toMatchObject({ code: "ECONNREFUSED" });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 and 5xx", async () => {
    get
      .mockRejectedValueOnce(axiosError(429))
      .mockRejectedValueOnce(axiosError(503))
      .mockResolvedValueOnce({ data: { ok: true } });

    await expect(
      mirroredGet("https://origin.example.com/manifest.json"),
    ).resolves.toMatchObject({ data: { ok: true } });
    expect(get).toHaveBeenCalledTimes(3);
  });
});
