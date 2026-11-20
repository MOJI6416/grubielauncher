import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: class {}, screen: {} }));
vi.mock("@electron-toolkit/utils", () => ({ is: { dev: false } }));

const { normalizeOverlayState, overlayBounds } = await import("./voiceOverlay");

const area = { x: 1920, y: 0, width: 2560, height: 1392 };

describe("overlayBounds", () => {
  it("keeps the old top-left spot by default", () => {
    expect(overlayBounds(area, "top-left")).toEqual({
      x: 1936,
      y: 16,
      width: 300,
      height: 420,
    });
  });

  it("hugs the chosen corner of the chosen screen", () => {
    expect(overlayBounds(area, "top-right")).toMatchObject({ x: 4164, y: 16 });
    expect(overlayBounds(area, "bottom-left")).toMatchObject({ x: 1936, y: 956 });
    expect(overlayBounds(area, "bottom-right")).toMatchObject({ x: 4164, y: 956 });
  });
});

describe("normalizeOverlayState", () => {
  const speaker = { id: "a", name: "Alex", initials: "AL", headUrl: null };

  it("passes a known corner and screen through", () => {
    expect(
      normalizeOverlayState({
        visible: true,
        speakers: [speaker],
        corner: "bottom-right",
        displayId: 2779098405,
      }),
    ).toMatchObject({ corner: "bottom-right", displayId: 2779098405 });
  });

  it("drops a corner or screen it does not understand", () => {
    const state = normalizeOverlayState({
      visible: true,
      speakers: [speaker],
      corner: "middle",
      displayId: "main",
    });
    expect(state.corner).toBeUndefined();
    expect(state.displayId).toBeUndefined();
  });
});
