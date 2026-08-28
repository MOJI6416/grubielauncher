import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type InvokeHandler = (event: unknown, ...args: unknown[]) => unknown;
const handlers = new Map<string, InvokeHandler>();

vi.mock("electron", () => ({
  app: {
    getPath: () => path.resolve("/fake/other"),
    getAppPath: () => path.resolve("/fake/app"),
  },
  ipcMain: {
    removeHandler: (channel: string) => handlers.delete(channel),
    handle: (channel: string, handler: InvokeHandler) =>
      handlers.set(channel, handler),
  },
}));

const loadAccountsConfig = vi.fn();
const mutateAccountsConfig = vi.fn();

vi.mock("../utilities/accounts", () => ({
  loadAccountsConfig: (...args: unknown[]) => loadAccountsConfig(...args),
  mutateAccountsConfig: (...args: unknown[]) => mutateAccountsConfig(...args),
  mergeIncomingAccounts: (_stored: unknown, incoming: unknown) => incoming,
}));

import { readIpcFailureEnvelope } from "@/shared/ipcFailureEnvelope";
import { registerAccountsIpc } from "./accountsIpc";

const event = {
  sender: { isDestroyed: () => false, send: vi.fn() },
} as unknown as Electron.IpcMainInvokeEvent;

function raw(channel: string, ...args: unknown[]) {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return handler(event, ...args);
}

async function invoke(channel: string, ...args: unknown[]) {
  const result = await raw(channel, ...args);
  const envelope = readIpcFailureEnvelope(result);
  return envelope ? envelope.value : result;
}

async function failureOf(channel: string, ...args: unknown[]) {
  const envelope = readIpcFailureEnvelope(await raw(channel, ...args));
  return envelope?.__grubieIpcFailure ?? null;
}

const account = {
  nickname: "Steve",
  type: "microsoft" as const,
  image: "",
  friends: [],
};

beforeEach(() => {
  handlers.clear();
  loadAccountsConfig.mockReset();
  mutateAccountsConfig.mockReset();
  registerAccountsIpc();
});

describe("accounts ipc", () => {
  it("returns the stored config when the store is readable", async () => {
    loadAccountsConfig.mockResolvedValue({
      accounts: [account],
      lastPlayed: "microsoft_Steve",
    });

    expect(await invoke("accounts:load")).toEqual({
      accounts: [account],
      lastPlayed: "microsoft_Steve",
    });
  });

  it("tells an unreadable store apart from an empty one", async () => {
    loadAccountsConfig.mockRejectedValue(new Error("Failed to read"));

    const envelope = readIpcFailureEnvelope(await raw("accounts:load"));
    expect(envelope?.value).toBeNull();
    expect(envelope?.__grubieIpcFailure).toMatchObject({
      channel: "accounts:load",
      notify: true,
    });
  });

  it("reports a failed write instead of resolving as saved", async () => {
    mutateAccountsConfig.mockRejectedValue(
      Object.assign(new Error("EPERM: operation not permitted"), {
        code: "EPERM",
      }),
    );

    expect(await invoke("accounts:save", [account], "microsoft_Steve")).toBe(
      false,
    );
    expect(await failureOf("accounts:save", [account], null)).toMatchObject({
      channel: "accounts:save",
      notify: true,
    });
  });

  it("saves and reports success", async () => {
    mutateAccountsConfig.mockImplementation(async (mutator: any) => {
      return await mutator({ accounts: [], lastPlayed: null });
    });

    expect(await invoke("accounts:save", [account], "microsoft_Steve")).toBe(
      true,
    );
  });

  it("refuses a malformed payload without notifying", async () => {
    expect(await invoke("accounts:save", "not-a-list", null)).toBe(false);
    expect(mutateAccountsConfig).not.toHaveBeenCalled();
    expect(await failureOf("accounts:save", "not-a-list", null)).toMatchObject({
      notify: false,
      failure: { cause: "invalidArgument" },
    });
  });
});
