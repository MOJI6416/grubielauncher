import type { FriendFilter, FriendSort } from "./friendsList";

export interface PeoplePrefs {
  filter: FriendFilter;
  sort: FriendSort;
}

const STORAGE_KEY = "people.prefs";
const DEFAULT_PREFS: PeoplePrefs = { filter: "all", sort: "activity" };

const FILTERS: FriendFilter[] = ["all", "online", "unread"];
const SORTS: FriendSort[] = ["activity", "name"];

export function normalizePeoplePrefs(raw: unknown): PeoplePrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_PREFS;

  const value = raw as Partial<PeoplePrefs>;
  return {
    filter: FILTERS.includes(value.filter as FriendFilter)
      ? (value.filter as FriendFilter)
      : DEFAULT_PREFS.filter,
    sort: SORTS.includes(value.sort as FriendSort)
      ? (value.sort as FriendSort)
      : DEFAULT_PREFS.sort,
  };
}

export function loadPeoplePrefs(): PeoplePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizePeoplePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePeoplePrefs(prefs: PeoplePrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    return;
  }
}
