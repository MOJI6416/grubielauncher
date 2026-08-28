import { describe, expect, it } from "vitest";
import { describeArguments, permissionActions } from "./permissionDetails";

describe("describeArguments", () => {
  it("returns nothing to show for empty arguments", () => {
    expect(describeArguments("{}")).toEqual({ rows: [], hidden: 0, raw: null });
    expect(describeArguments(undefined).rows).toEqual([]);
  });

  it("turns a flat object into rows", () => {
    const summary = describeArguments(
      JSON.stringify({ instance: "Fabric 26.2", memory: 4096, force: true }),
    );

    expect(summary.rows).toEqual([
      { key: "instance", value: { kind: "text", text: "Fabric 26.2" } },
      { key: "memory", value: { kind: "text", text: "4096" } },
      { key: "force", value: { kind: "text", text: "true" } },
    ]);
  });

  it("shortens a long value", () => {
    const summary = describeArguments(
      JSON.stringify({ arguments: "-X".repeat(200) }),
    );

    expect(summary.rows[0].value).toEqual({
      kind: "text",
      text: `${"-X".repeat(200).slice(0, 90)}…`,
    });
  });

  it("lists array items and counts the rest", () => {
    const summary = describeArguments(
      JSON.stringify({ mods: ["sodium", "lithium", "ferrite", "iris", "c2me"] }),
    );

    expect(summary.rows[0].value).toEqual({
      kind: "list",
      items: ["sodium", "lithium", "ferrite", "iris"],
      more: 1,
    });
  });

  it("reads a name out of an array of objects", () => {
    const summary = describeArguments(
      JSON.stringify({ projects: [{ name: "sodium" }, { name: "iris" }] }),
    );

    expect(summary.rows[0].value).toEqual({
      kind: "list",
      items: ["sodium", "iris"],
      more: 0,
    });
  });

  it("falls back to a count for opaque objects", () => {
    const summary = describeArguments(
      JSON.stringify({ patch: { a: 1, b: 2 } }),
    );

    expect(summary.rows[0].value).toEqual({ kind: "count", count: 2 });
  });

  it("drops empty values instead of showing blank rows", () => {
    const summary = describeArguments(
      JSON.stringify({ name: "", list: [], nested: {}, keep: "yes" }),
    );

    expect(summary.rows.map((row) => row.key)).toEqual(["keep"]);
  });

  it("caps the rows and reports how many are hidden", () => {
    const summary = describeArguments(
      JSON.stringify({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 }),
    );

    expect(summary.rows).toHaveLength(6);
    expect(summary.hidden).toBe(2);
  });

  it("keeps the raw payload when it cannot be parsed", () => {
    const summary = describeArguments("{not json");

    expect(summary.rows).toEqual([]);
    expect(summary.raw).toBe("{not json");
  });
});

describe("permissionActions", () => {
  it("never offers always-allow for a destructive tool", () => {
    expect(permissionActions("destructive")).toEqual(["deny", "once"]);
  });

  it("offers always-allow for a write tool", () => {
    expect(permissionActions("write")).toEqual(["deny", "always", "once"]);
  });
});
