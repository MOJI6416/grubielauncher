import { toast } from "sonner";
import i18n from "@renderer/i18n";
import { copyToClipboard } from "./clipboard";

const FLASH_MS = 1300;
const ANCHOR_GAP_PX = 6;
const TOP_SAFE_PX = 56;
const EDGE_MARGIN_PX = 8;
const CHECK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

export function captureCopyAnchor(): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  return active;
}

export function flashCopied(anchor: HTMLElement | null): void {
  const label = i18n.t("common.copied");
  const rect = anchor?.isConnected ? anchor.getBoundingClientRect() : null;

  if (!rect || rect.width === 0 || rect.height === 0) {
    toast(label);
    return;
  }

  const below = rect.top < TOP_SAFE_PX;
  const badge = document.createElement("div");
  badge.className = "copied-flash";
  badge.dataset.side = below ? "bottom" : "top";
  badge.setAttribute("role", "status");
  badge.innerHTML = CHECK_ICON;
  badge.append(label);
  badge.style.top = `${below ? rect.bottom + ANCHOR_GAP_PX : rect.top - ANCHOR_GAP_PX}px`;
  document.body.append(badge);

  const half = badge.offsetWidth / 2;
  const center = rect.left + rect.width / 2;
  const left = Math.min(
    Math.max(center, half + EDGE_MARGIN_PX),
    window.innerWidth - half - EDGE_MARGIN_PX,
  );
  badge.style.left = `${left}px`;

  window.setTimeout(() => badge.remove(), FLASH_MS);
}

export async function copyWithFeedback(text: string): Promise<boolean> {
  const anchor = captureCopyAnchor();
  const copied = await copyToClipboard(text);
  if (copied) flashCopied(anchor);
  return copied;
}
