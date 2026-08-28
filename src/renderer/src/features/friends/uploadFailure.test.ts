import { describe, expect, it } from "vitest";
import { classifyError } from "@/shared/errors";
import { uploadFailure } from "./uploadFailure";

describe("uploadFailure", () => {
  it("carries the http status of a rejected upload into the classifier", () => {
    expect(
      classifyError(uploadFailure(new Error("upload_failed_413")), {
        side: "grubie",
      }),
    ).toMatchObject({ cause: "tooLarge", status: 413, code: "GRB-413" });

    expect(
      classifyError(uploadFailure(new Error("upload_failed_429")), {
        side: "grubie",
      }),
    ).toMatchObject({ cause: "rateLimited", status: 429 });
  });

  it("names a transport failure as a lost connection", () => {
    expect(
      classifyError(uploadFailure(new Error("upload_failed")), {
        side: "grubie",
      }),
    ).toMatchObject({ cause: "offline", side: "network", code: "NET-OFFLINE" });
  });

  it("leaves unrecognised errors untouched", () => {
    const error = new Error("upload_aborted");
    expect(uploadFailure(error)).toBe(error);
    expect(classifyError(uploadFailure(error)).cause).toBe("unknown");
  });
});
