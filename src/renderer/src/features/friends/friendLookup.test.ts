import { describe, expect, it } from "vitest";
import { normalizeFriendLookup, validateFriendLookup } from "./friendLookup";

describe("normalizeFriendLookup", () => {
  it("formats a friend code with a dash", () => {
    expect(normalizeFriendLookup("abcd2345")).toBe("ABCD-2345");
  });

  it("ignores separators and spaces", () => {
    expect(normalizeFriendLookup("  ab cd-23 45 ")).toBe("ABCD-2345");
  });

  it("rejects letters outside the code alphabet", () => {
    expect(normalizeFriendLookup("ABCI-2345")).toBe("");
    expect(normalizeFriendLookup("ABC0-2345")).toBe("");
  });

  it("rejects a wrong length", () => {
    expect(normalizeFriendLookup("ABCD-234")).toBe("");
  });

  it("accepts a raw user id", () => {
    expect(normalizeFriendLookup("64B7F3A21C0D4E5F6A7B8C9D")).toBe(
      "64b7f3a21c0d4e5f6a7b8c9d",
    );
  });

  it("is empty for empty input", () => {
    expect(normalizeFriendLookup("   ")).toBe("");
  });
});

describe("validateFriendLookup", () => {
  const context = {
    ownUserId: "64b7f3a21c0d4e5f6a7b8c9d",
    ownFriendCode: "MYNE-2345",
    friends: [{ id: "f1", friendCode: "FRND-2345" }],
    requests: [{ id: "r1", friendCode: "PEND-2345" }],
  };

  it("accepts an unknown code", () => {
    expect(validateFriendLookup("NEWC-2345", context)).toBeNull();
  });

  it("reports an empty field", () => {
    expect(validateFriendLookup("  ", context)).toBe("empty");
  });

  it("reports a malformed code", () => {
    expect(validateFriendLookup("nope", context)).toBe("invalid");
  });

  it("refuses our own id and our own code", () => {
    expect(validateFriendLookup("64b7f3a21c0d4e5f6a7b8c9d", context)).toBe(
      "self",
    );
    expect(validateFriendLookup("myne2345", context)).toBe("self");
  });

  it("refuses an existing friend by code or id", () => {
    expect(validateFriendLookup("frnd2345", context)).toBe("already_friend");
  });

  it("refuses a code that already has a request", () => {
    expect(validateFriendLookup("PEND-2345", context)).toBe("pending");
  });
});
