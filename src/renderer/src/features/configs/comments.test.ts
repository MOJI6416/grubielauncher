import { describe, expect, it } from "vitest";
import {
  batchBodies,
  commentBodies,
  parseTranslationReply,
  splitComment,
  translateCommentTokens,
  translationPrompt,
} from "./comments";
import { tokenizeConfig } from "./highlight";

describe("splitComment", () => {
  it("separates the marker and indentation from the text", () => {
    expect(splitComment("\t#Range: 1 ~ 64")).toEqual({
      prefix: "\t#",
      body: "Range: 1 ~ 64",
      suffix: "",
    });
    expect(splitComment("  // Render distance")).toEqual({
      prefix: "  // ",
      body: "Render distance",
      suffix: "",
    });
    expect(splitComment("/* Block note */")).toEqual({
      prefix: "/* ",
      body: "Block note",
      suffix: " */",
    });
  });
});

describe("commentBodies", () => {
  it("collects unique human text and skips identifiers and non-latin text", () => {
    const tokens = tokenizeConfig(
      [
        "#Show the overlay",
        "#Range: 1 ~ 64",
        "distance = 16",
        "#Show the overlay",
        "#minecraft:stone",
        "#Уже по-русски",
        "#",
      ].join("\n"),
      "toml",
    );

    expect(commentBodies(tokens)).toEqual([
      "Show the overlay",
      "Range: 1 ~ 64",
    ]);
  });
});

describe("translateCommentTokens", () => {
  it("replaces only the comment text and keeps markers and code", () => {
    const tokens = tokenizeConfig(
      "\t#Show the overlay\n\tdistance = 16",
      "toml",
    );
    const translated = translateCommentTokens(
      tokens,
      new Map([["Show the overlay", "Показывать оверлей"]]),
    );

    expect(translated.map((token) => token.text).join("")).toBe(
      "\t#Показывать оверлей\n\tdistance = 16",
    );
  });
});

describe("batchBodies", () => {
  it("splits by size and item count", () => {
    const bodies = Array.from(
      { length: 10 },
      (_, index) => `comment number ${index}`,
    );
    expect(batchBodies(bodies, 10_000, 4).map((batch) => batch.length)).toEqual(
      [4, 4, 2],
    );
    expect(
      batchBodies(bodies, 60, 100).every((batch) => batch.length <= 3),
    ).toBe(true);
  });
});

describe("translation reply", () => {
  it("asks for an exact JSON array", () => {
    const prompt = translationPrompt(["Show the overlay"], "ru");
    expect(prompt).toContain("into Russian");
    expect(prompt).toContain('["Show the overlay"]');
  });

  it("reads arrays wrapped in prose or code fences", () => {
    expect(parseTranslationReply('```json\n["Один", "Два"]\n```', 2)).toEqual([
      "Один",
      "Два",
    ]);
    expect(parseTranslationReply('Here: ["Один"]', 1)).toEqual(["Один"]);
  });

  it("rejects replies with the wrong shape", () => {
    expect(parseTranslationReply('["Один"]', 2)).toBeNull();
    expect(parseTranslationReply("не JSON", 1)).toBeNull();
    expect(parseTranslationReply("[1, 2]", 2)).toBeNull();
    expect(parseTranslationReply(null, 1)).toBeNull();
  });
});
