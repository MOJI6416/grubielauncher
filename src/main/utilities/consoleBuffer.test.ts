import { beforeEach, describe, expect, it } from "vitest";
import {
  clearConsoleOutput,
  getConsoleOutput,
  recordConsoleOutput,
} from "./consoleBuffer";

describe("consoleBuffer", () => {
  beforeEach(() => {
    clearConsoleOutput("Forge 26.2", 0);
  });

  it("keeps process output per version and instance", () => {
    recordConsoleOutput("Forge 26.2", 0, "first line\nsecond line");
    recordConsoleOutput("Forge 26.2", 1, "other instance");

    expect(getConsoleOutput("Forge 26.2", 0)).toBe("first line\nsecond line");
    expect(getConsoleOutput("Forge 26.2", 1)).toBe("other instance");

    clearConsoleOutput("Forge 26.2", 1);
  });

  it("drops blank lines and keeps only the tail", () => {
    recordConsoleOutput("Forge 26.2", 0, "\n\n");
    expect(getConsoleOutput("Forge 26.2", 0)).toBe("");

    for (let index = 0; index < 500; index += 1) {
      recordConsoleOutput("Forge 26.2", 0, `line ${index}`);
    }

    const lines = getConsoleOutput("Forge 26.2", 0).split("\n");

    expect(lines).toHaveLength(400);
    expect(lines[lines.length - 1]).toBe("line 499");
    expect(lines[0]).toBe("line 100");
  });

  it("caps a single very long line", () => {
    recordConsoleOutput("Forge 26.2", 0, "x".repeat(5000));

    expect(getConsoleOutput("Forge 26.2", 0)).toHaveLength(2000);
  });

  it("returns nothing for an instance that never ran", () => {
    expect(getConsoleOutput("Fabric 1.20.1", 3)).toBe("");
  });
});
