import { describe, expect, it } from "vitest";
import { extractLauncherDeepLink, parseLauncherDeepLink } from "./deepLink";

describe("launcher deep links", () => {
  it("parses valid pack links", () => {
    expect(
      parseLauncherDeepLink(
        "grubielauncher://pack/507f1f77bcf86cd799439011",
      ),
    ).toEqual({
      type: "pack",
      shareCode: "507f1f77bcf86cd799439011",
    });
  });

  it("parses short pack codes", () => {
    expect(parseLauncherDeepLink("grubielauncher://pack/K7M2-QX9P")).toEqual({
      type: "pack",
      shareCode: "K7M2-QX9P",
    });
    expect(parseLauncherDeepLink("grubielauncher://pack/k7m2qx9p")).toEqual({
      type: "pack",
      shareCode: "k7m2qx9p",
    });
    expect(parseLauncherDeepLink("grubielauncher://pack/K0M2-QX1P")).toBeNull();
  });

  it("ignores invalid scheme, path and code", () => {
    expect(
      parseLauncherDeepLink("https://grubielauncher.com/pack/507f"),
    ).toBeNull();
    expect(
      parseLauncherDeepLink(
        "grubielauncher://user/507f1f77bcf86cd799439011",
      ),
    ).toBeNull();
    expect(parseLauncherDeepLink("grubielauncher://pack/bad-code")).toBeNull();
  });

  it("parses theme links and rejects anything but a gallery id", () => {
    expect(
      parseLauncherDeepLink("grubielauncher://theme/64f0000000000000000000aa"),
    ).toEqual({ type: "theme", id: "64f0000000000000000000aa" });
    expect(parseLauncherDeepLink("grubielauncher://theme/..%2F..%2Fetc")).toBeNull();
    expect(parseLauncherDeepLink("grubielauncher://theme/64F0000000000000000000AA")).toBeNull();
    expect(parseLauncherDeepLink("grubielauncher://theme/")).toBeNull();
  });

  it("parses friend links and rejects malformed ids", () => {
    expect(
      parseLauncherDeepLink(
        "grubielauncher://friend/507f1f77bcf86cd799439011",
      ),
    ).toEqual({
      type: "friend",
      userId: "507f1f77bcf86cd799439011",
    });
    expect(parseLauncherDeepLink("grubielauncher://friend/nick")).toBeNull();
    expect(parseLauncherDeepLink("grubielauncher://friend/")).toBeNull();
  });

  it("parses launch links with an instance", () => {
    expect(
      parseLauncherDeepLink("grubielauncher://launch/My%20Pack?instance=2"),
    ).toEqual({
      type: "launch",
      versionName: "My Pack",
      instance: 2,
    });
  });

  it("defaults the launch instance to 0", () => {
    expect(parseLauncherDeepLink("grubielauncher://launch/Vanilla")).toEqual({
      type: "launch",
      versionName: "Vanilla",
      instance: 0,
    });
    expect(
      parseLauncherDeepLink("grubielauncher://launch/Vanilla?instance=-1"),
    ).toEqual({
      type: "launch",
      versionName: "Vanilla",
      instance: 0,
    });
  });

  it("carries a quick play world or server from a shortcut", () => {
    expect(
      parseLauncherDeepLink(
        "grubielauncher://launch/Pack?instance=0&world=My%20World",
      ),
    ).toEqual({
      type: "launch",
      versionName: "Pack",
      instance: 0,
      world: "My World",
    });
    expect(
      parseLauncherDeepLink(
        "grubielauncher://launch/Pack?instance=0&server=mc.example.org%3A25566",
      ),
    ).toEqual({
      type: "launch",
      versionName: "Pack",
      instance: 0,
      server: "mc.example.org:25566",
    });
    expect(
      parseLauncherDeepLink(
        "grubielauncher://launch/Pack?world=--quickPlayMultiplayer",
      ),
    ).toEqual({ type: "launch", versionName: "Pack", instance: 0 });
  });

  it("keeps a well-formed signature only on server launch links", () => {
    const sig = "a".repeat(64);
    expect(
      parseLauncherDeepLink(
        `grubielauncher://launch/Pack?instance=0&server=mc.example.org&sig=${sig}`,
      ),
    ).toEqual({
      type: "launch",
      versionName: "Pack",
      instance: 0,
      server: "mc.example.org",
      signature: sig,
    });
    expect(
      parseLauncherDeepLink(
        "grubielauncher://launch/Pack?instance=0&server=mc.example.org&sig=bad",
      ),
    ).toEqual({
      type: "launch",
      versionName: "Pack",
      instance: 0,
      server: "mc.example.org",
    });
    expect(
      parseLauncherDeepLink(`grubielauncher://launch/Pack?instance=0&sig=${sig}`),
    ).toEqual({ type: "launch", versionName: "Pack", instance: 0 });
  });

  it("rejects launch links without a version name", () => {
    expect(parseLauncherDeepLink("grubielauncher://launch/")).toBeNull();
    expect(parseLauncherDeepLink("grubielauncher://launch")).toBeNull();
  });

  it("extracts a deep link from process argv", () => {
    expect(
      extractLauncherDeepLink([
        "Grubie Launcher.exe",
        "--flag",
        "grubielauncher://pack/507f1f77bcf86cd799439011",
      ]),
    ).toEqual({
      type: "pack",
      shareCode: "507f1f77bcf86cd799439011",
    });
  });
});
