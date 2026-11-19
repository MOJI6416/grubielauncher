import { describe, expect, it } from "vitest";
import {
  cleanroomInstallerUrl,
  cleanroomInstallerVersion,
  contentLoaderOf,
  isCleanroomComponent,
  isSupportedCleanroomVersion,
  listCleanroomVersions,
} from "./cleanroom";

const METADATA = `<?xml version="1.0" encoding="UTF-8"?>
<metadata>
  <groupId>com.cleanroommc</groupId>
  <artifactId>cleanroom</artifactId>
  <versioning>
    <latest>0.7.14-alpha</latest>
    <versions>
      <version>0.2.0-alpha</version>
      <version>0.4.0</version>
      <version>0.7.9-alpha</version>
      <version>0.7.14-alpha</version>
      <version>0.7.0-alpha</version>
      <version>0.6.13-alpha</version>
      <version>0.7.14-alpha</version>
    </versions>
  </versioning>
</metadata>`;

describe("listCleanroomVersions", () => {
  it("offers 0.7 and newer, newest first, without duplicates", () => {
    expect(listCleanroomVersions(METADATA).map((version) => version.id)).toEqual([
      "0.7.14-alpha",
      "0.7.9-alpha",
      "0.7.0-alpha",
    ]);
  });

  it("points every version at its installer on the Cleanroom maven", () => {
    expect(listCleanroomVersions(METADATA)[0].url).toBe(
      "https://maven.cleanroommc.com/com/cleanroommc/cleanroom/0.7.14-alpha/cleanroom-0.7.14-alpha-installer.jar",
    );
  });

  it("returns nothing for a broken answer", () => {
    expect(listCleanroomVersions(undefined)).toEqual([]);
    expect(listCleanroomVersions("<html>")).toEqual([]);
  });
});

describe("cleanroomInstallerVersion", () => {
  it("accepts only the installer url of the same version", () => {
    expect(cleanroomInstallerVersion(cleanroomInstallerUrl("0.7.14-alpha"))).toBe(
      "0.7.14-alpha",
    );
    expect(
      cleanroomInstallerVersion(
        "https://maven.cleanroommc.com/com/cleanroommc/cleanroom/0.7.14-alpha/cleanroom-0.7.13-alpha-installer.jar",
      ),
    ).toBeNull();
    expect(
      cleanroomInstallerVersion(
        "https://evil.example/com/cleanroommc/cleanroom/0.7.14-alpha/cleanroom-0.7.14-alpha-installer.jar",
      ),
    ).toBeNull();
  });
});

describe("isSupportedCleanroomVersion", () => {
  it("leaves out the old installer format", () => {
    expect(isSupportedCleanroomVersion("0.7.0-alpha")).toBe(true);
    expect(isSupportedCleanroomVersion("1.0.0")).toBe(true);
    expect(isSupportedCleanroomVersion("0.6.13-alpha")).toBe(false);
    expect(isSupportedCleanroomVersion("latest")).toBe(false);
  });
});

describe("isCleanroomComponent", () => {
  it("recognises the Cleanroom MMC pack that poses as Forge", () => {
    expect(
      isCleanroomComponent({ uid: "net.minecraftforge", version: "0.7.14-alpha" }),
    ).toBe(true);
    expect(
      isCleanroomComponent(
        { uid: "net.minecraftforge", version: "custom" },
        '{"mainClass":"top.outlands.foundation.boot.Foundation"}',
      ),
    ).toBe(true);
    expect(isCleanroomComponent({ uid: "com.cleanroommc", version: "0.3.0" })).toBe(true);
  });

  it("leaves real Forge alone", () => {
    expect(
      isCleanroomComponent({ uid: "net.minecraftforge", version: "14.23.5.2860" }),
    ).toBe(false);
    expect(isCleanroomComponent({ uid: "net.fabricmc.fabric-loader", version: "0.1.0" })).toBe(
      false,
    );
  });
});

describe("contentLoaderOf", () => {
  it("browses Forge mods for Cleanroom instances", () => {
    expect(contentLoaderOf("cleanroom")).toBe("forge");
    expect(contentLoaderOf("fabric")).toBe("fabric");
    expect(contentLoaderOf(undefined)).toBeUndefined();
  });
});
