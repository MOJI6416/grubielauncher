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
