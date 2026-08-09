import type { AxiosInstance } from "axios";
import { BACKEND_CANDIDATES, BACKEND_URL } from "@/shared/config";
import { isTransientNetworkFailure } from "@/shared/errors";

const PRIMARY_RETRY_AFTER_MS = 10 * 60 * 1000;

let activeBaseUrl: string = BACKEND_URL;
let primaryBlockedUntil = 0;
let onChange: ((baseUrl: string) => void) | null = null;

export function onApiBaseUrlChange(
  listener: ((baseUrl: string) => void) | null,
): void {
  onChange = listener;
}

function setActiveBaseUrl(next: string): void {
  if (next === activeBaseUrl) return;

  activeBaseUrl = next;
  onChange?.(next);
}

function isPrimaryBlocked(): boolean {
  if (primaryBlockedUntil === 0) return false;
  if (Date.now() >= primaryBlockedUntil) {
    primaryBlockedUntil = 0;
    setActiveBaseUrl(BACKEND_URL);
    return false;
  }
  return true;
}

export function getApiBaseUrl(): string {
  isPrimaryBlocked();
  return activeBaseUrl;
}

export function nextApiBaseUrl(failedBaseUrl: string): string | null {
  const candidates = BACKEND_CANDIDATES.filter((url) => url !== failedBaseUrl);
  return candidates[0] ?? null;
}

export function reportApiFailure(failedBaseUrl: string): void {
  if (failedBaseUrl !== BACKEND_URL) return;

  primaryBlockedUntil = Date.now() + PRIMARY_RETRY_AFTER_MS;
  const next = nextApiBaseUrl(failedBaseUrl);
  if (next) setActiveBaseUrl(next);
}

export function reportApiSuccess(baseUrl: string): void {
  if (baseUrl !== BACKEND_URL) return;

  primaryBlockedUntil = 0;
  setActiveBaseUrl(BACKEND_URL);
}

export function resetApiHostState(): void {
  activeBaseUrl = BACKEND_URL;
  primaryBlockedUntil = 0;
  onChange = null;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function apiBaseOf(url: string): string | null {
  const origin = originOf(url);
  if (!origin) return null;

  return (
    BACKEND_CANDIDATES.find((candidate) => originOf(candidate) === origin) ??
    null
  );
}

export function attachApiHostFallback(instance: AxiosInstance): AxiosInstance {
  instance.interceptors.request.use((config) => {
    if (!(config as { _hostRetry?: boolean })._hostRetry) {
      config.baseURL = getApiBaseUrl();
    }
    return config;
  });

  instance.interceptors.response.use(
    (response) => {
      const base =
        apiBaseOf(String(response.config?.url || "")) ??
        apiBaseOf(String(response.config?.baseURL || ""));
      if (base) reportApiSuccess(base);
      return response;
    },
    async (error) => {
      const config = (error as { config?: any })?.config;
      if (!config || config._hostRetry) return Promise.reject(error);
      if (!isTransientNetworkFailure(error)) return Promise.reject(error);

      const url = String(config.url || "");
      const failedBase =
        apiBaseOf(url) ?? apiBaseOf(String(config.baseURL || ""));
      const nextBase = failedBase ? nextApiBaseUrl(failedBase) : null;
      if (!failedBase || !nextBase) return Promise.reject(error);

      config._hostRetry = true;
      config.baseURL = nextBase;
      if (url.startsWith(failedBase)) {
        config.url = nextBase + url.slice(failedBase.length);
      }

      const response = await instance(config);
      reportApiFailure(failedBase);
      return response;
    },
  );

  return instance;
}
