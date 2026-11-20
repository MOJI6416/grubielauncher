import { describe, expect, it } from "vitest";
import { describeUpdateError } from "./updateError";

const t = (key: string, options?: Record<string, unknown>) =>
  options?.target ? `${key}:${String(options.target)}` : key;

describe("describeUpdateError", () => {
  it("names the cause of a network failure instead of the raw updater text", () => {
    expect(
      describeUpdateError(
        "net::ERR_NAME_NOT_RESOLVED https://github.com/x/latest.yml",
        t,
      ),
    ).toBe("errors.cause.dns:appUpdate.errors.target appUpdate.errors.later");
  });

  it("falls back to a plain sentence when the cause is unknown", () => {
    expect(describeUpdateError("Something odd happened", t)).toBe(
      "appUpdate.errors.unknown",
    );
    expect(describeUpdateError(undefined, t)).toBe("appUpdate.errors.unknown");
  });

  it("drops the retry sentence in the short form for the small start window", () => {
    expect(
      describeUpdateError("net::ERR_CONNECTION_TIMED_OUT", t, { short: true }),
    ).toBe("errors.cause.timeout:appUpdate.errors.target");
    expect(describeUpdateError("odd", t, { short: true })).toBe(
      "appUpdate.errors.startAnyway",
    );
  });
});
