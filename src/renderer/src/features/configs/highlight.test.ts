import { describe, expect, it } from "vitest";
import {
  detectConfigLanguage,
  splitTokensAt,
  tokenizeConfig,
  type Token,
} from "./highlight";

function join(tokens: Token[]): string {
  return tokens.map((token) => token.text).join("");
}

function kindsOf(tokens: Token[], text: string): string[] {
  return tokens.filter((token) => token.text.includes(text)).map((t) => t.kind);
}

describe("detectConfigLanguage", () => {
  it("maps known extensions", () => {
    expect(detectConfigLanguage("options.json")).toBe("json");
    expect(detectConfigLanguage("pack.mcmeta")).toBe("json");
    expect(detectConfigLanguage("server.properties")).toBe("properties");
    expect(detectConfigLanguage("forge-client.toml")).toBe("toml");
    expect(detectConfigLanguage("startup_scripts/main.js")).toBe("script");
    expect(detectConfigLanguage("recipes.zs")).toBe("script");
    expect(detectConfigLanguage("bukkit.yml")).toBe("yaml");
    expect(detectConfigLanguage("paper-global.yaml")).toBe("yaml");
  });

  it("falls back to plain text", () => {
    expect(detectConfigLanguage("README")).toBe("text");
    expect(detectConfigLanguage("notes.txt")).toBe("text");
  });
});

describe("tokenizeConfig", () => {
  it("never loses or reorders characters", () => {
    const sources: [string, ReturnType<typeof detectConfigLanguage>][] = [
      ['{"a": 1, "b": true}', "json"],
      ["# hi\nkey=value\n", "properties"],
      ["[section]\nkey = 12\n", "toml"],
      ["const x = 'a'; // note", "script"],
      ["# note\nserver:\n  port: 25565\n  - item\n", "yaml"],
      ["anything at all", "text"],
    ];

    for (const [source, language] of sources) {
      expect(join(tokenizeConfig(source, language))).toBe(source);
    }
  });

  it("marks json keys, strings, numbers and literals apart", () => {
    const tokens = tokenizeConfig('{"name": "steve", "age": 7, "ok": true}', "json");

    expect(kindsOf(tokens, '"name"')).toContain("key");
    expect(kindsOf(tokens, '"steve"')).toContain("string");
    expect(kindsOf(tokens, "7")).toContain("number");
    expect(kindsOf(tokens, "true")).toContain("keyword");
  });

  it("treats a leading # as a comment in properties", () => {
    const tokens = tokenizeConfig("# note\nmax-players=20", "properties");

    expect(kindsOf(tokens, "# note")).toEqual(["comment"]);
    expect(kindsOf(tokens, "max-players")).toContain("key");
    expect(kindsOf(tokens, "20")).toContain("number");
  });

  it("keeps a # inside a properties value out of the comment", () => {
    const tokens = tokenizeConfig("motd=hello #1 server", "properties");

    expect(tokens.some((token) => token.kind === "comment")).toBe(false);
  });

  it("marks toml sections and script keywords", () => {
    expect(kindsOf(tokenizeConfig("[client]", "toml"), "[client]")).toEqual([
      "keyword",
    ]);
    expect(kindsOf(tokenizeConfig("const a = 1", "script"), "const")).toContain(
      "keyword",
    );
  });

  it("marks yaml keys and list markers", () => {
    const tokens = tokenizeConfig("server:\n  - port: 25565", "yaml");

    expect(kindsOf(tokens, "server")).toContain("key");
    expect(kindsOf(tokens, "25565")).toContain("number");
    expect(tokens.some((token) => token.kind === "punctuation")).toBe(true);
  });
});

describe("splitTokensAt", () => {
  it("splits inside a token without losing text", () => {
    const tokens = tokenizeConfig('{"a": 1}', "json");
    const [before, after] = splitTokensAt(tokens, 3);

    expect(join(before)).toBe('{"a');
    expect(join(after)).toBe('": 1}');
  });

  it("handles both edges", () => {
    const tokens = tokenizeConfig("key=value", "properties");

    expect(join(splitTokensAt(tokens, 0)[0])).toBe("");
    expect(join(splitTokensAt(tokens, 999)[1])).toBe("");
  });
});
