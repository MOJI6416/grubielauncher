import type { OverlayToastKind } from "@/types/Voice";

export interface ToastFace {
  _id?: string;
  nickname: string;
}

export interface QueuedToast {
  id: string;
  kind: OverlayToastKind;
  title: string;
  body: (count: number) => string;
  face: ToastFace | null;
  accept?: () => void;
  count: number;
  shownAt: number;
  expiresAt: number;
}

export const MAX_TOASTS = 3;

export const TOAST_DURATION: Record<OverlayToastKind, number> = {
  message: 8_000,
  invite: 20_000,
  call: 30_000,
};

export function upsertToast(
  list: QueuedToast[],
  incoming: Omit<QueuedToast, "count" | "shownAt" | "expiresAt">,
  now: number,
): QueuedToast[] {
  const previous = list.find((toast) => toast.id === incoming.id);
  const next: QueuedToast = {
    ...incoming,
    count: incoming.kind === "message" ? (previous?.count ?? 0) + 1 : 1,
    shownAt: now,
    expiresAt: now + TOAST_DURATION[incoming.kind],
  };

  return [next, ...list.filter((toast) => toast.id !== incoming.id)].slice(
    0,
    MAX_TOASTS,
  );
}

export function pruneToasts(list: QueuedToast[], now: number): QueuedToast[] {
  const kept = list.filter((toast) => toast.expiresAt > now);
  return kept.length === list.length ? list : kept;
}

export function nextExpiry(list: QueuedToast[]): number | null {
  return list.length === 0
    ? null
    : Math.min(...list.map((toast) => toast.expiresAt));
}

export function latestActionable(list: QueuedToast[]): QueuedToast | undefined {
  return list
    .filter((toast) => !!toast.accept)
    .sort((a, b) => b.shownAt - a.shownAt)[0];
}

export function isFullscreenOptions(text: string): boolean {
  return /^fullscreen:true\s*$/m.test(text);
}
