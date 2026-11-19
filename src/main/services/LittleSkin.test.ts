import { beforeEach, describe, expect, it, vi } from "vitest";

const postMock = vi.fn();

vi.mock("axios", () => ({
  default: {
    post: (...args: unknown[]) => postMock(...args),
    isAxiosError: (value: unknown) =>
      Boolean((value as { isAxiosError?: boolean })?.isAxiosError),
  },
}));

vi.mock("../utilities/axiosLog", () => ({ logAxiosError: vi.fn() }));

import {
  authenticateLittleSkin,
  exchangeLittleSkinOAuthToken,
  LITTLESKIN_INVALID_CREDENTIALS,
  LITTLESKIN_OAUTH_CANCELLED,
  LITTLESKIN_OAUTH_DENIED,
  LITTLESKIN_OAUTH_EXPIRED,
  LITTLESKIN_OAUTH_SCOPE,
  LITTLESKIN_OAUTH_UNAVAILABLE,
  littleSkinProfileFromIdToken,
  requestLittleSkinDeviceCode,
  waitForLittleSkinAuthorization,
  type LittleSkinDeviceAuthorization,
} from "./LittleSkin";

function axiosError(status?: number, data?: unknown, code?: string) {
  return Object.assign(new Error("Request failed"), {
    isAxiosError: true,
    code,
    response: status ? { status, data } : undefined,
    config: { data: JSON.stringify({ password: "hunter2" }) },
  });
}

describe("authenticateLittleSkin", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("signs in against the LittleSkin Yggdrasil API and keeps only valid profiles", async () => {
    postMock.mockResolvedValue({
      data: {
        accessToken: "token",
        clientToken: "client",
        selectedProfile: null,
        availableProfiles: [
          { id: "0123456789abcdef0123456789abcdef", name: "Steve" },
          { id: "not-a-uuid", name: "Broken" },
        ],
      },
    });

    const result = await authenticateLittleSkin("steve@example.com", "pw");

    expect(postMock).toHaveBeenCalledWith(
      "https://littleskin.cn/api/yggdrasil/authserver/authenticate",
      expect.objectContaining({
        username: "steve@example.com",
        password: "pw",
        agent: { name: "Minecraft", version: 1 },
      }),
      expect.anything(),
    );
    expect(result.session).toEqual({ accessToken: "token", clientToken: "client" });
    expect(result.selectedProfile).toBeNull();
    expect(result.profiles).toEqual([
      { id: "0123456789abcdef0123456789abcdef", name: "Steve" },
    ]);
  });

  it("reports wrong credentials with a dedicated code", async () => {
    postMock.mockRejectedValue(
      axiosError(403, { error: "ForbiddenOperationException" }),
    );

    await expect(authenticateLittleSkin("a", "b")).rejects.toThrow(
      LITTLESKIN_INVALID_CREDENTIALS,
    );
  });

  it("never rethrows the request, which carries the password", async () => {
    postMock.mockRejectedValue(axiosError(502));
    const serverError = await authenticateLittleSkin("a", "hunter2").catch(
      (error: unknown) => error,
    );
    expect(serverError).toBeInstanceOf(Error);
    expect((serverError as Error).message).toContain("status code 502");
    expect(JSON.stringify(serverError)).not.toContain("hunter2");
    expect((serverError as { config?: unknown }).config).toBeUndefined();

    postMock.mockRejectedValue(axiosError(undefined, undefined, "ETIMEDOUT"));
    await expect(authenticateLittleSkin("a", "hunter2")).rejects.toThrow(
      "ETIMEDOUT",
    );
  });
});

function idToken(claims: object) {
  return [
    "header",
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".");
}

const device: LittleSkinDeviceAuthorization = {
  deviceCode: "device-code",
  userCode: "ABCD-EFGH",
  verificationUri: "https://open.littleskin.cn/oauth/device",
  expiresIn: 300,
  interval: 5,
};

function oauthError(error: string) {
  return axiosError(400, { error });
}

describe("LittleSkin device sign-in", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("asks for a device code with the scopes for a game token", async () => {
    postMock.mockResolvedValue({
      data: {
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://open.littleskin.cn/oauth/device",
        verification_uri_complete:
          "https://open.littleskin.cn/oauth/device?user_code=ABCD-EFGH",
        expires_in: 300,
        interval: 5,
      },
    });

    const result = await requestLittleSkinDeviceCode("client-1");

    const [url, body] = postMock.mock.calls[0];
    expect(url).toBe("https://open.littleskin.cn/oauth/device_code");
    expect(Object.fromEntries(body as URLSearchParams)).toEqual({
      client_id: "client-1",
      scope: LITTLESKIN_OAUTH_SCOPE,
    });
    expect(LITTLESKIN_OAUTH_SCOPE.split(" ")).toEqual(
      expect.arrayContaining([
        "openid",
        "Yggdrasil.PlayerProfiles.Select",
        "Yggdrasil.MinecraftToken.Create",
      ]),
    );
    expect(result).toEqual({
      deviceCode: "device-code",
      userCode: "ABCD-EFGH",
      verificationUri: "https://open.littleskin.cn/oauth/device",
      verificationUriComplete:
        "https://open.littleskin.cn/oauth/device?user_code=ABCD-EFGH",
      expiresIn: 300,
      interval: 5,
    });
  });

  it("tells a client LittleSkin does not let in apart from a failed request", async () => {
    postMock.mockRejectedValueOnce(axiosError(401, { error: "invalid_client" }));
    await expect(requestLittleSkinDeviceCode("client-1")).rejects.toThrow(
      LITTLESKIN_OAUTH_UNAVAILABLE,
    );

    postMock.mockRejectedValueOnce(axiosError(502));
    await expect(requestLittleSkinDeviceCode("client-1")).rejects.toThrow(
      "status code 502",
    );

    postMock.mockRejectedValueOnce(oauthError("unauthorized_client"));
    await expect(
      waitForLittleSkinAuthorization("client-1", device, undefined, async () => {}),
    ).rejects.toThrow(LITTLESKIN_OAUTH_UNAVAILABLE);
  });

  it("does not open a verification page that is not https", async () => {
    postMock.mockResolvedValue({
      data: {
        device_code: "d",
        user_code: "u",
        verification_uri: "http://open.littleskin.cn/oauth/device",
      },
    });

    await expect(requestLittleSkinDeviceCode("client-1")).rejects.toThrow(
      "no device code",
    );
  });

  it("keeps polling while the player has not confirmed and slows down on request", async () => {
    postMock
      .mockRejectedValueOnce(oauthError("authorization_pending"))
      .mockRejectedValueOnce(oauthError("slow_down"))
      .mockResolvedValueOnce({
        data: { access_token: "oauth-token", id_token: "id-token" },
      });
    const waits: number[] = [];

    const tokens = await waitForLittleSkinAuthorization(
      "client-1",
      device,
      undefined,
      async (ms) => {
        waits.push(ms);
      },
    );

    expect(tokens).toEqual({ accessToken: "oauth-token", idToken: "id-token" });
    expect(waits).toEqual([5000, 5000, 10000]);
    const body = postMock.mock.calls[0][1] as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: "client-1",
      device_code: "device-code",
    });
  });

  it("reports a declined and an expired sign-in with dedicated codes", async () => {
    const instant = async () => {};

    postMock.mockRejectedValueOnce(oauthError("access_denied"));
    await expect(
      waitForLittleSkinAuthorization("client-1", device, undefined, instant),
    ).rejects.toThrow(LITTLESKIN_OAUTH_DENIED);

    postMock.mockRejectedValueOnce(oauthError("expired_token"));
    await expect(
      waitForLittleSkinAuthorization("client-1", device, undefined, instant),
    ).rejects.toThrow(LITTLESKIN_OAUTH_EXPIRED);
  });

  it("stops without asking again once cancelled", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      waitForLittleSkinAuthorization("client-1", device, controller.signal),
    ).rejects.toThrow(LITTLESKIN_OAUTH_CANCELLED);
    expect(postMock).not.toHaveBeenCalled();
  });

  it("reads the chosen player out of the ID token", () => {
    expect(
      littleSkinProfileFromIdToken(
        idToken({
          sub: "1",
          selectedProfile: {
            id: "0123456789abcdef0123456789abcdef",
            name: "Steve",
          },
        }),
      ),
    ).toEqual({ id: "0123456789abcdef0123456789abcdef", name: "Steve" });
    expect(littleSkinProfileFromIdToken(idToken({ sub: "1" }))).toBeNull();
    expect(littleSkinProfileFromIdToken("not-a-jwt")).toBeNull();
  });

  it("trades the OAuth token for a Yggdrasil game token of that player", async () => {
    postMock.mockResolvedValue({
      data: {
        accessToken: "game-token",
        clientToken: "server-client",
        selectedProfile: {
          id: "0123456789abcdef0123456789abcdef",
          name: "Steve",
        },
      },
    });

    const result = await exchangeLittleSkinOAuthToken("oauth-token", {
      id: "01234567-89ab-cdef-0123-456789abcdef",
      name: "Steve",
    });

    expect(postMock).toHaveBeenCalledWith(
      "https://littleskin.cn/api/yggdrasil/authserver/oauth",
      { uuid: "0123456789abcdef0123456789abcdef" },
      expect.objectContaining({
        headers: { Authorization: "Bearer oauth-token" },
      }),
    );
    expect(result.session).toEqual({
      accessToken: "game-token",
      clientToken: "server-client",
    });
    expect(result.selectedProfile?.name).toBe("Steve");
  });

  it("never rethrows the request, which carries the OAuth token", async () => {
    postMock.mockRejectedValue(
      Object.assign(axiosError(401), {
        config: { headers: { Authorization: "Bearer oauth-token" } },
      }),
    );

    const failure = await exchangeLittleSkinOAuthToken("oauth-token", {
      id: "0123456789abcdef0123456789abcdef",
      name: "Steve",
    }).catch((error: unknown) => error);

    expect((failure as Error).message).toContain("status code 401");
    expect(JSON.stringify(failure)).not.toContain("oauth-token");
  });
});
