import { OPTIMIZED_GC_FLAGS } from "@/shared/jvmDefaults";

export interface JvmFlagNote {
  id: string;
  flag: string;
}

export interface JvmFlagGroup {
  id: string;
  flags: JvmFlagNote[];
}

const GROUP_OF: Record<string, string> = {
  AlwaysPreTouch: "memory",
  UseG1GC: "collector",
  MaxGCPauseMillis: "collector",
  ParallelRefProcEnabled: "collector",
  DisableExplicitGC: "collector",
  G1NewSizePercent: "young",
  G1MaxNewSizePercent: "young",
  SurvivorRatio: "young",
  MaxTenuringThreshold: "young",
  InitiatingHeapOccupancyPercent: "old",
  G1MixedGCCountTarget: "old",
  G1MixedGCLiveThresholdPercent: "old",
  G1HeapWastePercent: "old",
  G1ReservePercent: "old",
  G1HeapRegionSize: "old",
  G1RSetUpdatingPauseTimePercent: "old",
  UnlockExperimentalVMOptions: "service",
  PerfDisableSharedMem: "service",
};

const GROUP_ORDER = ["memory", "collector", "young", "old", "service"];

export function jvmFlagId(flag: string): string {
  return flag.replace(/^-XX:[+-]?/, "").replace(/=.*$/, "");
}

export function jvmFlagGroups(
  flags: readonly string[] = OPTIMIZED_GC_FLAGS,
): JvmFlagGroup[] {
  const groups = new Map<string, JvmFlagNote[]>(
    GROUP_ORDER.map((id) => [id, []]),
  );
  groups.get("memory")?.push({ id: "heap", flag: "-Xms = -Xmx" });

  for (const flag of flags) {
    const id = jvmFlagId(flag);
    groups.get(GROUP_OF[id] ?? "service")?.push({ id, flag });
  }

  return [...groups.entries()]
    .filter(([, notes]) => notes.length > 0)
    .map(([id, notes]) => ({ id, flags: notes }));
}

export function undescribedJvmFlags(
  flags: readonly string[] = OPTIMIZED_GC_FLAGS,
): string[] {
  return flags.filter((flag) => !(jvmFlagId(flag) in GROUP_OF));
}
