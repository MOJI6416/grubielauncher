import { describe, expect, it } from "vitest";
import {
  addSkinSources,
  isLikelyTextureLink,
  isNicknameValid,
} from "./addSkin";

describe("addSkinSources", () => {
  it("offers the nickname source only for skins", () => {
    expect(addSkinSources("skin")).toEqual(["file", "link", "nick"]);
    expect(addSkinSources("cape")).toEqual(["file", "link"]);
  });
});

describe("isLikelyTextureLink", () => {
  it("accepts http and https", () => {
    expect(isLikelyTextureLink("https://example.com/skin.png")).toBe(true);
    expect(isLikelyTextureLink("http://example.com/a.png")).toBe(true);
    expect(isLikelyTextureLink("  https://example.com/a.png  ")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isLikelyTextureLink("")).toBe(false);
    expect(isLikelyTextureLink("example.com/skin.png")).toBe(false);
    expect(isLikelyTextureLink("file:///C:/skin.png")).toBe(false);
    expect(isLikelyTextureLink("javascript:alert(1)")).toBe(false);
  });
});

describe("isNicknameValid", () => {
  it("accepts Minecraft nicknames", () => {
    expect(isNicknameValid("Notch")).toBe(true);
    expect(isNicknameValid("a_1")).toBe(true);
    expect(isNicknameValid("0123456789abcdef")).toBe(true);
  });

  it("rejects too short, too long and unsupported characters", () => {
    expect(isNicknameValid("ab")).toBe(false);
    expect(isNicknameValid("0123456789abcdefg")).toBe(false);
    expect(isNicknameValid("моё имя")).toBe(false);
    expect(isNicknameValid("with space")).toBe(false);
  });
});
