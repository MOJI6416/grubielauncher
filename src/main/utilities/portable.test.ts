import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: {} }));

import { findPortableRoot, portablePaths } from "./portable";

describe("portable mode", () => {
  it("turns on only when a data folder sits next to the exe", () => {
    const exe = "E:\\Grubie Launcher\\Grubie Launcher.exe";
    const seen: string[] = [];

    expect(
      findPortableRoot(exe, (target) => {
        seen.push(target);
        return true;
      }),
    ).toBe("E:\\Grubie Launcher\\data");
    expect(seen).toEqual(["E:\\Grubie Launcher\\data"]);
    expect(findPortableRoot(exe, () => false)).toBeNull();
  });

  it("keeps the profile, logs, crash dumps and temp inside the data folder", () => {
    expect(portablePaths("F:\\Grubie\\data", "grubie-launcher")).toEqual({
      appData: "F:\\Grubie\\data",
      userData: "F:\\Grubie\\data\\grubie-launcher",
      logs: "F:\\Grubie\\data\\grubie-launcher\\logs",
      crashDumps: "F:\\Grubie\\data\\grubie-launcher\\Crashpad",
      temp: "F:\\Grubie\\data\\Temp",
    });
  });
});
