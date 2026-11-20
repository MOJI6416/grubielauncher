import { describe, expect, it } from "vitest";
import { isSameRoute, routeKey, screenKey } from "./routes";

describe("routeKey for settings", () => {
  it("keeps the old keys of a section without a sub-view", () => {
    expect(routeKey({ name: "settings" })).toBe("settings");
    expect(routeKey({ name: "settings", section: "themes" })).toBe("settings:themes");
  });

  it("makes a sub-view its own history entry on the same screen", () => {
    const gallery = { name: "settings", section: "themes", view: "gallery" } as const;
    expect(routeKey(gallery)).toBe("settings:themes:gallery");
    expect(isSameRoute(gallery, { name: "settings", section: "themes" })).toBe(false);
    expect(screenKey(gallery)).toBe(screenKey({ name: "settings" }));
  });
});
