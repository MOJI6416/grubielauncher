import { describe, expect, it } from "vitest";
import { toNicknameFailure } from "./nicknameResult";

function httpError(data: unknown) {
  return Object.assign(new Error("Request failed"), {
    isAxiosError: true,
    response: { status: 409, data },
  });
}

describe("toNicknameFailure", () => {
  it("passes the server's reason through", () => {
    expect(toNicknameFailure(httpError({ code: "taken" }))).toEqual({
      ok: false,
      error: "taken",
      nextChangeAt: null,
    });
  });

  it("keeps the date a cooldown ends", () => {
    expect(
      toNicknameFailure(
        httpError({
          code: "cooldown",
          nextChangeAt: "2026-11-04T00:00:00.000Z",
        }),
      ),
    ).toEqual({
      ok: false,
      error: "cooldown",
      nextChangeAt: "2026-11-04T00:00:00.000Z",
    });
  });

  it("calls anything else a plain failure", () => {
    expect(toNicknameFailure(httpError({ code: "something_new" })).error).toBe(
      "failed",
    );
    expect(toNicknameFailure(httpError(["validation"])).error).toBe("failed");
    expect(toNicknameFailure(new Error("socket hang up")).error).toBe("failed");
    expect(toNicknameFailure(null).error).toBe("failed");
  });
});
