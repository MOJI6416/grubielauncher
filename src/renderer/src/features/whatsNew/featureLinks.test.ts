import { describe, expect, it } from "vitest";
import { featureLinksFor, parseFeatureLink } from "./featureLinks";

const ME = "me";

describe("parseFeatureLink", () => {
  it("opens screens and their sub-views", () => {
    expect(parseFeatureLink("wardrobe", ME)).toEqual({
      kind: "route",
      route: { name: "wardrobe" },
    });
    expect(parseFeatureLink("wardrobe/catalog", ME)).toEqual({
      kind: "route",
      route: { name: "wardrobe", view: "catalog" },
    });
    expect(parseFeatureLink("profile/achievements", ME)).toEqual({
      kind: "route",
      route: { name: "profile", userId: ME, tab: "achievements" },
    });
    expect(parseFeatureLink("settings/themes/gallery", ME)).toEqual({
      kind: "route",
      route: { name: "settings", section: "themes", view: "gallery" },
    });
  });

  it("points at a single setting by its id", () => {
    expect(parseFeatureLink("setting:discordActivity", ME)).toEqual({
      kind: "setting",
      id: "discordActivity",
    });
    expect(parseFeatureLink("setting:nope", ME)).toBeNull();
  });

  it("opens a tab of the selected instance", () => {
    expect(parseFeatureLink("instance/statistics", ME)).toEqual({
      kind: "instance",
      tab: "statistics",
    });
    expect(parseFeatureLink("instance/nope", ME)).toBeNull();
  });

  it("refuses anything that is not a place in the launcher", () => {
    expect(parseFeatureLink("https://example.com", ME)).toBeNull();
    expect(parseFeatureLink("profile/skins", ME)).toBeNull();
    expect(parseFeatureLink("people/Kituk", ME)).toBeNull();
    expect(parseFeatureLink("", ME)).toBeNull();
    expect(parseFeatureLink(null, ME)).toBeNull();
  });
});

describe("featureLinksFor", () => {
  it("lines the links up with the highlights and tolerates an old api", () => {
    expect(featureLinksFor(["a", "b"], ["news", null, "home"], ME)).toEqual([
      { kind: "route", route: { name: "news" } },
      null,
    ]);
    expect(featureLinksFor(["a"], undefined, ME)).toEqual([null]);
  });
});
