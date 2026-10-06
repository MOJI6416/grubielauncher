import { describe, expect, it } from "vitest";
import { MASK, PATH_MASK, maskValue, redactPath, redactText } from "./redact";

describe("redactPath", () => {
  it("hides the Windows profile name and keeps the rest of the path", () => {
    expect(
      redactPath("C:\\Users\\profi\\AppData\\Roaming\\.grubielauncher"),
    ).toBe(`C:\\Users\\${PATH_MASK}\\AppData\\Roaming\\.grubielauncher`);
    expect(redactPath("d:/users/John Smith/Games")).toBe(
      `d:/users/${PATH_MASK}/Games`,
    );
    expect(redactPath("C:\\\\Users\\\\profi\\\\.minecraft")).toBe(
      `C:\\\\Users\\\\${PATH_MASK}\\\\.minecraft`,
    );
  });

  it("hides Linux and macOS home folders", () => {
    expect(redactPath("/home/steve/.grubielauncher/versions")).toBe(
      `/home/${PATH_MASK}/.grubielauncher/versions`,
    );
    expect(redactPath("/Users/alex/Library/Application Support")).toBe(
      `/Users/${PATH_MASK}/Library/Application Support`,
    );
  });

  it("leaves paths outside a profile alone", () => {
    expect(redactPath("D:\\Games\\Grubie\\versions\\Pack")).toBe(
      "D:\\Games\\Grubie\\versions\\Pack",
    );
    expect(redactPath("/opt/grubie")).toBe("/opt/grubie");
    expect(redactPath("https://example.com/home/page")).toBe(
      "https://example.com/home/page",
    );
  });
});

describe("redactText", () => {
  it("hides paths inside log lines", () => {
    expect(
      redactText(
        "[main/INFO]: Loading C:\\Users\\profi\\AppData\\Roaming\\mods\\a.jar",
      ),
    ).toBe(
      `[main/INFO]: Loading C:\\Users\\${PATH_MASK}\\AppData\\Roaming\\mods\\a.jar`,
    );
  });

  it("hides the server the game connects to", () => {
    expect(
      redactText(
        "[Server Connector #1/INFO]: Connecting to play.example.net, 25565",
      ),
    ).toBe(`[Server Connector #1/INFO]: Connecting to ${MASK}, 25565`);
    expect(
      redactText("--quickPlayMultiplayer mc.example.org:25566 --demo"),
    ).toBe(`--quickPlayMultiplayer ${MASK} --demo`);
  });

  it("hides IPv4 addresses but not versions", () => {
    expect(redactText("joined 192.168.1.10:25565")).toBe(
      `joined ${MASK}:25565`,
    );
    expect(redactText("Minecraft 1.20.1 with Forge 47.2.0")).toBe(
      "Minecraft 1.20.1 with Forge 47.2.0",
    );
    expect(redactText("lib 1.2.3.4.5")).toBe("lib 1.2.3.4.5");
  });
});

describe("maskValue", () => {
  it("masks anything non-empty and keeps an empty value empty", () => {
    expect(maskValue("ABCD-1234")).toBe(MASK);
    expect(maskValue("")).toBe("");
  });
});
