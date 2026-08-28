import { describe, expect, it } from "vitest";
import {
  instanceMountKey,
  instanceSelectionSignature,
  shouldReselectInstance,
  type SelectionAccount,
} from "./instanceSelection";

const owner: SelectionAccount = { type: "discord", nickname: "moji6416" };
const other: SelectionAccount = { type: "microsoft", nickname: "Kituk" };

function selected(key: string, account: SelectionAccount | null) {
  return {
    selectedKey: key,
    signature: instanceSelectionSignature(key, account),
  };
}

describe("shouldReselectInstance", () => {
  it("keeps a selection computed for this instance and account", () => {
    expect(shouldReselectInstance(selected("A", owner), "A", owner)).toBe(
      false,
    );
  });

  it("reselects when the route points at another instance", () => {
    expect(shouldReselectInstance(selected("A", owner), "B", owner)).toBe(true);
  });

  it("reselects when the instance was preselected outside of the router", () => {
    expect(
      shouldReselectInstance({ selectedKey: "A", signature: null }, "A", owner),
    ).toBe(true);
  });

  it("reselects when the account arrived after the selection was made", () => {
    expect(shouldReselectInstance(selected("A", null), "A", owner)).toBe(true);
  });

  it("reselects when the account was switched", () => {
    expect(shouldReselectInstance(selected("A", owner), "A", other)).toBe(true);
  });

  it("reselects when another writer moved the selection elsewhere", () => {
    expect(
      shouldReselectInstance(
        {
          selectedKey: "B",
          signature: instanceSelectionSignature("A", owner),
        },
        "A",
        owner,
      ),
    ).toBe(true);
  });

  it("reselects when nothing is selected yet", () => {
    expect(
      shouldReselectInstance(
        { selectedKey: null, signature: null },
        "A",
        owner,
      ),
    ).toBe(true);
  });
});

describe("instanceMountKey", () => {
  it("keeps one key while the instance object lives, renames included", () => {
    const instance = { versionPath: "C:/versions/Old" };
    const key = instanceMountKey(instance);

    instance.versionPath = "C:/versions/New";

    expect(instanceMountKey(instance)).toBe(key);
  });

  it("gives another key to another instance", () => {
    const first = { versionPath: "C:/versions/A" };
    const second = { versionPath: "C:/versions/A" };

    expect(instanceMountKey(first)).not.toBe(instanceMountKey(second));
  });
});
