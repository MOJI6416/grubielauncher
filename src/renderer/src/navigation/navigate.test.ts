import { beforeEach, describe, expect, it } from "vitest";
import { getDefaultStore } from "jotai";
import {
  cancelPendingNavigation,
  confirmPendingNavigation,
  forgetInstance,
  getCurrentRoute,
  goBack,
  goForward,
  navigate,
  remapInstance,
} from "./navigate";
import {
  clearNavigationBlockers,
  registerNavigationBlocker,
} from "./guards";
import {
  canGoBackAtom,
  canGoForwardAtom,
  historyAtom,
  pendingNavigationAtom,
} from "./store";
import { createHistory } from "./history";

const store = getDefaultStore();

beforeEach(() => {
  clearNavigationBlockers();
  store.set(historyAtom, createHistory());
  store.set(pendingNavigationAtom, null);
});

describe("navigate", () => {
  it("moves to a route and back", () => {
    navigate({ name: "settings" });

    expect(getCurrentRoute()).toEqual({ name: "settings" });
    expect(store.get(canGoBackAtom)).toBe(true);

    goBack();

    expect(getCurrentRoute()).toEqual({ name: "home" });
    expect(store.get(canGoForwardAtom)).toBe(true);

    goForward();

    expect(getCurrentRoute()).toEqual({ name: "settings" });
  });

  it("reports success without moving when already there", () => {
    expect(navigate({ name: "home" })).toBe(true);
    expect(store.get(historyAtom).entries).toHaveLength(1);
  });

  it("replaces the current entry when asked", () => {
    navigate({ name: "settings" });
    navigate({ name: "news" }, { replace: true });

    expect(store.get(historyAtom).entries).toHaveLength(2);
    expect(getCurrentRoute()).toEqual({ name: "news" });
  });

  it("collapses the stack on reset", () => {
    navigate({ name: "settings" });
    navigate({ name: "home" }, { reset: true });

    expect(store.get(historyAtom).entries).toHaveLength(1);
    expect(store.get(canGoBackAtom)).toBe(false);
  });
});

describe("navigation guards", () => {
  it("holds the navigation and remembers the intent", () => {
    registerNavigationBlocker("editor", () => true);

    expect(navigate({ name: "settings" })).toBe(false);
    expect(getCurrentRoute()).toEqual({ name: "home" });
    expect(store.get(pendingNavigationAtom)).toEqual({
      kind: "route",
      route: { name: "settings" },
    });
  });

  it("goes through once the intent is confirmed", () => {
    registerNavigationBlocker("editor", () => true);
    navigate({ name: "settings" });

    confirmPendingNavigation();

    expect(getCurrentRoute()).toEqual({ name: "settings" });
    expect(store.get(pendingNavigationAtom)).toBeNull();
  });

  it("stays put when the intent is cancelled", () => {
    registerNavigationBlocker("editor", () => true);
    navigate({ name: "settings" });

    cancelPendingNavigation();

    expect(getCurrentRoute()).toEqual({ name: "home" });
    expect(store.get(pendingNavigationAtom)).toBeNull();
  });

  it("lets a forced navigation past the blocker", () => {
    registerNavigationBlocker("editor", () => true);

    expect(navigate({ name: "settings" }, { force: true })).toBe(true);
    expect(getCurrentRoute()).toEqual({ name: "settings" });
  });

  it("blocks back and forward as well", () => {
    navigate({ name: "settings" });
    registerNavigationBlocker("editor", () => true);

    expect(goBack()).toBe(false);
    expect(getCurrentRoute()).toEqual({ name: "settings" });
  });

  it("remembers a held back step and replays it on confirm", () => {
    navigate({ name: "settings" });
    registerNavigationBlocker("editor", () => true);

    expect(goBack()).toBe(false);
    expect(store.get(pendingNavigationAtom)).toEqual({ kind: "back" });

    confirmPendingNavigation();

    expect(getCurrentRoute()).toEqual({ name: "home" });
    expect(store.get(historyAtom).entries).toHaveLength(2);
    expect(store.get(canGoForwardAtom)).toBe(true);
  });

  it("remembers a held forward step and replays it on confirm", () => {
    navigate({ name: "settings" });
    goBack();
    registerNavigationBlocker("editor", () => true);

    expect(goForward()).toBe(false);
    expect(store.get(pendingNavigationAtom)).toEqual({ kind: "forward" });

    confirmPendingNavigation();

    expect(getCurrentRoute()).toEqual({ name: "settings" });
  });

  it("does not hold a back step that has nowhere to go", () => {
    registerNavigationBlocker("editor", () => true);

    expect(goBack()).toBe(false);
    expect(store.get(pendingNavigationAtom)).toBeNull();
  });

  it("keeps several blockers independent", () => {
    const releaseFirst = registerNavigationBlocker("first", () => true);
    registerNavigationBlocker("second", () => false);

    expect(navigate({ name: "settings" })).toBe(false);

    releaseFirst();

    expect(navigate({ name: "settings" })).toBe(true);
  });

  it("ignores a blocker that throws", () => {
    registerNavigationBlocker("broken", () => {
      throw new Error("boom");
    });

    expect(navigate({ name: "settings" })).toBe(true);
  });

  it("lets a blocker wave through a target it does not own", () => {
    navigate({ name: "instance", id: "pack" });
    registerNavigationBlocker(
      "editor",
      (target) => !(target?.name === "instance" && target.id === "pack"),
    );

    expect(navigate({ name: "instance", id: "pack", tab: "logs" })).toBe(true);
    expect(navigate({ name: "settings" })).toBe(false);
  });

  it("asks the blocker about the entry back and forward would land on", () => {
    navigate({ name: "instance", id: "pack" });
    navigate({ name: "settings" });
    const seen: (string | null)[] = [];
    registerNavigationBlocker("editor", (target) => {
      seen.push(target?.name ?? null);
      return false;
    });

    goBack();

    expect(seen).toEqual(["instance"]);
  });

  it("stops blocking after the screen releases it", () => {
    const release = registerNavigationBlocker("editor", () => true);
    release();

    expect(navigate({ name: "settings" })).toBe(true);
  });
});

describe("instance lifecycle", () => {
  it("follows a renamed instance", () => {
    navigate({ name: "instance", id: "old" });
    remapInstance("old", "new");

    expect(getCurrentRoute()).toEqual({ name: "instance", id: "new" });
  });

  it("leaves a deleted instance behind", () => {
    navigate({ name: "instance", id: "gone" });
    forgetInstance("gone");

    expect(getCurrentRoute()).toEqual({ name: "home" });
  });
});
