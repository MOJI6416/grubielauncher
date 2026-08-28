import { describe, expect, it } from "vitest";
import {
  motdColorVariable,
  motdLines,
  motdToPlainText,
  parseMotd,
  stripMotd,
} from "./motd";

describe("parseMotd", () => {
  it("returns nothing for an empty description", () => {
    expect(parseMotd(undefined)).toEqual([]);
    expect(parseMotd("")).toEqual([]);
  });

  it("splits a legacy string on colour codes", () => {
    expect(parseMotd(JSON.stringify("§aHello §cworld"))).toEqual([
      { color: "a", text: "Hello " },
      { color: "c", text: "world" },
    ]);
  });

  it("accepts a bare string that is not json", () => {
    expect(parseMotd("§eplain")).toEqual([{ color: "e", text: "plain" }]);
  });

  it("keeps formatting flags and resets them on §r", () => {
    expect(parseMotd("§l§nbold§rplain")).toEqual([
      { bold: true, underline: true, text: "bold" },
      { text: "plain" },
    ]);
  });

  it("inherits component styles into extra parts", () => {
    const spans = parseMotd(
      JSON.stringify({
        text: "A",
        color: "gold",
        bold: true,
        extra: [{ text: "B" }, { text: "C", color: "aqua", bold: false }],
      }),
    );

    expect(spans).toEqual([
      { color: "6", bold: true, text: "AB" },
      { color: "b", bold: false, text: "C" },
    ]);
  });

  it("understands hex colours from 1.16 components", () => {
    expect(parseMotd(JSON.stringify({ text: "x", color: "#1AF2b0" }))).toEqual([
      { color: "#1AF2b0", text: "x" },
    ]);
  });

  it("drops an unknown colour instead of leaking it", () => {
    expect(parseMotd(JSON.stringify({ text: "x", color: "chartreuse" }))).toEqual(
      [{ text: "x" }],
    );
  });

  it("decodes the bungeecord hex encoding", () => {
    expect(parseMotd("§x§1§a§2§b§3§ccolour")).toEqual([
      { color: "#1a2b3c", text: "colour" },
    ]);
  });

  it("falls back to legacy parsing on a broken hex sequence", () => {
    expect(motdToPlainText(parseMotd("§x§1§a nope"))).toBe("§x nope");
  });

  it("keeps unknown escape sequences as text", () => {
    expect(motdToPlainText(parseMotd("100§ of it"))).toBe("100§ of it");
  });

  it("walks an array description", () => {
    expect(motdToPlainText(parseMotd(JSON.stringify(["a", { text: "b" }])))).toBe(
      "ab",
    );
  });
});

describe("motdLines", () => {
  it("breaks the motd into rendered lines", () => {
    const lines = motdLines(parseMotd(JSON.stringify("§atop\n§cbottom")));

    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual([{ color: "a", text: "top" }]);
    expect(lines[1]).toEqual([{ color: "c", text: "bottom" }]);
  });

  it("keeps a single line intact", () => {
    expect(motdLines(parseMotd("one"))).toEqual([[{ text: "one" }]]);
  });
});

describe("motdColorVariable", () => {
  it("maps a code to a token and passes hex through", () => {
    expect(motdColorVariable("a")).toBe("var(--mc-a)");
    expect(motdColorVariable("#112233")).toBe("#112233");
    expect(motdColorVariable(undefined)).toBeUndefined();
  });
});

describe("stripMotd", () => {
  it("removes section codes from a server version string", () => {
    expect(stripMotd("§f§f§fWe support: 1.20-1.21")).toBe(
      "We support: 1.20-1.21",
    );
  });

  it("removes codes from a player sample entry and collapses gaps", () => {
    expect(stripMotd("§4§k||§9§lCubeCraft§4§k||")).toBe(
      "||CubeCraft||",
    );
  });

  it("returns an empty string for missing input", () => {
    expect(stripMotd(undefined)).toBe("");
  });
});
