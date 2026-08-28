import { describe, expect, it } from "vitest";
import type { IModpack as IBackendModpack } from "@/types/Backend";
import { buildSharedPack, isSharedPackOwned } from "./sharedPack";

function modpack(overrides: Partial<IBackendModpack> = {}): IBackendModpack {
  return {
    _id: "code-1",
    build: 4,
    downloads: 0,
    createdAt: new Date(),
    lastUpdate: new Date(),
    conf: {
      name: "mojisq vanilla",
      loader: { name: "vanilla", mods: [], version: undefined },
      version: {
        id: "1.21.1",
        type: "release",
        url: "",
        serverManager: true,
      },
      servers: [],
      options: "",
      runArguments: { game: "", jvm: "" },
      image: "",
      quickServer: "",
    },
    ...overrides,
  } as IBackendModpack;
}

describe("isSharedPackOwned", () => {
  it("treats a pack without an owner field as not owned", () => {
    expect(isSharedPackOwned(modpack(), "user-1")).toBe(false);
  });

  it("compares the owner id with the signed in user", () => {
    const owned = modpack({ owner: { _id: "user-1" } as never });

    expect(isSharedPackOwned(owned, "user-1")).toBe(true);
    expect(isSharedPackOwned(owned, "user-2")).toBe(false);
    expect(isSharedPackOwned(owned, undefined)).toBe(false);
  });
});

describe("buildSharedPack", () => {
  it("builds a pack when the list response carries no owner", () => {
    const { pack, content } = buildSharedPack(modpack(), {
      authSub: "user-1",
      takenNames: [],
    });

    expect(pack.kind).toBe("share");
    expect(pack.shareCode).toBe("code-1");
    expect(pack.isOwner).toBe(false);
    expect(content.name).toBe("mojisq vanilla");
    expect(content.minecraftVersion?.id).toBe("1.21.1");
  });

  it("carries the author's description so nobody installs blind", () => {
    const described = modpack();
    described.conf.description = "Survival pack, start with the quest book.";

    const { pack } = buildSharedPack(described, { takenNames: [] });

    expect(pack.description).toBe("Survival pack, start with the quest book.");
    expect(buildSharedPack(modpack(), { takenNames: [] }).pack.description).toBe(
      "",
    );
  });

  it("trusts an explicit ownership flag from the own packs list", () => {
    const { pack } = buildSharedPack(modpack(), {
      authSub: "user-1",
      ownedByUser: true,
      takenNames: [],
    });

    expect(pack.isOwner).toBe(true);
  });

  it("derives ownership from the populated owner", () => {
    const { pack } = buildSharedPack(
      modpack({ owner: { _id: "user-1" } as never }),
      { authSub: "user-1", takenNames: [] },
    );

    expect(pack.isOwner).toBe(true);
    expect(pack.shareVersion?.build).toBe(4);
  });

  it("carries the author and the install count from the same response", () => {
    const { pack } = buildSharedPack(
      modpack({
        downloads: 42,
        owner: {
          _id: "user-9",
          nickname: "pashka4005",
          platform: "microsoft",
          headUrl: "https://api.grubielauncher.com/skins/head/user/user-9.png",
        } as never,
      }),
      { takenNames: [] },
    );

    expect(pack.author).toEqual({
      id: "user-9",
      nickname: "pashka4005",
      platform: "microsoft",
      headUrl: "https://api.grubielauncher.com/skins/head/user/user-9.png",
    });
    expect(pack.downloads).toBe(42);
  });

  it("leaves the author out when the response has no owner", () => {
    const { pack } = buildSharedPack(modpack(), { takenNames: [] });

    expect(pack.author).toBeUndefined();
    expect(pack.downloads).toBe(0);
  });

  it("suggests a free name when one is taken", () => {
    const { content } = buildSharedPack(modpack(), {
      authSub: "user-1",
      takenNames: ["mojisq vanilla"],
    });

    expect(content.name).not.toBe("mojisq vanilla");
    expect(content.name.startsWith("mojisq vanilla")).toBe(true);
  });

  it("falls back to empty arguments and quick server", () => {
    const { content } = buildSharedPack(
      modpack({
        conf: {
          ...modpack().conf,
          runArguments: undefined as never,
          quickServer: undefined as never,
        },
      }),
      { authSub: "user-1", takenNames: [] },
    );

    expect(content.runArguments).toEqual({ game: "", jvm: "" });
    expect(content.quickServer).toBe("");
  });
});
