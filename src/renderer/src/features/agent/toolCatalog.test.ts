import { describe, expect, it } from "vitest";
import {
  countAvailableTools,
  describeTool,
  describeToolSurface,
  unavailableReason,
} from "./toolCatalog";

describe("describeTool", () => {
  it("knows the risk of a destructive tool", () => {
    expect(describeTool("delete_instance").risk).toBe("destructive");
  });

  it("puts an unknown tool into the catch-all group", () => {
    expect(describeTool("teleport_player")).toEqual({
      name: "teleport_player",
      group: "other",
      risk: "read",
      need: "none",
    });
  });
});

describe("describeToolSurface", () => {
  it("keeps every catalog tool listed and marks what is off", () => {
    const groups = describeToolSurface(["list_instances", "get_instance"]);
    const instances = groups.find((group) => group.id === "instances");

    expect(instances?.availableCount).toBe(2);
    expect(
      instances?.entries.find((entry) => entry.name === "add_mods"),
    ).toBeUndefined();
    expect(
      instances?.entries.find((entry) => entry.name === "delete_instance")
        ?.available,
    ).toBe(false);
  });

  it("keeps the declared group order", () => {
    const ids = describeToolSurface([]).map((group) => group.id);

    expect(ids).toEqual([
      "instances",
      "content",
      "worlds",
      "diagnostics",
      "skins",
      "system",
      "dialogue",
    ]);
  });

  it("shows a tool the catalog does not know about instead of hiding it", () => {
    const groups = describeToolSurface(["mystery_tool"]);
    const other = groups.find((group) => group.id === "other");

    expect(other?.entries.map((entry) => entry.name)).toEqual(["mystery_tool"]);
    expect(other?.availableCount).toBe(1);
  });

  it("counts the whole surface", () => {
    const all = describeToolSurface([]);
    const totals = countAvailableTools(all);

    expect(totals.available).toBe(0);
    expect(totals.total).toBeGreaterThan(30);
  });
});

describe("unavailableReason", () => {
  it("blames the network before the account", () => {
    expect(
      unavailableReason("both", { isOnline: false, hasAccount: false }),
    ).toBe("internet");
  });

  it("blames the account when the network is fine", () => {
    expect(
      unavailableReason("account", { isOnline: true, hasAccount: false }),
    ).toBe("account");
  });

  it("stays silent for a tool that needs nothing", () => {
    expect(
      unavailableReason("none", { isOnline: false, hasAccount: false }),
    ).toBeNull();
  });
});
