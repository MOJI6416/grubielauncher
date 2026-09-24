export interface LocalModMetadata {
  id: string;
  name: string;
  description: string;
  url: string;
  version: string | null;
  icon: string | null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickIcon(value: unknown): string | null {
  const direct = text(value);
  if (direct) return direct;

  const sizes = record(value);
  if (!sizes) return null;

  const candidates = Object.entries(sizes)
    .map(([size, iconPath]) => ({ size: Number(size), iconPath: text(iconPath) }))
    .filter((item) => item.iconPath)
    .sort((a, b) => (b.size || 0) - (a.size || 0));

  return candidates[0]?.iconPath ?? null;
}

function withFallbacks(
  meta: Partial<LocalModMetadata>,
  fileName: string,
): LocalModMetadata {
  const id = meta.id || fileName;

  return {
    id,
    name: meta.name || meta.id || fileName,
    description: meta.description || "",
    url: meta.url || "",
    version: meta.version || null,
    icon: meta.icon || null,
  };
}

export function fromFabricManifest(
  manifest: unknown,
  fileName: string,
): LocalModMetadata | null {
  const data = record(manifest);
  if (!data) return null;

  const contact = record(data.contact);

  return withFallbacks(
    {
      id: text(data.id),
      name: text(data.name),
      description: text(data.description),
      url: text(contact?.homepage) || text(contact?.sources),
      version: text(data.version),
      icon: pickIcon(data.icon),
    },
    fileName,
  );
}

export function fromQuiltManifest(
  manifest: unknown,
  fileName: string,
): LocalModMetadata | null {
  const loader = record(record(manifest)?.quilt_loader);
  if (!loader) return null;

  const metadata = record(loader.metadata);
  const contact = record(metadata?.contact);

  return withFallbacks(
    {
      id: text(loader.id),
      name: text(metadata?.name),
      description: text(metadata?.description),
      url: text(contact?.homepage) || text(contact?.sources),
      version: text(loader.version),
      icon: pickIcon(metadata?.icon),
    },
    fileName,
  );
}

export function fromModsToml(
  parsed: unknown,
  fileName: string,
): LocalModMetadata | null {
  const root = record(parsed);
  const mods = root?.mods;
  const mod = Array.isArray(mods) ? record(mods[0]) : null;
  if (!mod) return null;

  return withFallbacks(
    {
      id: text(mod.modId),
      name: text(mod.displayName),
      description: text(mod.description),
      url: text(mod.displayURL) || text(root?.displayURL),
      icon: text(mod.logoFile) || text(root?.logoFile),
    },
    fileName,
  );
}

export function packDescription(pack: unknown): string {
  const description = record(pack)?.description;
  if (typeof description === "string") return description.trim();

  const flatten = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(flatten).join("");

    const component = record(value);
    if (!component) return "";

    if (typeof component.fallback === "string") return component.fallback;

    const own = typeof component.text === "string" ? component.text : "";
    return own + (Array.isArray(component.extra) ? flatten(component.extra) : "");
  };

  return flatten(description).trim();
}
