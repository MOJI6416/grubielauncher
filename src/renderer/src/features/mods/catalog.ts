import { ProjectType, Provider } from "@/types/ModManager";
import { Loader } from "@/types/Loader";

export const CATALOG_PAGE_SIZE = 20;

export interface CatalogRequest {
  provider: Provider;
  projectType: ProjectType;
  query: string;
  sort: string;
  filters: string[];
  gameVersion: string | undefined;
  loader: Loader | undefined;
}

export function requestSignature(request: CatalogRequest): string {
  return [
    request.provider,
    request.projectType,
    request.query.trim(),
    request.sort,
    [...request.filters].sort().join("+"),
    request.gameVersion ?? "",
    request.loader ?? "",
  ].join("|");
}
