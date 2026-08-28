import { describe, expect, it } from "vitest";
import { buildSystemReport, platformName, type SystemReportInput } from "./systemReport";

const input: SystemReportInput = {
  appVersion: "1.9.0",
  platform: "win32",
  totalMemoryMb: 16384,
  xmx: 6144,
  optimizedJvm: true,
  downloadSource: "auto",
  mirrorMode: "mirror",
  language: "ru",
  instanceCount: 6,
  launcherPath: "C:/launcher",
  minecraftPath: "C:/launcher/minecraft",
  javaPath: "C:/launcher/java",
  storageTotal: "24.1 GB",
};

describe("platformName", () => {
  it("maps node platforms to human names", () => {
    expect(platformName("win32")).toBe("Windows");
    expect(platformName("darwin")).toBe("macOS");
    expect(platformName("linux")).toBe("Linux");
  });

  it("passes unknown platforms through", () => {
    expect(platformName("freebsd")).toBe("freebsd");
  });
});

describe("buildSystemReport", () => {
  it("renders one fact per line", () => {
    const report = buildSystemReport(input);

    expect(report.split("\n")).toEqual([
      "Grubie Launcher 1.9.0",
      "OS: Windows",
      "RAM: 16384 MB",
      "Heap: 6144 MB (preallocated)",
      "Downloads: auto → mirror",
      "Language: ru",
      "Instances: 6",
      "Storage: 24.1 GB",
      "Launcher: C:/launcher",
      "Minecraft: C:/launcher/minecraft",
      "Java: C:/launcher/java",
    ]);
  });

  it("marks unknown values instead of leaving blanks", () => {
    const report = buildSystemReport({
      ...input,
      appVersion: "",
      totalMemoryMb: 0,
      storageTotal: "",
      launcherPath: "",
      mirrorMode: null,
      optimizedJvm: false,
    });

    expect(report).toContain("Grubie Launcher ?");
    expect(report).toContain("RAM: ?");
    expect(report).toContain("Storage: ?");
    expect(report).toContain("Launcher: ?");
    expect(report).toContain("Downloads: auto\n");
    expect(report).toContain("Heap: 6144 MB\n");
  });
});
