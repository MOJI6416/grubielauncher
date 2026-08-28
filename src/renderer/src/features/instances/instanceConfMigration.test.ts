import { describe, expect, it } from "vitest";
import type { IVersionConf } from "@/types/IVersion";
import {
  applyInstanceConfMigration,
  isEmptyMigration,
  planInstanceConfMigration,
} from "./instanceConfMigration";

function conf(overrides: Partial<IVersionConf> = {}): IVersionConf {
  return {
    name: "Pack",
    loader: { name: "fabric", mods: [], version: "0.16.0" },
    version: { id: "1.21", type: "release", url: "", serverManager: false },
    build: 0,
    downloadedVersion: false,
    lastUpdate: new Date("2026-01-01T00:00:00.000Z"),
    runArguments: { game: "", jvm: "" },
    image: "",
    ...overrides,
  } as IVersionConf;
}

const launched = new Date("2026-08-19T02:42:47.787Z");

describe("planInstanceConfMigration", () => {
  it("drops only an empty shareCode, never a real one", () => {
    expect(
      planInstanceConfMigration(conf({ shareCode: "" })).dropEmptyShareCode,
    ).toBe(true);
    expect(
      planInstanceConfMigration(conf({ shareCode: "abc" })).dropEmptyShareCode,
    ).toBe(false);
    expect(planInstanceConfMigration(conf()).dropEmptyShareCode).toBe(false);
  });

  it("does nothing for an instance with no empty shareCode", () => {
    expect(isEmptyMigration(planInstanceConfMigration(conf()))).toBe(true);
  });
});

describe("applyInstanceConfMigration", () => {
  it("removes the field instead of blanking it", () => {
    const target = conf({ lastLaunch: launched, shareCode: "", build: 1 });

    applyInstanceConfMigration(target, planInstanceConfMigration(target));

    const written = JSON.parse(JSON.stringify(target));
    expect("shareCode" in written).toBe(false);
    expect(target.build).toBe(0);
  });

  it("keeps lastLaunch of an instance whose statistics were never written", () => {
    const target = conf({ lastLaunch: launched, shareCode: "" });

    applyInstanceConfMigration(target, planInstanceConfMigration(target));

    expect(target.lastLaunch).toBe(launched);
  });

  it("touches nothing when the plan is empty", () => {
    const target = conf({ lastLaunch: launched, shareCode: "abc", build: 4 });

    applyInstanceConfMigration(target, planInstanceConfMigration(target));

    expect(target.lastLaunch).toBe(launched);
    expect(target.shareCode).toBe("abc");
    expect(target.build).toBe(4);
  });
});
