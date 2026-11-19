import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  InstanceActionContext,
  InstanceScreenTools,
} from "./instanceActions";

const navigations: unknown[] = [];

vi.mock("@renderer/navigation/navigate", () => ({
  navigate: (route: unknown) => navigations.push(route),
}));

async function loadActions() {
  vi.resetModules();
  vi.stubGlobal("window", {
    api: { shell: { openPath: vi.fn() }, shortcut: { create: vi.fn() } },
  });

  return await import("./instanceActions");
}

function context(
  overrides: Partial<InstanceActionContext> = {},
): InstanceActionContext {
  return {
    instance: {
      versionPath: "C:\\versions\\Pack",
      version: {
        name: "Pack",
        loader: { name: "vanilla", mods: [] },
        version: { id: "1.21.1", serverManager: true },
      },
    } as never,
    t: ((key: string) => key) as never,
    canPlay: true,
    isRunningInstance: false,
    onPlay: () => undefined,
    onPlayAnother: () => undefined,
    onManageTags: () => undefined,
    onDuplicate: () => undefined,
    onPort: () => undefined,
    ...overrides,
  };
}

function screen(
  overrides: Partial<InstanceScreenTools> = {},
): InstanceScreenTools {
  return {
    isLoading: false,
    isOnline: true,
    hasAccount: true,
    devMode: false,
    onCheckIntegrity: vi.fn(),
    onExport: vi.fn(),
    onCopyRunCommand: vi.fn(),
    onCreateShortcut: vi.fn(),
    ...overrides,
  };
}

function ids(groups: { id: string }[][]): string[] {
  return groups.flat().map((action) => action.id);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  navigations.length = 0;
});

describe("buildInstanceActions", () => {
  it("keeps launch, open and tools in separate groups", async () => {
    const { buildInstanceActions } = await loadActions();
    const groups = buildInstanceActions(context());

    expect(groups).toHaveLength(3);
    expect(groups[0].map((action) => action.id)).toEqual(["play"]);
    expect(groups[1].map((action) => action.id)).toEqual(["overview"]);
    expect(groups[2].map((action) => action.id)).toEqual([
      "duplicate",
      "port",
      "folder",
      "shortcut",
      "tags",
    ]);
  });

  it("does not repeat the instance tabs in the menu", async () => {
    const { buildInstanceActions } = await loadActions();

    expect(ids(buildInstanceActions(context()))).not.toEqual(
      expect.arrayContaining([
        "content",
        "worlds",
        "servers",
        "settings",
        "logs",
      ]),
    );
  });

  it("opens the instance from the open entry", async () => {
    const { buildInstanceActions } = await loadActions();
    buildInstanceActions(context())[1][0].onSelect();

    expect(navigations).toEqual([
      { name: "instance", id: "C:\\versions\\Pack" },
    ]);
  });

  it("renames the launch action instead of duplicating it while running", async () => {
    const { buildInstanceActions } = await loadActions();
    const playAnother = vi.fn();
    const groups = buildInstanceActions(
      context({ isRunningInstance: true, onPlayAnother: playAnother }),
    );

    expect(groups[0].map((action) => action.id)).toEqual(["play-another"]);
    expect(groups[0][0].label).toBe("versions.playAnotherInstance");

    groups[0][0].onSelect();
    expect(playAnother).toHaveBeenCalledTimes(1);
  });

  it("has no disabled entries besides launching without an account", async () => {
    const { buildInstanceActions } = await loadActions();
    const groups = buildInstanceActions(context({ canPlay: false }));

    const disabled = groups
      .flat()
      .filter((action) => action.disabled)
      .map((action) => action.id);

    expect(disabled).toEqual(["play"]);
  });

  it("leaves delete out unless the surface can handle it", async () => {
    const { buildInstanceActions } = await loadActions();

    expect(ids(buildInstanceActions(context()))).not.toContain("delete");
  });

  it("puts delete alone in the last group as a destructive action", async () => {
    const { buildInstanceActions } = await loadActions();
    const onDelete = vi.fn();
    const groups = buildInstanceActions(
      context({ onDelete, deleteShortcut: "Del" }),
    );

    expect(groups).toHaveLength(4);
    expect(groups[3]).toHaveLength(1);
    expect(groups[3][0]).toMatchObject({
      id: "delete",
      label: "versions.deleteInstance",
      destructive: true,
      shortcut: "Del",
      disabled: false,
    });

    groups[3][0].onSelect();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("blocks delete while the instance runs or the launcher is busy", async () => {
    const { buildInstanceActions } = await loadActions();
    const onDelete = () => undefined;

    const running = buildInstanceActions(
      context({ onDelete, isRunningInstance: true }),
    );
    const busy = buildInstanceActions(context({ onDelete, isBusy: true }));

    expect(running[3][0].disabled).toBe(true);
    expect(busy[3][0].disabled).toBe(true);
  });

  it("skips tag management where no tag dialog is available", async () => {
    const { buildInstanceActions } = await loadActions();

    expect(
      ids(buildInstanceActions(context({ onManageTags: undefined }))),
    ).not.toContain("tags");
  });
});

describe("the same menu on the instance screen", () => {
  it("drops the open entry and adds the screen tools", async () => {
    const { buildInstanceActions } = await loadActions();
    const groups = buildInstanceActions(
      context({ screen: screen(), onDelete: () => undefined }),
    );

    expect(groups.map((group) => group.map((action) => action.id))).toEqual([
      ["play"],
      [
        "duplicate",
        "port",
        "folder",
        "shortcut",
        "export",
        "integrity",
        "run-command",
        "tags",
      ],
      ["delete"],
    ]);
  });

  it("keeps the home menu entries a subset of the screen menu", async () => {
    const { buildInstanceActions } = await loadActions();
    const home = ids(
      buildInstanceActions(context({ onDelete: () => undefined })),
    );
    const onScreen = ids(
      buildInstanceActions(
        context({ screen: screen(), onDelete: () => undefined }),
      ),
    );

    expect(
      home
        .filter((id) => id !== "overview")
        .every((id) => onScreen.includes(id)),
    ).toBe(true);
  });

  it("explains why the integrity check is unavailable offline", async () => {
    const { buildInstanceActions, pickActions } = await loadActions();
    const [integrity] = pickActions(
      buildInstanceActions(context({ screen: screen({ isOnline: false }) })),
      ["integrity"],
    );

    expect(integrity).toMatchObject({
      disabled: true,
      blockedReason: "versions.integrityBlocked.offline",
    });
  });

  it("routes the tools to the screen handlers", async () => {
    const { buildInstanceActions, pickActions } = await loadActions();
    const tools = screen({ devMode: true });
    const actions = pickActions(
      buildInstanceActions(context({ screen: tools })),
      [
        "export",
        "integrity",
        "run-command",
        "run-command-relative",
        "shortcut",
      ],
    );

    for (const action of actions) action.onSelect();

    expect(tools.onExport).toHaveBeenCalledTimes(1);
    expect(tools.onCheckIntegrity).toHaveBeenCalledTimes(1);
    expect(tools.onCopyRunCommand).toHaveBeenNthCalledWith(1, false);
    expect(tools.onCopyRunCommand).toHaveBeenNthCalledWith(2, true);
    expect(tools.onCreateShortcut).toHaveBeenCalledTimes(1);
  });

  it("picks overview tiles in the requested order", async () => {
    const { buildInstanceActions, pickActions, OVERVIEW_TILE_IDS } =
      await loadActions();
    const tiles = pickActions(
      buildInstanceActions(context({ screen: screen() })),
      OVERVIEW_TILE_IDS,
    );

    expect(tiles.map((action) => action.id)).toEqual([
      "folder",
      "integrity",
      "export",
      "shortcut",
    ]);
  });
});
