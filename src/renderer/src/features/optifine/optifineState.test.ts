import { describe, expect, it } from "vitest";
import type { IVersion } from "@/types/IVersion";
import {
  createInitialState,
  newInstanceReducer,
} from "@renderer/features/newInstance/state";

const release = (id: string): IVersion => ({
  id,
  type: "release",
  url: `https://piston-meta.mojang.com/${id}.json`,
  serverManager: true,
});

const CHOICE = {
  file: "OptiFine_1.12.2_HD_U_G5.jar",
  minecraft: "1.12.2",
  edition: "HD_U_G5",
};

describe("new instance OptiFine state", () => {
  it("keeps the Minecraft version when the Sodium + Iris button switches to Fabric", () => {
    let state = newInstanceReducer(createInitialState(), {
      type: "versionsLoaded",
      versions: [release("1.20.1"), release("1.12.2")],
      preferredId: "1.20.1",
    });
    state = newInstanceReducer(state, {
      type: "applyLoaderPreset",
      loader: "fabric",
      minecraft: "1.20.1",
    });

    expect(state.loader).toBe("fabric");
    expect(state.versions).toEqual([]);

    state = newInstanceReducer(state, {
      type: "versionsLoaded",
      versions: [release("1.21.1"), release("1.20.1")],
    });
    expect(state.minecraftVersion).toEqual(release("1.20.1"));
  });

  it("drops the OptiFine choice when the version or the loader changes", () => {
    const base = newInstanceReducer(
      newInstanceReducer(createInitialState(), {
        type: "selectVersion",
        version: release("1.12.2"),
      }),
      { type: "setOptiFine", value: CHOICE },
    );
    expect(base.optifine).toEqual(CHOICE);

    expect(
      newInstanceReducer(base, {
        type: "selectVersion",
        version: release("1.16.5"),
      }).optifine,
    ).toBeNull();
    expect(
      newInstanceReducer(base, { type: "selectLoader", loader: "forge" }).optifine,
    ).toBeNull();
  });
});
