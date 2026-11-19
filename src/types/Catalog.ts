import type { IProject } from "./ModManager";

export interface CatalogLinkResolution {
  project: IProject;
  versionId?: string;
}

export interface ModrinthCollectionImport {
  id: string;
  name: string;
  projects: IProject[];
}
