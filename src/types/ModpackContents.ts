import type { ProjectType, Provider } from "./ModManager";

export interface ModpackContentsEntry {
  key: string;
  title: string;
  iconUrl: string | null;
  provider: Provider;
  projectType: ProjectType;
  optional?: boolean;
}

export interface ModpackContents {
  items: ModpackContentsEntry[];
}
