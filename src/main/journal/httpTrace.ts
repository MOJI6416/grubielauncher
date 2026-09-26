import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { journal } from "./journal";

type TracedConfig = InternalAxiosRequestConfig & { journalStartedAt?: number };

let installed = false;

export function describeRequestTarget(config: {
  baseURL?: string;
  url?: string;
  method?: string;
}): { method: string; target: string; hasQuery: boolean } {
  const method = (config.method ?? "get").toUpperCase();
  const url = config.url ?? "";
  const full = /^[a-z][a-z0-9+.-]*:\/\//i.test(url)
    ? url
    : `${config.baseURL ?? ""}${url}`;

  try {
    const parsed = new URL(full);
    return {
      method,
      target: `${parsed.host}${parsed.pathname}`,
      hasQuery: parsed.search.length > 1,
    };
  } catch {
    const index = full.indexOf("?");
    return {
      method,
      target: index === -1 ? full : full.slice(0, index),
      hasQuery: index !== -1,
    };
  }
}

function elapsed(config: TracedConfig | undefined): number {
  const startedAt = config?.journalStartedAt;
  return typeof startedAt === "number" ? Date.now() - startedAt : 0;
}

function contentLength(response: AxiosResponse): number | undefined {
  const raw = response.headers?.["content-length"];
  const value = typeof raw === "string" ? Number(raw) : raw;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function instrumentAxios(instance: AxiosInstance): void {
  instance.interceptors.request.use((config: TracedConfig) => {
    config.journalStartedAt = Date.now();
    return config;
  });

  instance.interceptors.response.use(
    (response) => {
      try {
        const config = response.config as TracedConfig;
        const { method, target, hasQuery } = describeRequestTarget(config);
        const streaming = config.responseType === "stream";
        journal.timed(
          streaming ? "debug" : "info",
          "http",
          `${method} ${target} → ${response.status}`,
          elapsed(config),
          {
            bytes: contentLength(response),
            query: hasQuery || undefined,
            stream: streaming || undefined,
          },
        );
      } catch {}
      return response;
    },
    (error) => {
      try {
        const config = error?.config as TracedConfig | undefined;
        const { method, target } = describeRequestTarget(config ?? {});

        if (axios.isCancel(error)) {
          journal.timed(
            "debug",
            "http",
            `${method} ${target} → cancelled`,
            elapsed(config),
          );
        } else {
          const status: number | undefined = error?.response?.status;
          journal.timed(
            status && status < 500 ? "warn" : "error",
            "http",
            `${method} ${target} → ${status ?? error?.code ?? "failed"}`,
            elapsed(config),
            {
              code: error?.code,
              message: error?.message,
              timeout: config?.timeout || undefined,
            },
          );
        }
      } catch {}
      return Promise.reject(error);
    },
  );
}

export function installHttpTrace(): void {
  if (installed) return;
  installed = true;

  instrumentAxios(axios);

  const create = axios.create.bind(axios);
  axios.create = ((config) => {
    const instance = create(config);
    instrumentAxios(instance);
    return instance;
  }) as typeof axios.create;
}
