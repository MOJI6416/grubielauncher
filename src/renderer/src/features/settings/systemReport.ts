import type { MirrorMode } from "@/shared/mirrorMode";

export interface SystemReportInput {
  appVersion: string;
  platform: string;
  totalMemoryMb: number;
  xmx: number;
  optimizedJvm: boolean;
  downloadSource: string;
  mirrorMode: MirrorMode | null;
  language: string;
  instanceCount: number;
  launcherPath: string;
  minecraftPath: string;
  javaPath: string;
  storageTotal: string;
}

const PLATFORM_NAMES: Record<string, string> = {
  win32: "Windows",
  darwin: "macOS",
  linux: "Linux",
};

export function platformName(platform: string): string {
  return PLATFORM_NAMES[platform] ?? platform;
}

export function buildSystemReport(input: SystemReportInput): string {
  const lines = [
    `Grubie Launcher ${input.appVersion || "?"}`,
    `OS: ${platformName(input.platform)}`,
    `RAM: ${input.totalMemoryMb ? `${input.totalMemoryMb} MB` : "?"}`,
    `Heap: ${input.xmx} MB${input.optimizedJvm ? " (preallocated)" : ""}`,
    `Downloads: ${input.downloadSource}${
      input.mirrorMode ? ` → ${input.mirrorMode}` : ""
    }`,
    `Language: ${input.language}`,
    `Instances: ${input.instanceCount}`,
    `Storage: ${input.storageTotal || "?"}`,
    `Launcher: ${input.launcherPath || "?"}`,
    `Minecraft: ${input.minecraftPath || "?"}`,
    `Java: ${input.javaPath || "?"}`,
  ];

  return lines.join("\n");
}
