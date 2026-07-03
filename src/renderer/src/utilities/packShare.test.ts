import { describe, expect, it } from "vitest";
import {
  buildPackShareUrl,
  parseGroupJoinCode,
  parsePackShareCode,
} from "./packShare";

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

  it("parses group join links", () => {
    expect(parseGroupJoinCode("grubielauncher://group/join/AB12-CD34")).toBe(
      "AB12-CD34",
    );
    expect(parseGroupJoinCode(" grubielauncher://group/join/ab12cd34 ")).toBe(
      "ab12cd34",
    );
    expect(parseGroupJoinCode("grubielauncher://group/join/bad")).toBeNull();
    expect(parseGroupJoinCode("grubielauncher://group/leave/AB12-CD34")).toBeNull();
    expect(parseGroupJoinCode("grubielauncher://pack/AB12-CD34")).toBeNull();
    expect(parseGroupJoinCode("just text")).toBeNull();
  });
});
