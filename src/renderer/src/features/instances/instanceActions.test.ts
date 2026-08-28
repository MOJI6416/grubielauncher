import { afterEach, describe, expect, it, vi } from "vitest";
import type { InstanceActionContext } from "./instanceActions";

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
    hasSaves: false,
    hasServer: false,
    hasStatistics: false,
    onPlay: () => undefined,
    onPlayAnother: () => undefined,
    onManageTags: () => undefined,
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
  it("keeps launch, sections and tools in separate groups", async () => {
    const { buildInstanceActions } = await loadActions();
    const groups = buildInstanceActions(context());

    expect(groups).toHaveLength(3);
    expect(groups[0].map((action) => action.id)).toEqual(["play"]);
    expect(groups[2].map((action) => action.id)).toEqual([
      "folder",
      "shortcut",
      "tags",
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

  it("offers the servers section whenever the version supports it", async () => {
    const { buildInstanceActions } = await loadActions();

    expect(ids(buildInstanceActions(context()))).toContain("servers");
  });

  it("hides the servers section for versions without a server manager", async () => {
    const { buildInstanceActions } = await loadActions();
    const groups = buildInstanceActions(
      context({
        instance: {
          versionPath: "C:\\versions\\Old",
          version: {
            name: "Old",
            loader: { name: "vanilla", mods: [] },
            version: { id: "1.7.10", serverManager: false },
          },
        } as never,
      }),
    );

    expect(ids(groups)).not.toContain("servers");
  });

  it("shows worlds only when the instance has saves", async () => {
    const { buildInstanceActions } = await loadActions();

    expect(ids(buildInstanceActions(context()))).not.toContain("worlds");
    expect(ids(buildInstanceActions(context({ hasSaves: true })))).toContain(
      "worlds",
    );
  });

  it("shows statistics only when the instance collected some", async () => {
    const { buildInstanceActions } = await loadActions();

    expect(ids(buildInstanceActions(context()))).not.toContain("statistics");
    expect(
      ids(buildInstanceActions(context({ hasStatistics: true }))),
    ).toContain("statistics");
  });

  it("has no disabled entries besides launching without an account", async () => {
    const { buildInstanceActions } = await loadActions();
    const groups = buildInstanceActions(
      context({ canPlay: false, hasSaves: true, hasServer: true }),
    );

    const disabled = groups
      .flat()
      .filter((action) => action.disabled)
      .map((action) => action.id);

    expect(disabled).toEqual(["play"]);
  });

  it("routes every section entry to its own tab", async () => {
    const { buildInstanceActions } = await loadActions();
    const groups = buildInstanceActions(
      context({ hasSaves: true, hasServer: true, hasStatistics: true }),
    );

    for (const action of groups[1]) action.onSelect();

    expect(navigations).toEqual([
      { name: "instance", id: "C:\\versions\\Pack", tab: undefined },
      { name: "instance", id: "C:\\versions\\Pack", tab: "content" },
      { name: "instance", id: "C:\\versions\\Pack", tab: "worlds" },
      { name: "instance", id: "C:\\versions\\Pack", tab: "servers" },
      { name: "instance", id: "C:\\versions\\Pack", tab: "server" },
      { name: "instance", id: "C:\\versions\\Pack", tab: "settings" },
      { name: "instance", id: "C:\\versions\\Pack", tab: "statistics" },
      { name: "instance", id: "C:\\versions\\Pack", tab: "logs" },
    ]);
  });
});
