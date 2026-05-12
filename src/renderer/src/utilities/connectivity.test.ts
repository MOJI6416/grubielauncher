import { describe, expect, it } from "vitest";

import {
  canLoadLoaderData,
  canLoadSkinPreviewForProvider,
  canOpenSkinManagerForAccount,
  canUseBackendFeature,
  canUseInternetFeature,
  getConnectivityProblems,
  getUnavailableConnectivityProblem,
} from "./connectivity";

describe("connectivity helpers", () => {
  const online = { isInternetOnline: true, isBackendOnline: true };
  const backendOffline = { isInternetOnline: true, isBackendOnline: false };
  const internetOffline = { isInternetOnline: false, isBackendOnline: false };

  it("does not treat backend outage as internet outage", () => {
    expect(canUseInternetFeature(backendOffline)).toBe(true);
    expect(canUseBackendFeature(backendOffline)).toBe(false);
    expect(getConnectivityProblems(backendOffline)).toEqual(["backend"]);
  });

  it("blocks internet-required flows when internet is offline", () => {
    expect(canUseInternetFeature(internetOffline)).toBe(false);
    expect(canLoadLoaderData("fabric", internetOffline)).toBe(false);
    expect(canOpenSkinManagerForAccount("elyby", internetOffline)).toBe(false);
    expect(getUnavailableConnectivityProblem(false, internetOffline)).toBe(
      "internet",
    );
  });

  it("blocks backend-required flows when backend is offline", () => {
    expect(canUseBackendFeature(backendOffline)).toBe(false);
    expect(canOpenSkinManagerForAccount("discord", backendOffline)).toBe(false);
    expect(canLoadSkinPreviewForProvider("discord", backendOffline)).toBe(
      false,
    );
    expect(canLoadLoaderData("forge", backendOffline)).toBe(false);
    expect(canLoadLoaderData("neoforge", backendOffline)).toBe(false);
    expect(getUnavailableConnectivityProblem(true, backendOffline)).toBe(
      "backend",
    );
  });

  it("keeps internet-only loader/provider flows available when backend is offline", () => {
    expect(canLoadLoaderData("vanilla", backendOffline)).toBe(true);
    expect(canLoadLoaderData("fabric", backendOffline)).toBe(true);
    expect(canLoadLoaderData("quilt", backendOffline)).toBe(true);
    expect(canLoadSkinPreviewForProvider("microsoft", backendOffline)).toBe(
      true,
    );
    expect(canOpenSkinManagerForAccount("elyby", backendOffline)).toBe(true);
  });

  it("shows navbar indicators only for degraded connectivity", () => {
    expect(getConnectivityProblems(online)).toEqual([]);
    expect(getConnectivityProblems(backendOffline)).toEqual(["backend"]);
    expect(getConnectivityProblems(internetOffline)).toEqual([
      "internet",
      "backend",
    ]);
  });
});
