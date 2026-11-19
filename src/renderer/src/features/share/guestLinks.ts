import { atom } from "jotai";
import type { ShareGuestLink, ShareTransport } from "@/types/Share";

export const shareGuestLinksAtom = atom<ShareGuestLink[]>([]);

export function linkForHost(
  links: ShareGuestLink[],
  hostUserId: string,
): ShareGuestLink | undefined {
  return links.find(
    (link) => link.hostUserId === hostUserId && link.state !== "closed",
  );
}

export function transportLabelKey(transport: ShareTransport): string {
  return `share.transport.${transport}`;
}

export function transportHintKey(transport: ShareTransport): string {
  return `share.transport.${transport}Hint`;
}

export function formatRtt(
  rttMs: number | undefined,
  unit: string,
): string | null {
  if (typeof rttMs !== "number" || !Number.isFinite(rttMs) || rttMs <= 0) {
    return null;
  }
  return `${Math.round(rttMs)} ${unit}`;
}
