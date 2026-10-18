import { describe, expect, it } from "vitest";
import {
  pickLastPlayedInstance,
  resolveAccountBootstrap,
  resolveBootstrapLanguage,
} from "./bootstrapPlan";

describe("resolveBootstrapLanguage", () => {
  it("takes the system locale when it is supported", () => {
    expect(resolveBootstrapLanguage("ru-RU", "en")).toBe("ru");
    expect(resolveBootstrapLanguage("uk", "en")).toBe("uk");
    expect(resolveBootstrapLanguage("de-DE", "en")).toBe("de");
    expect(resolveBootstrapLanguage("pt-PT", "en")).toBe("pt");
    expect(resolveBootstrapLanguage("es-419", "en")).toBe("es");
  });

  it("matches the language part only, not a substring", () => {
    expect(resolveBootstrapLanguage("lt-LT", "en")).toBe("en");
    expect(resolveBootstrapLanguage("ja-JP", "uk")).toBe("uk");
  });

  it("opens in Russian for systems whose players read it", () => {
    expect(resolveBootstrapLanguage("kk-KZ", "en")).toBe("ru");
    expect(resolveBootstrapLanguage("be", "en")).toBe("ru");
  });

  it("falls back when the system locale is unknown", () => {
    expect(resolveBootstrapLanguage("ja-JP", "en")).toBe("en");
    expect(resolveBootstrapLanguage("", "ru")).toBe("ru");
  });
});

describe("resolveAccountBootstrap", () => {
  const accounts = [
    { type: "microsoft" as const, nickname: "Kituk" },
    { type: "discord" as const, nickname: "moji6416" },
  ];

  it("restores the remembered account without rewriting the file", () => {
    expect(resolveAccountBootstrap(accounts, "discord_moji6416")).toEqual({
      account: accounts[1],
      persist: false,
    });
  });

  it("falls back to the first account and persists the choice", () => {
    expect(resolveAccountBootstrap(accounts, "discord_ghost")).toEqual({
      account: accounts[0],
      persist: true,
    });
    expect(resolveAccountBootstrap(accounts, null)).toEqual({
      account: accounts[0],
      persist: true,
    });
  });

  it("stays empty when there are no accounts", () => {
    expect(resolveAccountBootstrap([], "anything")).toEqual({
      account: null,
      persist: false,
    });
  });
});

describe("pickLastPlayedInstance", () => {
  it("returns null for an empty library", () => {
    expect(pickLastPlayedInstance([])).toBeNull();
  });

  it("picks the newest launch", () => {
    const older = { version: { lastLaunch: "2026-01-01T00:00:00.000Z" } };
    const newer = { version: { lastLaunch: "2026-08-01T00:00:00.000Z" } };
    expect(pickLastPlayedInstance([older, newer])).toBe(newer);
  });

  it("treats a never launched instance as the oldest", () => {
    const never = { version: {} };
    const played = { version: { lastLaunch: "2026-01-01T00:00:00.000Z" } };
    expect(pickLastPlayedInstance([never, played])).toBe(played);
  });

  it("does not reorder the source array", () => {
    const first = { version: { lastLaunch: "2026-01-01T00:00:00.000Z" } };
    const second = { version: { lastLaunch: "2026-08-01T00:00:00.000Z" } };
    const list = [first, second];
    pickLastPlayedInstance(list);
    expect(list).toEqual([first, second]);
  });
});
