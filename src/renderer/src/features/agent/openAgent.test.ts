import { beforeEach, describe, expect, it } from "vitest";
import { getDefaultStore } from "jotai";
import { agentDraftAtom } from "@renderer/agent/store";
import { accountAtom } from "@renderer/stores/atoms";
import { createHistory } from "@renderer/navigation/history";
import {
  clearNavigationBlockers,
  registerNavigationBlocker,
} from "@renderer/navigation/guards";
import { getCurrentRoute } from "@renderer/navigation/navigate";
import {
  historyAtom,
  pendingNavigationAtom,
} from "@renderer/navigation/store";
import type { ILocalAccount } from "@/types/Account";
import { askAgent, openAgent } from "./openAgent";

const store = getDefaultStore();

const online = { nickname: "Lumavia", type: "discord" } as ILocalAccount;
const offline = { nickname: "Steve", type: "plain" } as ILocalAccount;

beforeEach(() => {
  clearNavigationBlockers();
  store.set(historyAtom, createHistory());
  store.set(pendingNavigationAtom, null);
  store.set(agentDraftAtom, null);
  store.set(accountAtom, online);
});

describe("openAgent", () => {
  it("opens the assistant without touching the draft", () => {
    store.set(agentDraftAtom, "typed earlier");

    expect(openAgent()).toBe(true);
    expect(getCurrentRoute()).toEqual({ name: "agent" });
    expect(store.get(agentDraftAtom)).toBe("typed earlier");
  });

  it("stays put for an account the assistant does not serve", () => {
    store.set(accountAtom, offline);

    expect(openAgent()).toBe(false);
    expect(getCurrentRoute()).toEqual({ name: "home" });
  });
});

describe("askAgent", () => {
  it("carries the question over", () => {
    expect(askAgent("  why did it crash  ")).toBe(true);
    expect(store.get(agentDraftAtom)).toBe("why did it crash");
  });

  it("keeps the question while the unsaved guard holds the navigation", () => {
    registerNavigationBlocker("editor", () => true);

    expect(askAgent("why did it crash")).toBe(false);
    expect(store.get(pendingNavigationAtom)).toEqual({
      kind: "route",
      route: { name: "agent" },
    });
    expect(store.get(agentDraftAtom)).toBe("why did it crash");
  });

  it("puts the previous draft back when the route is out of reach", () => {
    store.set(accountAtom, offline);
    store.set(agentDraftAtom, "typed earlier");

    expect(askAgent("why did it crash")).toBe(false);
    expect(store.get(agentDraftAtom)).toBe("typed earlier");
  });
});
