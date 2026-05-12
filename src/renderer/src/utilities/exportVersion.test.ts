import { describe, expect, it } from "vitest";
import {
  EXPORT_EXCLUDED_TOP_LEVEL,
  getLocalPathFromFileUrl,
  sanitizeExportVersion,
} from "./exportVersion";
import { ProjectType, Provider } from "@/types/ModManager";

describe("export version helpers", () => {
  it("decodes local file URLs used by logos and local files", () => {
    expect(
      getLocalPathFromFileUrl("file:///C:/Users/Test/logo%20one.png?t=1"),
    ).toBe("C:/Users/Test/logo one.png");
    expect(getLocalPathFromFileUrl("https://example/logo.png")).toBe("");
  });

  it("removes account/share-only fields and local file paths from exported config", () => {
    const version = {
      name: "Shared Pack",
      owner: "discord_owner",
      shareCode: "share-code",
      downloadedVersion: true,
      image: "file:///C:/logo.png",
      loader: {
        name: "fabric",
        mods: [
          {
            id: "local-mod",
            title: "Local Mod",
            description: "",
            projectType: ProjectType.MOD,
            iconUrl: null,
            url: "",
            provider: Provider.LOCAL,
            version: {
              id: "v1",
              dependencies: [],
              files: [
                {
                  filename: "local.jar",
                  size: 1,
                  sha1: "sha1",
                  url: "file:///C:/Mods/local.jar",
                  localPath: "C:/Mods/local.jar",
                  isServer: false,
                },
              ],
            },
          },
        ],
      },
    } as any;

    const exported = sanitizeExportVersion(version);

    expect(exported.owner).toBeUndefined();
    expect(exported.shareCode).toBeUndefined();
    expect(exported.downloadedVersion).toBe(false);
    expect(exported.loader.mods[0].version?.files[0]).toMatchObject({
      filename: "local.jar",
      url: "",
    });
    expect(exported.loader.mods[0].version?.files[0].localPath).toBeUndefined();
  });

  it("keeps transient top-level folders out of export", () => {
    expect(EXPORT_EXCLUDED_TOP_LEVEL.has("logs")).toBe(true);
    expect(EXPORT_EXCLUDED_TOP_LEVEL.has("crash-reports")).toBe(true);
    expect(EXPORT_EXCLUDED_TOP_LEVEL.has("version.json")).toBe(false);
  });
});
