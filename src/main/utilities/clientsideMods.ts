import axios from "axios";
import { BACKEND_URL } from "@/shared/config";

// Client-only mod detection and the server-copy directory list both come from
// ServerPackCreator's curated data, served (and periodically refreshed from the
// SPC repo) by our backend at `${BACKEND_URL}/server/clientside-mods.json`. The
// data is NOT stored locally; the backend is the single source of truth.
//
// SPC clientside/whitelist entries are filename fragments matched against a
// mod's file name with the START filter (the SPC default): the file name must
// start with the fragment. The whitelist protects mods that must stay on the
// server even if they match the clientside list. `mustInclude` are the
// top-level directories a server needs (config, datapacks, structures, …).

const DEFAULT_SYNC_DIRS = ["config", "defaultconfigs", "kubejs", "scripts"];

// Never mirror these as extra dirs: mods are synced separately (side-aware) and
// resource/shader packs are client-only.
const EXCLUDED_SYNC_DIRS = new Set(["mods", "resourcepacks", "shaderpacks"]);

let cache: {
  clientside: string[];
  whitelist: string[];
  mustInclude: string[];
  fetchedAt: number;
} | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function stripLeadingTags(name: string): string {
  return name.replace(/^(?:\[[^\]]*\]\s*|【[^】]*】\s*)+/, "");
}

export function isClientsideFilename(
  filename: string,
  clientside: string[],
  whitelist: string[],
): boolean {
  const lower = stripLeadingTags(filename.trim()).toLowerCase();
  if (whitelist.some((fragment) => lower.startsWith(fragment))) return false;
  return clientside.some((fragment) => lower.startsWith(fragment));
}

function normalizeFragments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry) => entry.length >= 3);
}

function normalizeDirs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry).trim())
    .filter(
      (entry) =>
        entry.length > 0 &&
        !entry.includes("/") &&
        !entry.includes("\\") &&
        !entry.includes("..") &&
        !EXCLUDED_SYNC_DIRS.has(entry.toLowerCase()),
    );
}

async function fetchLists(): Promise<{
  clientside: string[];
  whitelist: string[];
  mustInclude: string[];
}> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return {
      clientside: cache.clientside,
      whitelist: cache.whitelist,
      mustInclude: cache.mustInclude,
    };
  }

  try {
    const response = await axios.get<{
      mods?: unknown;
      whitelist?: unknown;
      mustInclude?: unknown;
    }>(`${BACKEND_URL}/server/clientside-mods.json`, { timeout: 15000 });

    const clientside = normalizeFragments(response.data?.mods);
    const whitelist = normalizeFragments(response.data?.whitelist);
    const mustInclude = normalizeDirs(response.data?.mustInclude);

    cache = { clientside, whitelist, mustInclude, fetchedAt: Date.now() };
    return { clientside, whitelist, mustInclude };
  } catch {
    return cache
      ? {
          clientside: cache.clientside,
          whitelist: cache.whitelist,
          mustInclude: cache.mustInclude,
        }
      : { clientside: [], whitelist: [], mustInclude: [] };
  }
}

export async function getClientsideModMatcher(): Promise<
  (filename: string) => boolean
> {
  const { clientside, whitelist } = await fetchLists();
  return (filename: string) =>
    isClientsideFilename(filename, clientside, whitelist);
}

export async function getServerSyncDirs(): Promise<string[]> {
  const { mustInclude } = await fetchLists();
  return mustInclude.length > 0 ? mustInclude : DEFAULT_SYNC_DIRS;
}
