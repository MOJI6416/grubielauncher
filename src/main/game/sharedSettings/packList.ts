import {
  isManagedPackFile,
  packEntryName,
} from "../modTranslations/optionsTxt";
import { langFormatFor } from "../modTranslations/langFiles";
import {
  getOption,
  parseOptionsText,
  serializeOptionsDoc,
  setOption,
} from "./optionsText";

function usesFilePrefix(mcVersion: string): boolean {
  return langFormatFor(mcVersion) === "json";
}

function parseList(value: string | undefined): string[] | null {
  if (value === undefined || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value.trim());
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function fileOf(entry: string, mcVersion: string): string | null {
  const name = usesFilePrefix(mcVersion)
    ? entry.startsWith("file/")
      ? entry.slice(5)
      : null
    : entry;
  if (!name || isManagedPackFile(name)) return null;
  return name;
}

export function enabledPlayerPacks(
  text: string | null,
  mcVersion: string,
): string[] | null {
  const list = parseList(getOption(parseOptionsText(text), "resourcePacks"));
  if (!list) return null;
  return list
    .map((entry) => fileOf(entry, mcVersion))
    .filter((name): name is string => name !== null);
}

export function applyPackList(
  text: string | null,
  mcVersion: string,
  shared: string[],
  known: ReadonlySet<string>,
): { text: string; changed: boolean } {
  const source = text ?? "";
  const doc = parseOptionsText(text);
  const packsValue = getOption(doc, "resourcePacks");
  const list = parseList(packsValue);
  const incompatible = parseList(getOption(doc, "incompatibleResourcePacks"));
  if (!list || !incompatible) return { text: source, changed: false };

  const isKnown = (entry: string) => {
    const name = fileOf(entry, mcVersion);
    return name !== null && known.has(name);
  };

  const firstKnown = list.findIndex(isKnown);
  const kept = list.filter((entry) => !isKnown(entry));
  const at =
    firstKnown < 0
      ? kept.length
      : list.slice(0, firstKnown).filter((entry) => !isKnown(entry)).length;
  const ours = shared.map((name) => packEntryName(name, mcVersion));
  const next = [...kept.slice(0, at), ...ours, ...kept.slice(at)];
  if (
    usesFilePrefix(mcVersion) &&
    packsValue === undefined &&
    ours.length > 0 &&
    !next.includes("vanilla")
  ) {
    next.unshift("vanilla");
  }

  const sharedSet = new Set(shared);
  const nextIncompatible = incompatible.filter((entry) => {
    const name = fileOf(entry, mcVersion);
    return name === null || !sharedSet.has(name);
  });

  let changed = false;
  if (
    JSON.stringify(next) !== JSON.stringify(list) &&
    (packsValue !== undefined || ours.length)
  ) {
    changed = setOption(doc, "resourcePacks", JSON.stringify(next)) || changed;
  }
  if (JSON.stringify(nextIncompatible) !== JSON.stringify(incompatible)) {
    changed =
      setOption(
        doc,
        "incompatibleResourcePacks",
        JSON.stringify(nextIncompatible),
      ) || changed;
  }

  return { text: changed ? serializeOptionsDoc(doc) : source, changed };
}

export interface PackState {
  profile: string[];
  local: string[];
}

export function capturePacks(
  current: string[],
  baseline: string[] | null,
  applied: string[],
  state: PackState,
  mode: "session" | "adopt" | "first",
  shareable: (name: string) => boolean,
): PackState {
  if (mode === "adopt") {
    const add = current.filter(
      (name) => shareable(name) && !state.profile.includes(name),
    );
    return { profile: [...state.profile, ...add], local: [] };
  }
  if (mode === "first" || !baseline) {
    return {
      profile: state.profile,
      local: current.filter((name) => !state.profile.includes(name)),
    };
  }
  if (JSON.stringify(current) === JSON.stringify(baseline)) return state;

  const local = new Set(state.local.filter((name) => current.includes(name)));
  const candidates = current.filter((name) => !local.has(name));
  for (const name of candidates) {
    if (!shareable(name) && !state.profile.includes(name)) local.add(name);
  }
  const appliedSet = new Set(applied);
  const elsewhere = state.profile.filter(
    (name) => !appliedSet.has(name) && !current.includes(name),
  );
  return {
    profile: [...elsewhere, ...current.filter((name) => !local.has(name))],
    local: [...local],
  };
}

export function restorePackList(
  text: string | null,
  backup: string | null,
  mcVersion: string,
  applied: readonly string[],
  exists: (name: string) => boolean,
): { text: string; changed: boolean } {
  const source = text ?? "";
  const own = enabledPlayerPacks(backup, mcVersion) ?? [];
  const current = enabledPlayerPacks(text, mcVersion);
  if (!current) return { text: source, changed: false };

  const ownSet = new Set(own);
  const keep = current.filter(
    (name) => ownSet.has(name) || !applied.includes(name),
  );
  const missing = own.filter((name) => !keep.includes(name) && exists(name));
  const next = [...keep, ...missing];
  if (JSON.stringify(next) === JSON.stringify(current)) {
    return { text: source, changed: false };
  }
  return applyPackList(text, mcVersion, next, new Set([...current, ...own]));
}
