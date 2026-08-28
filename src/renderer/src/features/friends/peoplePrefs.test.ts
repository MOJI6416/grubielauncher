import { describe, expect, it } from "vitest";
import { normalizePeoplePrefs } from "./peoplePrefs";

describe("normalizePeoplePrefs", () => {
  it("keeps valid values", () => {
    expect(normalizePeoplePrefs({ filter: "unread", sort: "name" })).toEqual({
      filter: "unread",
      sort: "name",
    });
  });

  it("falls back on unknown values", () => {
    expect(normalizePeoplePrefs({ filter: "nope", sort: "nope" })).toEqual({
      filter: "all",
      sort: "activity",
    });
  });

  it("falls back on junk", () => {
    expect(normalizePeoplePrefs(null)).toEqual({
      filter: "all",
      sort: "activity",
    });
    expect(normalizePeoplePrefs("x")).toEqual({
      filter: "all",
      sort: "activity",
    });
  });
});
