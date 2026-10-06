import type { IVersionConf } from "@/types/IVersion";
import type { IServer } from "@/types/ServersList";
import type {
  ModrinthServer,
  ModrinthServerCompatibility,
  ModrinthServerContent,
} from "@/types/ModrinthServers";
import { Provider } from "@/types/ModManager";
import { toNbtSafeText } from "@/shared/nbtText";
import { MAX_SERVER_NAME } from "../serverList";

export interface ServerFitInstance {
  gameVersion: string;
  modpackProjectId?: string;
  modpackVersionId?: string;
}

export type ServerFit = "ready" | "packVersion" | "otherVersion" | "needsPack";

export function fitInstanceOf(conf: IVersionConf): ServerFitInstance {
  const modpack =
    conf.modpack?.provider === Provider.MODRINTH ? conf.modpack : undefined;

  return {
    gameVersion: conf.version.id,
    modpackProjectId: modpack?.projectId,
    modpackVersionId: modpack?.versionId,
  };
}

export function compatibilityOf(
  instance: ServerFitInstance,
): ModrinthServerCompatibility {
  return {
    gameVersion: instance.gameVersion,
    modpackProjectId: instance.modpackProjectId,
  };
}

export function serverFit(
  server: ModrinthServer,
  instance: ServerFitInstance,
): ServerFit {
  const { content } = server;

  if (content.kind === "modpack") {
    if (content.projectId !== instance.modpackProjectId) return "needsPack";
    return content.versionId === instance.modpackVersionId
      ? "ready"
      : "packVersion";
  }

  if (content.gameVersions.length === 0) return "ready";

  return content.gameVersions.includes(instance.gameVersion)
    ? "ready"
    : "otherVersion";
}

export function serverVersionPreference(
  content: ModrinthServerContent,
): string[] {
  const recommended =
    content.kind === "vanilla" ? content.recommendedVersion : null;

  return [
    ...new Set([
      ...(recommended ? [recommended] : []),
      ...content.gameVersions,
    ]),
  ];
}

export function summarizeVersions(versions: string[]): string {
  if (versions.length <= 3) return versions.join(", ");

  return `${versions[versions.length - 1]} – ${versions[0]}`;
}

export function serverEntryOf(server: ModrinthServer): IServer {
  const name = toNbtSafeText(server.name)
    .trim()
    .slice(0, MAX_SERVER_NAME)
    .trim();

  return {
    name: name || server.address,
    ip: server.address,
    acceptTextures: null,
  };
}
