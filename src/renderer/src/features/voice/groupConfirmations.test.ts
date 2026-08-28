import { describe, expect, it } from "vitest";
import en from "../../../locales/en.json";
import {
  groupConfirmCopy,
  groupConfirmKinds,
  type GroupConfirmKind,
} from "./groupConfirmations";

function resolve(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      en,
    );
}

describe("groupConfirmCopy", () => {
  it("covers every destructive group action", () => {
    expect(groupConfirmKinds().sort()).toEqual([
      "ban",
      "delete",
      "kick",
      "leave",
      "resetCode",
      "transfer",
    ]);
  });

  it("names consequences with two lines for every action", () => {
    for (const kind of groupConfirmKinds()) {
      expect(groupConfirmCopy(kind).lineKeys).toHaveLength(2);
    }
  });

  it("resolves every title, action and line key in en", () => {
    for (const kind of groupConfirmKinds()) {
      const copy = groupConfirmCopy(kind);

      for (const key of [copy.titleKey, copy.actionKey, ...copy.lineKeys]) {
        expect({ kind, key, text: resolve(key) }).toEqual({
          kind,
          key,
          text: expect.any(String),
        });
      }
    }
  });

  it("gives leaving and deleting a group different copy", () => {
    expect(groupConfirmCopy("delete").lineKeys).not.toEqual(
      groupConfirmCopy("leave").lineKeys,
    );
  });

  it("marks deleting a group as final and a ban as undoable", () => {
    expect(groupConfirmCopy("delete").reversible).toBe(false);
    expect(groupConfirmCopy("ban").reversible).toBe(true);
  });

  it("keeps ownership transfer and code reset out of the destructive tone", () => {
    const soft: GroupConfirmKind[] = ["transfer", "resetCode"];

    for (const kind of groupConfirmKinds()) {
      expect(groupConfirmCopy(kind).actionColor).toBe(
        soft.includes(kind) ? "warning" : "danger",
      );
    }
  });
});
