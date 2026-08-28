import { Route, isSameRoute, routeKey } from "./routes";

export const HISTORY_LIMIT = 50;

export interface HistoryEntry {
  route: Route;
  key: string;
}

export interface HistoryState {
  entries: HistoryEntry[];
  index: number;
}

function entryOf(route: Route): HistoryEntry {
  return { route, key: routeKey(route) };
}

export function createHistory(route: Route = { name: "home" }): HistoryState {
  return { entries: [entryOf(route)], index: 0 };
}

export function current(state: HistoryState): Route {
  return state.entries[state.index].route;
}

export function canGoBack(state: HistoryState): boolean {
  return state.index > 0;
}

export function canGoForward(state: HistoryState): boolean {
  return state.index < state.entries.length - 1;
}

export function push(state: HistoryState, route: Route): HistoryState {
  if (isSameRoute(current(state), route)) return state;

  const kept = state.entries.slice(0, state.index + 1);
  const entries = [...kept, entryOf(route)];
  const overflow = Math.max(0, entries.length - HISTORY_LIMIT);

  return {
    entries: entries.slice(overflow),
    index: entries.length - overflow - 1,
  };
}

export function replace(state: HistoryState, route: Route): HistoryState {
  const entries = [...state.entries];
  entries[state.index] = entryOf(route);
  return { ...state, entries };
}

export function back(state: HistoryState): HistoryState {
  if (!canGoBack(state)) return state;
  return { ...state, index: state.index - 1 };
}

export function forward(state: HistoryState): HistoryState {
  if (!canGoForward(state)) return state;
  return { ...state, index: state.index + 1 };
}

export function reset(state: HistoryState, route: Route): HistoryState {
  if (state.entries.length === 1 && isSameRoute(current(state), route)) {
    return state;
  }
  return createHistory(route);
}

export function remapInstanceId(
  state: HistoryState,
  oldId: string,
  newId: string,
): HistoryState {
  if (oldId === newId) return state;

  let changed = false;
  const entries = state.entries.map((entry) => {
    if (entry.route.name !== "instance" || entry.route.id !== oldId) {
      return entry;
    }

    changed = true;
    const route: Route = { ...entry.route, id: newId };
    return { ...entry, route, key: routeKey(route) };
  });

  return changed ? { ...state, entries } : state;
}

export function dropInstance(
  state: HistoryState,
  instanceId: string,
): HistoryState {
  const kept: HistoryEntry[] = [];
  let index = state.index;

  state.entries.forEach((entry, position) => {
    const matches =
      entry.route.name === "instance" && entry.route.id === instanceId;

    if (matches) {
      if (position <= state.index) index -= 1;
      return;
    }

    kept.push(entry);
  });

  if (!kept.length) return createHistory({ name: "home" });

  return { entries: kept, index: Math.max(0, Math.min(index, kept.length - 1)) };
}
