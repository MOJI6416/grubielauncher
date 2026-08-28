import { describe, expect, it } from "vitest";
import { packShareCode, publishedShareCodes } from "./ownPacks";

// The two shapes GET /modpacks/own actually returns: a build published since
// share codes exist, and one from before them.
const withCode = {
  _id: "6a10a2e421437b64b32425f9",
  shareCode: "0f3c9d1b7e5a4c2d8b6f1a03",
};
const legacy = { _id: "507f1f77bcf86cd799439011", shareCode: null };

describe("packShareCode", () => {
  it("prefers the share code over the row id", () => {
    expect(packShareCode(withCode)).toBe("0f3c9d1b7e5a4c2d8b6f1a03");
  });

  it("falls back to the row id for builds published before share codes", () => {
    expect(packShareCode(legacy)).toBe("507f1f77bcf86cd799439011");
    expect(packShareCode({ _id: legacy._id } as never)).toBe(legacy._id);
  });
});

describe("publishedShareCodes", () => {
  // The instance stores the share code the publish handed back, so a set built
  // from row ids never matched it and every published build kept showing up
  // under "not published".
  it("matches the code an instance stored when it was published", () => {
    const published = publishedShareCodes([withCode, legacy]);

    expect(published.has(withCode.shareCode)).toBe(true);
    expect(published.has(withCode._id)).toBe(false);
    expect(published.has(legacy._id)).toBe(true);
  });
});
