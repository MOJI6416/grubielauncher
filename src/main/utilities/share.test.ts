import { describe, expect, it } from "vitest";
import {
  getRemoteModpackId,
  shouldUploadLocalShareFile,
} from "./share";

describe("share upload helpers", () => {
  it("extracts modpack id from public storage URLs", () => {
    expect(
      getRemoteModpackId(
        "https://cdn.grubielauncher.com/modpacks/old-pack/shaderpacks/file.zip",
      ),
    ).toBe("old-pack");
    expect(
      getRemoteModpackId(
        "https://cdn.example.com/storage/modpacks/current-pack/mods/mod.jar?v=1",
      ),
    ).toBe("current-pack");
  });

  it("reuploads local files that point to another shared pack prefix", () => {
    expect(
      shouldUploadLocalShareFile(
        {
          filename: "shader.txt",
          url: "https://cdn.grubielauncher.com/modpacks/old-pack/shaderpacks/shader.txt",
          sha1: "",
          size: 0,
          isServer: false,
        },
        "current-pack",
      ),
    ).toBe(true);
  });

  it("does not reupload local files already stored under the current shared pack", () => {
    expect(
      shouldUploadLocalShareFile(
        {
          filename: "shader.txt",
          url: "https://cdn.grubielauncher.com/modpacks/current-pack/shaderpacks/shader.txt",
          sha1: "",
          size: 0,
          isServer: false,
        },
        "current-pack",
      ),
    ).toBe(false);
  });

  it("keeps file and blocked URLs uploadable", () => {
    expect(
      shouldUploadLocalShareFile(
        {
          filename: "local.jar",
          url: "file:///C:/pack/mods/local.jar",
          sha1: "",
          size: 0,
          isServer: false,
        },
        "current-pack",
      ),
    ).toBe(true);
    expect(
      shouldUploadLocalShareFile(
        {
          filename: "blocked.jar",
          url: "blocked::https://www.curseforge.com/file",
          sha1: "",
          size: 0,
          isServer: false,
        },
        "current-pack",
      ),
    ).toBe(true);
  });

  it("does not reupload unknown remote URLs without a modpack prefix", () => {
    expect(
      shouldUploadLocalShareFile(
        {
          filename: "remote.jar",
          url: "https://example.com/files/remote.jar",
          sha1: "",
          size: 0,
          isServer: false,
        },
        "current-pack",
      ),
    ).toBe(false);
  });
});
