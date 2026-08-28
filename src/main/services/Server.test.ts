import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "" },
  BrowserWindow: { getAllWindows: () => [] },
}));

import { Server } from "./Server";

type Reply = { status: number } | { code: string };

const replies = new Map<string, Reply>();

function matchReply(url: string): Reply | undefined {
  for (const [fragment, reply] of replies) {
    if (url.includes(fragment)) return reply;
  }
  return undefined;
}

beforeEach(() => {
  replies.clear();

  (Server as unknown as { api: { defaults: Record<string, unknown> } }).api.defaults.adapter =
    async (config: { url?: string }) => {
      const url = config.url ?? "";
      const reply = matchReply(url) ?? { status: 404 };

      if ("code" in reply) {
        const error: any = new Error(reply.code);
        error.isAxiosError = true;
        error.code = reply.code;
        error.config = config;
        throw error;
      }

      const error: any = new Error(`Request failed with status code ${reply.status}`);
      error.isAxiosError = true;
      error.config = config;
      error.response = { status: reply.status, data: {}, headers: {}, config };
      throw error;
    };
});

describe("Server.get", () => {
  it("returns an empty list when the sources answer that the version has no core", async () => {
    replies.set("loaders/forge.json", { status: 404 });

    await expect(Server.get("1.20.1", "forge")).resolves.toEqual([]);
  });

  it("throws when the list is empty only because the source is unreachable", async () => {
    replies.set("loaders/forge.json", { code: "ECONNREFUSED" });

    await expect(Server.get("1.20.1", "forge")).rejects.toMatchObject({
      code: "ECONNREFUSED",
    });
  });

  it("throws for vanilla when every source is unreachable", async () => {
    replies.set("server/vanilla.json", { code: "ENOTFOUND" });
    replies.set("papermc.io", { code: "ENOTFOUND" });
    replies.set("purpurmc.org", { code: "ENOTFOUND" });

    await expect(Server.get("1.20.1", "vanilla")).rejects.toMatchObject({
      code: "ENOTFOUND",
    });
  });
});
