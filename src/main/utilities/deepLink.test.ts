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
