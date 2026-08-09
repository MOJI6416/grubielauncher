import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKEND_URL, BACKEND_URL_DIRECT } from "@/shared/config";

let pushListener: ((baseUrl: string) => void) | null = null;
let offCalls = 0;
let resolveBase: () => string = () => BACKEND_URL;

vi.stubGlobal("window", {
  api: {
    backend: {
      apiBaseUrl: async () => resolveBase(),
      onApiBaseUrl: (cb: (baseUrl: string) => void) => {
        pushListener = cb;
        return () => {
          offCalls += 1;
          pushListener = null;
        };
      },
    },
  },
});

const { getApiBase, subscribeApiBase, refreshApiBase, watchApiBase } =
  await import("./apiBase");

let stopWatching: (() => void) | null = null;

beforeEach(async () => {
  offCalls = 0;
  resolveBase = () => BACKEND_URL;
  stopWatching = watchApiBase();
  await refreshApiBase();
});

afterEach(() => {
  stopWatching?.();
  stopWatching = null;
});

describe("renderer apiBase", () => {
  it("tells a subscriber only when the host really changed", async () => {
    const seen: string[] = [];
    const stop = subscribeApiBase((base) => seen.push(base));

    expect(pushListener).not.toBeNull();

    pushListener?.(BACKEND_URL);
    await refreshApiBase();

    expect(seen).toEqual([]);

    pushListener?.(BACKEND_URL_DIRECT);
    pushListener?.(BACKEND_URL_DIRECT);
    pushListener?.(BACKEND_URL_DIRECT);

    expect(seen).toEqual([BACKEND_URL_DIRECT]);
    expect(getApiBase()).toBe(BACKEND_URL_DIRECT);

    stop();
  });

  it("refuses a value that is not one of our https bases", () => {
    const seen: string[] = [];
    const stop = subscribeApiBase((base) => seen.push(base));

    pushListener?.("http://evil.example.com");
    pushListener?.(undefined as unknown as string);
    pushListener?.("" as unknown as string);

    expect(seen).toEqual([]);
    expect(getApiBase()).toBe(BACKEND_URL);

    stop();
  });

  it("stops listening on both channels when the watcher is torn down", () => {
    const seen: string[] = [];
    const stop = subscribeApiBase((base) => seen.push(base));

    stop();
    stopWatching?.();
    stopWatching = null;

    expect(offCalls).toBe(1);
    expect(pushListener).toBeNull();
    expect(seen).toEqual([]);
  });

  it("keeps the pushed value when a later pull rejects", async () => {
    pushListener?.(BACKEND_URL_DIRECT);
    expect(getApiBase()).toBe(BACKEND_URL_DIRECT);

    resolveBase = () => {
      throw new Error("ipc gone");
    };
    await refreshApiBase();

    expect(getApiBase()).toBe(BACKEND_URL_DIRECT);
  });

  it("lets a stale pull overwrite a newer pushed value", async () => {
    pushListener?.(BACKEND_URL_DIRECT);
    expect(getApiBase()).toBe(BACKEND_URL_DIRECT);

    resolveBase = () => BACKEND_URL;
    await refreshApiBase();

    expect(getApiBase()).toBe(BACKEND_URL);
  });
});
