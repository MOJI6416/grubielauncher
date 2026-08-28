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

import { Backend } from "./Backend";

type Reply =
  | { status: number; data?: unknown }
  | { code: string }
  | { ok: unknown };

let reply: Reply = { ok: [] };

function makeBackend() {
  const backend = new Backend("token");

  backend.api.defaults.adapter = async (config) => {
    if ("ok" in reply) {
      return {
        data: reply.ok,
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      } as any;
    }

    if ("code" in reply) {
      const error: any = new Error(reply.code);
      error.isAxiosError = true;
      error.code = reply.code;
      error.config = config;
      throw error;
    }

    const error: any = new Error(
      `Request failed with status code ${reply.status}`,
    );
    error.isAxiosError = true;
    error.config = config;
    error.response = {
      status: reply.status,
      data: reply.data ?? {},
      headers: {},
      config,
    };
    throw error;
  };

  return backend;
}

beforeEach(() => {
  reply = { ok: [] };
});

describe("Backend.getPublicProfile", () => {
  it("asks by id first, so a shared nickname cannot resolve a stranger", async () => {
    const backend = makeBackend();
    const urls: string[] = [];
    backend.api.defaults.adapter = async (config) => {
      urls.push(String(config.url));
      return {
        data: { id: "64f000000000000000000001" },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      } as any;
    };

    await backend.getPublicProfile("moji", "64f000000000000000000001");

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/profiles/id/64f000000000000000000001");
  });

  it("falls back to the nickname when the backend has no by-id route yet", async () => {
    const backend = makeBackend();
    const urls: string[] = [];
    backend.api.defaults.adapter = async (config) => {
      urls.push(String(config.url));
      if (String(config.url).includes("/profiles/id/")) {
        const error: any = new Error("Request failed with status code 404");
        error.isAxiosError = true;
        error.config = config;
        error.response = { status: 404, data: {}, headers: {}, config };
        throw error;
      }
      return {
        data: { id: "other" },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      } as any;
    };

    const profile = await backend.getPublicProfile(
      "moji",
      "64f000000000000000000001",
    );

    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("/profiles/moji");
    expect(profile).toMatchObject({ id: "other" });
  });

  it("does not hide a server failure behind the nickname lookup", async () => {
    const backend = makeBackend();
    reply = { status: 500 };

    await expect(
      backend.getPublicProfile("moji", "64f000000000000000000001"),
    ).rejects.toMatchObject({ response: { status: 500 } });
  });
});

describe("Backend read methods", () => {
  it("does not turn an unreachable source into an empty list", async () => {
    reply = { code: "ECONNREFUSED" };

    await expect(makeBackend().groupsList()).rejects.toMatchObject({
      code: "ECONNREFUSED",
    });
  });

  it("does not turn a server error into an empty own-modpack list", async () => {
    reply = { status: 500 };

    await expect(makeBackend().getOwnModpacks()).rejects.toMatchObject({
      response: { status: 500 },
    });
  });

  it("does not turn an unreachable source into an empty news list", async () => {
    reply = { code: "ENOTFOUND" };

    await expect(makeBackend().getNews()).rejects.toMatchObject({
      code: "ENOTFOUND",
    });
  });

  it("does not report a failed write as done", async () => {
    reply = { status: 503 };

    await expect(makeBackend().groupDelete("group")).rejects.toMatchObject({
      response: { status: 503 },
    });
  });
});

describe("Backend.groupJoinByCode", () => {
  it("keeps the answers the server explains", async () => {
    for (const [message, expected] of [
      ["banned", "banned"],
      ["group_full", "group_full"],
      ["rate_limited", "rate_limited"],
      ["group_not_found", "not_found"],
      ["invalid_code", "invalid_code"],
    ] as const) {
      reply = { status: 403, data: { message } };
      await expect(makeBackend().groupJoinByCode("ABCD")).resolves.toBe(
        expected,
      );
    }
  });

  it("does not read an unreachable server as a wrong code", async () => {
    reply = { code: "ETIMEDOUT" };

    await expect(makeBackend().groupJoinByCode("ABCD")).rejects.toMatchObject({
      code: "ETIMEDOUT",
    });
  });
});
