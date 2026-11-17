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
  LITTLESKIN_INVALID_CREDENTIALS,
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
