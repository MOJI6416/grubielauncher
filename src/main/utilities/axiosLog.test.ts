import { AxiosError, AxiosHeaders } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./failureBus", () => ({ reportFailure: vi.fn() }));

import { describeErrorBody, logAxiosError } from "./axiosLog";

function httpError(status: number, statusText: string, data: unknown) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError(
    `Request failed with status code ${status}`,
    "ERR_BAD_REQUEST",
    config,
    {},
    { status, statusText, data, headers: {}, config },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logAxiosError", () => {
  it("names the api's refusal code and message next to the status", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    logAxiosError(
      "Microsoft auth error",
      httpError(400, "Bad Request", {
        statusCode: 400,
        error: "Bad Request",
        message: "This Microsoft account has no Minecraft: Java Edition profile",
        code: "no_minecraft",
      }),
    );

    expect(log).toHaveBeenCalledWith(
      "Microsoft auth error:",
      "HTTP 400 Bad Request (no_minecraft: This Microsoft account has no Minecraft: Java Edition profile)",
    );
  });

  it("keeps the bare status when the body has nothing to add", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    logAxiosError("ElyBy auth error", httpError(502, "Bad Gateway", "<html>"));

    expect(log).toHaveBeenCalledWith("ElyBy auth error:", "HTTP 502 Bad Gateway");
  });
});

describe("describeErrorBody", () => {
  it("drops tokens, html and anything that is not a plain code", () => {
    expect(
      describeErrorBody({ message: "bad refresh_token=abc.def.ghi", code: "x y" }),
    ).toBe("bad refresh_token=<secret>");
    expect(describeErrorBody({ message: "<!doctype html>" })).toBe("");
    expect(describeErrorBody({ message: ["a", "b"], code: "bad_settings" })).toBe(
      "bad_settings: a; b",
    );
    expect(describeErrorBody("plain text")).toBe("");
    expect(describeErrorBody(null)).toBe("");
  });
});
