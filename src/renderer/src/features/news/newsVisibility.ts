import { atom, getDefaultStore } from "jotai";

const STORAGE_KEY = "newsFeedVisible";

export const newsVisibleAtom = atom(
  localStorage.getItem(STORAGE_KEY) === "true",
);

export function toggleNewsFeed(): void {
  const store = getDefaultStore();
  const next = !store.get(newsVisibleAtom);
  store.set(newsVisibleAtom, next);
  localStorage.setItem(STORAGE_KEY, String(next));
}
