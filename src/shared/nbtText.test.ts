import { describe, expect, it } from "vitest";
import { isNbtSafeText, toNbtSafeText } from "./nbtText";

describe("toNbtSafeText", () => {
  it("keeps plain and cyrillic text untouched", () => {
    expect(toNbtSafeText("FunnyMC [1.8-26.2+]")).toBe("FunnyMC [1.8-26.2+]");
    expect(toNbtSafeText("Сервер друзей")).toBe("Сервер друзей");
  });

  it("drops emoji that the nbt writer cannot encode", () => {
    expect(toNbtSafeText("🗡 FunnyMC 🗡 [1.8]")).toBe(
      " FunnyMC  [1.8]",
    );
  });

  it("drops a lone surrogate left over by a naive slice", () => {
    expect(toNbtSafeText("FunnyMC \uD83D")).toBe("FunnyMC ");
  });

  it("handles an empty value", () => {
    expect(toNbtSafeText("")).toBe("");
  });
});

describe("isNbtSafeText", () => {
  it("reports whether the text survives a round trip", () => {
    expect(isNbtSafeText("mc.example.com")).toBe(true);
    expect(isNbtSafeText("🗡")).toBe(false);
  });
});
