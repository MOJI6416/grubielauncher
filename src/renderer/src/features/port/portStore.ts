import { atom, getDefaultStore } from "jotai";
import type { Version } from "@renderer/classes/Version";

export const portSourceAtom = atom<Version | null>(null);

export function openPortDialog(instance: Version): void {
  getDefaultStore().set(portSourceAtom, instance);
}

export function closePortDialog(): void {
  getDefaultStore().set(portSourceAtom, null);
}
