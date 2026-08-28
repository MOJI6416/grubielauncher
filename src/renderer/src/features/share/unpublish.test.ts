import { describe, expect, it } from "vitest";
import type { IVersionConf } from "@/types/IVersion";
import { applyUnpublish, unpublishedImage } from "./unpublish";

function conf(overrides: Partial<IVersionConf> = {}): IVersionConf {
  return {
    name: "Pack",
    loader: { name: "fabric", mods: [], version: "0.16.0" },
    version: { id: "1.21", type: "release", url: "", serverManager: false },
    build: 3,
    shareCode: "507f1f77bcf86cd799439011",
    downloadedVersion: false,
    lastUpdate: new Date("2026-01-01T00:00:00.000Z"),
    runArguments: { game: "", jvm: "" },
    image: "",
    ...overrides,
  } as IVersionConf;
}

describe("unpublishedImage", () => {
  it("drops the logo uploaded to the deleted modpack", () => {
    expect(
      unpublishedImage(
        "https://cdn.example.com/modpacks/507f1f77bcf86cd799439011/logo.png",
        "507f1f77bcf86cd799439011",
      ),
    ).toBe("");
  });

  it("keeps a local logo that was never uploaded", () => {
    expect(
      unpublishedImage("file:///C:/versions/Pack/logo.png", "507f1f77bcf86cd799439011"),
    ).toBe("file:///C:/versions/Pack/logo.png");
  });

  it("normalizes a missing logo to an empty string", () => {
    expect(unpublishedImage(undefined, "code")).toBe("");
  });
});

describe("applyUnpublish", () => {
  it("leaves the instance as if it had never been published", () => {
    const target = conf({
      image: "https://cdn.example.com/modpacks/507f1f77bcf86cd799439011/logo.png",
    });

    applyUnpublish(target, "507f1f77bcf86cd799439011");

    expect("shareCode" in JSON.parse(JSON.stringify(target))).toBe(false);
    expect(target.build).toBe(0);
    expect(target.image).toBe("");
  });

  it("does not touch anything but the publish fingerprints", () => {
    const target = conf({
      description: "mine",
      image: "file:///C:/versions/Pack/logo.png",
      quickServer: "play.example.com",
    });
    const before = { ...target };

    applyUnpublish(target, "507f1f77bcf86cd799439011");

    expect(target.name).toBe(before.name);
    expect(target.description).toBe("mine");
    expect(target.quickServer).toBe("play.example.com");
    expect(target.downloadedVersion).toBe(before.downloadedVersion);
    expect(target.lastUpdate).toBe(before.lastUpdate);
    expect(target.image).toBe("file:///C:/versions/Pack/logo.png");
  });
});
