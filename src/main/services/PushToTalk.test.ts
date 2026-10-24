import { beforeEach, describe, expect, it, vi } from "vitest";

const start = vi.fn();
const stop = vi.fn();
const trusted = vi.fn((_prompt: boolean) => true);

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
  systemPreferences: {
    isTrustedAccessibilityClient: (prompt: boolean) => trusted(prompt),
  },
}));

vi.mock("uiohook-napi", () => ({
  uIOhook: {
    on: vi.fn(),
    start: (...args: unknown[]) => start(...args),
    stop: (...args: unknown[]) => stop(...args),
  },
  UiohookKey: { KeyA: 30 },
}));

import { capturePttBind, setPttBind } from "./PushToTalk";

beforeEach(() => {
  vi.clearAllMocks();
  trusted.mockReturnValue(true);
  setPttBind(null);
  start.mockReset();
  stop.mockReset();
});

function onPlatform(platform: NodeJS.Platform, run: () => Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: platform });
  return run().finally(() => Object.defineProperty(process, "platform", original));
}

describe("setPttBind", () => {
  it("reports success when the global hook starts", () => {
    expect(setPttBind({ type: "key", code: 30 })).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("reports failure when the hook cannot start", () => {
    start.mockImplementation(() => {
      throw new Error("hook unavailable");
    });

    expect(setPttBind({ type: "key", code: 30 })).toBe(false);
  });

  it("does not restart the hook when the same bind is re-applied", () => {
    expect(setPttBind({ type: "key", code: 30 })).toBe(true);
    start.mockClear();

    expect(setPttBind({ type: "key", code: 30 })).toBe(true);
    expect(start).not.toHaveBeenCalled();
  });

  it("switches the bind without tearing the running hook down", () => {
    setPttBind({ type: "key", code: 30 });
    start.mockClear();

    expect(setPttBind({ type: "mouse", code: 4 })).toBe(true);
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it("stops the hook when push-to-talk is turned off", () => {
    setPttBind({ type: "key", code: 30 });

    expect(setPttBind(null)).toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe("capturePttBind on macOS", () => {
  it("asks for Accessibility instead of starting a hook that cannot see keys", () =>
    onPlatform("darwin", async () => {
      trusted.mockReturnValue(false);

      await expect(capturePttBind()).resolves.toEqual({
        reason: "permission",
        bind: null,
      });
      expect(trusted).toHaveBeenCalledWith(true);
      expect(start).not.toHaveBeenCalled();
    }));

  it("hooks keys once Accessibility is granted", () =>
    onPlatform("darwin", async () => {
      expect(setPttBind({ type: "key", code: 30 })).toBe(true);
      expect(start).toHaveBeenCalledTimes(1);
    }));
});
