import { describe, expect, it } from "vitest";
import {
  EMPTY_INSTANCES_FILE,
  InstancesFile,
  assignToGroup,
  createGroup,
  forgetInstanceKey,
  mergeLegacyOrganize,
  normalizeInstancesFile,
  removeGroup,
  renameGroup,
  renameInstanceKey,
  reorderGroups,
  toggleGroup,
  toggleUngrouped,
} from "./instancesFile";

function fileWith(partial: Partial<InstancesFile>): InstancesFile {
  return { ...EMPTY_INSTANCES_FILE, ...partial };
}

describe("normalizeInstancesFile", () => {
  it("returns an empty file for junk input", () => {
    expect(normalizeInstancesFile(null)).toEqual(EMPTY_INSTANCES_FILE);
    expect(normalizeInstancesFile("nope")).toEqual(EMPTY_INSTANCES_FILE);
    expect(normalizeInstancesFile([])).toEqual(EMPTY_INSTANCES_FILE);
  });

  it("drops malformed entries and duplicates", () => {
    const result = normalizeInstancesFile({
      version: 99,
      tags: { a: ["x", "x", 5], b: [], "": ["y"] },
      order: ["a", "a", 7, "b"],
      groups: [
        { id: "g1", name: " Modded ", keys: ["a", "a"] },
        { id: "g1", name: "duplicate id" },
        { id: "", name: "no id" },
        { id: "g2", name: "   " },
        { id: "g3", name: "Collapsed", keys: [], collapsed: true },
        "garbage",
      ],
    });

    expect(result).toEqual({
      version: 1,
      tags: { a: ["x"] },
      order: ["a", "b"],
      groups: [
        { id: "g1", name: "Modded", keys: ["a"] },
        { id: "g3", name: "Collapsed", keys: [], collapsed: true },
      ],
    });
  });
});

describe("mergeLegacyOrganize", () => {
  it("takes legacy data only when the file has none", () => {
    const merged = mergeLegacyOrganize(EMPTY_INSTANCES_FILE, {
      tags: { a: ["fun"] },
      order: ["a", "b"],
    });

    expect(merged.tags).toEqual({ a: ["fun"] });
    expect(merged.order).toEqual(["a", "b"]);
  });

  it("keeps existing data untouched", () => {
    const existing = fileWith({ tags: { b: ["own"] }, order: ["b"] });
    const merged = mergeLegacyOrganize(existing, {
      tags: { a: ["legacy"] },
      order: ["a"],
    });

    expect(merged.tags).toEqual({ b: ["own"] });
    expect(merged.order).toEqual(["b"]);
  });
});

describe("renameInstanceKey", () => {
  it("moves tags, order and group membership", () => {
    const file = fileWith({
      tags: { old: ["fun"] },
      order: ["x", "old"],
      groups: [{ id: "g", name: "G", keys: ["old", "x"] }],
    });

    const renamed = renameInstanceKey(file, "old", "new");

    expect(renamed.tags).toEqual({ new: ["fun"] });
    expect(renamed.order).toEqual(["x", "new"]);
    expect(renamed.groups[0].keys).toEqual(["new", "x"]);
  });

  it("ignores empty or identical keys", () => {
    const file = fileWith({ order: ["a"] });
    expect(renameInstanceKey(file, "a", "a")).toBe(file);
    expect(renameInstanceKey(file, "", "b")).toBe(file);
  });
});

describe("forgetInstanceKey", () => {
  it("removes the key everywhere", () => {
    const file = fileWith({
      tags: { gone: ["t"], kept: ["t"] },
      order: ["gone", "kept"],
      groups: [{ id: "g", name: "G", keys: ["gone", "kept"] }],
    });

    const result = forgetInstanceKey(file, "gone");

    expect(result.tags).toEqual({ kept: ["t"] });
    expect(result.order).toEqual(["kept"]);
    expect(result.groups[0].keys).toEqual(["kept"]);
  });
});

describe("groups", () => {
  it("creates, renames, toggles and removes", () => {
    let file = createGroup(EMPTY_INSTANCES_FILE, "g1", "  Modded  ");
    expect(file.groups).toEqual([{ id: "g1", name: "Modded", keys: [] }]);

    expect(createGroup(file, "g1", "Again").groups).toHaveLength(1);
    expect(createGroup(file, "g2", "   ").groups).toHaveLength(1);

    file = renameGroup(file, "g1", " Vanilla ");
    expect(file.groups[0].name).toBe("Vanilla");
    expect(renameGroup(file, "g1", "  ").groups[0].name).toBe("Vanilla");

    file = toggleGroup(file, "g1");
    expect(file.groups[0].collapsed).toBe(true);
    file = toggleGroup(file, "g1");
    expect(file.groups[0].collapsed).toBe(false);

    expect(removeGroup(file, "g1").groups).toEqual([]);
  });

  it("moves an instance between groups without duplicating it", () => {
    let file = createGroup(createGroup(EMPTY_INSTANCES_FILE, "a", "A"), "b", "B");

    file = assignToGroup(file, "inst", "a");
    expect(file.groups[0].keys).toEqual(["inst"]);

    file = assignToGroup(file, "inst", "b");
    expect(file.groups[0].keys).toEqual([]);
    expect(file.groups[1].keys).toEqual(["inst"]);

    file = assignToGroup(file, "inst", null);
    expect(file.groups[1].keys).toEqual([]);
  });

  it("inserts at the requested position and clamps it", () => {
    let file = createGroup(EMPTY_INSTANCES_FILE, "g", "G");
    file = assignToGroup(file, "a", "g");
    file = assignToGroup(file, "b", "g");
    file = assignToGroup(file, "c", "g", 1);

    expect(file.groups[0].keys).toEqual(["a", "c", "b"]);

    file = assignToGroup(file, "c", "g", 99);
    expect(file.groups[0].keys).toEqual(["a", "b", "c"]);
  });

  it("ignores assignment to a missing group", () => {
    const file = assignToGroup(EMPTY_INSTANCES_FILE, "inst", "nope");
    expect(file.groups).toEqual([]);
  });

  it("reorders groups and rejects out-of-range moves", () => {
    let file = EMPTY_INSTANCES_FILE;
    for (const id of ["a", "b", "c"]) file = createGroup(file, id, id);

    expect(reorderGroups(file, 0, 2).groups.map((g) => g.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(reorderGroups(file, 1, 1)).toBe(file);
    expect(reorderGroups(file, 0, 9)).toBe(file);
  });

  it("remembers a collapsed ungrouped section and forgets it cleanly", () => {
    const collapsed = toggleUngrouped(EMPTY_INSTANCES_FILE);
    expect(collapsed.ungroupedCollapsed).toBe(true);

    const expanded = toggleUngrouped(collapsed);
    expect("ungroupedCollapsed" in expanded).toBe(false);
    expect(expanded).toEqual(EMPTY_INSTANCES_FILE);
  });

  it("survives a round trip through the file", () => {
    const collapsed = toggleUngrouped(EMPTY_INSTANCES_FILE);
    expect(normalizeInstancesFile(JSON.parse(JSON.stringify(collapsed))))
      .toEqual(collapsed);

    expect(
      normalizeInstancesFile({ ungroupedCollapsed: "yes" }).ungroupedCollapsed,
    ).toBeUndefined();
  });
});
