import type { IModpackRefusal, ModpackRefusalCode } from "@/types/Backend";

const CODES: Record<string, ModpackRefusalCode> = {
  modpack_infected: "infected",
  modpack_files_missing: "filesMissing",
  modpack_scan_too_large: "tooLarge",
  modpack_scan_unavailable: "scanUnavailable",
};

const MAX_FILES = 50;
const MAX_TEXT = 200;

function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_TEXT) : "";
}

export function modpackRefusalOf(error: unknown): IModpackRefusal | null {
  const response = (error as { response?: { status?: number; data?: unknown } })
    ?.response;
  if (response?.status !== 422 && response?.status !== 503) return null;

  const data = response.data as
    | { error?: unknown; files?: unknown }
    | null
    | undefined;
  const code = typeof data?.error === "string" ? CODES[data.error] : undefined;
  if (!code) return null;

  const files = (Array.isArray(data?.files) ? data.files : [])
    .slice(0, MAX_FILES)
    .map((entry: { file?: unknown; threats?: unknown }) => {
      const threats = Array.isArray(entry?.threats)
        ? entry.threats.map(text).filter(Boolean).slice(0, 10)
        : [];
      return {
        file: text(entry?.file),
        ...(threats.length > 0 ? { threats } : {}),
      };
    })
    .filter((entry) => entry.file !== "");

  return { code, files };
}
