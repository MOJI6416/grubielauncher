import { describe, expect, it } from "vitest";
import { nextPresenceForShareCode } from "./publishPresence";

const presence = {
  versionName: "Fresh Pack",
  versionCode: "",
  serverAddress: "",
};

describe("nextPresenceForShareCode", () => {
  it("fills the share code of the instance that is running", () => {
    expect(
      nextPresenceForShareCode(presence, "Fresh Pack", "FRESHCODE1"),
    ).toEqual({
      versionName: "Fresh Pack",
      versionCode: "FRESHCODE1",
      serverAddress: "",
    });
  });

  it("keeps the server address the player is already on", () => {
    expect(
      nextPresenceForShareCode(
        { ...presence, serverAddress: "play.example.net:25565" },
        "Fresh Pack",
        "FRESHCODE1",
      )?.serverAddress,
    ).toBe("play.example.net:25565");
  });

  it("ignores another instance", () => {
    expect(
      nextPresenceForShareCode(presence, "Vanilla 26.2", "FRESHCODE1"),
    ).toBeNull();
  });

  it("ignores a presence without a running instance", () => {
    expect(
      nextPresenceForShareCode(
        { versionName: "", versionCode: "", serverAddress: "" },
        "",
        "FRESHCODE1",
      ),
    ).toBeNull();
  });

  it("does not resend the same code", () => {
    expect(
      nextPresenceForShareCode(
        { ...presence, versionCode: "FRESHCODE1" },
        "Fresh Pack",
        "FRESHCODE1",
      ),
    ).toBeNull();
  });

  it("clears the code when the pack is unpublished", () => {
    expect(
      nextPresenceForShareCode(
        { ...presence, versionCode: "FRESHCODE1" },
        "Fresh Pack",
        "",
      ),
    ).toEqual({
      versionName: "Fresh Pack",
      versionCode: "",
      serverAddress: "",
    });
  });
});
