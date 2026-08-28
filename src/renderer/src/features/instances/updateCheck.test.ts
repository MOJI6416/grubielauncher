import { beforeEach, describe, expect, it } from "vitest";
import { getDefaultStore } from "jotai";
import { IVersionConf } from "@/types/IVersion";
import {
  checkFingerprint,
  claimUpdateCheck,
  claimUpdatesForAccount,
  compareBuilds,
  expandedUpdateKeyAtom,
  forgetInstanceUpdates,
  isUpdateCheckable,
  instanceUpdateSummariesAtom,
  instanceUpdatesAtom,
  recordModpackComparison,
  releaseUpdateCheck,
  requestUpdateDetails,
  retainInstanceUpdates,
} from "./updateCheck";

function conf(patch: Partial<IVersionConf>): IVersionConf {
  return { build: 0, ...patch } as IVersionConf;
}

describe("compareBuilds", () => {
  it("reports behind when the server has a newer build", () => {
    expect(compareBuilds(conf({ build: 3 }), { build: 5 })).toBe("behind");
  });

  it("reports sync on equal builds", () => {
    expect(compareBuilds(conf({ build: 5 }), { build: 5 })).toBe("sync");
  });

  it("calls a downloaded copy ahead only when it really is newer", () => {
    expect(
      compareBuilds(conf({ build: 7, downloadedVersion: true }), { build: 5 }),
    ).toBe("ahead");
    expect(compareBuilds(conf({ build: 7 }), { build: 5 })).toBe("sync");
  });

  it("treats missing builds as zero", () => {
    expect(compareBuilds(conf({}), {} as { build: number })).toBe("sync");
    expect(compareBuilds(conf({}), { build: 1 })).toBe("behind");
  });
});

const store = getDefaultStore();

function localConf(patch: Partial<IVersionConf>): IVersionConf {
  return {
    build: 1,
    version: { id: "1.21" },
    loader: { name: "fabric", mods: [] },
    ...patch,
  } as IVersionConf;
}

const remote = (
  build: number,
  gameVersion = "1.21",
  loader = "fabric",
  mods: unknown[] = [],
) =>
  ({
    build,
    conf: { version: { id: gameVersion }, loader: { name: loader, mods } },
  }) as never;

describe("recordModpackComparison", () => {
  beforeEach(() => {
    store.set(instanceUpdatesAtom, {});
    store.set(instanceUpdateSummariesAtom, {});
  });

  it("stores a summary only while the instance is behind", () => {
    expect(
      recordModpackComparison("a", localConf({}), remote(4, "1.21.1")),
    ).toBe("behind");
    expect(store.get(instanceUpdateSummariesAtom).a.gameVersion).toEqual({
      from: "1.21",
      to: "1.21.1",
    });
  });

  it("drops the summary once the instance catches up", () => {
    recordModpackComparison("a", localConf({}), remote(4, "1.21.1"));
    expect(
      recordModpackComparison("a", localConf({ build: 4 }), remote(4)),
    ).toBe("sync");

    expect(store.get(instanceUpdatesAtom).a).toBe("sync");
    expect(store.get(instanceUpdateSummariesAtom).a).toBeUndefined();
  });

  it("keeps summaries of different instances apart", () => {
    recordModpackComparison("a", localConf({}), remote(4, "1.21", "neoforge"));
    recordModpackComparison("b", localConf({}), remote(9, "1.22"));

    expect(store.get(instanceUpdateSummariesAtom).a.loader).toEqual({
      from: "fabric",
      to: "neoforge",
    });
    expect(store.get(instanceUpdateSummariesAtom).b.gameVersion).toEqual({
      from: "1.21",
      to: "1.22",
    });
  });
});

describe("retainInstanceUpdates", () => {
  beforeEach(() => {
    store.set(instanceUpdatesAtom, {});
    store.set(instanceUpdateSummariesAtom, {});
    store.set(expandedUpdateKeyAtom, null);
  });

  it("drops instances that are no longer linked to a published pack", () => {
    recordModpackComparison("a", localConf({}), remote(4, "1.21.1"));
    recordModpackComparison("b", localConf({}), remote(9, "1.22"));

    retainInstanceUpdates(["b"]);

    expect(store.get(instanceUpdatesAtom)).toEqual({ b: "behind" });
    expect(store.get(instanceUpdateSummariesAtom).a).toBeUndefined();
    expect(store.get(instanceUpdateSummariesAtom).b).toBeDefined();
  });

  it("does not resurrect a badge for a rebuilt instance at the same path", () => {
    recordModpackComparison("versions/Pack", localConf({}), remote(4));
    retainInstanceUpdates([]);

    expect(store.get(instanceUpdatesAtom)["versions/Pack"]).toBeUndefined();
  });

  it("closes details pinned to a dropped instance", () => {
    recordModpackComparison("a", localConf({}), remote(4));
    requestUpdateDetails("a");

    retainInstanceUpdates(["b"]);

    expect(store.get(expandedUpdateKeyAtom)).toBeNull();
  });

  it("keeps untouched state when every key survives", () => {
    recordModpackComparison("a", localConf({}), remote(4));
    const before = store.get(instanceUpdatesAtom);

    retainInstanceUpdates(["a", "b"]);

    expect(store.get(instanceUpdatesAtom)).toBe(before);
  });
});

describe("forgetInstanceUpdates", () => {
  beforeEach(() => {
    store.set(instanceUpdatesAtom, {});
    store.set(instanceUpdateSummariesAtom, {});
    store.set(expandedUpdateKeyAtom, null);
  });

  it("clears one instance without touching the rest", () => {
    recordModpackComparison("a", localConf({}), remote(4));
    recordModpackComparison("b", localConf({}), remote(4));

    forgetInstanceUpdates("a");

    expect(store.get(instanceUpdatesAtom)).toEqual({ b: "behind" });
    expect(store.get(instanceUpdateSummariesAtom).a).toBeUndefined();
  });
});

describe("update check cooldown", () => {
  beforeEach(() => {
    forgetInstanceUpdates();
  });

  it("lets the first check through and holds back an immediate repeat", () => {
    const print = checkFingerprint("/a", conf({ shareCode: "x", build: 2 }));

    expect(claimUpdateCheck(print, 1000)).toBe(true);
    expect(claimUpdateCheck(print, 1000 + 60_000)).toBe(false);
    expect(claimUpdateCheck(print, 1000 + 5 * 60_000)).toBe(true);
  });

  it("checks again once the local build changed", () => {
    const before = checkFingerprint("/a", conf({ shareCode: "x", build: 2 }));
    const after = checkFingerprint("/a", conf({ shareCode: "x", build: 3 }));

    expect(claimUpdateCheck(before, 1000)).toBe(true);
    expect(claimUpdateCheck(after, 1000)).toBe(true);
  });

  it("releases a claim that produced no answer", () => {
    const print = checkFingerprint("/a", conf({ shareCode: "x", build: 2 }));

    expect(claimUpdateCheck(print, 1000)).toBe(true);
    releaseUpdateCheck(print);
    expect(claimUpdateCheck(print, 1000)).toBe(true);
  });

  it("drops the cooldown of a forgotten instance", () => {
    const print = checkFingerprint("/a", conf({ shareCode: "x", build: 2 }));

    expect(claimUpdateCheck(print, 1000)).toBe(true);
    forgetInstanceUpdates("/a");
    expect(claimUpdateCheck(print, 1000)).toBe(true);
  });

  it("checks again for another account even inside the cooldown", () => {
    const mine = checkFingerprint(
      "/a",
      conf({ shareCode: "x", build: 2 }),
      "discord_one",
    );
    const other = checkFingerprint(
      "/a",
      conf({ shareCode: "x", build: 2 }),
      "microsoft_two",
    );

    expect(claimUpdateCheck(mine, 1000)).toBe(true);
    expect(claimUpdateCheck(other, 1000)).toBe(true);
  });
});

describe("claimUpdatesForAccount", () => {
  beforeEach(() => {
    forgetInstanceUpdates();
    store.set(instanceUpdatesAtom, {});
    store.set(instanceUpdateSummariesAtom, {});
  });

  it("wipes badges of the previous account even after the library was unmounted", () => {
    claimUpdatesForAccount("discord_one");
    recordModpackComparison("/a", localConf({}), remote(4, "1.21.1"));

    expect(claimUpdatesForAccount("microsoft_two")).toBe(true);
    expect(store.get(instanceUpdatesAtom)).toEqual({});
    expect(store.get(instanceUpdateSummariesAtom)).toEqual({});
  });

  it("keeps badges while the account stays the same", () => {
    claimUpdatesForAccount("discord_one");
    recordModpackComparison("/a", localConf({}), remote(4));

    expect(claimUpdatesForAccount("discord_one")).toBe(false);
    expect(store.get(instanceUpdatesAtom)["/a"]).toBe("behind");
  });
});

describe("isUpdateCheckable", () => {
  const account = (type: string, nickname: string) =>
    ({ type, nickname }) as never;

  it("checks a published instance of the active account", () => {
    expect(
      isUpdateCheckable(
        { shareCode: "abc", owner: "discord_Lumavia" },
        account("discord", "Lumavia"),
      ),
    ).toBe(true);
  });

  it("skips an instance published under another account", () => {
    expect(
      isUpdateCheckable(
        { shareCode: "abc", owner: "microsoft_NoctVale" },
        account("discord", "Lumavia"),
      ),
    ).toBe(false);
  });

  it("skips instances without a share code or without an account", () => {
    expect(
      isUpdateCheckable(
        { shareCode: undefined, owner: "discord_Lumavia" },
        account("discord", "Lumavia"),
      ),
    ).toBe(false);
    expect(
      isUpdateCheckable({ shareCode: "abc", owner: "discord_Lumavia" }, null),
    ).toBe(false);
  });
});
