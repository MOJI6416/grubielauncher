import { describe, expect, it } from "vitest";
import type { IVersion } from "@/types/IVersion";
import { ProjectType, Provider } from "@/types/ModManager";
import {
  EMPTY_ARGUMENTS,
  NewInstanceState,
  createInitialState,
  isPackLocked,
  needsPackPicker,
  newInstanceReducer,
} from "./state";

function version(id: string, type = "release"): IVersion {
  return { id, type, url: "", serverManager: true };
}

const catalog = [
  version("24w44a", "snapshot"),
  version("1.21.4"),
  version("1.21.3"),
];

function reduce(
  state: NewInstanceState,
  ...actions: Parameters<typeof newInstanceReducer>[1][]
): NewInstanceState {
  return actions.reduce(newInstanceReducer, state);
}

describe("newInstanceReducer", () => {
  it("picks the newest release once the catalog arrives", () => {
    const state = reduce(createInitialState(), {
      type: "versionsLoaded",
      versions: catalog,
    });

    expect(state.minecraftVersion?.id).toBe("1.21.4");
  });

  it("keeps the selected version when the catalog reloads", () => {
    const state = reduce(
      createInitialState(),
      { type: "versionsLoaded", versions: catalog },
      { type: "selectVersion", version: version("1.21.3") },
      { type: "versionsLoaded", versions: catalog },
    );

    expect(state.minecraftVersion?.id).toBe("1.21.3");
  });

  it("drops the loader build when the game version changes", () => {
    const state = reduce(
      createInitialState(),
      { type: "selectLoader", loader: "fabric" },
      { type: "versionsLoaded", versions: catalog },
      {
        type: "loaderVersionsLoaded",
        versions: [{ id: "0.16.9", url: "" }],
      },
      { type: "selectVersion", version: version("1.21.3") },
    );

    expect(state.loaderVersion).toBeUndefined();
    expect(state.loaderVersions).toEqual([]);
  });

  it("clears the catalog when the loader changes", () => {
    const state = reduce(
      createInitialState(),
      { type: "versionsLoaded", versions: catalog },
      { type: "selectLoader", loader: "quilt" },
    );

    expect(state.versions).toEqual([]);
    expect(state.minecraftVersion).toBeUndefined();
    expect(state.loader).toBe("quilt");
  });

  it("reloads the catalog when snapshots are toggled", () => {
    const state = reduce(
      createInitialState(),
      { type: "versionsLoaded", versions: catalog },
      { type: "setSnapshots", value: true },
    );

    expect(state.showSnapshots).toBe(true);
    expect(state.versions).toEqual([]);
  });

  it("auto-names only until the user types", () => {
    const auto = reduce(createInitialState(), {
      type: "autoName",
      value: "Vanilla 1.21.4",
    });
    expect(auto.name).toBe("Vanilla 1.21.4");

    const typed = reduce(
      auto,
      { type: "setName", value: "My pack" },
      { type: "autoName", value: "Vanilla 1.21.3" },
    );
    expect(typed.name).toBe("My pack");
  });

  it("locks the form once a pack is applied", () => {
    const state = reduce(createInitialState("file"), {
      type: "applyPack",
      pack: { kind: "file", title: "All the Mods 10", isOwner: true },
      content: {
        name: "All the Mods 10",
        image: "",
        loader: "neoforge",
        minecraftVersion: version("1.21.1"),
        loaderVersion: { id: "21.1.77", url: "" },
        mods: [
          {
            id: "mod",
            title: "Mod",
            description: "",
            projectType: ProjectType.MOD,
            iconUrl: null,
            url: "",
            provider: Provider.CURSEFORGE,
            version: null,
          },
        ],
        servers: [],
        options: "",
        runArguments: EMPTY_ARGUMENTS,
        quickServer: "",
      },
    });

    expect(isPackLocked(state)).toBe(true);
    expect(needsPackPicker(state)).toBe(false);
    expect(state.loader).toBe("neoforge");
    expect(state.versions).toHaveLength(1);
    expect(state.mods).toHaveLength(1);
  });

  it("refuses to change the loader of an applied pack", () => {
    const applied = reduce(createInitialState("file"), {
      type: "applyPack",
      pack: { kind: "file", title: "Pack", isOwner: true },
      content: {
        name: "Pack",
        image: "",
        loader: "fabric",
        minecraftVersion: version("1.21.4"),
        loaderVersion: { id: "0.16.9", url: "" },
        mods: [],
        servers: [],
        options: "",
        runArguments: EMPTY_ARGUMENTS,
        quickServer: "",
      },
    });

    expect(
      newInstanceReducer(applied, { type: "selectLoader", loader: "forge" }),
    ).toBe(applied);
  });

  it("returns to the picker when the pack is dropped", () => {
    const state = reduce(
      createInitialState("catalog"),
      {
        type: "applyPack",
        pack: { kind: "modpack", title: "Pack", isOwner: true },
        content: {
          name: "Pack",
          image: "",
          loader: "fabric",
          minecraftVersion: version("1.21.4"),
          loaderVersion: { id: "0.16.9", url: "" },
          mods: [],
          servers: [],
          options: "",
          runArguments: EMPTY_ARGUMENTS,
          quickServer: "",
        },
      },
      { type: "clearPack" },
    );

    expect(state.pack).toBeNull();
    expect(state.source).toBe("catalog");
    expect(needsPackPicker(state)).toBe(true);
    expect(state.name).toBe("");
  });

  it("starts from scratch when the source changes", () => {
    const state = reduce(
      createInitialState(),
      { type: "setSnapshots", value: true },
      { type: "setName", value: "typed" },
      { type: "selectSource", source: "code" },
    );

    expect(state.source).toBe("code");
    expect(state.name).toBe("");
    expect(state.nameEdited).toBe(false);
    expect(state.showSnapshots).toBe(true);
  });

  it("does not preselect a loader build the pack could not resolve", () => {
    const state = reduce(createInitialState(), {
      type: "loaderVersionsLoaded",
      versions: [{ id: "0.16.9", url: "" }],
      issue: "notFound",
    });

    expect(state.loaderVersion).toBeUndefined();
    expect(state.loaderVersionIssue).toBe("notFound");

    const recovered = reduce(state, {
      type: "selectLoaderVersion",
      version: { id: "0.16.9", url: "" },
    });

    expect(recovered.loaderVersion?.id).toBe("0.16.9");
    expect(recovered.loaderVersionIssue).toBeNull();
  });

  it("turns a pinged server into a quick-connect target", () => {
    const state = reduce(createInitialState("server"), {
      type: "applyServer",
      target: {
        host: "mc.example.com",
        port: null,
        address: "mc.example.com",
      },
      server: { name: "Example", ip: "mc.example.com", acceptTextures: null },
    });

    expect(needsPackPicker(state)).toBe(false);
    expect(state.quickServer).toBe("mc.example.com");
    expect(state.servers).toHaveLength(1);

    const cleared = reduce(state, { type: "clearServer" });

    expect(needsPackPicker(cleared)).toBe(true);
    expect(cleared.servers).toEqual([]);
    expect(cleared.quickServer).toBe("");
  });

  it("takes the logo from the server favicon and drops it with the server", () => {
    const target = {
      host: "mc.example.com",
      port: null,
      address: "mc.example.com",
    };
    const server = {
      name: "Example",
      ip: "mc.example.com",
      acceptTextures: null,
    };

    const withLogo = reduce(createInitialState("server"), {
      type: "applyServer",
      target,
      server,
      logo: "data:image/png;base64,AAAA",
    });

    expect(withLogo.image).toBe("data:image/png;base64,AAAA");

    const withoutLogo = reduce(withLogo, {
      type: "applyServer",
      target,
      server,
    });

    expect(withoutLogo.image).toBe("");
  });

  it("keeps the reason the pack has no game version and clears it on retry", () => {
    const applied = reduce(createInitialState("catalog"), {
      type: "applyPack",
      pack: { kind: "modpack", title: "Pack", isOwner: true },
      content: {
        name: "Pack",
        image: "",
        loader: "forge",
        minecraftVersion: undefined,
        mods: [],
        servers: [],
        options: "",
        runArguments: EMPTY_ARGUMENTS,
        quickServer: "",
      },
      versionIssue: "catalogFailed",
    });

    expect(applied.packVersionIssue).toBe("catalogFailed");
    expect(applied.minecraftVersion).toBeUndefined();

    const resolved = reduce(applied, {
      type: "packVersionsResolved",
      minecraftVersion: version("1.20.1"),
      loaderVersion: { id: "47.2.20", url: "" },
      loaderVersions: [{ id: "47.2.20", url: "" }],
      issue: null,
      versionIssue: null,
    });

    expect(resolved.packVersionIssue).toBeNull();
    expect(resolved.minecraftVersion?.id).toBe("1.20.1");
    expect(resolved.versions).toHaveLength(1);
    expect(resolved.loaderVersion?.id).toBe("47.2.20");
    expect(resolved.name).toBe("Pack");
  });

  it("drops the pack version reason together with the pack", () => {
    const applied = reduce(createInitialState("catalog"), {
      type: "applyPack",
      pack: { kind: "modpack", title: "Pack", isOwner: true },
      content: {
        name: "Pack",
        image: "",
        loader: "forge",
        mods: [],
        servers: [],
        options: "",
        runArguments: EMPTY_ARGUMENTS,
        quickServer: "",
      },
      versionIssue: "versionMissing",
    });

    expect(reduce(applied, { type: "clearPack" }).packVersionIssue).toBeNull();
  });

  it("ignores selecting the source that is already active", () => {
    const initial = createInitialState("code");

    expect(
      newInstanceReducer(initial, { type: "selectSource", source: "code" }),
    ).toBe(initial);
  });
});
