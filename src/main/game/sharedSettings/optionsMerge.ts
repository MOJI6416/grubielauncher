import type { Loader } from "@/types/Loader";
import type { SharedGroup } from "@/types/SharedSettings";
import {
  decodeOption,
  defaultValueOf,
  definitionOf,
  encodeOption,
  managedOption,
  nameFor,
  optionsEra,
  sameOptionValue,
} from "./catalog";
import {
  getOption,
  optionEntries,
  parseOptionsText,
  prependOption,
  serializeOptionsDoc,
  setOption,
} from "./optionsText";

export interface ProfileOption {
  value: string;
  at: number;
  mc: string;
}

export type ProfileOptions = Record<string, ProfileOption>;

export interface OptionsTarget {
  mcVersion: string;
  loader: Loader;
  groups: ReadonlySet<SharedGroup>;
  dataVersion: number | null;
}

export interface OptionsApplyResult {
  text: string;
  changed: boolean;
  baseline: Record<string, string>;
}

export type CaptureMode = "session" | "adopt";

function managedIn(
  name: string,
  groups: ReadonlySet<SharedGroup>,
): ReturnType<typeof managedOption> {
  const managed = managedOption(name);
  return managed && groups.has(managed.group) ? managed : null;
}

export function optionsBaseline(
  text: string | null,
  groups: ReadonlySet<SharedGroup>,
): Record<string, string> {
  const baseline: Record<string, string> = {};
  for (const { key, value } of optionEntries(parseOptionsText(text))) {
    const managed = managedIn(key, groups);
    if (managed) baseline[managed.canonical] = value;
  }
  return baseline;
}

export function applySharedOptions(
  text: string | null,
  profile: ProfileOptions,
  target: OptionsTarget,
): OptionsApplyResult {
  const source = text ?? "";
  const era = optionsEra(target.mcVersion);
  if (!era) {
    return {
      text: source,
      changed: false,
      baseline: optionsBaseline(text, target.groups),
    };
  }

  const doc = parseOptionsText(text);
  const fresh = getOption(doc, "version") === undefined;
  const needsVersion = era !== "legacy" && fresh;
  const keybindsAllowed = !needsVersion || target.dataVersion !== null;

  let changed = false;
  let wroteKeybind = false;
  for (const [canonical, entry] of Object.entries(profile)) {
    const def = definitionOf(canonical);
    if (!def || !target.groups.has(def.group)) continue;
    if (def.kind === "keybind" && !keybindsAllowed) continue;

    const name = nameFor(canonical, target.mcVersion);
    const current = getOption(doc, name);
    if (current === undefined && def.kind !== "keybind" && !fresh) continue;

    const raw = encodeOption(def, canonical, entry.value, target, current);
    if (raw === null) continue;
    if (current !== undefined) {
      const currentValue = decodeOption(def, name, current);
      if (
        currentValue !== null &&
        sameOptionValue(def, currentValue, entry.value)
      ) {
        continue;
      }
    }

    if (setOption(doc, name, raw)) {
      changed = true;
      if (def.kind === "keybind") wroteKeybind = true;
    }
  }

  if (wroteKeybind && needsVersion && target.dataVersion !== null) {
    prependOption(doc, "version", String(target.dataVersion));
  }

  const result = changed ? serializeOptionsDoc(doc) : source;
  return {
    text: result,
    changed,
    baseline: optionsBaseline(result, target.groups),
  };
}

export function captureSharedOptions(
  text: string | null,
  baseline: Record<string, string> | null,
  profile: ProfileOptions,
  target: OptionsTarget,
  mode: CaptureMode,
  now: number,
): ProfileOptions {
  const updates: ProfileOptions = {};
  if (!optionsEra(target.mcVersion) || text === null) return updates;

  for (const { key, value } of optionEntries(parseOptionsText(text))) {
    const managed = managedIn(key, target.groups);
    if (!managed) continue;
    const decoded = decodeOption(managed.def, key, value);
    if (decoded === null) continue;

    const known = profile[managed.canonical];
    const standard = defaultValueOf(managed.canonical, target.mcVersion);
    const isStandard =
      standard !== null && sameOptionValue(managed.def, standard, decoded);
    const fresh: ProfileOption = {
      value: decoded,
      at: now,
      mc: target.mcVersion,
    };

    if (mode === "adopt") {
      if (!known && !isStandard) updates[managed.canonical] = fresh;
      continue;
    }

    const before = baseline?.[managed.canonical];
    if (before === undefined) {
      if (!known && standard !== null && !isStandard) {
        updates[managed.canonical] = fresh;
      }
      continue;
    }

    const beforeValue = decodeOption(managed.def, key, before);
    if (
      beforeValue !== null &&
      sameOptionValue(managed.def, beforeValue, decoded)
    ) {
      continue;
    }
    if (known && sameOptionValue(managed.def, known.value, decoded)) continue;
    updates[managed.canonical] = fresh;
  }

  return updates;
}

export function restoreOptions(
  text: string | null,
  backup: string | null,
  groups: ReadonlySet<SharedGroup>,
): { text: string; changed: boolean } {
  const source = text ?? "";
  if (backup === null || groups.size === 0)
    return { text: source, changed: false };

  const doc = parseOptionsText(text);
  let changed = false;
  for (const { key, value } of optionEntries(parseOptionsText(backup))) {
    if (!managedIn(key, groups)) continue;
    if (setOption(doc, key, value)) changed = true;
  }

  return { text: changed ? serializeOptionsDoc(doc) : source, changed };
}
