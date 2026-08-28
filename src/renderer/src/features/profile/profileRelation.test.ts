import { describe, expect, it } from "vitest";
import { profileRelation } from "./profileRelation";

const base = {
  userId: "them",
  ownId: "me",
  friendIds: [] as string[],
  requests: [] as { type: "requester" | "recipient"; userId: string }[],
};

describe("profileRelation", () => {
  it("knows your own profile even when the id list is empty", () => {
    expect(profileRelation({ ...base, userId: "me" })).toBe("self");
  });

  it("prefers friendship over a stale request record", () => {
    expect(
      profileRelation({
        ...base,
        friendIds: ["them"],
        requests: [{ type: "requester", userId: "them" }],
      }),
    ).toBe("friend");
  });

  it("separates a request you sent from a request you received", () => {
    expect(
      profileRelation({
        ...base,
        requests: [{ type: "requester", userId: "them" }],
      }),
    ).toBe("outgoing");

    expect(
      profileRelation({
        ...base,
        requests: [{ type: "recipient", userId: "them" }],
      }),
    ).toBe("incoming");
  });

  it("ignores requests that belong to someone else", () => {
    expect(
      profileRelation({
        ...base,
        requests: [{ type: "recipient", userId: "other" }],
      }),
    ).toBe("none");
  });

  it("falls back to a stranger without a signed-in identity", () => {
    expect(profileRelation({ ...base, ownId: null })).toBe("none");
    expect(profileRelation({ ...base, userId: "" })).toBe("none");
  });
});
