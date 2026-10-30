import { describe, expect, it } from "vitest";
import { ProjectType, Provider } from "@/types/ModManager";
import { ContentEntry } from "./entries";
import {
  EMPTY_GROUPS,
  addGroup,
  assignToGroup,
  groupRows,
  parseGroupsFile,
  removeGroup,
  renameGroup,
  toggleGroupCollapsed,
} from "./modGroups";

function entry(id: string): ContentEntry {
  return {
    key: `modrinth:${id}`,
    id,
    provider: Provider.MODRINTH,
    projectType: ProjectType.MOD,
    title: id,
    description: "",
    iconUrl: null,
    url: "",
    installed: null,
    project: null,
    pendingRemoved: false,
    side: "both",
    size: 0,
    fileName: `${id}.jar`,
    markedDisabled: false,
  };
}

const sodium = entry("sodium");
const iris = entry("iris");
const jei = entry("jei");
const modmenu = entry("modmenu");
const sorted = [iris, jei, modmenu, sodium];

const shape = (items: ReturnType<typeof groupRows>["items"]) =>
  items.map((item) =>
    item.kind === "header"
      ? `[${item.name || "-"} ${item.count}${item.collapsed ? " closed" : ""}]`
      : `${item.entry.id}#${item.rowIndex}`,
  );

describe("groupRows", () => {
  it("leaves the list as it is while there are no groups", () => {
    const { rows, items } = groupRows(sorted, EMPTY_GROUPS, false);
    expect(rows).toBe(sorted);
    expect(shape(items)).toEqual(["iris#0", "jei#1", "modmenu#2", "sodium#3"]);
  });

  it("puts groups in their order, keeps the sort inside and ends with the rest", () => {
    let file = addGroup(EMPTY_GROUPS, "Visual", "v");
    file = addGroup(file, "Speed", "s");
    file = assignToGroup(file, [sodium.key], "s");
    file = assignToGroup(file, [iris.key], "v");

    const { rows, items } = groupRows(sorted, file, false);
    expect(shape(items)).toEqual([
      "[Visual 1]",
      "iris#0",
      "[Speed 1]",
      "sodium#1",
      "[- 2]",
      "jei#2",
      "modmenu#3",
    ]);
    expect(rows.map((row) => row.id)).toEqual(["iris", "sodium", "jei", "modmenu"]);
  });

  it("hides the mods of a collapsed group unless a filter is on", () => {
    let file = addGroup(EMPTY_GROUPS, "Visual", "v");
    file = assignToGroup(file, [iris.key, sodium.key], "v");
    file = toggleGroupCollapsed(file, "v");

    expect(shape(groupRows(sorted, file, false).items)).toEqual([
      "[Visual 2 closed]",
      "[- 2]",
      "jei#0",
      "modmenu#1",
    ]);
    expect(shape(groupRows(sorted, file, true).items)).toEqual([
      "[Visual 2]",
      "iris#0",
      "sodium#1",
      "[- 2]",
      "jei#2",
      "modmenu#3",
    ]);
    expect(toggleGroupCollapsed(file, "v").groups[0]).toEqual({ id: "v", name: "Visual" });
  });

  it("skips empty groups and moves mods back on removal", () => {
    let file = addGroup(EMPTY_GROUPS, "Empty", "e");
    file = addGroup(file, "Visual", "v");
    file = assignToGroup(file, [iris.key], "v");

    expect(shape(groupRows(sorted, file, false).items)[0]).toBe("[Visual 1]");

    file = assignToGroup(file, [iris.key], "");
    expect(file.members).toEqual({});

    file = assignToGroup(file, [iris.key], "v");
    file = removeGroup(renameGroup(file, "v", "  Pretty   things "), "e");
    expect(file.groups).toEqual([{ id: "v", name: "Pretty things" }]);
    expect(removeGroup(file, "v")).toEqual({ version: 1, groups: [], members: {} });
  });
});

describe("parseGroupsFile", () => {
  it("drops broken groups and members of unknown groups", () => {
    expect(
      parseGroupsFile({
        groups: [
          { id: "v", name: "Visual", collapsed: true },
          { id: "v", name: "Copy" },
          { id: "", name: "No id" },
          { name: "Nameless" },
        ],
        members: { "modrinth:iris": "v", "modrinth:sodium": "gone", bad: 5 },
      }),
    ).toEqual({
      version: 1,
      groups: [{ id: "v", name: "Visual", collapsed: true }],
      members: { "modrinth:iris": "v" },
    });
    expect(parseGroupsFile(null)).toEqual(EMPTY_GROUPS);
  });
});
