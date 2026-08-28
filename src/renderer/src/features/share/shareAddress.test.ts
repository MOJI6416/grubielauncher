import { describe, expect, it } from "vitest";
import { isShareAddressUsable, parseShareAddress } from "./shareAddress";

describe("parseShareAddress", () => {
  it("returns null for empty input", () => {
    expect(parseShareAddress(undefined)).toBeNull();
    expect(parseShareAddress("")).toBeNull();
    expect(parseShareAddress("   ")).toBeNull();
  });

  it("splits the session handle from the domain", () => {
    const info = parseShareAddress("bright-otter-42.join.grubielauncher.com");
    expect(info).toEqual({
      raw: "bright-otter-42.join.grubielauncher.com",
      handle: "bright-otter-42",
      domain: "join.grubielauncher.com",
      masked: "••••••.join.grubielauncher.com",
    });
  });

  it("strips scheme, port and trailing slashes", () => {
    const info = parseShareAddress("tcp://slug.join.grubielauncher.com:25565/");
    expect(info?.raw).toBe("slug.join.grubielauncher.com:25565");
    expect(info?.handle).toBe("slug");
    expect(info?.domain).toBe("join.grubielauncher.com");
  });

  it("masks a hostname without a domain part", () => {
    const info = parseShareAddress("localhost");
    expect(info?.masked).toBe("••••••");
  });
});

describe("isShareAddressUsable", () => {
  it("is usable only for a public session", () => {
    expect(isShareAddressUsable("a.join.grubielauncher.com", "public")).toBe(
      true,
    );
    expect(isShareAddressUsable("a.join.grubielauncher.com", "friends")).toBe(
      false,
    );
    expect(isShareAddressUsable("", "public")).toBe(false);
  });
});
