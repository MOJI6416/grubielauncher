import { describe, expect, it } from "vitest";
import { describeAuthFailure } from "./authErrors";

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

  it("has nothing to go on when the failure is swallowed into a null result", () => {
    const failure = describeAuthFailure(
      new Error("Empty refresh response"),
      "elyby",
    );

    expect(failure.reason).toBe("unknown");
  });
});
