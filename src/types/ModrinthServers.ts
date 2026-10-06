import type { IProject, IVersion } from "./ModManager";

export type ModrinthServerSort =
  | "relevance"
  | "players"
  | "verified"
  | "follows"
  | "newest"
  | "updated";

export type ModrinthServerKind = "vanilla" | "modpack";

export interface ModrinthServerCompatibility {
  gameVersion: string;
  modpackProjectId?: string;
}

export interface ModrinthServerQuery {
  query: string;
  sort: ModrinthServerSort;
  kind?: ModrinthServerKind;
  gameVersion?: string;
  language?: string;
  compatible?: ModrinthServerCompatibility;
  offset: number;
  limit: number;
}

export interface ModrinthServerPing {
  playersOnline: number;
  playersMax: number;
  latencyMs: number | null;
  versionName: string | null;
}

export type ModrinthServerContent =
  | {
      kind: "vanilla";
      gameVersions: string[];
      recommendedVersion: string | null;
    }
  | {
      kind: "modpack";
      projectId: string;
      versionId: string;
      title: string | null;
      iconUrl: string | null;
      loaders: string[];
      gameVersions: string[];
    };

export interface ModrinthServer {
  id: string;
  slug: string;
  name: string;
  summary: string;
  iconUrl: string | null;
  bannerUrl: string | null;
  url: string;
  address: string;
  region: string | null;
  languages: string[];
  categories: string[];
  follows: number;
  verifiedPlays: number;
  content: ModrinthServerContent;
  ping: ModrinthServerPing | null;
}

export interface ModrinthServerPage {
  servers: ModrinthServer[];
  total: number;
  nextOffset: number;
  error?: boolean;
}

export interface ModrinthServerPack {
  project: IProject;
  version: IVersion;
}

export interface ModrinthServerImage {
  url: string;
  thumbnail: string;
  title: string;
  description: string;
}
