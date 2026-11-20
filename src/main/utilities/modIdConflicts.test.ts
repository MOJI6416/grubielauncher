import { describe, expect, it } from "vitest";
import { groupModIdConflicts, ownModIds } from "./modIdConflicts";

describe("mod id conflicts", () => {
  it("finds several jars of one mod and ignores jar-in-jar copies", () => {
    expect(
      ownModIds({
        provides: ["tacz", "mixinextras"],
        requires: [],
        embedded: ["mixinextras"],
      }),
    ).toEqual(["tacz"]);

    expect(
      groupModIdConflicts([
        { fileName: "tacz-1.0.3.jar", ids: ["tacz"] },
        { fileName: "tacz-1.1.4.jar", ids: ["tacz"] },
        { fileName: "tacz-1.0.0.jar", ids: ["tacz"] },
        { fileName: "sodium.jar", ids: ["sodium"] },
        { fileName: "lib.jar", ids: ["mixinextras"] },
      ]),
    ).toEqual([
      {
        modId: "tacz",
        files: ["tacz-1.0.0.jar", "tacz-1.0.3.jar", "tacz-1.1.4.jar"],
      },
    ]);
  });

  it("reports one group when two jars share several ids", () => {
    expect(
      groupModIdConflicts([
        { fileName: "a-1.jar", ids: ["alpha", "alpha_api"] },
        { fileName: "a-2.jar", ids: ["alpha", "alpha_api"] },
      ]),
    ).toEqual([{ modId: "alpha", files: ["a-1.jar", "a-2.jar"] }]);
  });
});
