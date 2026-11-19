import { describe, expect, it } from "vitest";
import {
  downloadReasonFor,
  isModrinthCdnUrl,
  modrinthLoaderTag,
  modrinthMetaHeader,
} from "./modrinthDownloadMeta";

describe("modrinth download meta", () => {
  it("only tags Modrinth file requests", () => {
    expect(isModrinthCdnUrl("https://cdn.modrinth.com/data/AANobbMI/versions/x/a.jar")).toBe(true);
    expect(isModrinthCdnUrl("https://mirror.grubielauncher.com/modrinth/data/a.jar")).toBe(true);
    expect(isModrinthCdnUrl("https://direct-mirror.grubielauncher.com/modrinth/data/a.jar")).toBe(true);
    expect(isModrinthCdnUrl("https://mirror.grubielauncher.com/forgecdn/files/1/2/a.jar")).toBe(false);
    expect(isModrinthCdnUrl("https://edge.forgecdn.net/files/1/2/a.jar")).toBe(false);
    expect(isModrinthCdnUrl("http://cdn.modrinth.com/data/a.jar")).toBe(false);
    expect(isModrinthCdnUrl("file:///C:/a.jar")).toBe(false);
  });

  it("writes the header Modrinth documents", () => {
    expect(
      modrinthMetaHeader({ reason: "update", gameVersion: "1.21.1", loader: "fabric" }),
    ).toBe('{"reason":"update","game_version":"1.21.1","loader":"fabric"}');
    expect(modrinthMetaHeader({ reason: "standalone", loader: "a b" })).toBe(
      '{"reason":"standalone"}',
    );
  });

  it("names the loader the way the file was published", () => {
    expect(modrinthLoaderTag("fabric", "mod")).toBe("fabric");
    expect(modrinthLoaderTag("vanilla", "mod")).toBeUndefined();
    expect(modrinthLoaderTag("fabric", "resourcepack")).toBe("minecraft");
    expect(modrinthLoaderTag("fabric", "shader")).toBeUndefined();
  });

  it("calls a modpack install a modpack download", () => {
    expect(downloadReasonFor({ operation: "install", fromModpack: true })).toBe("modpack");
    expect(downloadReasonFor({ operation: "install", fromModpack: false })).toBe("standalone");
    expect(
      downloadReasonFor({ explicit: "update", operation: "install", fromModpack: true }),
    ).toBe("update");
    expect(downloadReasonFor({ operation: "content", fromModpack: true })).toBe("standalone");
  });
});
