import { beforeEach, describe, expect, it, vi } from "vitest";

type InvokeHandler = (event: unknown, ...args: unknown[]) => unknown;
const handlers = new Map<string, InvokeHandler>();

vi.mock("electron", () => ({
  ipcMain: {
    removeHandler: (channel: string) => handlers.delete(channel),
    handle: (channel: string, handler: InvokeHandler) =>
      handlers.set(channel, handler),
  },
}));

vi.mock("../services/Auth", () => ({}));
vi.mock("../services/LittleSkin", () => ({}));

const journalInfo = vi.fn();
vi.mock("../journal/journal", () => ({
  journal: { info: (...args: unknown[]) => journalInfo(...args) },
}));

const startOAuthServer = vi.fn();
vi.mock("../utilities/authServer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utilities/authServer")>()),
  startOAuthServer: (...args: unknown[]) => startOAuthServer(...args),
  stopOAuthServer: vi.fn(async () => {}),
}));

import { OAuthCancelledError } from "../utilities/authServer";
import { registerAuthIpc } from "./authIpc";

function startServer(state: string) {
  const handler = handlers.get("auth:startServer");
  if (!handler) throw new Error("no handler for auth:startServer");
  return handler({}, state);
}

beforeEach(() => {
  handlers.clear();
  startOAuthServer.mockReset();
  journalInfo.mockReset();
  registerAuthIpc();
});

describe("auth:startServer", () => {
  it("hands back the callback the browser delivered", async () => {
    startOAuthServer.mockResolvedValue({ code: "abc", provider: "microsoft" });

    await expect(startServer("microsoft:0123456789abcdef")).resolves.toEqual({
      code: "abc",
      provider: "microsoft",
    });
  });

  it("answers a routine cancellation instead of failing the handler", async () => {
    for (const reason of [
      "OAuth server was restarted.",
      "OAuth sign-in was cancelled.",
      "OAuth callback timed out.",
    ]) {
      startOAuthServer.mockRejectedValueOnce(new OAuthCancelledError(reason));

      await expect(
        startServer(`discord:${reason.length}-0123456789abcdef`),
      ).resolves.toEqual({ cancelled: true, message: reason });
    }

    expect(journalInfo).toHaveBeenCalledTimes(3);
  });

  it("still fails on a real problem such as a busy port", async () => {
    startOAuthServer.mockRejectedValue(
      Object.assign(new Error("listen EADDRINUSE :::53213"), {
        code: "EADDRINUSE",
      }),
    );

    await expect(startServer("elyby:0123456789abcdef")).rejects.toThrow(
      "EADDRINUSE",
    );
    expect(journalInfo).not.toHaveBeenCalled();
  });
});
