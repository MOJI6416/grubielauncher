import { ILocalProject, Provider } from "@/types/ModManager";

const LOADER = "(?:neo\\s?forge|forge|fabric|quilt)";
const GAME_VERSION = "(?:mc\\s?)?1\\.\\d+(?:\\.(?:\\d+|x))?\\+?";
const TAG_WORD = `(?:${LOADER}|${GAME_VERSION}|all|and|&|\\+|/|,|\\s|-|\\|)`;

const TAG_GROUP = new RegExp(
  `\\s*[\\[(]\\s*(?=[^\\])]*?(?:${LOADER}|\\d))${TAG_WORD}+\\s*[\\])]\\s*`,
  "gi",
);
const LOADER_LIST_SUFFIX = new RegExp(
  `\\s*(?:[-–—|:]\\s*)?${LOADER}(?:\\s*[/&,+|]\\s*${LOADER})+\\s*$`,
  "i",
);
const LOADER_SUFFIX = new RegExp(`\\s*[-–—|:]\\s*${LOADER}\\s*$`, "i");
const EDGE_SEPARATORS = /^[\s\-–—|:]+|[\s\-–—|:]+$/g;

export function displayTitle(title: string): string {
  const original = typeof title === "string" ? title : "";

  const cleaned = original
    .replace(TAG_GROUP, " ")
    .replace(LOADER_LIST_SUFFIX, "")
    .replace(LOADER_SUFFIX, "")
    .replace(/\s{2,}/g, " ")
    .replace(EDGE_SEPARATORS, "");

  return cleaned || original.trim();
}

const VERSION_TOKEN = /\d+(?:\.\d+)+/g;

export function versionToken(
  raw: string | undefined,
  gameVersion?: string,
): string | null {
  if (!raw) return null;

  const base = raw.replace(/\.(jar|zip)(\.disabled)?$/i, "");
  const family = gameVersion?.split(".").slice(0, 2).join(".");
  const tokens = (base.match(VERSION_TOKEN) ?? []).filter(
    (token) => token !== gameVersion && token !== family,
  );

  return tokens.length > 0 ? tokens[tokens.length - 1] : null;
}

export function installedVersionLabel(
  mod: Pick<ILocalProject, "provider" | "version">,
  gameVersion?: string,
): string | null {
  const isLocal =
    mod.provider === Provider.LOCAL || mod.provider === Provider.OTHER;

  return (
    versionToken(mod.version?.files[0]?.filename, gameVersion) ??
    (isLocal ? versionToken(mod.version?.id, gameVersion) : null)
  );
}
