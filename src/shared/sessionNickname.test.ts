import { describe, expect, it } from "vitest";
import { sessionNickname, withSessionNickname } from "./sessionNickname";

function token(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.sig`;
}

describe("sessionNickname", () => {
  it("reads the nickname the session token carries", () => {
    expect(sessionNickname(token({ sub: "1", nickname: "Builder_42" }))).toBe(
      "Builder_42",
    );
  });

  it("has nothing to say about a missing, empty or broken token", () => {
    expect(sessionNickname(undefined)).toBeNull();
    expect(sessionNickname(token({ sub: "1", nickname: "  " }))).toBeNull();
    expect(sessionNickname(token({ sub: "1" }))).toBeNull();
    expect(sessionNickname("not-a-token")).toBeNull();
  });
});

describe("withSessionNickname", () => {
  it("takes the name from a fresh token", () => {
    const account = {
      nickname: "johndoe",
      accessToken: token({ sub: "1", nickname: "Builder_42" }),
    };

    expect(withSessionNickname(account)).toEqual({
      ...account,
      nickname: "Builder_42",
    });
  });

  it("keeps the account as it is when the token says nothing new", () => {
    const same = {
      nickname: "Steve",
      accessToken: token({ nickname: "Steve" }),
    };
    const offline = { nickname: "Steve" };

    expect(withSessionNickname(same)).toBe(same);
    expect(withSessionNickname(offline)).toBe(offline);
  });
});
