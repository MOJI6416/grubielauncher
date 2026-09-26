import { describe, expect, it } from "vitest";
import { EditTargetInfo, buildEditMenu } from "./editTarget";

function info(overrides: Partial<EditTargetInfo> = {}): EditTargetInfo {
  return {
    isEditable: false,
    isPassword: false,
    isReadOnly: false,
    hasValue: false,
    hasFieldSelection: false,
    pageSelection: "",
    linkUrl: null,
    ...overrides,
  };
}

const shape = (items: ReturnType<typeof buildEditMenu>) =>
  items.map((item) =>
    item.kind === "command"
      ? `${item.command}:${item.enabled ? "on" : "off"}`
      : item.kind,
  );

describe("buildEditMenu", () => {
  it("offers the full edit set in a text field with a selection", () => {
    expect(
      shape(
        buildEditMenu(
          info({ isEditable: true, hasValue: true, hasFieldSelection: true }),
        ),
      ),
    ).toEqual(["cut:on", "copy:on", "paste:on", "separator", "selectAll:on"]);
  });

  it("keeps paste but not cut or copy without a selection", () => {
    expect(
      shape(buildEditMenu(info({ isEditable: true, hasValue: true }))),
    ).toEqual(["cut:off", "copy:off", "paste:on", "separator", "selectAll:on"]);
  });

  it("never lets a password leave its field", () => {
    expect(
      shape(
        buildEditMenu(
          info({
            isEditable: true,
            isPassword: true,
            hasValue: true,
            hasFieldSelection: true,
          }),
        ),
      ),
    ).toEqual(["cut:off", "copy:off", "paste:on", "separator", "selectAll:on"]);
  });

  it("only copies from a read-only field", () => {
    expect(
      shape(
        buildEditMenu(
          info({
            isEditable: true,
            isReadOnly: true,
            hasValue: true,
            hasFieldSelection: true,
          }),
        ),
      ),
    ).toEqual(["cut:off", "copy:on", "paste:off", "separator", "selectAll:on"]);
  });

  it("copies selected page text and web links, and stays quiet otherwise", () => {
    expect(shape(buildEditMenu(info({ pageSelection: "sodium.jar" })))).toEqual([
      "copy:on",
    ]);
    expect(
      buildEditMenu(info({ linkUrl: "https://modrinth.com/mod/sodium" })),
    ).toEqual([{ kind: "copyLink", url: "https://modrinth.com/mod/sodium" }]);
    expect(buildEditMenu(info({ linkUrl: "app://bundle/index.html" }))).toEqual(
      [],
    );
    expect(buildEditMenu(info({ pageSelection: "   " }))).toEqual([]);
  });
});
