import { atom, getDefaultStore } from "jotai";

export const publishOfferKeyAtom = atom<string | null>(null);

export function requestPublishOffer(key: string): void {
  if (!key) return;

  getDefaultStore().set(publishOfferKeyAtom, key);
}

export function consumePublishOffer(key: string): boolean {
  const store = getDefaultStore();
  if (!key || store.get(publishOfferKeyAtom) !== key) return false;

  store.set(publishOfferKeyAtom, null);
  return true;
}
