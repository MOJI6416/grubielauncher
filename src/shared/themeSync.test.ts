import { describe, expect, it } from "vitest";
import type { ThemeDefinition } from "./themes";
import {
  mergeSyncedThemes,
  normalizeRemoteTheme,
  planThemeSync,
  stampThemes,
  themeContentKey,
  type RemoteTheme,
  type ThemeLinks,
} from "./themeSync";

const COLORS = { background: "#101010", surface: "#202020", foreground: "#f0f0f0", accent: null };

function local(id: string, patch: Partial<ThemeDefinition> = {}): ThemeDefinition {
  return { id, name: id, mode: "dark", colors: { ...COLORS }, backdrop: null, ...patch };
}

function remote(id: string, patch: Partial<RemoteTheme> = {}): RemoteTheme {
  return {
    id,
    clientId: null,
    name: "r",
    mode: "dark",
    colors: { ...COLORS },
    backdrop: null,
    changedAt: 100,
    ...patch,
  };
}

const R1 = "64f000000000000000000001";
const R2 = "64f000000000000000000002";

function linked(theme: ThemeDefinition, remoteId: string, syncedAt = 100): ThemeLinks {
  return {
    [theme.id]: {
      remoteId,
      syncedAt,
      contentKey: themeContentKey(theme),
      picturePath: null,
      pictureHash: null,
    },
  };
}

describe("planThemeSync", () => {
  it("uploads a theme the account has never seen", () => {
    expect(planThemeSync([local("custom-a")], {}, [])).toEqual([
      { kind: "push", localId: "custom-a", remoteId: null },
    ]);
  });

  it("does nothing when neither side changed", () => {
    const theme = local("custom-a");
    expect(planThemeSync([theme], linked(theme, R1), [remote(R1)])).toEqual([]);
  });

  it("pushes a local edit and pulls a remote one", () => {
    const theme = local("custom-a");
    const links = linked(theme, R1);

    expect(planThemeSync([{ ...theme, name: "edited" }], links, [remote(R1)])).toEqual([
      { kind: "push", localId: "custom-a", remoteId: R1 },
    ]);

    const changed = remote(R1, { name: "there", changedAt: 200 });
    expect(planThemeSync([theme], links, [changed])).toEqual([
      { kind: "pull", remote: changed, localId: "custom-a" },
    ]);
  });

  it("lets the later edit win when both sides changed", () => {
    const theme = local("custom-a");
    const links = linked(theme, R1);
    const there = remote(R1, { name: "there", changedAt: 200 });

    expect(
      planThemeSync([{ ...theme, name: "here", updatedAt: 300 }], links, [there]),
    ).toEqual([{ kind: "push", localId: "custom-a", remoteId: R1 }]);
    expect(
      planThemeSync([{ ...theme, name: "here", updatedAt: 150 }], links, [there]),
    ).toEqual([{ kind: "pull", remote: there, localId: "custom-a" }]);
  });

  it("removes on the account what was deleted here", () => {
    const theme = local("custom-a");
    expect(planThemeSync([], linked(theme, R1), [remote(R1)])).toEqual([
      { kind: "deleteRemote", localId: "custom-a", remoteId: R1 },
    ]);
  });

  it("removes here what was deleted elsewhere, unless it was edited here since", () => {
    const theme = local("custom-a");
    const links = linked(theme, R1);

    expect(planThemeSync([theme], links, [])).toEqual([
      { kind: "deleteLocal", localId: "custom-a" },
    ]);
    expect(planThemeSync([{ ...theme, name: "kept" }], links, [])).toEqual([
      { kind: "push", localId: "custom-a", remoteId: null },
    ]);
  });

  it("brings a theme from another launcher under its own id", () => {
    const there = remote(R2, { clientId: "custom-b" });
    expect(planThemeSync([local("custom-a")], linked(local("custom-a"), R1), [remote(R1), there])).toEqual([
      { kind: "pull", remote: there, localId: "custom-b" },
    ]);
  });

  it("gives a pulled theme a new id when its own is taken here", () => {
    const there = remote(R2, { clientId: "custom-a" });
    const theme = local("custom-a");
    expect(planThemeSync([theme], linked(theme, R1), [remote(R1), there])).toEqual([
      { kind: "pull", remote: there, localId: null },
    ]);
  });

  it("links an unlinked theme to the account's copy of it instead of uploading twice", () => {
    const theme = local("custom-a", { name: "r" });
    const copy = remote(R1, { clientId: "custom-a" });
    expect(planThemeSync([theme], {}, [copy])).toEqual([
      { kind: "link", localId: "custom-a", remote: copy },
    ]);
  });

  it("never pulls back a theme deleted here before the sync ran", () => {
    const theme = local("custom-a");
    const links = linked(theme, R1);
    expect(planThemeSync([], links, [remote(R1, { clientId: "custom-a" })])).toEqual([
      { kind: "deleteRemote", localId: "custom-a", remoteId: R1 },
    ]);
  });
});

describe("stampThemes", () => {
  it("stamps new and edited themes and leaves the rest", () => {
    const kept = local("custom-a", { updatedAt: 10 });
    const edited = local("custom-b", { updatedAt: 10 });
    const result = stampThemes(
      [kept, edited],
      [{ ...kept }, { ...edited, name: "renamed" }, local("custom-c")],
      500,
    );

    expect(result.map((theme) => theme.updatedAt)).toEqual([10, 500, 500]);
  });

  it("carries the stamp over when the caller dropped it", () => {
    const stored = local("custom-a", { updatedAt: 10 });
    const { updatedAt: _dropped, ...withoutStamp } = stored;
    expect(stampThemes([stored], [withoutStamp], 500)[0].updatedAt).toBe(10);
  });
});

describe("normalizeRemoteTheme", () => {
  it("reads what the api sends and refuses what it cannot use", () => {
    expect(
      normalizeRemoteTheme({
        id: R1,
        clientId: "custom-a",
        name: "Ночь",
        mode: "light",
        colors: { ...COLORS, sidebar: "#ABCDEF" },
        backdrop: { dim: 40, blur: 2, panelOpacity: 90, fit: "contain", focusX: 10, focusY: 90, hash: "ff" },
        hash: "x",
        changedAt: 1700,
      }),
    ).toEqual({
      id: R1,
      clientId: "custom-a",
      name: "Ночь",
      mode: "light",
      colors: { ...COLORS, sidebar: "#abcdef" },
      backdrop: { dim: 40, blur: 2, panelOpacity: 90, fit: "contain", focusX: 10, focusY: 90, hash: "ff" },
      changedAt: 1700,
    });
    expect(normalizeRemoteTheme({ id: "nope", colors: COLORS, changedAt: 1 })).toBeNull();
    expect(normalizeRemoteTheme({ id: R1, colors: { background: "red" }, changedAt: 1 })).toBeNull();
    expect(normalizeRemoteTheme({ id: R1, colors: COLORS, changedAt: 0 })).toBeNull();
  });
});

describe("mergeSyncedThemes", () => {
  it("applies the sync on top of what the player changed meanwhile", () => {
    const kept = local("custom-a");
    const pulled = local("custom-b");
    const deleted = local("custom-c");
    const snapshot = [kept, pulled, deleted];
    const current = [{ ...kept, name: "edited during sync" }, pulled, deleted, local("custom-new")];

    const result = mergeSyncedThemes(
      snapshot,
      current,
      new Set(["custom-c"]),
      new Map([
        ["custom-a", { ...kept, name: "from account" }],
        ["custom-b", { ...pulled, name: "from account" }],
        ["custom-d", local("custom-d")],
      ]),
    );

    expect(result.map((theme) => [theme.id, theme.name])).toEqual([
      ["custom-a", "edited during sync"],
      ["custom-b", "from account"],
      ["custom-new", "custom-new"],
      ["custom-d", "custom-d"],
    ]);
  });

  it("does not bring back a theme the player deleted while the sync ran", () => {
    const theme = local("custom-a");
    expect(
      mergeSyncedThemes([theme], [], new Set(), new Map([["custom-a", { ...theme, name: "x" }]])),
    ).toEqual([]);
  });
});
