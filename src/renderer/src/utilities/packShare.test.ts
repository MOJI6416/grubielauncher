import { describe, expect, it } from "vitest";
import {
  buildGroupInviteUrl,
  buildPackShareUrl,
  isPackCode,
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

  it("builds and parses the site's group invite links", () => {
    expect(buildGroupInviteUrl("AB12-CD34")).toBe(
      "https://grubielauncher.com/g/AB12-CD34",
    );
    expect(parseGroupJoinCode("https://grubielauncher.com/g/AB12-CD34")).toBe(
      "AB12-CD34",
    );
    expect(
      parseGroupJoinCode(" https://www.grubielauncher.com/ru/g/ab12cd34 "),
    ).toBe("ab12cd34");
    expect(parseGroupJoinCode("https://grubielauncher.com/g/bad")).toBeNull();
    expect(
      parseGroupJoinCode("https://example.com/g/AB12-CD34"),
    ).toBeNull();
    expect(
      parseGroupJoinCode("https://grubielauncher.com/ru/pack/AB12-CD34"),
    ).toBeNull();
  });

  it("parses short pack codes from site and protocol links", () => {
    expect(parsePackShareCode("https://grubielauncher.com/pack/k7m2-qx9p")).toBe(
      "K7M2-QX9P",
    );
    expect(
      parsePackShareCode("https://grubielauncher.com/ru/pack/K7M2QX9P"),
    ).toBe("K7M2-QX9P");
    expect(parsePackShareCode("grubielauncher://pack/K7M2-QX9P")).toBe(
      "K7M2-QX9P",
    );
    expect(parsePackShareCode("K7M2-QX9P")).toBe("K7M2-QX9P");
  });

  it("tells pack codes from look-alikes", () => {
    expect(isPackCode("6a10a2e421437b64b32425f9")).toBe(true);
    expect(isPackCode("K7M2-QX9P")).toBe(true);
    expect(isPackCode("k7m2qx9p")).toBe(true);
    expect(isPackCode("K0M2-QX1P")).toBe(false);
    expect(isPackCode("hello")).toBe(false);
  });
});
