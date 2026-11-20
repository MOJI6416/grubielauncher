import { getDefaultStore } from "jotai";
import { toast } from "sonner";
import i18n from "@renderer/i18n";
import {
  back,
  canGoBack,
  canGoForward,
  dropInstance,
  forward,
  push,
  remapInstanceId,
  replace,
  reset,
} from "./history";
import { accountAtom } from "@renderer/stores/atoms";
import { isNavigationBlocked } from "./guards";
import { routeBlockReason, routeBlockedKey } from "./access";
import {
  currentRouteAtom,
  historyAtom,
  pendingNavigationAtom,
} from "./store";
import { Route, isSameRoute } from "./routes";

export interface NavigateOptions {
  force?: boolean;
  replace?: boolean;
  reset?: boolean;
}

type Store = ReturnType<typeof getDefaultStore>;

function store(): Store {
  return getDefaultStore();
}

export function getCurrentRoute(): Route {
  return store().get(currentRouteAtom);
}

function blockReasonFor(route: Route) {
  return routeBlockReason(route, {
    accountType: store().get(accountAtom)?.type ?? null,
  });
}

export function isRouteReachable(route: Route): boolean {
  return blockReasonFor(route) === null;
}

export function navigate(route: Route, options: NavigateOptions = {}): boolean {
  const s = store();

  const blocked = blockReasonFor(route);
  if (blocked) {
    toast.info(i18n.t(routeBlockedKey(blocked)), {
      id: `route-blocked-${blocked}`,
    });
    return false;
  }

  if (isSameRoute(s.get(currentRouteAtom), route) && !options.reset) {
    return true;
  }

  if (!options.force && isNavigationBlocked(route)) {
    s.set(pendingNavigationAtom, { kind: "route", route });
    return false;
  }

  s.set(pendingNavigationAtom, null);
  s.set(historyAtom, (state) => {
    if (options.reset) return reset(state, route);
    if (options.replace) return replace(state, route);
    return push(state, route);
  });

  return true;
}

export function goBack(options: NavigateOptions = {}): boolean {
  const s = store();
  const state = s.get(historyAtom);

  if (!canGoBack(state)) return false;

  if (
    !options.force &&
    isNavigationBlocked(state.entries[state.index - 1].route)
  ) {
    s.set(pendingNavigationAtom, { kind: "back" });
    return false;
  }

  s.set(pendingNavigationAtom, null);
  s.set(historyAtom, (state) => back(state));
  return true;
}

export function goForward(options: NavigateOptions = {}): boolean {
  const s = store();
  const state = s.get(historyAtom);

  if (!canGoForward(state)) return false;

  if (
    !options.force &&
    isNavigationBlocked(state.entries[state.index + 1].route)
  ) {
    s.set(pendingNavigationAtom, { kind: "forward" });
    return false;
  }

  s.set(pendingNavigationAtom, null);
  s.set(historyAtom, (state) => forward(state));
  return true;
}

export function confirmPendingNavigation(): void {
  const s = store();
  const pending = s.get(pendingNavigationAtom);
  if (!pending) return;

  s.set(pendingNavigationAtom, null);

  if (pending.kind === "route") {
    navigate(pending.route, { force: true });
    return;
  }

  if (pending.kind === "back") goBack({ force: true });
  else goForward({ force: true });
}

export function cancelPendingNavigation(): void {
  store().set(pendingNavigationAtom, null);
}

export function remapInstance(oldId: string, newId: string): void {
  store().set(historyAtom, (state) => remapInstanceId(state, oldId, newId));
}

export function forgetInstance(instanceId: string): void {
  store().set(historyAtom, (state) => dropInstance(state, instanceId));
}
