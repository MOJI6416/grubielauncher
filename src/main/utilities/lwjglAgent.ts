import path from "path";
import fs from "fs-extra";
import type { DownloadItem } from "@/types/Downloader";

export const LWJGL_UNSAFE_AGENT = {
  path: "org/glavo/lwjgl-unsafe-agent/2.0/lwjgl-unsafe-agent-2.0.jar",
  url: "https://repo1.maven.org/maven2/org/glavo/lwjgl-unsafe-agent/2.0/lwjgl-unsafe-agent-2.0.jar",
  sha1: "ba9653e9f58a18f11663936ea3bf04a52d1c1032",
  size: 9821,
} as const;

export function lwjglAgentPath(minecraftPath: string): string {
  return path.join(
    minecraftPath,
    "libraries",
    ...LWJGL_UNSAFE_AGENT.path.split("/"),
  );
}

export function lwjglAgentDownload(minecraftPath: string): DownloadItem {
  return {
    url: LWJGL_UNSAFE_AGENT.url,
    destination: lwjglAgentPath(minecraftPath),
    sha1: LWJGL_UNSAFE_AGENT.sha1,
    size: LWJGL_UNSAFE_AGENT.size,
    group: "libraries",
    options: { silent: true },
  };
}

export async function hasLwjglAgent(minecraftPath: string): Promise<boolean> {
  const stats = await fs.stat(lwjglAgentPath(minecraftPath)).catch(() => null);
  return stats?.isFile() === true && stats.size === LWJGL_UNSAFE_AGENT.size;
}

export function lwjglAgentArgument(minecraftPath: string): string {
  return `-javaagent:${lwjglAgentPath(minecraftPath)}`;
}
