import { beforeEach, describe, expect, it, vi } from "vitest";

type InvokeHandler = (event: unknown, ...args: unknown[]) => unknown;
const handlers = new Map<string, InvokeHandler>();

let stored = "";
let writable = true;
const MAX_STORE = 100_000;

vi.mock("electron", () => ({
  app: {
    getPath: () => "/fake",
    getVersion: () => "0.0.0",
    getLocale: () => "en",
    getAppPath: () => "/fake/app",
  },
  clipboard: {
    writeText: (text: string) => {
      if (!writable) return;
      stored = text.slice(0, MAX_STORE);
    },
    readText: () => stored,
  },
  dialog: { showOpenDialog: vi.fn() },
  shell: {},
  Notification: class {},
  nativeImage: { createFromBuffer: vi.fn() },
  ipcMain: {
    removeHandler: (channel: string) => handlers.delete(channel),
    removeAllListeners: vi.fn(),
    handle: (channel: string, handler: InvokeHandler) =>
      handlers.set(channel, handler),
    on: vi.fn(),
  },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock("../../../resources/icon.png?asset", () => ({ default: "" }));
vi.mock("../utilities/downloader", () => ({ Downloader: class {} }));
vi.mock("../windows/mainWindow", () => ({
  confirmWindowClose: vi.fn(),
  mainWindow: null,
  setUnsavedChangesGuard: vi.fn(),
}));
vi.mock("../utilities/other", () => ({ getLauncherPaths: vi.fn() }));
vi.mock("../utilities/connectivityTest", () => ({
  runConnectivityTests: vi.fn(),
}));
vi.mock("../rpc", () => ({ rpc: { syncContext: vi.fn() } }));
vi.mock("../utilities/shortcut", () => ({
  createInstanceShortcut: vi.fn(),
  getImageBase64: vi.fn(),
}));

import { readIpcFailureEnvelope } from "@/shared/ipcFailureEnvelope";
import { registerOtherIpc } from "./otherIpc";

const event = {
  sender: { isDestroyed: () => false, send: vi.fn() },
} as unknown as Electron.IpcMainInvokeEvent;

async function invoke(channel: string, ...args: unknown[]) {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  const result = await handler(event, ...args);
  const envelope = readIpcFailureEnvelope(result);
  return envelope ? envelope.value : result;
}

describe("clipboard:writeText", () => {
  beforeEach(() => {
    handlers.clear();
    stored = "";
    writable = true;
    registerOtherIpc();
  });

  it("keeps the whole text and reports success", async () => {
    const text = "line\r\n\ttab é❤️".repeat(10);

    await expect(invoke("clipboard:writeText", text)).resolves.toBe(true);
    expect(stored).toBe(text);
  });

  it("does not report success when the clipboard kept only part of the text", async () => {
    const text = "x".repeat(MAX_STORE + 1);

    await expect(invoke("clipboard:writeText", text)).resolves.toBe(false);
  });

  it("does not report success when the clipboard refused the write", async () => {
    writable = false;

    await expect(invoke("clipboard:writeText", "code")).resolves.toBe(false);
  });

  it("refuses text above the transfer limit instead of cutting it", async () => {
    const text = "y".repeat(8 * 1024 * 1024 + 1);

    await expect(invoke("clipboard:writeText", text)).resolves.toBe(false);
    expect(stored).toBe("");
  });
});
