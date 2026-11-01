import { ProjectType, Provider } from "@/types/ModManager";

export interface ProjectLink {
  provider: Provider.MODRINTH | Provider.CURSEFORGE;
  ref: string;
  projectType?: ProjectType;
}

const MODRINTH_KINDS: Record<string, ProjectType | null> = {
  mod: ProjectType.MOD,
  plugin: ProjectType.PLUGIN,
  datapack: ProjectType.DATAPACK,
  resourcepack: ProjectType.RESOURCEPACK,
  shader: ProjectType.SHADER,
  modpack: ProjectType.MODPACK,
  project: null,
};

const CURSEFORGE_CLASSES: Record<string, ProjectType> = {
  "mc-mods": ProjectType.MOD,
  "texture-packs": ProjectType.RESOURCEPACK,
  shaders: ProjectType.SHADER,
  "data-packs": ProjectType.DATAPACK,
  modpacks: ProjectType.MODPACK,
  worlds: ProjectType.WORLD,
  "bukkit-plugins": ProjectType.PLUGIN,
};

const CURSEFORGE_HOSTS = new Set([
  "curseforge.com",
  "legacy.curseforge.com",
  "beta.curseforge.com",
]);

const MODRINTH_REF = /^[\w!@$().+,'-]{1,64}$/;
const CURSEFORGE_SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/i;
const NUMERIC_ID = /^\d{1,10}$/;

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function unwrapLinkout(url: URL): URL | null {
  if (!hostOf(url).endsWith("curseforge.com")) return url;
  if (!url.pathname.toLowerCase().startsWith("/linkout")) return url;

  let target = url.searchParams.get("remoteUrl") ?? "";
  for (let step = 0; step < 3 && /%[0-9a-f]{2}/i.test(target); step++) {
    try {
      target = decodeURIComponent(target);
    } catch {
      return null;
    }
  }

  try {
    return new URL(target);
  } catch {
    return null;
  }
}

function pathParts(url: URL): string[] {
  return url.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
}

export function parseProjectLink(href: string): ProjectLink | null {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }

  const url = unwrapLinkout(parsed);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
    return null;
  }

  const host = hostOf(url);
  const parts = pathParts(url);

  if (host === "modrinth.com") {
    const [kind, ref] = parts;
    if (!kind || !ref || !(kind.toLowerCase() in MODRINTH_KINDS)) return null;
    if (!MODRINTH_REF.test(ref)) return null;
    const projectType = MODRINTH_KINDS[kind.toLowerCase()];
    return projectType
      ? { provider: Provider.MODRINTH, ref, projectType }
      : { provider: Provider.MODRINTH, ref };
  }

  if (CURSEFORGE_HOSTS.has(host)) {
    const [game, kind, ref] = parts;
    if (game?.toLowerCase() === "minecraft" && kind && ref) {
      const projectType = CURSEFORGE_CLASSES[kind.toLowerCase()];
      if (!projectType || !CURSEFORGE_SLUG.test(ref)) return null;
      return { provider: Provider.CURSEFORGE, ref, projectType };
    }
    if (game?.toLowerCase() === "projects" && kind && NUMERIC_ID.test(kind)) {
      return { provider: Provider.CURSEFORGE, ref: kind };
    }
    return null;
  }

  if (host === "minecraft.curseforge.com") {
    const [kind, ref] = parts;
    if (kind?.toLowerCase() !== "projects" || !ref) return null;
    if (NUMERIC_ID.test(ref)) return { provider: Provider.CURSEFORGE, ref };
    if (!CURSEFORGE_SLUG.test(ref)) return null;
    return { provider: Provider.CURSEFORGE, ref, projectType: ProjectType.MOD };
  }

  return null;
}
