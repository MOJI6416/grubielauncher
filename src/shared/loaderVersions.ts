import type { Loader } from "@/types/Loader";
import type { LoaderVersion } from "@/types/VersionsService";

type ResolveImportedLoaderVersionInput = {
  loader: Loader | undefined;
  minecraftVersion: string | undefined;
  requiredLoaderVersion: string | undefined;
  availableVersions: LoaderVersion[];
};

export type ImportedLoaderVersionResolution =
  | { status: "notRequired"; version?: undefined }
  | { status: "matched"; version: LoaderVersion }
  | { status: "synthesized"; version: LoaderVersion }
  | { status: "missingRequired"; version?: undefined }
  | { status: "notFound"; version?: undefined };

const loaderPrefixes: Array<{ prefix: string; loader: Loader }> = [
  { prefix: "fabric-loader-", loader: "fabric" },
  { prefix: "quilt-loader-", loader: "quilt" },
  { prefix: "neoforge-", loader: "neoforge" },
  { prefix: "forge-", loader: "forge" },
  { prefix: "fabric-", loader: "fabric" },
  { prefix: "quilt-", loader: "quilt" },
];

function isLoader(value: string): value is Loader {
  return ["vanilla", "forge", "neoforge", "fabric", "quilt"].includes(value);
}

function trimVersion(value?: string) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseCurseForgeLoaderId(rawLoaderId: unknown): {
  loader?: Loader;
  loaderVersion?: string;
} {
  const loaderId = trimVersion(String(rawLoaderId ?? ""));
  if (!loaderId) return {};

  const normalized = loaderId.toLowerCase();
  for (const { prefix, loader } of loaderPrefixes) {
    if (normalized.startsWith(prefix)) {
      const loaderVersion = loaderId.slice(prefix.length).trim();
      return {
        loader,
        loaderVersion: loaderVersion || undefined,
      };
    }
  }

  const firstToken = normalized.split("-")[0];
  return {
    loader: isLoader(firstToken) ? firstToken : undefined,
  };
}

function stripKnownPrefixes(
  value: string,
  loader: Loader | undefined,
  minecraftVersion: string | undefined,
) {
  const candidates = new Set<string>();
  const add = (candidate: string) => {
    const next = candidate.trim();
    if (next) candidates.add(next);
  };

  add(value);

  const lower = value.toLowerCase();
  const prefixes = [
    loader ? `${loader}-` : "",
    loader === "fabric" ? "fabric-loader-" : "",
    loader === "quilt" ? "quilt-loader-" : "",
    minecraftVersion ? `${minecraftVersion}-` : "",
    loader && minecraftVersion ? `${loader}-${minecraftVersion}-` : "",
    loader === "fabric" && minecraftVersion
      ? `fabric-loader-${minecraftVersion}-`
      : "",
    loader === "quilt" && minecraftVersion
      ? `quilt-loader-${minecraftVersion}-`
      : "",
  ].filter(Boolean);

  for (const prefix of prefixes) {
    if (lower.startsWith(prefix.toLowerCase())) {
      add(value.slice(prefix.length));
    }
  }

  return [...candidates];
}

export function loaderVersionMatches(
  availableId: string,
  requiredId: string,
  loader: Loader | undefined,
  minecraftVersion: string | undefined,
) {
  const available = stripKnownPrefixes(
    trimVersion(availableId),
    loader,
    minecraftVersion,
  ).map((value) => value.toLowerCase());
  const required = stripKnownPrefixes(
    trimVersion(requiredId),
    loader,
    minecraftVersion,
  ).map((value) => value.toLowerCase());

  return available.some((a) => required.includes(a));
}

function canonicalLoaderVersionId(
  requiredId: string,
  loader: Loader,
  minecraftVersion: string,
) {
  const candidates = stripKnownPrefixes(requiredId, loader, minecraftVersion);
  return (
    candidates.find(
      (candidate) =>
        candidate !== requiredId &&
        !candidate.toLowerCase().startsWith(`${loader}-`) &&
        !candidate.toLowerCase().startsWith(`${minecraftVersion}-`),
    ) ||
    candidates.find((candidate) => !candidate.includes("/")) ||
    ""
  );
}

export function createLoaderVersionFromManifest(
  loader: Loader | undefined,
  minecraftVersion: string | undefined,
  requiredLoaderVersion: string | undefined,
): LoaderVersion | null {
  if (!loader || loader === "vanilla" || !minecraftVersion) return null;

  const rawId = trimVersion(requiredLoaderVersion);
  if (!rawId || rawId.includes("/") || rawId.includes("\\")) return null;

  const id = canonicalLoaderVersionId(rawId, loader, minecraftVersion);
  if (!id) return null;

  if (loader === "forge") {
    return {
      id,
      url: `https://maven.minecraftforge.net/net/minecraftforge/forge/${minecraftVersion}-${id}/forge-${minecraftVersion}-${id}-installer.jar`,
    };
  }

  if (loader === "neoforge") {
    return {
      id,
      url: `https://maven.neoforged.net/releases/net/neoforged/neoforge/${id}/neoforge-${id}-installer.jar`,
    };
  }

  if (loader === "fabric") {
    return {
      id,
      url: `https://meta.fabricmc.net/v2/versions/loader/${minecraftVersion}/${id}/profile/json`,
    };
  }

  if (loader === "quilt") {
    return {
      id,
      url: `https://meta.quiltmc.org/v3/versions/loader/${minecraftVersion}/${id}/profile/json`,
    };
  }

  return null;
}

export function resolveImportedLoaderVersion({
  loader,
  minecraftVersion,
  requiredLoaderVersion,
  availableVersions,
}: ResolveImportedLoaderVersionInput): ImportedLoaderVersionResolution {
  if (!loader || loader === "vanilla") return { status: "notRequired" };

  const required = trimVersion(requiredLoaderVersion);
  if (!required) return { status: "missingRequired" };

  const matched = availableVersions.find((version) =>
    loaderVersionMatches(version.id, required, loader, minecraftVersion),
  );
  if (matched) return { status: "matched", version: matched };

  const synthesized = createLoaderVersionFromManifest(
    loader,
    minecraftVersion,
    required,
  );

  if (synthesized) return { status: "synthesized", version: synthesized };

  return { status: "notFound" };
}
