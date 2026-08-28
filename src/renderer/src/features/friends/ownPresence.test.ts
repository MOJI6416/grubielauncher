import { describe, expect, it } from "vitest";
import { applyPresenceUpdate, sharePresenceKey } from "./ownPresence";

const previous = {
  versionName: "Fabulously Optimized",
  versionCode: "abc",
  serverAddress: "play.example.com",
};

describe("applyPresenceUpdate", () => {
  it("keeps untouched fields", () => {
    expect(applyPresenceUpdate(previous, { serverAddress: "" })).toEqual({
      versionName: "Fabulously Optimized",
      versionCode: "abc",
      serverAddress: "",
    });
  });

  it("clears a field only when it is explicitly empty", () => {
    expect(applyPresenceUpdate(previous, { versionName: "" }).versionName).toBe(
      "",
    );
    expect(applyPresenceUpdate(previous, {}).versionName).toBe(
      "Fabulously Optimized",
    );
  });
});

describe("sharePresenceKey", () => {
  it("is offline unless the share is fully online", () => {
    expect(sharePresenceKey({ phase: "lan_ready" })).toBe("offline");
    expect(sharePresenceKey({ phase: "online", slug: "s" })).toBe("offline");
    expect(sharePresenceKey({ phase: "online", publicAddress: "1.2.3.4" })).toBe(
      "offline",
    );
  });

  it("changes when the session, slug or visibility change", () => {
    const base = {
      phase: "online",
      slug: "world",
      publicAddress: "1.2.3.4",
      sessionId: "s1",
      visibility: "friends",
    };

    expect(sharePresenceKey(base)).toBe("online:s1:world:friends");
    expect(sharePresenceKey({ ...base, visibility: "public" })).not.toBe(
      sharePresenceKey(base),
    );
    expect(sharePresenceKey({ ...base, sessionId: "s2" })).not.toBe(
      sharePresenceKey(base),
    );
  });
});
