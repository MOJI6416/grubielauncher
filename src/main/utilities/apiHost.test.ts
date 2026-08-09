import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios, { type AxiosAdapter } from "axios";
import { BACKEND_URL, BACKEND_URL_DIRECT } from "@/shared/config";
import { isTransientNetworkFailure } from "@/shared/errors";
import {
  apiBaseOf,
  attachApiHostFallback,
  getApiBaseUrl,
  nextApiBaseUrl,
  onApiBaseUrlChange,
  reportApiFailure,
  reportApiSuccess,
  resetApiHostState,
} from "./apiHost";

describe("apiHost", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetApiHostState();
  });

  it("starts on the primary host", () => {
    expect(getApiBaseUrl()).toBe(BACKEND_URL);
  });

  it("moves to the direct host once the primary drops a connection", () => {
    reportApiFailure(BACKEND_URL);

    expect(getApiBaseUrl()).toBe(BACKEND_URL_DIRECT);
  });

  it("comes back to the primary after the cooldown, without being told to", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T00:00:00Z"));

    reportApiFailure(BACKEND_URL);
    expect(getApiBaseUrl()).toBe(BACKEND_URL_DIRECT);

    vi.setSystemTime(new Date("2026-08-09T00:09:59Z"));
    expect(getApiBaseUrl()).toBe(BACKEND_URL_DIRECT);

    vi.setSystemTime(new Date("2026-08-09T00:10:01Z"));
    expect(getApiBaseUrl()).toBe(BACKEND_URL);
  });

  it("returns to the primary the moment it answers again", () => {
    reportApiFailure(BACKEND_URL);
    expect(getApiBaseUrl()).toBe(BACKEND_URL_DIRECT);

    reportApiSuccess(BACKEND_URL);
    expect(getApiBaseUrl()).toBe(BACKEND_URL);
  });

  it("does not let the fallback failing push anyone off the primary", () => {
    reportApiFailure(BACKEND_URL_DIRECT);

    expect(getApiBaseUrl()).toBe(BACKEND_URL);
  });

  it("does not let the fallback succeeding declare the primary healthy", () => {
    reportApiFailure(BACKEND_URL);
    reportApiSuccess(BACKEND_URL_DIRECT);

    expect(getApiBaseUrl()).toBe(BACKEND_URL_DIRECT);
  });

  it("hands back the other candidate, and the primary for a stranger", () => {
    expect(nextApiBaseUrl(BACKEND_URL)).toBe(BACKEND_URL_DIRECT);
    expect(nextApiBaseUrl(BACKEND_URL_DIRECT)).toBe(BACKEND_URL);
    expect(nextApiBaseUrl("https://evil.example.com")).toBe(BACKEND_URL);
  });

  it("recognises our hosts by origin and refuses everything else", () => {
    expect(apiBaseOf(`${BACKEND_URL}/modpacks`)).toBe(BACKEND_URL);
    expect(apiBaseOf(`${BACKEND_URL_DIRECT}/health`)).toBe(BACKEND_URL_DIRECT);
    expect(apiBaseOf("https://api.grubielauncher.com.evil.com/x")).toBeNull();
    expect(apiBaseOf("https://cdn.grubielauncher.com/x")).toBeNull();
    expect(apiBaseOf("/modpacks")).toBeNull();
    expect(apiBaseOf("")).toBeNull();
  });
});

describe("attachApiHostFallback", () => {
  const hits: string[] = [];

  beforeEach(() => {
    hits.length = 0;
    resetApiHostState();
  });

  function client(deadBase?: string) {
    const adapter: AxiosAdapter = async (config) => {
      const url = String(config.url || "");
      const target = new URL(
        url.startsWith("http") ? url : String(config.baseURL) + url,
      );
      hits.push(target.origin + target.pathname);

      if (target.origin === deadBase) {
        const error = new Error("timeout of 30000ms exceeded") as Error & {
          code: string;
          isAxiosError: boolean;
          config: unknown;
        };
        error.code = "ECONNABORTED";
        error.isAxiosError = true;
        error.config = config;
        throw error;
      }

      return {
        data: { ok: true },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      } as never;
    };

    return attachApiHostFallback(axios.create({ timeout: 400, adapter }));
  }

  it("moves an absolute-url call to the direct host when the primary hangs", async () => {
    const response = await client(BACKEND_URL).get(
      `${BACKEND_URL}/loaders/forge.json`,
    );

    expect(response.status).toBe(200);
    expect(hits).toEqual([
      `${BACKEND_URL}/loaders/forge.json`,
      `${BACKEND_URL_DIRECT}/loaders/forge.json`,
    ]);
    expect(getApiBaseUrl()).toBe(BACKEND_URL_DIRECT);
  });

  it("moves a relative-url call too, the shape CurseForge and Auth send", async () => {
    const response = await client(BACKEND_URL).get("/curseforge/categories/6");

    expect(response.status).toBe(200);
    expect(hits).toEqual([
      `${BACKEND_URL}/curseforge/categories/6`,
      `${BACKEND_URL_DIRECT}/curseforge/categories/6`,
    ]);
  });

  it("retries exactly once when both hosts are gone", async () => {
    const api = client("https://nothing.example.com");
    api.defaults.adapter = async (config) => {
      hits.push(String(config.baseURL) + String(config.url));
      const error = new Error("socket hang up") as Error & {
        code: string;
        isAxiosError: boolean;
        config: unknown;
      };
      error.code = "ECONNRESET";
      error.isAxiosError = true;
      error.config = config;
      throw error;
    };

    await expect(api.get(`${BACKEND_URL}/x`)).rejects.toBeTruthy();
    expect(hits).toHaveLength(2);
  });

  it("moves an absolute-url call back off a direct host that stops answering", async () => {
    await client(BACKEND_URL).get(`${BACKEND_URL}/loaders/forge.json`);
    expect(getApiBaseUrl()).toBe(BACKEND_URL_DIRECT);

    hits.length = 0;
    const response = await client(BACKEND_URL_DIRECT).get(
      `${getApiBaseUrl()}/loaders/forge.json`,
    );

    expect(response.status).toBe(200);
    expect(hits).toEqual([
      `${BACKEND_URL_DIRECT}/loaders/forge.json`,
      `${BACKEND_URL}/loaders/forge.json`,
    ]);
  });

  it("moves a relative-url call back off a direct host that stops answering", async () => {
    await client(BACKEND_URL).get(`${BACKEND_URL}/loaders/forge.json`);
    expect(getApiBaseUrl()).toBe(BACKEND_URL_DIRECT);

    hits.length = 0;
    const response = await client(BACKEND_URL_DIRECT).get(
      "/curseforge/categories/6",
    );

    expect(response.status).toBe(200);
    expect(hits).toEqual([
      `${BACKEND_URL_DIRECT}/curseforge/categories/6`,
      `${BACKEND_URL}/curseforge/categories/6`,
    ]);
  });

  it("returns to the primary the moment a call reaches it again", async () => {
    await client(BACKEND_URL).get(`${BACKEND_URL}/loaders/forge.json`);
    expect(getApiBaseUrl()).toBe(BACKEND_URL_DIRECT);

    await client(BACKEND_URL_DIRECT).get(`${getApiBaseUrl()}/loaders/forge.json`);

    expect(getApiBaseUrl()).toBe(BACKEND_URL);
  });

  it("leaves a host alone when the server itself answered", async () => {
    const api = client("https://nothing.example.com");
    api.defaults.adapter = async (config) => {
      hits.push(String(config.url));
      const error = new Error("Request failed with status code 503") as Error & {
        isAxiosError: boolean;
        config: unknown;
        response: { status: number };
      };
      error.isAxiosError = true;
      error.config = config;
      error.response = { status: 503 };
      throw error;
    };

    await expect(api.get(`${BACKEND_URL}/x`)).rejects.toBeTruthy();
    expect(hits).toHaveLength(1);
    expect(getApiBaseUrl()).toBe(BACKEND_URL);
  });

  it("treats every shape of 'the host never answered' as worth the other host", () => {
    expect(isTransientNetworkFailure({ code: "ETIMEDOUT" })).toBe(true);
    expect(isTransientNetworkFailure({ code: "ECONNRESET" })).toBe(true);
    expect(isTransientNetworkFailure({ code: "ECONNREFUSED" })).toBe(true);
    expect(isTransientNetworkFailure({ code: "ENOTFOUND" })).toBe(true);
    expect(isTransientNetworkFailure({ code: "EAI_AGAIN" })).toBe(true);
    expect(
      isTransientNetworkFailure({ code: "ECONNREFUSED", response: { status: 502 } }),
    ).toBe(false);
  });
});

describe("apiHost notifications", () => {
  const seen: string[] = [];

  beforeEach(() => {
    vi.useRealTimers();
    resetApiHostState();
    seen.length = 0;
    onApiBaseUrlChange((base) => seen.push(base));
  });

  afterEach(() => {
    onApiBaseUrlChange(null);
    resetApiHostState();
  });

  it("says nothing when the host does not actually change", () => {
    reportApiSuccess(BACKEND_URL);
    reportApiSuccess(BACKEND_URL);
    reportApiFailure(BACKEND_URL_DIRECT);

    expect(seen).toEqual([]);
  });

  it("announces one change however many callers report the same failure", () => {
    reportApiFailure(BACKEND_URL);
    reportApiFailure(BACKEND_URL);
    reportApiFailure(BACKEND_URL);

    expect(seen).toEqual([BACKEND_URL_DIRECT]);
  });

  it("announces one change for a burst of parallel requests failing at once", async () => {
    const adapter: AxiosAdapter = async (config) => {
      const url = String(config.url || "");
      const target = new URL(
        url.startsWith("http") ? url : String(config.baseURL) + url,
      );
      if (target.origin === BACKEND_URL) {
        const error = new Error("socket hang up") as Error & {
          code: string;
          isAxiosError: boolean;
          config: unknown;
        };
        error.code = "ECONNRESET";
        error.isAxiosError = true;
        error.config = config;
        throw error;
      }
      return {
        data: {},
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      } as never;
    };
    const api = attachApiHostFallback(axios.create({ adapter }));

    await Promise.all(
      Array.from({ length: 12 }, (_, i) => api.get(`${BACKEND_URL}/x/${i}`)),
    );

    expect(getApiBaseUrl()).toBe(BACKEND_URL_DIRECT);
    expect(seen).toEqual([BACKEND_URL_DIRECT]);
  });

  it("announces the way back, once, when the cooldown expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T00:00:00Z"));

    reportApiFailure(BACKEND_URL);
    expect(seen).toEqual([BACKEND_URL_DIRECT]);

    vi.setSystemTime(new Date("2026-08-09T00:10:01Z"));
    getApiBaseUrl();
    getApiBaseUrl();
    getApiBaseUrl();

    expect(seen).toEqual([BACKEND_URL_DIRECT, BACKEND_URL]);
  });

  it("announces the way back when a call reaches the primary again", () => {
    reportApiFailure(BACKEND_URL);
    reportApiSuccess(BACKEND_URL);
    reportApiSuccess(BACKEND_URL);

    expect(seen).toEqual([BACKEND_URL_DIRECT, BACKEND_URL]);
  });

  it("keeps a flapping primary from announcing more often than it flaps", () => {
    reportApiFailure(BACKEND_URL);
    reportApiSuccess(BACKEND_URL);
    reportApiFailure(BACKEND_URL);
    reportApiSuccess(BACKEND_URL);

    expect(seen).toEqual([
      BACKEND_URL_DIRECT,
      BACKEND_URL,
      BACKEND_URL_DIRECT,
      BACKEND_URL,
    ]);
  });
});

describe("a machine that is offline entirely", () => {
  beforeEach(() => resetApiHostState());

  function deadEverything(code: string) {
    const hits: string[] = [];
    const adapter: AxiosAdapter = async (config) => {
      const url = String(config.url || "");
      const target = new URL(
        url.startsWith("http") ? url : String(config.baseURL) + url,
      );
      hits.push(target.origin);
      const error = new Error(`getaddrinfo ${code} api.grubielauncher.com`) as Error & {
        code: string;
        isAxiosError: boolean;
        config: unknown;
      };
      error.code = code;
      error.isAxiosError = true;
      error.config = config;
      throw error;
    };
    return { api: attachApiHostFallback(axios.create({ adapter })), hits };
  }

  it("still costs exactly one extra attempt, never a loop", async () => {
    const { api, hits } = deadEverything("EAI_AGAIN");

    await expect(api.get(`${BACKEND_URL}/loaders/forge.json`)).rejects.toBeTruthy();

    expect(hits).toEqual([BACKEND_URL, BACKEND_URL_DIRECT]);
  });

  it("does not pin the whole session to the direct host on a dead network", async () => {
    const { api } = deadEverything("ENOTFOUND");

    await expect(api.get(`${BACKEND_URL}/loaders/forge.json`)).rejects.toBeTruthy();

    expect(getApiBaseUrl()).toBe(BACKEND_URL);
  });
});
