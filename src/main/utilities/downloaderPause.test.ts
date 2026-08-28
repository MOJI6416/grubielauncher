import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../windows/mainWindow", () => ({ mainWindow: null }));

import {
  getDownloadPauseState,
  pauseDownloads,
  resumeDownloads,
  waitWhileDownloadsPaused,
} from "./downloader";

describe("install pause gate", () => {
  beforeEach(() => {
    resumeDownloads();
  });

  it("is off while nothing asked for a pause", () => {
    expect(getDownloadPauseState()).toBe("off");
  });

  it("holds a non-download step until the pause is lifted", async () => {
    pauseDownloads();

    let released = false;
    const gate = waitWhileDownloadsPaused(() => false).then(() => {
      released = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(released).toBe(false);
    expect(getDownloadPauseState()).toBe("held");

    resumeDownloads();
    await gate;
    expect(released).toBe(true);
    expect(getDownloadPauseState()).toBe("off");
  });

  it("reports the pause as pending while no step is parked on it yet", () => {
    pauseDownloads();
    expect(getDownloadPauseState()).toBe("pending");
  });

  it("lets a cancelled install through the gate instead of hanging", async () => {
    pauseDownloads();
    await waitWhileDownloadsPaused(() => true);
    expect(getDownloadPauseState()).toBe("pending");
  });
});
