import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import http from "http";
import type { AddressInfo } from "net";

const STAND_PORT = 47331;

vi.mock("electron", () => ({
  app: { getPath: () => "" },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (buffer: Buffer) => buffer.toString(),
  },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock("@/shared/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/config")>();
  const standUrl = "http://127.0.0.1:47331";
  return {
    ...actual,
    BACKEND_URL: standUrl,
    BACKEND_URL_DIRECT: standUrl,
    BACKEND_CANDIDATES: [standUrl, standUrl],
  };
});

import { Backend } from "./Backend";

type StandMode = "ok" | "missing" | "broken" | "slow";

let mode: StandMode = "ok";
let server: http.Server;

beforeAll(async () => {
  server = http.createServer((_request, response) => {
    if (mode === "slow") {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ _id: "1", shareCode: "abc" }));
      }, 3000);
      return;
    }

    if (mode === "missing") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "Modpack not found" }));
      return;
    }

    if (mode === "broken") {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "Internal server error" }));
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ _id: "1", shareCode: "abc", conf: { name: "Pack" } }),
    );
  });

  await new Promise<void>((resolve) =>
    server.listen(STAND_PORT, "127.0.0.1", resolve),
  );
  expect((server.address() as AddressInfo).port).toBe(STAND_PORT);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  mode = "ok";
});

async function fetchModpack() {
  const backend = new Backend("token");
  try {
    return await backend.getModpack("abc");
  } catch {
    return { status: "error" as const, data: null };
  }
}

describe("getModpack against a live backend", () => {
  it("reports a published pack", async () => {
    const response = await fetchModpack();
    expect(response.status).toBe("success");
  });

  it("reports a deleted pack as gone", async () => {
    mode = "missing";
    const response = await fetchModpack();
    expect(response.status).toBe("not_found");
  });

  it("does not read a failing backend as a deleted pack", async () => {
    mode = "broken";
    const response = await fetchModpack();
    expect(response.status).toBe("error");
  });

  it("does not read a timing-out backend as a deleted pack", async () => {
    mode = "slow";
    const backend = new Backend("token");
    backend.api.defaults.timeout = 300;

    let response: Awaited<ReturnType<typeof fetchModpack>>;
    try {
      response = await backend.getModpack("abc");
    } catch {
      response = { status: "error", data: null };
    }

    expect(response.status).toBe("error");
  }, 15000);
});
