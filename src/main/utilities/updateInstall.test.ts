import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const { EventEmitter } = require("events");
  return {
    updater: Object.assign(new EventEmitter(), { quitAndInstall: vi.fn() }),
    writeAttempt: vi.fn(),
    clearAttempt: vi.fn(),
    markHidden: vi.fn(),
    clearHidden: vi.fn(),
  };
});

vi.mock("electron", () => ({
  app: { getPath: () => "user-data", getVersion: () => "2.0.5" },
}));
vi.mock("electron-updater", () => ({ autoUpdater: mocks.updater }));
vi.mock("./updateLoopGuard", () => ({
  writeUpdateAttempt: mocks.writeAttempt,
  clearUpdateAttempt: mocks.clearAttempt,
}));
vi.mock("./launchAtLogin", () => ({
  markHiddenRelaunch: mocks.markHidden,
  clearHiddenRelaunch: mocks.clearHidden,
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.updater.removeAllListeners();
  mocks.writeAttempt.mockResolvedValue(undefined);
  mocks.clearAttempt.mockResolvedValue(undefined);
  vi.useFakeTimers();
});

afterEach(() => vi.useRealTimers());

describe("update installation", () => {
  it("records the attempt, preserves hidden mode and installs silently with relaunch", async () => {
    const { scheduleUpdateInstall } = await import("./updateInstall");
    const onInstall = vi.fn();
    await expect(
      scheduleUpdateInstall({
        version: "2.0.6",
        hidden: true,
        delay: 700,
        onInstall,
        onError: vi.fn(),
      }),
    ).resolves.toBe(true);
    expect(mocks.writeAttempt).toHaveBeenCalledWith(
      "user-data",
      expect.objectContaining({
        from: "2.0.5",
        target: "2.0.6",
        exe: process.execPath,
      }),
    );
    expect(mocks.markHidden).toHaveBeenCalledOnce();
    expect(onInstall).toHaveBeenCalledOnce();
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(700);
    expect(mocks.updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(
      true,
      true,
    );
  });

  it("prevents two clicks from starting two installers", async () => {
    const { scheduleUpdateInstall } = await import("./updateInstall");
    const options = {
      version: "2.0.6",
      delay: 300,
      onInstall: vi.fn(),
      onError: vi.fn(),
    };
    const result = await Promise.all([
      scheduleUpdateInstall(options),
      scheduleUpdateInstall(options),
    ]);
    expect(result).toEqual([true, false]);
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.updater.quitAndInstall).toHaveBeenCalledOnce();
  });

  it("clears failed-install markers and lets the user retry", async () => {
    const { scheduleUpdateInstall } = await import("./updateInstall");
    const failure = new Error("Could not spawn installer");
    const options = {
      version: "2.0.6",
      hidden: true,
      delay: 300,
      onInstall: vi.fn(),
      onError: vi.fn(),
    };
    await scheduleUpdateInstall(options);
    mocks.updater.quitAndInstall.mockImplementationOnce(() => {
      mocks.updater.emit("error", failure);
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.clearAttempt).toHaveBeenCalledWith("user-data");
    expect(mocks.clearHidden).toHaveBeenCalledOnce();
    expect(options.onError).toHaveBeenCalledWith(failure);
    await expect(scheduleUpdateInstall(options)).resolves.toBe(true);
  });

  it("cancels the scheduled install if the updater errors before the timer fires", async () => {
    const { scheduleUpdateInstall } = await import("./updateInstall");
    const failure = new Error("Update file missing");
    const onError = vi.fn();
    await scheduleUpdateInstall({
      version: "2.0.6",
      delay: 300,
      onInstall: vi.fn(),
      onError,
    });
    mocks.updater.emit("error", failure);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(failure);
    expect(mocks.markHidden).not.toHaveBeenCalled();
  });

  it("does not schedule an installer when the preparation callback emits an error", async () => {
    const { scheduleUpdateInstall } = await import("./updateInstall");
    const onError = vi.fn();
    await expect(
      scheduleUpdateInstall({
        version: "2.0.6",
        delay: 300,
        onInstall: () =>
          mocks.updater.emit("error", new Error("Preparation failed")),
        onError,
      }),
    ).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("waits for failed-attempt cleanup before accepting another installation", async () => {
    const { scheduleUpdateInstall } = await import("./updateInstall");
    let finishCleanup!: () => void;
    mocks.clearAttempt.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishCleanup = resolve;
      }),
    );
    const options = {
      version: "2.0.6",
      delay: 300,
      onInstall: vi.fn(),
      onError: vi.fn(),
    };
    await scheduleUpdateInstall(options);
    mocks.updater.emit("error", new Error("Installer failed"));
    await expect(scheduleUpdateInstall(options)).resolves.toBe(false);
    finishCleanup();
    await Promise.resolve();
    await expect(scheduleUpdateInstall(options)).resolves.toBe(true);
  });
});
