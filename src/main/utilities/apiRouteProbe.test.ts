import { afterEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  results: new Map<string, { status: number; complete: boolean }>(),
}));

vi.mock("./payloadProbe", () => ({
  probePayload: async (url: string) => {
    const hit = [...hoisted.results].find(([base]) => url.startsWith(base));
    if (!hit) throw new Error("timeout of 10000ms exceeded");
    return { ...hit[1], received: 0, latencyMs: 1 };
  },
}));

import { BACKEND_URL, BACKEND_URL_DIRECT } from "@/shared/config";
import { getApiBaseUrl, resetApiHostState } from "./apiHost";
import { probeApiRoute } from "./apiRouteProbe";

afterEach(() => {
  hoisted.results.clear();
  resetApiHostState();
});

describe("probeApiRoute", () => {
  it("keeps the primary host when it delivers a full response", async () => {
    hoisted.results.set(BACKEND_URL, { status: 200, complete: true });

    expect(await probeApiRoute()).toBe("primary");
    expect(getApiBaseUrl()).toBe(BACKEND_URL);
  });

  it("moves to the direct route when the primary stalls mid-response", async () => {
    hoisted.results.set(BACKEND_URL, { status: 200, complete: false });
    hoisted.results.set(BACKEND_URL_DIRECT, { status: 200, complete: true });

    expect(await probeApiRoute()).toBe("direct");
    expect(getApiBaseUrl()).toBe(BACKEND_URL_DIRECT);
  });

  it("stays put when neither route works", async () => {
    expect(await probeApiRoute()).toBe("none");
    expect(getApiBaseUrl()).toBe(BACKEND_URL);
  });
});
