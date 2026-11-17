export const OPTIMIZED_GC_FLAGS = [
  "-XX:+UseG1GC",
  "-XX:+ParallelRefProcEnabled",
  "-XX:MaxGCPauseMillis=200",
  "-XX:+UnlockExperimentalVMOptions",
  "-XX:+DisableExplicitGC",
  "-XX:+AlwaysPreTouch",
  "-XX:G1NewSizePercent=30",
  "-XX:G1MaxNewSizePercent=40",
  "-XX:G1HeapRegionSize=8M",
  "-XX:G1ReservePercent=20",
  "-XX:G1HeapWastePercent=5",
  "-XX:G1MixedGCCountTarget=4",
  "-XX:InitiatingHeapOccupancyPercent=15",
  "-XX:G1MixedGCLiveThresholdPercent=90",
  "-XX:G1RSetUpdatingPauseTimePercent=5",
  "-XX:SurvivorRatio=32",
  "-XX:+PerfDisableSharedMem",
  "-XX:MaxTenuringThreshold=1",
];

export function buildMemoryArguments(
  xmx: number,
  optimizedJvm: boolean,
): string[] {
  if (optimizedJvm) {
    return [`-Xms${xmx}M`, `-Xmx${xmx}M`, ...OPTIMIZED_GC_FLAGS];
  }

  return ["-Xms1G", `-Xmx${xmx}M`];
}

export const COMPACT_OBJECT_HEADERS_FLAG = "-XX:+UseCompactObjectHeaders";
export const COMPACT_OBJECT_HEADERS_MIN_JAVA = 25;
export const LWJGL_UNSAFE_AGENT_MIN_JAVA = 25;
export const LWJGL_UNSAFE_AGENT_VERSIONS = ["3.4.0", "3.4.1"] as const;

const NON_HOTSPOT_VENDOR = /openj9|semeru|\bibm\b/i;
const COMPACT_HEADERS_SETTING = /^-XX:[+-]UseCompactObjectHeaders$/;

export function isHotSpotVendor(vendor: string | null | undefined): boolean {
  return !NON_HOTSPOT_VENDOR.test(vendor ?? "");
}

export function runtimeJvmFlags(input: {
  javaMajor: number | null | undefined;
  javaVendor: string | null | undefined;
  customJvm?: readonly string[];
}): string[] {
  const major = input.javaMajor ?? 0;
  if (major < COMPACT_OBJECT_HEADERS_MIN_JAVA) return [];
  if (!isHotSpotVendor(input.javaVendor)) return [];
  if (input.customJvm?.some((arg) => COMPACT_HEADERS_SETTING.test(arg))) {
    return [];
  }
  return [COMPACT_OBJECT_HEADERS_FLAG];
}

export function lwjglVersionOf(
  libraries: readonly { name?: string }[] | undefined,
): string | null {
  for (const library of libraries ?? []) {
    const parts = (library.name ?? "").split(":");
    if (parts[0] === "org.lwjgl" && parts[1] === "lwjgl" && parts[2]) {
      return parts[2];
    }
  }
  return null;
}

export function needsLwjglUnsafeAgent(input: {
  javaMajor: number | null | undefined;
  lwjglVersion: string | null | undefined;
}): boolean {
  return (
    (input.javaMajor ?? 0) >= LWJGL_UNSAFE_AGENT_MIN_JAVA &&
    LWJGL_UNSAFE_AGENT_VERSIONS.includes(
      input.lwjglVersion as (typeof LWJGL_UNSAFE_AGENT_VERSIONS)[number],
    )
  );
}
