import { normalizeId } from "@renderer/features/configs/modGroups";

export type CrashFix =
  | { kind: "disableMod"; title: string }
  | { kind: "memory"; fromMb: number; toMb: number }
  | { kind: "integrity" };

export type CrashFixIdentity = { title: string; ids: string[] };

export type CrashFixInput = {
  ruleId: string | null;
  culprits: string[];
  identities: CrashFixIdentity[];
  memoryMb: number;
  totalMemoryMb: number;
};

const DISABLE_RULES = new Set([
  "fabric_missing_dep",
  "forge_missing_dep",
  "mixin_error",
  "mod_resolution",
]);

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

export function planCrashFixes(input: CrashFixInput): CrashFix[] {
  const fixes: CrashFix[] = [];

  if (input.ruleId === "out_of_memory" && input.totalMemoryMb > 0) {
    const ceiling =
      Math.floor((input.totalMemoryMb - OS_RESERVE_MB) / 512) * 512;
    const next = Math.min(input.memoryMb + MEMORY_STEP_MB, ceiling);
    if (next > input.memoryMb) {
      fixes.push({ kind: "memory", fromMb: input.memoryMb, toMb: next });
    }
  }

  if (input.ruleId === "corrupted_files") fixes.push({ kind: "integrity" });

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
