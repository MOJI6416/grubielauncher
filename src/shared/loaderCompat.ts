import type { Loader } from "@/types/Loader";

export type ModdedLoader = Exclude<Loader, "vanilla">;

export type LoaderRequirementSyntax = "semver" | "maven";

export interface LoaderRequirement {
  file: string;
  modId: string | null;
  name: string | null;
  syntax: LoaderRequirementSyntax;
  ranges: string[];
}

export interface LoaderRequirementsScan {
  scanned: number;
  requirements: LoaderRequirement[];
}

export const LOADER_DEPENDENCY_IDS: Record<ModdedLoader, string> = {
  fabric: "fabricloader",
  quilt: "quilt_loader",
  forge: "forge",
  neoforge: "neoforge",
};

export const LOADER_VERSION_ID_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,127}$/;

export function isModdedLoader(loader: unknown): loader is ModdedLoader {
  return (
    typeof loader === "string" &&
    Object.prototype.hasOwnProperty.call(LOADER_DEPENDENCY_IDS, loader)
  );
}

const PRERELEASE_MARKER = /-(alpha|beta|pre|rc|snapshot)/i;

export function isStableLoaderVersion(id: string): boolean {
  return !PRERELEASE_MARKER.test(id);
}

type CoreToken = number | string;

interface ParsedVersion {
  core: CoreToken[];
  pre: string[];
}

function parseVersion(value: string): ParsedVersion | null {
  const trimmed = value.trim().replace(/\+.*$/, "");
  if (!trimmed) return null;

  const dash = trimmed.indexOf("-");
  const coreText = dash === -1 ? trimmed : trimmed.slice(0, dash);
  const preText = dash === -1 ? "" : trimmed.slice(dash + 1);

  if (!/^\d[0-9A-Za-z]*(\.[0-9A-Za-z]+)*$/.test(coreText)) return null;

  return {
    core: coreText
      .split(".")
      .map((token) => (/^\d+$/.test(token) ? Number(token) : token.toLowerCase())),
    pre: preText ? preText.split(/[.-]/).filter(Boolean) : [],
  };
}

function compareCore(left: CoreToken[], right: CoreToken[]): number {
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index++) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a === b) continue;

    if (typeof a === "number" && typeof b === "number") return a < b ? -1 : 1;
    if (typeof a === "number") return 1;
    if (typeof b === "number") return -1;
    return a < b ? -1 : 1;
  }

  return 0;
}

function comparePre(left: string[], right: string[]): number {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;

  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index++) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;

    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);

    if (aNumeric && bNumeric) {
      if (Number(a) !== Number(b)) return Number(a) < Number(b) ? -1 : 1;
      continue;
    }
    if (aNumeric) return -1;
    if (bNumeric) return 1;

    const order = a.toLowerCase().localeCompare(b.toLowerCase());
    if (order !== 0) return order < 0 ? -1 : 1;
  }

  return 0;
}

function compareParsed(left: ParsedVersion, right: ParsedVersion): number {
  return compareCore(left.core, right.core) || comparePre(left.pre, right.pre);
}

export function compareLoaderVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return Math.sign(left.localeCompare(right));

  return compareParsed(a, b);
}

const SEMVER_OPERATORS = [">=", "<=", ">", "<", "=", "~", "^"];
const SEMVER_VERSION = /^\d+(\.\d+)*(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

function parseSemverTerm(
  term: string,
): { operator: string; version: ParsedVersion } | null {
  let operator = "=";
  let rest = term;

  for (const candidate of SEMVER_OPERATORS) {
    if (!rest.startsWith(candidate)) continue;
    operator = candidate;
    rest = rest.slice(candidate.length);
    break;
  }

  rest = rest.trim();

  const wildcard = /^(\d+(?:\.\d+)?)\.[xX*]$/.exec(rest);
  if (wildcard) {
    if (operator !== "=") return null;
    operator = wildcard[1].includes(".") ? "~" : "^";
    rest = wildcard[1];
  }

  if (!SEMVER_VERSION.test(rest)) return null;

  const version = parseVersion(rest);
  return version ? { operator, version } : null;
}

function component(core: CoreToken[], index: number): number {
  const value = core[index];
  return typeof value === "number" ? value : 0;
}

function testSemverTerm(
  version: ParsedVersion,
  operator: string,
  bound: ParsedVersion,
): boolean {
  const order = compareParsed(version, bound);

  switch (operator) {
    case ">=":
      return order >= 0;
    case "<=":
      return order <= 0;
    case ">":
      return order > 0;
    case "<":
      return order < 0;
    case "~":
      return (
        order >= 0 &&
        component(version.core, 0) === component(bound.core, 0) &&
        component(version.core, 1) === component(bound.core, 1)
      );
    case "^":
      return order >= 0 && component(version.core, 0) === component(bound.core, 0);
    default:
      return order === 0;
  }
}

export function satisfiesSemverPredicate(
  version: string,
  predicate: string,
): boolean | null {
  const candidate = parseVersion(version);
  if (!candidate) return null;

  const terms = predicate
    .trim()
    .split(/\s+/)
    .filter((term) => term && term !== "*");
  if (!terms.length) return true;

  let unknown = false;

  for (const term of terms) {
    const parsed = parseSemverTerm(term);
    if (!parsed) {
      unknown = true;
      continue;
    }
    if (!testSemverTerm(candidate, parsed.operator, parsed.version)) return false;
  }

  return unknown ? null : true;
}

const MAVEN_RANGE =
  /([[(])\s*([^,[\]()]*?)\s*(?:(,)\s*([^,[\]()]*?)\s*)?([\])])/g;

function normalizeBound(raw: string | undefined, minecraftVersion?: string) {
  const bound = (raw ?? "").trim();
  if (minecraftVersion && bound.startsWith(`${minecraftVersion}-`)) {
    return bound.slice(minecraftVersion.length + 1);
  }
  return bound;
}

export function satisfiesMavenRange(
  version: string,
  spec: string,
  minecraftVersion?: string,
): boolean | null {
  const candidate = parseVersion(version);
  if (!candidate) return null;

  const trimmed = spec.trim();
  if (!trimmed || trimmed === "*") return true;
  if (!/[[(]/.test(trimmed)) return true;

  let matched = false;
  let parsedAny = false;
  let broken = false;

  for (const match of trimmed.matchAll(MAVEN_RANGE)) {
    const [, open, lowerRaw, comma, upperRaw, close] = match;
    const lower = normalizeBound(lowerRaw, minecraftVersion);
    const upper = comma ? normalizeBound(upperRaw, minecraftVersion) : lower;

    if (!comma && !lower) {
      broken = true;
      continue;
    }

    const lowerBound = lower ? parseVersion(lower) : null;
    const upperBound = upper ? parseVersion(upper) : null;

    if ((lower && !lowerBound) || (upper && !upperBound)) {
      broken = true;
      continue;
    }

    parsedAny = true;

    const aboveLower =
      !lowerBound ||
      (open === "["
        ? compareParsed(candidate, lowerBound) >= 0
        : compareParsed(candidate, lowerBound) > 0);
    const belowUpper =
      !upperBound ||
      (close === "]"
        ? compareParsed(candidate, upperBound) <= 0
        : compareParsed(candidate, upperBound) < 0);

    if (aboveLower && belowUpper) matched = true;
  }

  if (matched) return true;
  if (broken || !parsedAny) return null;
  return false;
}

export function isRequirementSatisfied(
  version: string,
  requirement: LoaderRequirement,
  minecraftVersion?: string,
): boolean {
  let known = false;

  for (const range of requirement.ranges) {
    const result =
      requirement.syntax === "maven"
        ? satisfiesMavenRange(version, range, minecraftVersion)
        : satisfiesSemverPredicate(version, range);

    if (result === true) return true;
    if (result === false) known = true;
  }

  return !known;
}

export function findBlockingRequirements(
  version: string,
  requirements: LoaderRequirement[],
  minecraftVersion?: string,
): LoaderRequirement[] {
  return requirements.filter(
    (requirement) =>
      !isRequirementSatisfied(version, requirement, minecraftVersion),
  );
}

export interface LoaderManifestLike {
  mainClass?: string;
  minecraftArguments?: string;
  arguments?: { game?: unknown[] };
  libraries?: { name?: string }[];
}

export function manifestMentionsLoaderVersion(
  manifest: LoaderManifestLike | null | undefined,
  id: string,
): boolean {
  const target = id.trim();
  if (!manifest || !target) return false;

  const inLibraries = (manifest.libraries ?? []).some((library) => {
    const version = String(library?.name ?? "").split(":")[2] ?? "";
    return (
      version === target ||
      version.endsWith(`-${target}`) ||
      version.includes(`-${target}-`)
    );
  });
  if (inLibraries) return true;

  const gameArguments = Array.isArray(manifest.arguments?.game)
    ? manifest.arguments.game
    : [];
  if (gameArguments.some((argument) => argument === target)) return true;

  return (manifest.minecraftArguments ?? "").split(/\s+/).includes(target);
}
