import { atom } from "jotai";
import {
  HistoryState,
  canGoBack,
  canGoForward,
  createHistory,
  current,
} from "./history";
import { Route } from "./routes";

export type PendingNavigation =
  | { kind: "route"; route: Route }
  | { kind: "back" }
  | { kind: "forward" };

export const historyAtom = atom<HistoryState>(createHistory());

export const currentRouteAtom = atom((get) => current(get(historyAtom)));

export const canGoBackAtom = atom((get) => canGoBack(get(historyAtom)));

export const canGoForwardAtom = atom((get) => canGoForward(get(historyAtom)));

export const pendingNavigationAtom = atom<PendingNavigation | null>(null);
