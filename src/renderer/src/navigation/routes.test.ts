import { describe, expect, it } from "vitest";
import { screenKey } from "./routes";

describe("screenKey", () => {
  it("stays the same while only a tab or section changes", () => {
    expect(screenKey({ name: "instance", id: "pack", tab: "content" })).toBe(
      screenKey({ name: "instance", id: "pack" }),
    );
    expect(screenKey({ name: "settings", section: "voice" })).toBe(
      screenKey({ name: "settings" }),
    );
    expect(screenKey({ name: "people", section: "groups" })).toBe(
      screenKey({ name: "people", section: "friends", peerId: "a" }),
    );
    expect(screenKey({ name: "agent", chatId: "1" })).toBe(
      screenKey({ name: "agent" }),
    );
  });

  it("changes when a different screen or subject opens", () => {
    expect(screenKey({ name: "home" })).not.toBe(screenKey({ name: "news" }));
    expect(screenKey({ name: "instance", id: "a" })).not.toBe(
      screenKey({ name: "instance", id: "b" }),
    );
    expect(screenKey({ name: "profile", userId: "a" })).not.toBe(
      screenKey({ name: "profile", userId: "b" }),
    );
  });
});
