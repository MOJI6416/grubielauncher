import { describe, expect, it } from "vitest";
import { buildQuickPlayArguments } from "./quickPlayArgs";

const base = {
  supportsSingleplayer: true,
  supportsMultiplayer: true,
  isLegacyManifest: false,
};

describe("buildQuickPlayArguments", () => {
  it("joins a world when a world is requested", () => {
    expect(
      buildQuickPlayArguments({ ...base, quickSingle: "New World" }),
    ).toEqual(["--quickPlaySingleplayer", "New World"]);
  });

  it("never mixes a world with the instance quick server", () => {
    expect(
      buildQuickPlayArguments({
        ...base,
        quickSingle: "New World",
        savedServer: "neiromine.com",
      }),
    ).toEqual(["--quickPlaySingleplayer", "New World"]);
  });

  it("never mixes a world with an explicit server", () => {
    expect(
      buildQuickPlayArguments({
        ...base,
        quickSingle: "New World",
        quickMultiplayer: "play.example.com",
      }),
    ).toEqual(["--quickPlaySingleplayer", "New World"]);
  });

  it("stays out of the way when the version cannot join a world", () => {
    expect(
      buildQuickPlayArguments({
        ...base,
        supportsSingleplayer: false,
        quickSingle: "New World",
        savedServer: "neiromine.com",
      }),
    ).toEqual([]);
  });

  it("prefers the explicit server over the saved one", () => {
    expect(
      buildQuickPlayArguments({
        ...base,
        quickMultiplayer: "play.example.com",
        savedServer: "neiromine.com",
      }),
    ).toEqual(["--quickPlayMultiplayer", "play.example.com"]);
  });

  it("falls back to the saved quick server", () => {
    expect(
      buildQuickPlayArguments({ ...base, savedServer: "neiromine.com" }),
    ).toEqual(["--quickPlayMultiplayer", "neiromine.com"]);
  });

  it("uses the legacy pair when quick play is unavailable", () => {
    expect(
      buildQuickPlayArguments({
        ...base,
        supportsMultiplayer: false,
        savedServer: "neiromine.com",
      }),
    ).toEqual(["--server", "neiromine.com", "--port", "25565"]);
  });

  it("keeps an explicit port in the legacy pair", () => {
    expect(
      buildQuickPlayArguments({
        ...base,
        supportsMultiplayer: false,
        savedServer: "mojisq.earth.pp.ua:25577",
      }),
    ).toEqual(["--server", "mojisq.earth.pp.ua", "--port", "25577"]);
  });

  it("passes an ipv6 literal through untouched", () => {
    expect(
      buildQuickPlayArguments({
        ...base,
        supportsMultiplayer: false,
        savedServer: "[::1]:25566",
      }),
    ).toEqual(["--server", "[::1]", "--port", "25566"]);
  });

  it("adds nothing at all on alpha and beta manifests", () => {
    expect(
      buildQuickPlayArguments({
        ...base,
        supportsMultiplayer: false,
        isLegacyManifest: true,
        savedServer: "neiromine.com",
      }),
    ).toEqual([]);
  });

  it("adds nothing when there is no target", () => {
    expect(buildQuickPlayArguments(base)).toEqual([]);
  });
});
