import { describe, expect, it } from "vitest";
import { pickEntry, pickSpatial, type Box } from "./spatial";

const box = (
  left: number,
  top: number,
  width: number,
  height: number,
): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe("spatial focus", () => {
  const grid = [
    box(0, 0, 100, 100),
    box(120, 0, 100, 100),
    box(240, 0, 100, 100),
    box(0, 120, 100, 100),
    box(120, 120, 100, 100),
    box(240, 120, 100, 100),
  ];

  it("walks a grid along rows and columns", () => {
    expect(pickSpatial(grid[0], grid, "right")).toBe(1);
    expect(pickSpatial(grid[1], grid, "right")).toBe(2);
    expect(pickSpatial(grid[1], grid, "down")).toBe(4);
    expect(pickSpatial(grid[5], grid, "up")).toBe(2);
    expect(pickSpatial(grid[4], grid, "left")).toBe(3);
  });

  it("stays put at the edge", () => {
    expect(pickSpatial(grid[2], grid, "right")).toBe(-1);
    expect(pickSpatial(grid[0], grid, "up")).toBe(-1);
  });

  it("prefers the switch below over a label diagonally closer", () => {
    const rows = [
      box(20, 0, 300, 20),
      box(900, 0, 40, 20),
      box(20, 50, 300, 20),
      box(900, 50, 40, 20),
    ];
    expect(pickSpatial(rows[1], rows, "down")).toBe(3);
    expect(pickSpatial(rows[0], rows, "down")).toBe(2);
  });

  it("goes from the sidebar to the content beside it", () => {
    const sidebar = box(0, 300, 240, 34);
    const content = [
      box(280, 40, 200, 40),
      box(280, 290, 200, 56),
      box(280, 600, 200, 56),
    ];
    expect(pickSpatial(sidebar, content, "right")).toBe(1);
  });

  it("enters at the top left", () => {
    expect(
      pickEntry([
        box(300, 50, 10, 10),
        box(10, 60, 10, 10),
        box(200, 400, 10, 10),
      ]),
    ).toBe(1);
    expect(pickEntry([])).toBe(-1);
  });
});
