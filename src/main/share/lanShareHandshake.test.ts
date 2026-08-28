import net from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.NODE_ENV = "development";

const startShareMock = vi.fn();
const stopShareMock = vi.fn(async () => undefined);

vi.mock("electron", () => ({
  app: {
    getPath: () => process.env.TEMP || "/tmp",
    getVersion: () => "2.0.0",
  },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { trashItem: async () => undefined },
}));

vi.mock("../services/Backend", () => ({
  Backend: class {
    startShare = startShareMock;
    stopShare = stopShareMock;
    heartbeatShare = vi.fn(async () => ({}));
  },
}));

vi.mock("../utilities/accounts", () => ({
  getSelectedAccessToken: async () => "token",
}));

import { LanShareService } from "./LanShareService";
import { gameProcesses } from "../utilities/runtime";

const KEY = "Pack-0";

async function listen(): Promise<{ port: number; close: () => void }> {
  const server = net.createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  return { port, close: () => server.close() };
}

async function closedPort(): Promise<number> {
  const server = await listen();
  const port = server.port;
  server.close();
  return port;
}

let service: LanShareService;
let lan: { port: number; close: () => void };

beforeEach(async () => {
  vi.clearAllMocks();
  lan = await listen();
  gameProcesses.clear();
  gameProcesses.set(KEY, {
    process: { exitCode: null, pid: undefined } as never,
    versionName: "Pack",
    instance: 0,
    versionPath: process.env.TEMP || "/tmp",
    serverPort: null,
    accessToken: "host-token",
  });

  service = new LanShareService();
  (service as unknown as { candidates: Map<string, unknown> }).candidates.set(
    KEY,
    {
      key: KEY,
      versionName: "Pack",
      instance: 0,
      localPort: lan.port,
      detectedAt: new Date().toISOString(),
    },
  );
});

afterEach(async () => {
  await service.dispose?.();
  gameProcesses.clear();
  lan.close();
});

describe("startShare handshake", () => {
  it("fails instead of reporting success when the gateway is unreachable", async () => {
    const gatewayPort = await closedPort();

    startShareMock.mockResolvedValue({
      sessionId: "11111111-1111-4111-8111-111111111111",
      slug: "abcdefgh",
      publicAddress: "abcdefgh.join.grubielauncher.com",
      gatewayUrl: `ws://127.0.0.1:${gatewayPort}`,
      gatewayToken: "gw-token",
      visibility: "friends",
      heartbeatIntervalSec: 10,
      joinTicketTtlSec: 60,
    });

    const result = await service.startShare("friends");

    expect(result.ok).toBe(false);
    expect(service.getState().phase).toBe("error");
    expect(service.getState().sessionId).toBeFalsy();
  }, 30000);

  it("gives up when the gateway accepts the socket but never confirms", async () => {
    const silent = await listen();

    try {
      const waiter = (
        service as unknown as {
          waitForHandshake: (ms: number) => Promise<{ code: string } | null>;
        }
      ).waitForHandshake.bind(service);

      await (
        service as unknown as {
          tunnelClient: {
            connect: (options: Record<string, string>) => Promise<void>;
          };
        }
      ).tunnelClient.connect({
        gatewayUrl: `ws://127.0.0.1:${silent.port}`,
        token: "gw-token",
        sessionId: "11111111-1111-4111-8111-111111111111",
        slug: "abcdefgh",
      });

      expect((await waiter(400))?.code).toBe("tunnel_handshake_timeout");
    } finally {
      silent.close();
    }
  }, 20000);
});
