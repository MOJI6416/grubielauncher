import { atom, getDefaultStore } from "jotai";
import type { ActiveSeasonalEvent } from "./calendar";

export const seasonalEventAtom = atom<ActiveSeasonalEvent | null>(null);

export const batFlockRequestAtom = atom(0);

export function releaseBats(): void {
  getDefaultStore().set(batFlockRequestAtom, (count) => count + 1);
}
