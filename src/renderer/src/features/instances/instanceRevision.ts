import { useEffect } from "react";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import { forgetContinueCache } from "./continueCache";

export const instanceDataRevisionAtom = atom(0);

export function bumpInstanceDataRevision(): void {
  const store = getDefaultStore();

  forgetContinueCache();
  store.set(instanceDataRevisionAtom, store.get(instanceDataRevisionAtom) + 1);
}

let listeners = 0;
let unsubscribe: (() => void) | null = null;

export function useInstanceDataRevision(): number {
  const revision = useAtomValue(instanceDataRevisionAtom);

  useEffect(() => {
    listeners += 1;
    if (listeners === 1) {
      unsubscribe =
        window.api.events.onPlaytimeRecorded(bumpInstanceDataRevision) ?? null;
    }

    return () => {
      listeners -= 1;
      if (listeners > 0) return;

      unsubscribe?.();
      unsubscribe = null;
    };
  }, []);

  return revision;
}
