import { describe, expect, it } from "vitest";
import { buildPackShareUrl, parsePackShareCode } from "./packShare";

describe("pack share utilities", () => {
  it("builds public pack urls", () => {
    expect(buildPackShareUrl("6a10a2e421437b64b32425f9")).toBe(
      "https://grubielauncher.com/pack/6a10a2e421437b64b32425f9",
    );
  });

  it("parses raw codes, compact slash codes and public urls", () => {
    expect(parsePackShareCode("6a10a2e421437b64b32425f9")).toBe(
      "6a10a2e421437b64b32425f9",
    );
    expect(parsePackShareCode("/6a10a2e421437b64b32425f9")).toBe(
      "6a10a2e421437b64b32425f9",
    );
    expect(
      parsePackShareCode(
        "https://grubielauncher.com/ru/pack/6a10a2e421437b64b32425f9",
      ),
    ).toBe("6a10a2e421437b64b32425f9");
  });

  it("parses launcher protocol urls", () => {
    expect(
      parsePackShareCode("grubielauncher://pack/6a10a2e421437b64b32425f9"),
    ).toBe("6a10a2e421437b64b32425f9");
  });
});
