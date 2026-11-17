import { normalizeId } from "@renderer/features/configs/modGroups";
import type { LocalModDependencyIndex } from "@/types/ModManager";

export type CrashFix =
  | { kind: "disableMod"; title: string }
  | { kind: "memory"; fromMb: number; toMb: number }
  | { kind: "integrity" }
  | { kind: "openGl" };

export type CrashFixIdentity = { title: string; ids: string[] };

export type DuplicatePlacement = {
  id: string;
  standalone: string[];
  nestedIn: string[];
};

export type CrashFixInput = {
  ruleId: string | null;
  culprits: string[];
  identities: CrashFixIdentity[];
  memoryMb: number;
  totalMemoryMb: number;
  canSwitchToOpenGl?: boolean;
  duplicates?: DuplicatePlacement[];
  fileTitles?: Record<string, string>;
};

const DISABLE_RULES = new Set([
  "fabric_missing_dep",
  "forge_missing_dep",
  "mixin_error",
  "mod_resolution",
]);

export const VULKAN_RULE_ID = "vulkan_startup";
export const DUPLICATE_RULE_ID = "duplicate_mods";

const MEMORY_STEP_MB = 2048;
const OS_RESERVE_MB = 2048;
const MAX_DISABLE_FIXES = 2;

export function matchCulprits(
  culprits: string[],
  identities: CrashFixIdentity[],
): string[] {
  const titles: string[] = [];

  for (const culprit of culprits) {
    const id = normalizeId(
      /\.jar$/i.test(culprit)
        ? culprit.replace(/\.jar$/i, "").replace(/[-_+](mc)?\d[\w.+-]*$/i, "")
        : culprit,
    );
    if (id === "") continue;

    const match = identities.find((identity) => identity.ids.includes(id));
    if (match && !titles.includes(match.title)) titles.push(match.title);
  }

  return titles;
}

export function locateDuplicates(
  culprits: string[],
  index: LocalModDependencyIndex,
): DuplicatePlacement[] {
  const placements: DuplicatePlacement[] = [];
  const files = Object.keys(index).sort();

  for (const culprit of culprits) {
    const id = culprit.trim().toLowerCase();
    if (!id || placements.some((entry) => entry.id === id)) continue;

    const standalone: string[] = [];
    const nestedIn: string[] = [];
    for (const file of files) {
      const info = index[file];
      const embedded = (info.embedded ?? []).map((item) => item.toLowerCase());
      const provides = info.provides.map((item) => item.toLowerCase());
      if (embedded.includes(id)) nestedIn.push(file);
      else if (provides.includes(id)) standalone.push(file);
    }

    if (standalone.length + nestedIn.length > 0) {
      placements.push({ id, standalone, nestedIn });
    }
  }

  return placements;
}

function duplicateFixes(
  duplicates: DuplicatePlacement[],
  fileTitles: Record<string, string>,
): CrashFix[] {
  const titles: string[] = [];

  for (const placement of duplicates) {
    const candidates =
      placement.nestedIn.length > 0
        ? placement.standalone
        : placement.standalone.length > 1
          ? placement.standalone
          : [];

    const owners = candidates.map((file) => fileTitles[file]);
    const distinct = new Set(owners.filter(Boolean));
    if (owners.some((title) => !title) || distinct.size !== owners.length) {
      continue;
    }

    for (const title of owners) {
      if (!titles.includes(title)) titles.push(title);
    }
  }

  return titles
    .slice(0, MAX_DISABLE_FIXES)
    .map((title) => ({ kind: "disableMod", title }));
}

export function planCrashFixes(input: CrashFixInput): CrashFix[] {
  const fixes: CrashFix[] = [];

  if (input.ruleId === VULKAN_RULE_ID && input.canSwitchToOpenGl) {
    fixes.push({ kind: "openGl" });
  }

  if (input.ruleId === "out_of_memory" && input.totalMemoryMb > 0) {
    const ceiling =
      Math.floor((input.totalMemoryMb - OS_RESERVE_MB) / 512) * 512;
    const next = Math.min(input.memoryMb + MEMORY_STEP_MB, ceiling);
    if (next > input.memoryMb) {
      fixes.push({ kind: "memory", fromMb: input.memoryMb, toMb: next });
    }
  }

  if (input.ruleId === "corrupted_files") fixes.push({ kind: "integrity" });

  if (input.ruleId === DUPLICATE_RULE_ID) {
    fixes.push(
      ...duplicateFixes(input.duplicates ?? [], input.fileTitles ?? {}),
    );
  }

  if (input.ruleId === null || DISABLE_RULES.has(input.ruleId)) {
    for (const title of matchCulprits(input.culprits, input.identities).slice(
      0,
      MAX_DISABLE_FIXES,
    )) {
      fixes.push({ kind: "disableMod", title });
    }
  }

  return fixes;
}
