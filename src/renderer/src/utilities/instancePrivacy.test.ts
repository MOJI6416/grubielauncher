import { describe, expect, it } from "vitest";
import {
  EXCLUDED_INSTANCE_PATHS,
  PRIVATE_INSTANCE_PATHS,
  hasNestedInstanceExclusions,
  isExcludedInstancePath,
} from "@/shared/instancePrivacy";
import {
  createForbiddenPathSet,
  filterSelectableSharePaths,
  isForbiddenSharePath,
} from "./selectPaths";

const PERSONAL_FILES = [
  "sessions.json",
  "statistics.json",
  "usercache.json",
  "usernamecache.json",
  "notes.txt",
  "authlib-injector.log",
  "servers.dat",
  "servers.dat_old",
  "command_history.txt",
  "realms_persistence.json",
];

describe("excluded instance paths", () => {
  it("matches an entry and everything under it, whatever the separator or case", () => {
    expect(isExcludedInstancePath("sessions.json")).toBe(true);
    expect(isExcludedInstancePath("Sessions.JSON")).toBe(true);
    expect(isExcludedInstancePath("logs")).toBe(true);
    expect(isExcludedInstancePath("logs/latest.log")).toBe(true);
    expect(isExcludedInstancePath("logs\\2026-08\\old.log.gz")).toBe(true);
    expect(isExcludedInstancePath("./crash-reports/crash.txt")).toBe(true);
    expect(isExcludedInstancePath("storage/trash/removed.jar")).toBe(true);
  });

  it("leaves pack content and launcher-managed shares alone", () => {
    expect(isExcludedInstancePath("config/mod.toml")).toBe(false);
    expect(isExcludedInstancePath("storage")).toBe(false);
    expect(isExcludedInstancePath("storage/server-overrides/a.toml")).toBe(
      false,
    );
    expect(isExcludedInstancePath("storage/worlds/My World")).toBe(false);
    expect(isExcludedInstancePath("config/sessions.json")).toBe(false);
    expect(isExcludedInstancePath("sessions.json.bak")).toBe(false);
    expect(isExcludedInstancePath("")).toBe(false);
  });

  it("applies the same list inside an installed server", () => {
    expect(isExcludedInstancePath("server/logs/latest.log")).toBe(true);
    expect(isExcludedInstancePath("server/crash-reports")).toBe(true);
    expect(isExcludedInstancePath("server/usercache.json")).toBe(true);
    expect(isExcludedInstancePath("server/ops.json")).toBe(true);
    expect(isExcludedInstancePath("server/banned-ips.json")).toBe(true);
    expect(isExcludedInstancePath("server/mods/mod.jar")).toBe(false);
    expect(isExcludedInstancePath("server")).toBe(false);
  });

  it("reports folders that hold nested exclusions", () => {
    expect(hasNestedInstanceExclusions("storage")).toBe(true);
    expect(hasNestedInstanceExclusions("server")).toBe(true);
    expect(hasNestedInstanceExclusions("config")).toBe(false);
    expect(hasNestedInstanceExclusions("logs")).toBe(false);
  });

  it("lists every private file in one place", () => {
    for (const file of PERSONAL_FILES) {
      expect(PRIVATE_INSTANCE_PATHS as readonly string[]).toContain(file);
      expect(EXCLUDED_INSTANCE_PATHS).toContain(file);
    }
  });
});

describe("personal files never leave the instance", () => {
  it("stays out of the zip export", () => {
    for (const file of PERSONAL_FILES) {
      expect(isExcludedInstancePath(file)).toBe(true);
    }

    expect(isExcludedInstancePath("logs")).toBe(true);
    expect(isExcludedInstancePath("crash-reports")).toBe(true);
    expect(isExcludedInstancePath("screenshots/2026-08-21.png")).toBe(true);
    expect(isExcludedInstancePath("version.json")).toBe(false);
    expect(isExcludedInstancePath("config")).toBe(false);
  });

  it("cannot be picked for sharing or publishing", () => {
    const forbidden = createForbiddenPathSet("1.21.1", "neoforge");

    for (const file of PERSONAL_FILES) {
      expect(isForbiddenSharePath(file, forbidden)).toBe(true);
    }

    expect(isForbiddenSharePath("logs/latest.log", forbidden)).toBe(true);
    expect(
      filterSelectableSharePaths(
        ["config", "sessions.json", "notes.txt", "kubejs"],
        forbidden,
      ),
    ).toEqual(["config", "kubejs"]);
  });
});
