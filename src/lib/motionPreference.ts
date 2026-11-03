import { useSyncExternalStore } from "react";
import type { MotionSetting } from "@/types/Settings";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

let setting: MotionSetting = "system";
let installed = false;
const listeners = new Set<() => void>();

function systemPrefersReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCE_QUERY).matches
  );
}

export function resolveReducedMotion(
  value: MotionSetting,
  systemReduced: boolean,
): boolean {
  if (value === "on") return false;
  if (value === "off") return true;
  return systemReduced;
}

export function isMotionReduced(): boolean {
  return resolveReducedMotion(setting, systemPrefersReduced());
}

function apply(): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.motion = isMotionReduced() ? "off" : "on";
  }
  listeners.forEach((listener) => listener());
}

export function installMotionPreference(): void {
  if (!installed && typeof window.matchMedia === "function") {
    installed = true;
    window.matchMedia(REDUCE_QUERY).addEventListener("change", apply);
  }
  apply();
}

export function setMotionSetting(next: MotionSetting): void {
  if (next === setting) return;
  setting = next;
  apply();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useReducedMotionPreference(): boolean {
  return useSyncExternalStore(subscribe, isMotionReduced);
}
