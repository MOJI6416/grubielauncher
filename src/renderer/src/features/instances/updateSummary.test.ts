import { describe, expect, it } from "vitest";
import {
  buildUpdateSummary,
  hasUpdateDetails,
  invertUpdateSummary,
  serversLostBySync,
  summaryCounts,
} from "./updateSummary";

const mod = (id: string, version: string) => ({
  title: id,
  provider: "modrinth",
  id,
  version: { id: version },
});

const side = (
  gameVersion: string,
  loader: string,
  mods: ReturnType<typeof mod>[],
) => ({ version: { id: gameVersion }, loader: { name: loader, mods } });

describe("buildUpdateSummary", () => {
  it("counts added, updated and removed mods", () => {
    const summary = buildUpdateSummary(
      side("1.21", "fabric", [
        mod("sodium", "1.0"),
        mod("lithium", "2.0"),
        mod("iris", "3.0"),
      ]),
      side("1.21", "fabric", [
        mod("sodium", "1.1"),
        mod("lithium", "2.0"),
        mod("rei", "9.0"),
      ]),
    );

    expect(summaryCounts(summary)).toEqual({
      added: 1,
      updated: 1,
      removed: 1,
      total: 3,
    });
    expect(summary.diff.unchanged).toBe(1);
  });

  it("reports a changed game version as its own line", () => {
    const summary = buildUpdateSummary(
      side("1.20.1", "fabric", []),
      side("1.21", "fabric", []),
    );

    expect(summary.gameVersion).toEqual({ from: "1.20.1", to: "1.21" });
    expect(summary.loader).toBeNull();
  });

  it("reports a changed loader as its own line", () => {
    const summary = buildUpdateSummary(
      side("1.21", "fabric", []),
      side("1.21", "neoforge", []),
    );

    expect(summary.loader).toEqual({ from: "fabric", to: "neoforge" });
    expect(summary.gameVersion).toBeNull();
  });

  it("keeps both lines when the pack jumps version and loader at once", () => {
    const summary = buildUpdateSummary(
      side("1.20.1", "forge", []),
      side("1.21", "neoforge", []),
    );

    expect(summary.gameVersion).toEqual({ from: "1.20.1", to: "1.21" });
    expect(summary.loader).toEqual({ from: "forge", to: "neoforge" });
  });

  it("ignores an empty side of the comparison", () => {
    const summary = buildUpdateSummary(
      side("", "fabric", []),
      side("1.21", "fabric", []),
    );

    expect(summary.gameVersion).toBeNull();
  });

  it("has nothing to show when only the build number moved", () => {
    const same = [mod("sodium", "1.0")];

    expect(
      hasUpdateDetails(
        buildUpdateSummary(
          side("1.21", "fabric", same),
          side("1.21", "fabric", same),
        ),
      ),
    ).toBe(false);
  });

  it("has details when the mods, the game version or the loader moved", () => {
    expect(
      hasUpdateDetails(
        buildUpdateSummary(
          side("1.21", "fabric", [mod("sodium", "1.0")]),
          side("1.21", "fabric", [mod("sodium", "1.1")]),
        ),
      ),
    ).toBe(true);

    expect(
      hasUpdateDetails(
        buildUpdateSummary(side("1.20.1", "fabric", []), side("1.21", "fabric", [])),
      ),
    ).toBe(true);

    expect(
      hasUpdateDetails(
        buildUpdateSummary(side("1.21", "fabric", []), side("1.21", "quilt", [])),
      ),
    ).toBe(true);
  });

  it("survives a modpack with no mods array", () => {
    const summary = buildUpdateSummary(
      { version: { id: "1.21" }, loader: { name: "vanilla" } } as never,
      { version: { id: "1.21" }, loader: { name: "vanilla" } } as never,
    );

    expect(summaryCounts(summary).total).toBe(0);
  });
});

describe("invertUpdateSummary", () => {
  it("swaps buckets and versions so the diff reads towards the server", () => {
    const summary = buildUpdateSummary(
      side("1.20.1", "forge", [mod("sodium", "1.0"), mod("lithium", "2.0")]),
      side("1.21", "neoforge", [mod("sodium", "1.1"), mod("rei", "9.0")]),
    );

    expect(summaryCounts(summary)).toEqual({
      added: 1,
      updated: 1,
      removed: 1,
      total: 3,
    });

    const inverted = invertUpdateSummary(summary);

    expect(inverted.diff.added.map((entry) => entry.title)).toEqual([
      "lithium",
    ]);
    expect(inverted.diff.removed.map((entry) => entry.title)).toEqual(["rei"]);
    expect(inverted.diff.updated[0]).toMatchObject({
      title: "sodium",
      fromVersion: "1.1",
      toVersion: "1.0",
    });
    expect(inverted.gameVersion).toEqual({ from: "1.21", to: "1.20.1" });
    expect(inverted.loader).toEqual({ from: "neoforge", to: "forge" });
    expect(inverted.diff.unchanged).toBe(summary.diff.unchanged);
  });

  it("keeps an empty summary empty", () => {
    const summary = buildUpdateSummary(
      side("1.21", "fabric", [mod("sodium", "1.0")]),
      side("1.21", "fabric", [mod("sodium", "1.0")]),
    );

    expect(hasUpdateDetails(invertUpdateSummary(summary))).toBe(false);
  });
});

describe("serversLostBySync", () => {
  it("names local servers the published list does not carry", () => {
    expect(
      serversLostBySync(
        [
          { name: "Сервер друзей", ip: "friends.example:25565" },
          { name: "Official", ip: "play.pack.example" },
        ],
        ["play.pack.example"],
      ),
    ).toEqual(["Сервер друзей"]);
  });

  it("ignores case and padding of the address", () => {
    expect(
      serversLostBySync(
        [{ name: "Official", ip: " Play.Pack.Example " }],
        ["play.pack.example"],
      ),
    ).toEqual([]);
  });

  it("reports every local server when the published list is empty", () => {
    expect(
      serversLostBySync([{ name: "", ip: "solo.example" }], []),
    ).toEqual(["solo.example"]);
  });

  it("survives inversion of the summary", () => {
    const summary = buildUpdateSummary(
      { version: { id: "1.21" }, loader: { name: "fabric", mods: [] } },
      {
        version: { id: "1.21" },
        loader: { name: "fabric", mods: [] },
        servers: [{ name: "Official", ip: "play.pack.example" }],
      },
    );

    expect(summary.remoteServers).toEqual(["play.pack.example"]);
    expect(invertUpdateSummary(summary).remoteServers).toEqual([
      "play.pack.example",
    ]);
  });
});
