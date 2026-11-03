import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  trayAvailable: true,
  window: {
    visible: true,
    minimized: false,
    destroyed: false,
  },
}));

const window = vi.hoisted(() => ({
  isDestroyed: () => state.window.destroyed,
  isVisible: () => state.window.visible,
  isMinimized: () => state.window.minimized,
  minimize: vi.fn(() => {
    state.window.minimized = true;
  }),
  restore: vi.fn(() => {
    state.window.minimized = false;
  }),
  show: vi.fn(() => {
    state.window.visible = true;
  }),
  hide: vi.fn(() => {
    state.window.visible = false;
  }),
}));

vi.mock("fs-extra", () => ({
  default: { readJSONSync: () => state.settings },
}));

vi.mock("./dataRoot", () => ({ getDataRoot: () => "C:\\data" }));

vi.mock("../windows/mainWindow", () => ({
  mainWindow: window,
  hideMainWindowToTray: () => {
    if (!state.trayAvailable) return false;
    window.hide();
    return true;
  },
}));

const { hideWindowForGame, returnWindowAfterGame } = await import(
  "./gameWindow"
);

beforeEach(() => {
  state.settings = {};
  state.trayAvailable = true;
  state.window.visible = true;
  state.window.minimized = false;
  state.window.destroyed = false;
  vi.clearAllMocks();
});

describe("hideWindowForGame", () => {
  it("minimizes by default, like before", () => {
    hideWindowForGame();
    expect(window.minimize).toHaveBeenCalledTimes(1);
    expect(window.hide).not.toHaveBeenCalled();
  });

  it("hides to the tray when asked", () => {
    state.settings = { gameWindow: "tray" };
    hideWindowForGame();
    expect(window.hide).toHaveBeenCalledTimes(1);
    expect(window.minimize).not.toHaveBeenCalled();
  });

  it("falls back to minimizing when there is no tray", () => {
    state.settings = { gameWindow: "tray" };
    state.trayAvailable = false;
    hideWindowForGame();
    expect(window.minimize).toHaveBeenCalledTimes(1);
  });

  it("leaves the window alone when asked to keep it open", () => {
    state.settings = { gameWindow: "keep" };
    hideWindowForGame();
    expect(window.minimize).not.toHaveBeenCalled();
    expect(window.hide).not.toHaveBeenCalled();
  });

  it("does not pull a window the player already hid out of the tray", () => {
    state.window.visible = false;
    hideWindowForGame();
    expect(window.minimize).not.toHaveBeenCalled();
  });
});

describe("returnWindowAfterGame", () => {
  it("restores a minimized launcher", () => {
    hideWindowForGame();
    returnWindowAfterGame();
    expect(window.restore).toHaveBeenCalledTimes(1);
  });

  it("shows the launcher it hid to the tray", () => {
    state.settings = { gameWindow: "tray" };
    hideWindowForGame();
    returnWindowAfterGame();
    expect(window.show).toHaveBeenCalledTimes(1);
  });

  it("stays out of the way when the player turned the return off", () => {
    state.settings = { restoreAfterGame: false };
    hideWindowForGame();
    returnWindowAfterGame();
    expect(window.restore).not.toHaveBeenCalled();
  });

  it("still comes back after a crash so the analysis is visible", () => {
    state.settings = { gameWindow: "tray", restoreAfterGame: false };
    hideWindowForGame();
    returnWindowAfterGame({ force: true });
    expect(window.show).toHaveBeenCalledTimes(1);
  });

  it("does not show a window that was already hidden before the game", () => {
    state.window.visible = false;
    hideWindowForGame();
    returnWindowAfterGame();
    expect(window.show).not.toHaveBeenCalled();
  });
});
