import { ProjectType, Provider, type IProject } from "@/types/ModManager";

export function archiveProject(title: string, url = ""): IProject {
  return {
    id: "",
    title,
    description: "",
    iconUrl: "",
    url,
    projectType: ProjectType.MODPACK,
    provider: Provider.LOCAL,
    versions: [],
    body: "",
    gallery: [],
  };
}

export function parseArchiveUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function archiveExtension(url: string): ".zip" | ".mrpack" {
  const name = new URL(url).pathname.split("/").pop()?.toLowerCase() ?? "";
  return name.endsWith(".mrpack") ? ".mrpack" : ".zip";
}
