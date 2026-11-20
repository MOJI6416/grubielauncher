import { describe, expect, it } from "vitest";
import { describeAuthFailure, readOAuthCallback } from "./authErrors";

function wrappedIpcError(inner: string) {
  return new Error(
    `Error invoking remote method 'auth:elyby:refresh': ${inner}`,
  );
}

describe("describeAuthFailure over the auth IPC boundary", () => {
  it("reads a provider outage forwarded from the main process", () => {
    const failure = describeAuthFailure(
      wrappedIpcError("AxiosError: Request failed with status code 503"),
      "elyby",
    );

    expect(failure.reason).toBe("provider");
  });

  it("reads a broken connection forwarded from the main process", () => {
    const failure = describeAuthFailure(
      wrappedIpcError("AxiosError: connect ECONNREFUSED 127.0.0.1:443"),
      "microsoft",
    );

    expect(failure.reason).toBe("network");
  });

  it("still calls a refused credential a rejection", () => {
    const failure = describeAuthFailure(
      wrappedIpcError("AxiosError: Request failed with status code 401"),
      "discord",
    );

    expect(failure.reason).toBe("rejected");
  });

  it("explains a Microsoft account without Minecraft: Java Edition", () => {
    const failure = describeAuthFailure(
      wrappedIpcError(
        "Error: auth_refused:no_minecraft: Request failed with status code 400",
      ),
      "microsoft",
    );

    expect(failure).toMatchObject({ reason: "noMinecraft", silent: false });
    expect(failure.code).toBe("MS-400");
  });

  it("reads every Xbox refusal the api names", () => {
    const cases: Array<[string, string]> = [
      ["xbox_profile_missing", "xboxProfile"],
      ["xbox_child_account", "childAccount"],
      ["xbox_banned", "xboxBanned"],
      ["xbox_region", "xboxRegion"],
    ];

    for (const [code, reason] of cases) {
      expect(
        describeAuthFailure(
          wrappedIpcError(
            `Error: auth_refused:${code}: Request failed with status code 400`,
          ),
          "microsoft",
        ).reason,
      ).toBe(reason);
    }
  });

  it("keeps an unnamed or unknown refusal on the general text", () => {
    expect(
      describeAuthFailure(
        wrappedIpcError(
          "Error: auth_refused:microsoft_failed: Request failed with status code 400",
        ),
        "microsoft",
      ).reason,
    ).toBe("unknown");
    expect(
      describeAuthFailure(
        wrappedIpcError("Error: auth_refused:constructor: Request failed with status code 400"),
        "microsoft",
      ).reason,
    ).toBe("unknown");
    expect(
      describeAuthFailure(
        wrappedIpcError("AxiosError: Request failed with status code 400"),
        "microsoft",
      ).reason,
    ).toBe("unknown");
  });

  it("has nothing to go on when the failure is swallowed into a null result", () => {
    const failure = describeAuthFailure(
      new Error("Empty refresh response"),
      "elyby",
    );

    expect(failure.reason).toBe("unknown");
  });
});

describe("readOAuthCallback", () => {
  it("passes the browser's callback through", () => {
    const callback = { code: "abc", provider: "microsoft" as const };

    expect(readOAuthCallback(callback)).toBe(callback);
  });

  it("turns a cancelled wait back into the failure the flow already handles", () => {
    const failureOf = (message: string) => {
      try {
        readOAuthCallback({ cancelled: true, message });
      } catch (error) {
        return describeAuthFailure(error, "microsoft");
      }
      throw new Error("expected the cancelled wait to throw");
    };

    expect(failureOf("OAuth server was restarted.")).toMatchObject({
      reason: "cancelled",
      silent: true,
    });
    expect(failureOf("OAuth sign-in was cancelled.")).toMatchObject({
      reason: "cancelled",
      silent: true,
    });
    expect(failureOf("OAuth callback timed out.")).toMatchObject({
      reason: "timeout",
      silent: false,
    });
  });
});
