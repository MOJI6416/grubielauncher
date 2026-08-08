import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "" },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (buffer: Buffer) => buffer.toString(),
  },
  BrowserWindow: { getAllWindows: () => [] },
}));

import { BaseService } from "./Base";
import { BACKEND_URL } from "@/shared/config";

class TestService extends BaseService {
  public allow(url: string) {
    this.allowAuthorizedOrigin(url);
  }
}

const seen: Array<Record<string, unknown>> = [];

function makeService(extraOrigin?: string) {
  const service = new TestService("token-abc");
  if (extraOrigin) service.allow(extraOrigin);

  service.api.defaults.adapter = async (config) => {
    seen.push({ ...(config.headers as Record<string, unknown>) });
    return {
      data: {},
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    } as any;
  };

  return service;
}

beforeEach(() => {
  seen.length = 0;
});

describe("BaseService authorization scoping", () => {
  it("sends the bearer token to the launcher backend", async () => {
    const service = makeService();
    await service.api.get("/users/me");
    await service.api.get(`${BACKEND_URL}/users/me`);

    expect(seen).toHaveLength(2);
    expect(seen[0].Authorization).toBe("Bearer token-abc");
    expect(seen[1].Authorization).toBe("Bearer token-abc");
  });

  it("never sends the bearer token to a third-party host", async () => {
    const service = makeService();
    await service.api.get("https://api.mojang.com/users/profiles/minecraft/Notch");

    expect(seen).toHaveLength(1);
    expect(seen[0].Authorization).toBeUndefined();
  });

  it("strips an Authorization header set by the caller for a foreign host", async () => {
    const service = makeService();
    await service.api.get("https://api.mojang.com/x", {
      headers: { Authorization: "Bearer token-abc" },
    });

    expect(seen[0].Authorization).toBeUndefined();
  });

  it("allows an explicitly registered service origin", async () => {
    const service = makeService("https://api.minecraftservices.com");
    await service.api.get("https://api.minecraftservices.com/minecraft/profile");
    await service.api.get("https://sessionserver.mojang.com/x");

    expect(seen[0].Authorization).toBe("Bearer token-abc");
    expect(seen[1].Authorization).toBeUndefined();
  });
});
