import { compareLoaderVersions } from "./loaderCompat";

export const OPTIFINE_HOST = "optifine.net";
export const OPTIFINE_SITE = `https://${OPTIFINE_HOST}`;
export const OPTIFINE_DOWNLOADS_URL = `${OPTIFINE_SITE}/downloads`;

export const OPTIFINE_OLDEST = "1.7.2";
export const OPTIFINE_NEWEST = "1.16.5";

export const OPTIFINE_LOADERS = ["vanilla", "forge"] as const;

export interface OptiFineBuild {
  file: string;
  minecraft: string;
  edition: string;
  forge: string | null;
  date: string | null;
}

export interface OptiFineChoice {
  file: string;
  minecraft: string;
  edition: string;
}

export type OptiFineOffer = "optifine" | "sodium" | null;

export type OptiFineForgeFit = "ok" | "older" | "unsupported";

const FILE_PATTERN = /^OptiFine_(\d+\.\d+(?:\.\d+)?)_(HD_U_[A-Z]\d+)\.jar$/;
const VERSION_STRING = /OptiFine_(\d+\.\d+(?:\.\d+)?)_(HD_U_[A-Z]\d+(?:_pre\d+)?)/;
const RELEASE_ID = /^1\.(\d+)(?:\.(\d+))?$/;
const CALENDAR_ID = /^\d{2}\.\d+(?:\.\d+)?$/;
const LEGACY_FORGE_BUILD = /^\d+\.\d+\.\d+\.(\d+)/;

export function normalizeOptiFineMinecraft(version: string): string {
  return version.replace(/^(\d+\.\d+)\.0$/, "$1");
}

export function parseOptiFineFile(
  file: string,
): { minecraft: string; edition: string } | null {
  const match = FILE_PATTERN.exec(file);
  if (!match) return null;
  return {
    minecraft: normalizeOptiFineMinecraft(match[1]),
    edition: match[2],
  };
}

export function isOptiFineFileName(file: string): boolean {
  return FILE_PATTERN.test(file);
}

export function optifineLabel(edition: string): string {
  return edition.replace(/_/g, " ");
}

export function optifineAdPageUrl(file: string): string {
  return `${OPTIFINE_SITE}/adloadx?f=${encodeURIComponent(file)}`;
}

export function optifineLibraryVersion(choice: OptiFineChoice): string {
  return `${choice.minecraft}_${choice.edition}`;
}

function cell(row: string, name: string): string | null {
  const match = new RegExp(`class='${name}'>([^<]*)<`).exec(row);
  return match ? match[1].trim() : null;
}

function parseForgeCell(value: string | null): string | null {
  const text = value?.replace(/^Forge\s*/i, "").trim() ?? "";
  if (!text || /^n\/a$/i.test(text)) return null;
  return /^#\d+$|^\d+(?:\.\d+)+$/.test(text) ? text : null;
}

function parseDateCell(value: string | null): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value ?? "");
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

export function parseOptiFineDownloads(html: string): OptiFineBuild[] {
  const builds: OptiFineBuild[] = [];
  const seen = new Set<string>();
  const rows = html.matchAll(
    /<tr class='downloadLine downloadLine(Main|More)'>([\s\S]*?)<\/tr>/g,
  );

  for (const [, , row] of rows) {
    const link = /adloadx\?f=([^"'&\s]+)/.exec(row);
    if (!link) continue;

    const file = decodeURIComponent(link[1]);
    const parsed = parseOptiFineFile(file);
    if (!parsed || seen.has(file)) continue;
    seen.add(file);

    builds.push({
      file,
      minecraft: parsed.minecraft,
      edition: parsed.edition,
      forge: parseForgeCell(cell(row, "colForge")),
      date: parseDateCell(cell(row, "colDate")),
    });
  }

  return builds;
}

function releaseParts(id: string): [number, number] | null {
  const match = RELEASE_ID.exec(id);
  return match ? [Number(match[1]), Number(match[2] ?? 0)] : null;
}

function compareRelease(left: [number, number], right: [number, number]) {
  return left[0] - right[0] || left[1] - right[1];
}

export function supportsOptiFine(minecraft: string): boolean {
  const parts = releaseParts(minecraft);
  if (!parts) return false;
  const oldest = releaseParts(OPTIFINE_OLDEST)!;
  const newest = releaseParts(OPTIFINE_NEWEST)!;
  return (
    compareRelease(parts, oldest) >= 0 && compareRelease(parts, newest) <= 0
  );
}

function isPastOptiFine(minecraft: string): boolean {
  if (CALENDAR_ID.test(minecraft)) return true;
  const parts = releaseParts(minecraft);
  return !!parts && compareRelease(parts, releaseParts(OPTIFINE_NEWEST)!) > 0;
}

export function optifineOffer(minecraft: string, loader: string): OptiFineOffer {
  if (!(OPTIFINE_LOADERS as readonly string[]).includes(loader)) return null;
  if (supportsOptiFine(minecraft)) return "optifine";
  if (isPastOptiFine(minecraft)) return "sodium";
  return null;
}

export function forgeFit(
  build: Pick<OptiFineBuild, "forge">,
  forgeVersion: string | undefined,
): OptiFineForgeFit {
  if (!build.forge) return "unsupported";
  if (!forgeVersion) return "ok";

  if (build.forge.startsWith("#")) {
    const installed = LEGACY_FORGE_BUILD.exec(forgeVersion);
    if (!installed) return "ok";
    return Number(installed[1]) >= Number(build.forge.slice(1))
      ? "ok"
      : "older";
  }

  return compareLoaderVersions(forgeVersion, build.forge) >= 0 ? "ok" : "older";
}

export function optifineBuildsFor(
  builds: readonly OptiFineBuild[],
  minecraft: string,
  loader: string,
): OptiFineBuild[] {
  return builds.filter(
    (build) =>
      build.minecraft === minecraft && (loader !== "forge" || !!build.forge),
  );
}

export function pickOptiFineBuild(
  builds: readonly OptiFineBuild[],
  loader: string,
  forgeVersion?: string,
): OptiFineBuild | undefined {
  if (loader !== "forge") return builds[0];
  return (
    builds.find((build) => forgeFit(build, forgeVersion) === "ok") ?? builds[0]
  );
}

export function readOptiFineVersion(
  bytes: Uint8Array,
): { minecraft: string; raw: string; edition: string } | null {
  let text = "";
  for (let index = 0; index < bytes.length; index++) {
    text += String.fromCharCode(bytes[index]);
  }
  const match = VERSION_STRING.exec(text);
  if (!match) return null;
  return {
    minecraft: normalizeOptiFineMinecraft(match[1]),
    raw: match[1],
    edition: match[2],
  };
}

export function toOptiFineChoice(
  build: Pick<OptiFineBuild, "file" | "minecraft" | "edition">,
): OptiFineChoice {
  return {
    file: build.file,
    minecraft: build.minecraft,
    edition: build.edition,
  };
}

export function isOptiFineChoice(value: unknown): value is OptiFineChoice {
  if (!value || typeof value !== "object") return false;
  const choice = value as Partial<OptiFineChoice>;
  if (typeof choice.file !== "string") return false;
  const parsed = parseOptiFineFile(choice.file);
  return (
    !!parsed &&
    parsed.minecraft === choice.minecraft &&
    parsed.edition === choice.edition
  );
}
