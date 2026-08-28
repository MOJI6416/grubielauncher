import { Route } from "./routes";

export type NavigationBlocker = (target: Route | null) => boolean;

const blockers = new Map<string, NavigationBlocker>();
const listeners = new Set<() => void>();

function notifyBlockerChange(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

export function subscribeNavigationBlockers(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function registerNavigationBlocker(
  id: string,
  isBlocking: NavigationBlocker,
): () => void {
  blockers.set(id, isBlocking);
  notifyBlockerChange();

  return () => {
    if (blockers.get(id) === isBlocking) {
      blockers.delete(id);
      notifyBlockerChange();
    }
  };
}

export function getBlockingIds(target: Route | null = null): string[] {
  const blocking: string[] = [];

  blockers.forEach((isBlocking, id) => {
    let result = false;
    try {
      result = isBlocking(target);
    } catch {
      result = false;
    }

    if (result) blocking.push(id);
  });

  return blocking;
}

export function isNavigationBlocked(target: Route | null = null): boolean {
  return getBlockingIds(target).length > 0;
}

export function clearNavigationBlockers(): void {
  blockers.clear();
  notifyBlockerChange();
}
