import { BACKEND_URL } from "@/shared/config";

let cachedBase = BACKEND_URL;
const listeners = new Set<(baseUrl: string) => void>();

function setBase(next: string): void {
  if (typeof next !== "string" || !next.startsWith("https://")) return;
  if (next === cachedBase) return;

  cachedBase = next;
  for (const listener of listeners) listener(next);
}

export function getApiBase(): string {
  return cachedBase;
}

export function subscribeApiBase(
  listener: (baseUrl: string) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function refreshApiBase(): Promise<string> {
  try {
    setBase(await window.api.backend.apiBaseUrl());
  } catch {
    // keep the last known base
  }

  return cachedBase;
}

export function watchApiBase(): () => void {
  void refreshApiBase();
  return window.api.backend.onApiBaseUrl(setBase);
}
