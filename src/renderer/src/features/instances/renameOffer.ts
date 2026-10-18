import { atom, getDefaultStore } from "jotai";

export const renameOfferAtom = atom<{ key: string; name: string } | null>(null);

export function requestRenameOffer(key: string, name: string): void {
  if (!key) return;

  getDefaultStore().set(renameOfferAtom, { key, name });
}

export function consumeRenameOffer(key: string): string | null {
  const store = getDefaultStore();
  const offer = store.get(renameOfferAtom);
  if (!key || offer?.key !== key) return null;

  store.set(renameOfferAtom, null);
  return offer.name;
}
