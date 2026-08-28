import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  back,
  canGoBack,
  canGoForward,
  createHistory,
  current,
  dropInstance,
  forward,
  push,
  remapInstanceId,
  replace,
  reset,
} from "./history";
import { Route } from "./routes";

const instance = (id: string): Route => ({ name: "instance", id });

describe("history", () => {
  it("starts at home with no way back or forward", () => {
    const state = createHistory();

    expect(current(state)).toEqual({ name: "home" });
    expect(canGoBack(state)).toBe(false);
    expect(canGoForward(state)).toBe(false);
  });

  it("pushes a route and allows going back", () => {
    const state = push(createHistory(), instance("better-mc"));

    expect(current(state)).toEqual(instance("better-mc"));
    expect(canGoBack(state)).toBe(true);
    expect(current(back(state))).toEqual({ name: "home" });
  });

  it("ignores a push of the route already shown", () => {
    const first = push(createHistory(), instance("a"));
    const second = push(first, instance("a"));

    expect(second).toBe(first);
  });

  it("keeps a tab of the same instance as its own entry", () => {
    const first = push(createHistory(), instance("a"));
    const second = push(first, { name: "instance", id: "a", tab: "content" });

    expect(second.entries).toHaveLength(3);
    expect(second.entries[second.index].route).toEqual({
      name: "instance",
      id: "a",
      tab: "content",
    });
  });

  it("drops the forward tail when pushing after going back", () => {
    let state = push(createHistory(), instance("a"));
    state = push(state, instance("b"));
    state = back(state);
    state = push(state, instance("c"));

    expect(canGoForward(state)).toBe(false);
    expect(state.entries.map((entry) => entry.key)).toEqual([
      "home",
      "instance:a",
      "instance:c",
    ]);
  });

  it("walks back and forward without losing entries", () => {
    let state = push(createHistory(), instance("a"));
    state = push(state, instance("b"));

    expect(current(back(back(state)))).toEqual({ name: "home" });
    expect(current(forward(back(state)))).toEqual(instance("b"));
  });

  it("stops at the ends instead of overflowing", () => {
    const state = createHistory();

    expect(back(state)).toBe(state);
    expect(forward(state)).toBe(state);
  });

  it("caps the stack and keeps the newest entry current", () => {
    let state = createHistory();
    for (let i = 0; i < HISTORY_LIMIT + 10; i += 1) {
      state = push(state, instance(`i${i}`));
    }

    expect(state.entries).toHaveLength(HISTORY_LIMIT);
    expect(current(state)).toEqual(instance(`i${HISTORY_LIMIT + 9}`));
    expect(state.index).toBe(HISTORY_LIMIT - 1);
  });

  it("replaces the current entry without growing the stack", () => {
    const state = replace(push(createHistory(), instance("a")), instance("b"));

    expect(state.entries).toHaveLength(2);
    expect(current(state)).toEqual(instance("b"));
  });

  it("resets to a single entry", () => {
    let state = push(createHistory(), instance("a"));
    state = reset(state, { name: "home" });

    expect(state.entries).toHaveLength(1);
    expect(canGoBack(state)).toBe(false);
  });

  it("remaps instance ids after a rename", () => {
    let state = push(createHistory(), instance("old"));
    state = push(state, { name: "settings" });
    state = remapInstanceId(state, "old", "new");

    expect(state.entries[1].route).toEqual(instance("new"));
    expect(state.entries[1].key).toBe("instance:new");
  });

  it("leaves history untouched when the renamed instance is absent", () => {
    const state = push(createHistory(), instance("a"));

    expect(remapInstanceId(state, "missing", "other")).toBe(state);
    expect(remapInstanceId(state, "a", "a")).toBe(state);
  });

  it("drops entries of a deleted instance and keeps the cursor valid", () => {
    let state = push(createHistory(), instance("gone"));
    state = push(state, { name: "settings" });
    state = dropInstance(state, "gone");

    expect(state.entries.map((entry) => entry.key)).toEqual([
      "home",
      "settings",
    ]);
    expect(current(state)).toEqual({ name: "settings" });
  });

  it("falls back to home when every entry is dropped", () => {
    const state = dropInstance(createHistory(instance("only")), "only");

    expect(current(state)).toEqual({ name: "home" });
    expect(state.entries).toHaveLength(1);
  });
});
