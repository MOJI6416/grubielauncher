import { describe, expect, it } from "vitest";
import {
  createShareError,
  isUnrecoverableShareError,
  ShareServiceError,
  toShareStateError,
} from "./errors";

describe("isUnrecoverableShareError", () => {
  it("gives up on a session the backend no longer knows", () => {
    expect(
      isUnrecoverableShareError(createShareError("join_share_not_found", "x")),
    ).toBe(true);
  });

  it("gives up when the account may not touch the session", () => {
    expect(
      isUnrecoverableShareError(createShareError("not_authenticated", "x")),
    ).toBe(true);
    expect(isUnrecoverableShareError(createShareError("not_friend", "x"))).toBe(
      true,
    );
  });

  it("keeps retrying transient transport failures", () => {
    expect(
      isUnrecoverableShareError(createShareError("tunnel_auth_failed", "x")),
    ).toBe(false);
    expect(
      isUnrecoverableShareError(createShareError("session_not_online", "x")),
    ).toBe(false);
  });

  it("classifies a 404 coming back from the api as unrecoverable", () => {
    const error = toShareStateError(
      new ShareServiceError("join_share_not_found", "gone", 404),
    );

    expect(isUnrecoverableShareError(error)).toBe(true);
  });
});
