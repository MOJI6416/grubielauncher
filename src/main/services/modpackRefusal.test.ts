import { describe, expect, it } from "vitest";
import { modpackRefusalOf } from "./modpackRefusal";

function apiError(status: number, data: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data },
  });
}

describe("modpackRefusalOf", () => {
  it("reads which files the api found malware in", () => {
    expect(
      modpackRefusalOf(
        apiError(422, {
          statusCode: 422,
          error: "modpack_infected",
          message: "Known malware was found in helper.jar.",
          files: [{ file: "helper.jar", threats: ["fractureiser"] }],
        }),
      ),
    ).toEqual({
      code: "infected",
      files: [{ file: "helper.jar", threats: ["fractureiser"] }],
    });
  });

  it("maps the other refusals of the jar check", () => {
    expect(
      modpackRefusalOf(
        apiError(422, {
          error: "modpack_files_missing",
          files: [{ file: "a.jar" }],
        }),
      ),
    ).toEqual({ code: "filesMissing", files: [{ file: "a.jar" }] });
    expect(
      modpackRefusalOf(
        apiError(422, { error: "modpack_scan_too_large", files: [] }),
      ),
    ).toEqual({ code: "tooLarge", files: [] });
    expect(
      modpackRefusalOf(apiError(503, { error: "modpack_scan_unavailable" })),
    ).toEqual({ code: "scanUnavailable", files: [] });
  });

  it("leaves every other failure to the caller", () => {
    expect(
      modpackRefusalOf(apiError(422, { message: "Validation failed" })),
    ).toBeNull();
    expect(
      modpackRefusalOf(apiError(500, { error: "modpack_infected" })),
    ).toBeNull();
    expect(modpackRefusalOf(new Error("socket hang up"))).toBeNull();
    expect(modpackRefusalOf(undefined)).toBeNull();
  });

  it("keeps only well-formed, bounded file entries", () => {
    const refusal = modpackRefusalOf(
      apiError(422, {
        error: "modpack_infected",
        files: [
          { file: "x".repeat(500), threats: ["a", 3, null] },
          { file: 42 },
          "nonsense",
        ],
      }),
    );

    expect(refusal?.files).toEqual([{ file: "x".repeat(200), threats: ["a"] }]);
  });
});
