import { describe, expect, it } from "vitest";
import {
  claimGameInviteResults,
  releaseGameInviteResults,
  takeGameInviteResult,
} from "@renderer/features/friends/gameInvite";
import { summariseGameInvites } from "./useGroupGameInvite";

describe("summariseGameInvites", () => {
  it("reports a clean run as fully sent", () => {
    expect(summariseGameInvites({ total: 3, sent: 3, codes: [] })).toEqual({
      key: "all",
      params: { sent: 3, total: 3 },
    });
  });

  it("names the reason when nobody was invited", () => {
    expect(
      summariseGameInvites({
        total: 2,
        sent: 0,
        codes: ["recipient_offline", "recipient_offline"],
      }),
    ).toEqual({ key: "none", code: "recipient_offline", params: {} });
  });

  it("keeps the count and the reason on a partial run", () => {
    expect(
      summariseGameInvites({ total: 4, sent: 2, codes: ["not_friend"] }),
    ).toEqual({
      key: "partial",
      code: "not_friend",
      params: { sent: 2, total: 4 },
    });
  });

  it("falls back to unknown when the server sent no code", () => {
    expect(summariseGameInvites({ total: 1, sent: 0, codes: [] }).code).toBe(
      "unknown",
    );
  });
});

describe("game invite result ownership", () => {
  it("hands a claimed result to the batch exactly once", () => {
    claimGameInviteResults(["u1", "u2"]);

    expect(takeGameInviteResult("u1")).toBe(true);
    expect(takeGameInviteResult("u1")).toBe(false);
    expect(takeGameInviteResult("u3")).toBe(false);
    expect(takeGameInviteResult(undefined)).toBe(false);

    releaseGameInviteResults(["u2"]);
    expect(takeGameInviteResult("u2")).toBe(false);
  });
});
