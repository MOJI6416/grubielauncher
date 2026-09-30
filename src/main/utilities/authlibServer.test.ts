import { beforeEach, describe, expect, it, vi } from "vitest";

const getYggdrasilMetadataMock = vi.fn();
const axiosGetMock = vi.fn();

vi.mock("../services/Backend", () => ({
  Backend: class {
    getYggdrasilMetadata = getYggdrasilMetadataMock;
  },
}));

vi.mock("axios", () => ({
  default: { get: (...args: unknown[]) => axiosGetMock(...args) },
}));

import { encodeAuthlibMetadata, resolveAuthlibServer } from "./authlibServer";

const metadata = {
  meta: { serverName: "Grubie Launcher" },
  skinDomains: ["cdn.grubielauncher.com"],
  signaturePublickey: "-----BEGIN PUBLIC KEY-----\nKEY\n-----END PUBLIC KEY-----",
};

function decode(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
}

describe("encodeAuthlibMetadata", () => {
  it("encodes metadata that carries a signature key", () => {
    const encoded = encodeAuthlibMetadata(metadata);
    expect(encoded && decode(encoded)).toEqual(metadata);
  });

  it("rejects responses that are not authlib-injector metadata", () => {
    expect(encodeAuthlibMetadata(null)).toBeNull();
    expect(encodeAuthlibMetadata("<!DOCTYPE html>")).toBeNull();
    expect(encodeAuthlibMetadata([metadata])).toBeNull();
    expect(encodeAuthlibMetadata({ meta: {} })).toBeNull();
  });
});

describe("resolveAuthlibServer", () => {
  beforeEach(() => {
    getYggdrasilMetadataMock.mockReset();
    axiosGetMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("uses the Grubie API host that answered, including the direct route", async () => {
    getYggdrasilMetadataMock.mockResolvedValue({
      baseUrl: "https://direct.grubielauncher.com",
      metadata,
    });

    const server = await resolveAuthlibServer("discord");

    expect(server?.url).toBe("https://direct.grubielauncher.com/yggdrasil");
    expect(server && decode(server.prefetched)).toEqual(metadata);
  });

  it("returns null when Grubie metadata is unavailable", async () => {
    getYggdrasilMetadataMock.mockResolvedValue(null);
    expect(await resolveAuthlibServer("discord")).toBeNull();
  });

  it("prefetches Ely.by metadata from its authlib-injector API", async () => {
    axiosGetMock.mockResolvedValue({ data: metadata });

    const server = await resolveAuthlibServer("elyby");

    expect(axiosGetMock).toHaveBeenCalledWith(
      "https://account.ely.by/api/authlib-injector",
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    expect(server?.url).toBe("https://account.ely.by/api/authlib-injector");
  });

  it("returns null when Ely.by is unreachable", async () => {
    axiosGetMock.mockRejectedValue(new Error("ETIMEDOUT"));
    expect(await resolveAuthlibServer("elyby")).toBeNull();
  });
});
