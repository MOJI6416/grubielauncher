import { describe, expect, it } from "vitest";
import {
  AUTH_PROVIDER_UNAVAILABLE,
  classifyRefreshFailure,
  providerOutageError,
} from "./authRefresh";

function ipcError(channel: string, inner: string) {
  return new Error(`Error invoking remote method '${channel}': ${inner}`);
}

function httpError(status: number, data?: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data },
  });
}

describe("classifyRefreshFailure", () => {
  it("reads a refused refresh token as an expired session", () => {
    for (const status of [400, 401, 403]) {
      expect(
        classifyRefreshFailure(
          ipcError(
            "auth:microsoft:refresh",
            `AxiosError: Request failed with status code ${status}`,
          ),
        ),
      ).toBe("expired");
    }
  });

  it("keeps the Ely.by 400 from report GRB-M5DN-0106 an expired session", () => {
    expect(
      classifyRefreshFailure(
        ipcError(
          "auth:elyby:refresh",
          "AxiosError: Request failed with status code 400",
        ),
      ),
    ).toBe("expired");
  });

  it("tells a sign-in provider outage apart from our own server failing", () => {
    expect(
      classifyRefreshFailure(
        ipcError(
          "auth:microsoft:refresh",
          `Error: ${AUTH_PROVIDER_UNAVAILABLE}: Request failed with status code 503`,
        ),
      ),
    ).toBe("providerDown");
    expect(
      classifyRefreshFailure(
        ipcError(
          "auth:microsoft:refresh",
          "AxiosError: Request failed with status code 503",
        ),
      ),
    ).toBe("serviceDown");
  });

  it("reads server errors, throttling and dead connections as an outage", () => {
    for (const inner of [
      "AxiosError: Request failed with status code 500",
      "AxiosError: Request failed with status code 502",
      "AxiosError: Request failed with status code 429",
      "Error: connect ECONNREFUSED 127.0.0.1:443",
      "Error: getaddrinfo ENOTFOUND api.grubielauncher.com",
      "Error: read ECONNRESET",
      "AxiosError: timeout of 30000ms exceeded",
      "AxiosError: Network Error",
      "Error: certificate has expired CERT_HAS_EXPIRED",
    ]) {
      expect(
        classifyRefreshFailure(ipcError("auth:microsoft:refresh", inner)),
      ).toBe("serviceDown");
    }
  });

  it("leaves anything else unclassified", () => {
    expect(
      classifyRefreshFailure(
        ipcError("auth:microsoft:refresh", "Error: Invalid refreshToken"),
      ),
    ).toBe("unknown");
    expect(
      classifyRefreshFailure(
        ipcError(
          "auth:microsoft:refresh",
          "AxiosError: Request failed with status code 404",
        ),
      ),
    ).toBe("unknown");
  });
});

describe("providerOutageError", () => {
  it("marks the api's 503 for an unreachable sign-in provider", () => {
    const marked = providerOutageError(
      httpError(503, {
        message: "Authentication provider is unavailable, please try again",
        error: "Service Unavailable",
        statusCode: 503,
      }),
    );

    expect(marked?.message).toContain(AUTH_PROVIDER_UNAVAILABLE);
    expect(classifyRefreshFailure(marked)).toBe("providerDown");
    expect(
      classifyRefreshFailure(
        ipcError("auth:microsoft:refresh", `Error: ${marked?.message}`),
      ),
    ).toBe("providerDown");
  });

  it("does not mark a 503 that the provider did not cause", () => {
    expect(
      providerOutageError(httpError(503, "<html>Service Unavailable</html>")),
    ).toBeNull();
    expect(providerOutageError(httpError(503))).toBeNull();
    expect(
      providerOutageError(
        httpError(400, {
          message: "Authentication provider is unavailable, please try again",
        }),
      ),
    ).toBeNull();
    expect(providerOutageError(new Error("connect ECONNREFUSED"))).toBeNull();
  });
});
