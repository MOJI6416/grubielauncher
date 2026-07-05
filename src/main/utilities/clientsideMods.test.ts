import { describe, expect, it } from "vitest";
import { isClientsideFilename } from "./clientsideMods";

describe("isClientsideFilename", () => {
  const clientside = ["3dskinlayers-", "particleeffects-", "oculus-", "sodium-"];

  it("matches file names that start with a client fragment", () => {
    expect(
      isClientsideFilename(
        "3dskinlayers-fabric-1.6.4-mc1.20.jar",
        clientside,
        [],
      ),
    ).toBe(true);
    expect(
      isClientsideFilename("Oculus-mc1.20.1-1.8.0.jar", clientside, []),
    ).toBe(true);
    expect(
      isClientsideFilename("ParticleEffects-1.0.3+1.20.1.jar", clientside, []),
    ).toBe(true);
  });

  it("does not match when the fragment is not at the start", () => {
    expect(
      isClientsideFilename("addon-for-oculus-1.0.jar", clientside, []),
    ).toBe(false);
  });

  it("does not match unrelated server mods", () => {
    expect(isClientsideFilename("create-1.20.1-0.5.1.jar", clientside, [])).toBe(
      false,
    );
    expect(isClientsideFilename("jei-1.20.1-forge.jar", clientside, [])).toBe(
      false,
    );
  });

  it("keeps whitelisted mods even if they match the client list", () => {
    const file = "appleskin-forge-mc1.20.1-2.5.1.jar";
    expect(isClientsideFilename(file, ["appleskin-"], [])).toBe(true);
    expect(isClientsideFilename(file, ["appleskin-"], ["appleskin-"])).toBe(
      false,
    );
  });

  it("does not match with empty lists", () => {
    expect(isClientsideFilename("oculus-1.0.jar", [], [])).toBe(false);
  });

  it("strips leading bracket tags added by Chinese modpacks", () => {
    expect(
      isClientsideFilename(
        "[钠／Embeddium：附属] sodium-forge-1.0.7-1.20.1.jar",
        clientside,
        [],
      ),
    ).toBe(true);
    expect(
      isClientsideFilename("【拼音搜索】oculus-mc1.20.1-1.8.0.jar", clientside, []),
    ).toBe(true);
  });

  it("still respects the whitelist under a bracket tag", () => {
    expect(
      isClientsideFilename("[附属] sodium-extra.jar", clientside, ["sodium-"]),
    ).toBe(false);
  });
});
