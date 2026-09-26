import { describe, expect, it } from "vitest";

import {
  placeTrayPopup,
  resolveTrayAnchor,
  taskbarEdge,
} from "./trayPopupPlacement";

const size = { width: 320, height: 400 };
const screen = { x: 0, y: 0, width: 1920, height: 1080 };

describe("placeTrayPopup", () => {
  it("opens beside the cursor above a bottom taskbar, not over the icon", () => {
    const display = {
      bounds: screen,
      workArea: { x: 0, y: 0, width: 1920, height: 1032 },
    };

    expect(placeTrayPopup({ x: 1700, y: 1056 }, display, size)).toEqual({
      x: 1380,
      y: 624,
    });
  });

  it("opens to the right of the cursor when there is room, like a native menu", () => {
    const display = {
      bounds: screen,
      workArea: { x: 0, y: 0, width: 1920, height: 1032 },
    };

    expect(placeTrayPopup({ x: 900, y: 1056 }, display, size).x).toBe(900);
  });

  it("hangs below a top taskbar", () => {
    const display = {
      bounds: screen,
      workArea: { x: 0, y: 40, width: 1920, height: 1040 },
    };

    expect(placeTrayPopup({ x: 1700, y: 20 }, display, size)).toEqual({
      x: 1380,
      y: 48,
    });
  });

  it("sits beside a taskbar on the right edge", () => {
    const display = {
      bounds: screen,
      workArea: { x: 0, y: 0, width: 1872, height: 1080 },
    };

    expect(placeTrayPopup({ x: 1896, y: 900 }, display, size)).toEqual({
      x: 1544,
      y: 500,
    });
  });

  it("sits beside a taskbar on the left edge", () => {
    const display = {
      bounds: screen,
      workArea: { x: 48, y: 0, width: 1872, height: 1080 },
    };

    expect(placeTrayPopup({ x: 24, y: 300 }, display, size)).toEqual({
      x: 56,
      y: 300,
    });
  });

  it("opens from the cursor for icons in the hidden icons flyout", () => {
    const display = {
      bounds: screen,
      workArea: { x: 0, y: 0, width: 1920, height: 1032 },
    };

    expect(placeTrayPopup({ x: 1650, y: 980 }, display, size)).toEqual({
      x: 1330,
      y: 580,
    });
  });

  it("finds an auto-hidden taskbar from the screen edge the cursor is near", () => {
    const display = { bounds: screen, workArea: screen };

    expect(placeTrayPopup({ x: 1700, y: 1075 }, display, size)).toEqual({
      x: 1380,
      y: 672,
    });
  });

  it("stays on the monitor the icon lives on", () => {
    const display = {
      bounds: { x: 1920, y: 0, width: 1280, height: 720 },
      workArea: { x: 1920, y: 0, width: 1280, height: 680 },
    };

    expect(placeTrayPopup({ x: 3100, y: 700 }, display, size)).toEqual({
      x: 2780,
      y: 272,
    });
  });

  it("keeps a popup taller than the screen pinned to the top edge", () => {
    const display = {
      bounds: { x: 0, y: 0, width: 1280, height: 400 },
      workArea: { x: 0, y: 0, width: 1280, height: 360 },
    };

    expect(placeTrayPopup({ x: 1200, y: 380 }, display, size).y).toBe(8);
  });
});

describe("taskbarEdge", () => {
  it("picks the side the work area gives up", () => {
    expect(
      taskbarEdge(
        screen,
        { x: 0, y: 0, width: 1920, height: 1032 },
        { x: 0, y: 0 },
      ),
    ).toBe("bottom");
    expect(
      taskbarEdge(
        screen,
        { x: 0, y: 25, width: 1920, height: 1055 },
        { x: 0, y: 0 },
      ),
    ).toBe("top");
  });
});

describe("resolveTrayAnchor", () => {
  const icon = { x: 1690, y: 1044, width: 24, height: 24 };

  it("uses the cursor when the click came from the icon", () => {
    expect(resolveTrayAnchor({ x: 1700, y: 1056 }, icon)).toEqual({
      x: 1700,
      y: 1056,
    });
  });

  it("falls back to the icon centre when opened from the keyboard", () => {
    expect(resolveTrayAnchor({ x: 400, y: 300 }, icon)).toEqual({
      x: 1702,
      y: 1056,
    });
  });

  it("uses the cursor when the icon bounds are unknown", () => {
    expect(
      resolveTrayAnchor(
        { x: 400, y: 300 },
        { x: 0, y: 0, width: 0, height: 0 },
      ),
    ).toEqual({ x: 400, y: 300 });
  });
});
