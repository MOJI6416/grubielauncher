import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/types/Settings";
import { migrateInstancesViewPrefs } from "./viewPrefsMigration";

describe("migrateInstancesViewPrefs", () => {
  it("carries legacy preferences over when settings are untouched", () => {
    expect(
      migrateInstancesViewPrefs(DEFAULT_SETTINGS, {
        view: "grid",
        sort: "name",
      }),
    ).toEqual({ instancesView: "grid", instancesSort: "name" });
  });

  it("never overwrites preferences already set in settings", () => {
    expect(
      migrateInstancesViewPrefs(
        { ...DEFAULT_SETTINGS, instancesView: "grid", instancesSort: "manual" },
        { view: "list", sort: "name" },
      ),
    ).toBeNull();
  });

  it("ignores junk and values equal to the default", () => {
    expect(
      migrateInstancesViewPrefs(DEFAULT_SETTINGS, {
        view: "cards",
        sort: "whatever",
      }),
    ).toBeNull();
    expect(
      migrateInstancesViewPrefs(DEFAULT_SETTINGS, {
        view: "list",
        sort: "activity",
      }),
    ).toBeNull();
  });

  it("migrates each preference independently", () => {
    expect(
      migrateInstancesViewPrefs(DEFAULT_SETTINGS, { view: null, sort: "manual" }),
    ).toEqual({ instancesSort: "manual" });
  });
});
