import { describe, expect, it } from "vitest";
import {
  collectKeys,
  completionPatch,
  completionsFor,
  currentWord,
  isValueContext,
} from "./complete";
import { applyPatch } from "./editing";

describe("config completions", () => {
  it("reads the word under the caret", () => {
    const content = "mixin.chunk=fal";
    expect(currentWord(content, content.length)).toEqual({
      word: "fal",
      from: 12,
    });
    expect(currentWord(content, 11)).toEqual({ word: "mixin.chunk", from: 0 });
  });

  it("completes booleans in a properties value", () => {
    const content = "enableFancy=fal";
    const result = completionsFor(content, content.length, "properties");

    expect(result.items.map((item) => item.label)).toEqual(["false"]);
    expect(applyPatch(content, completionPatch(result, "false"))).toBe(
      "enableFancy=false",
    );
  });

  it("suggests keys already present in the file", () => {
    const content = "renderDistance=12\nsimulationDistance=8\nrende";
    const result = completionsFor(content, content.length, "properties");

    expect(result.items.map((item) => item.label)).toContain("renderDistance");
  });

  it("does not suggest keys once a value separator was typed", () => {
    const content = "renderDistance=12\nsimulationDistance=8\nfoo=rende";
    const result = completionsFor(content, content.length, "properties");

    expect(result.items.map((item) => item.label)).not.toContain(
      "renderDistance",
    );
  });

  it("stays silent inside comments", () => {
    const content = "# fal";
    expect(completionsFor(content, content.length, "properties").items).toEqual(
      [],
    );
  });

  it("stays silent for a one-letter word", () => {
    expect(completionsFor("f", 1, "properties").items).toEqual([]);
  });

  it("ranks a prefix match above a substring match", () => {
    const content = '{\n  "enableShadows": true,\n  "shadow": 1,\n  "shad"';
    const result = completionsFor(content, content.length - 1, "json");

    expect(result.items[0].label).toBe("shadow");
  });

  it("offers script keywords and kubejs globals", () => {
    const result = completionsFor("Server", 6, "script");
    expect(result.items.map((item) => item.label)).toContain("ServerEvents");

    const keyword = completionsFor("fun", 3, "script");
    expect(keyword.items.map((item) => item.label)).toContain("function");
  });

  it("collects json and toml keys", () => {
    expect(collectKeys('{"pack": {"format": 15}}', "json")).toEqual([
      "pack",
      "format",
    ]);
    expect(collectKeys("[general]\nmaxChunks = 4\n", "toml")).toEqual([
      "maxChunks",
    ]);
    expect(collectKeys("server:\n  port: 25565\n", "yaml")).toEqual([
      "server",
      "port",
    ]);
  });

  it("detects the value side of a line", () => {
    expect(isValueContext("foo=ba", "properties")).toBe(true);
    expect(isValueContext("foo", "properties")).toBe(false);
    expect(isValueContext("  port: 25", "yaml")).toBe(true);
  });
});
