import { atom, getDefaultStore } from "jotai";
import { IModpack } from "@/types/Backend";
import { navigate } from "@renderer/navigation/navigate";
import { rememberFocusOrigin } from "@renderer/navigation/focusReturn";
import type { NewInstanceSource } from "@renderer/features/newInstance/state";

export type NewInstanceRequest = {
  importFilePath?: string;
  modpack?: IModpack;
  source?: NewInstanceSource;
  onSuccess?: () => void;
};

export const newInstanceRequestAtom = atom<NewInstanceRequest>({});

export function openNewInstance(request: NewInstanceRequest = {}): void {
  rememberFocusOrigin();
  getDefaultStore().set(newInstanceRequestAtom, request);
  navigate({ name: "instance-new" });
}

export function setNewInstanceImport(importFilePath: string): void {
  const store = getDefaultStore();
  store.set(newInstanceRequestAtom, {
    ...store.get(newInstanceRequestAtom),
    importFilePath,
  });
}

export function clearNewInstanceRequest(): void {
  getDefaultStore().set(newInstanceRequestAtom, {});
}
