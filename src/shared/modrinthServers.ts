import type {
  ModrinthServer,
  ModrinthServerContent,
  ModrinthServerImage,
  ModrinthServerPing,
  ModrinthServerQuery,
  ModrinthServerSort,
} from "@/types/ModrinthServers";
import { compareLoaderVersions } from "./loaderCompat";

const SORT_INDEX: Record<ModrinthServerSort, string> = {
  relevance: "relevance",
  players: "minecraft_java_server.ping.data.players_online",
  verified: "minecraft_java_server.verified_plays_2w",
  follows: "follows",
  newest: "date_created",
  updated: "date_modified",
};

export const MODRINTH_SERVER_SORTS = Object.keys(
  SORT_INDEX,
) as ModrinthServerSort[];

export const MODRINTH_SERVER_PAGE_SIZE = 20;

const FILTER_VALUE = /^[A-Za-z0-9._+-]{1,64}$/;

type Json = Record<string, unknown>;

function filterValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !FILTER_VALUE.test(trimmed)) return null;

  return JSON.stringify(trimmed);
}

function versionClause(version: string): string {
  return `(game_versions IN [${version}] OR minecraft_java_server.content.supported_game_versions IN [${version}])`;
}

export function serverSortIndex(sort: ModrinthServerSort): string {
  return SORT_INDEX[sort] ?? SORT_INDEX.relevance;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value ? value.slice(0, 64) : undefined;
}

export function sanitizeServerQuery(
  raw: ModrinthServerQuery,
): ModrinthServerQuery {
  const compatibleVersion = optionalText(raw.compatible?.gameVersion);

  return {
    query: typeof raw.query === "string" ? raw.query.slice(0, 256) : "",
    sort: MODRINTH_SERVER_SORTS.includes(raw.sort) ? raw.sort : "relevance",
    kind:
      raw.kind === "vanilla" || raw.kind === "modpack" ? raw.kind : undefined,
    gameVersion: optionalText(raw.gameVersion),
    language: optionalText(raw.language),
    compatible: compatibleVersion
      ? {
          gameVersion: compatibleVersion,
          modpackProjectId: optionalText(raw.compatible?.modpackProjectId),
        }
      : undefined,
    offset: Number.isSafeInteger(raw.offset) && raw.offset > 0 ? raw.offset : 0,
    limit: Number.isSafeInteger(raw.limit)
      ? Math.min(50, Math.max(1, raw.limit))
      : MODRINTH_SERVER_PAGE_SIZE,
  };
}

export function buildServerFilters(query: ModrinthServerQuery): string {
  const parts = [
    "project_types = minecraft_java_server",
    "minecraft_java_server.ping.data EXISTS",
  ];

  const compatibleVersion = filterValue(query.compatible?.gameVersion);

  if (compatibleVersion) {
    const vanilla = `(minecraft_java_server.content.kind = vanilla AND ${versionClause(compatibleVersion)})`;
    const projectId = filterValue(query.compatible?.modpackProjectId);
    parts.push(
      projectId ? `(${vanilla} OR project_id = ${projectId})` : vanilla,
    );
  } else {
    if (query.kind === "vanilla" || query.kind === "modpack") {
      parts.push(`minecraft_java_server.content.kind = ${query.kind}`);
    }

    const version = filterValue(query.gameVersion);
    if (version) parts.push(versionClause(version));
  }

  const language = filterValue(query.language);
  if (language) parts.push(`minecraft_server.languages IN [${language}]`);

  return parts.join(" AND ");
}

function record(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      )
    : [];
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

function unique(list: string[]): string[] {
  return [...new Set(list)];
}

export function sortGameVersions(list: string[]): string[] {
  return unique(list).sort((left, right) => compareLoaderVersions(right, left));
}

function latencyMs(value: unknown): number | null {
  const latency = record(value);
  if (!latency) return null;

  const ms = Math.round(
    count(latency.secs) * 1000 + count(latency.nanos) / 1e6,
  );
  return ms > 0 ? ms : null;
}

function parsePing(value: unknown): ModrinthServerPing | null {
  const data = record(record(value)?.data);
  if (!data) return null;

  return {
    playersOnline: count(data.players_online),
    playersMax: count(data.players_max),
    latencyMs: latencyMs(data.latency),
    versionName: text(data.version_name),
  };
}

function parseContent(value: unknown, hit: Json): ModrinthServerContent | null {
  const content = record(value);
  const fields = record(hit.project_loader_fields);
  const gameVersions = sortGameVersions([
    ...strings(hit.game_versions),
    ...strings(fields?.game_versions),
  ]);

  if (content?.kind === "modpack") {
    const projectId = text(content.project_id);
    const versionId = text(content.version_id);
    if (!projectId || !versionId) return null;

    return {
      kind: "modpack",
      projectId,
      versionId,
      title: text(content.project_name),
      iconUrl: text(content.project_icon),
      loaders: unique([
        ...strings(hit.mrpack_loaders),
        ...strings(fields?.mrpack_loaders),
      ]),
      gameVersions,
    };
  }

  if (content && content.kind !== "vanilla") return null;

  return {
    kind: "vanilla",
    gameVersions: sortGameVersions([
      ...strings(content?.supported_game_versions),
      ...gameVersions,
    ]),
    recommendedVersion: text(content?.recommended_game_version),
  };
}

export function normalizeServerHit(hit: unknown): ModrinthServer | null {
  const data = record(hit);
  if (!data) return null;

  const id = text(data.project_id) ?? text(data.id);
  const java = record(data.minecraft_java_server);
  const address = text(java?.address);
  if (!id || !address) return null;

  const content = parseContent(java?.content, data);
  if (!content) return null;

  const server = record(data.minecraft_server);
  const slug = text(data.slug) ?? id;
  const categories = strings(data.display_categories);

  return {
    id,
    slug,
    name: text(data.name) ?? text(data.title) ?? slug,
    summary: text(data.summary) ?? text(data.description) ?? "",
    iconUrl: text(data.icon_url),
    bannerUrl: text(data.featured_gallery),
    url: `https://modrinth.com/server/${encodeURIComponent(slug)}`,
    address,
    region: text(server?.region),
    languages: strings(server?.languages),
    categories: unique(
      categories.length ? categories : strings(data.categories),
    ),
    follows: count(data.follows ?? data.followers),
    verifiedPlays: count(java?.verified_plays_2w),
    content,
    ping: parsePing(java?.ping),
  };
}

const GALLERY_LIMIT = 64;

function isHttpsImage(value: string | null): value is string {
  return Boolean(value && value.startsWith("https://"));
}

export function normalizeServerGallery(project: unknown): ModrinthServerImage[] {
  const gallery = record(project)?.gallery;
  if (!Array.isArray(gallery)) return [];

  return gallery
    .map((entry, position) => ({ image: record(entry), position }))
    .filter((item): item is { image: Json; position: number } => item.image !== null)
    .sort(
      (a, b) =>
        Number(b.image.featured === true) - Number(a.image.featured === true) ||
        count(a.image.ordering) - count(b.image.ordering) ||
        a.position - b.position,
    )
    .flatMap(({ image }) => {
      const thumbnail = text(image.url);
      const raw = text(image.raw_url);
      const url = isHttpsImage(raw) ? raw : thumbnail;
      if (!isHttpsImage(url)) return [];

      return [
        {
          url,
          thumbnail: isHttpsImage(thumbnail) ? thumbnail : url,
          title: text(image.name) ?? text(image.title) ?? "",
          description: text(image.description) ?? "",
        },
      ];
    })
    .slice(0, GALLERY_LIMIT);
}
