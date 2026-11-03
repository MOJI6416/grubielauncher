import { atom, getDefaultStore } from "jotai";
import type { Version } from "@renderer/classes/Version";

export const instanceToDeleteAtom = atom<Version | null>(null);

export function requestInstanceDelete(instance: Version): void {
  getDefaultStore().set(instanceToDeleteAtom, instance);
}

export function closeInstanceDelete(): void {
  getDefaultStore().set(instanceToDeleteAtom, null);
}
