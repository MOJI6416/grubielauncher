import { atom, getDefaultStore } from "jotai";
import type { IProject } from "@/types/ModManager";
import type { CatalogLink } from "@/types/DeepLink";

export type CatalogInstallRequest =
  | { kind: "project"; project: IProject; versionId?: string }
  | { kind: "link"; link: CatalogLink };

export const catalogInstallAtom = atom<CatalogInstallRequest | null>(null);

export function openCatalogInstall(request: CatalogInstallRequest): void {
  getDefaultStore().set(catalogInstallAtom, request);
}

export function closeCatalogInstall(): void {
  getDefaultStore().set(catalogInstallAtom, null);
}
