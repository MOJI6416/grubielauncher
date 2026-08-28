import { describe, expect, it } from "vitest";
import {
  agentBlockReason,
  blockReasonKey,
  isRouteAllowed,
  routeBlockReason,
} from "./access";

describe("routeBlockReason", () => {
  it("lets an online account into the assistant", () => {
    for (const accountType of ["microsoft", "discord", "elyby"] as const) {
      expect(routeBlockReason({ name: "agent" }, { accountType })).toBeNull();
    }
  });

  it("blocks the assistant for an offline account", () => {
    expect(routeBlockReason({ name: "agent" }, { accountType: "plain" })).toBe(
      "offlineAccount",
    );
  });

  it("blocks the assistant when no account is selected", () => {
    expect(routeBlockReason({ name: "agent" }, { accountType: null })).toBe(
      "noAccount",
    );
  });

  it("blocks a chat deep link the same way as the bare route", () => {
    expect(
      routeBlockReason(
        { name: "agent", chatId: "chat-1" },
        { accountType: "plain" },
      ),
    ).toBe("offlineAccount");
  });

  it("blocks people and the profile the same way as the assistant", () => {
    const routes = [
      { name: "people" },
      { name: "profile", userId: "me" },
    ] as const;

    for (const route of routes) {
      expect(routeBlockReason(route, { accountType: "plain" })).toBe(
        "offlineAccount",
      );
      expect(routeBlockReason(route, { accountType: null })).toBe("noAccount");
      expect(
        routeBlockReason(route, { accountType: "discord" }),
      ).toBeNull();
    }
  });

  it("leaves every other route alone", () => {
    const routes = [
      { name: "home" },
      { name: "news" },
      { name: "settings" },
      { name: "accounts" },
      { name: "instance", id: "x" },
    ] as const;

    for (const route of routes) {
      expect(routeBlockReason(route, { accountType: "plain" })).toBeNull();
      expect(routeBlockReason(route, { accountType: null })).toBeNull();
    }
  });
});

describe("isRouteAllowed", () => {
  it("mirrors routeBlockReason", () => {
    expect(isRouteAllowed({ name: "agent" }, { accountType: "plain" })).toBe(
      false,
    );
    expect(
      isRouteAllowed({ name: "agent" }, { accountType: "microsoft" }),
    ).toBe(true);
    expect(isRouteAllowed({ name: "home" }, { accountType: null })).toBe(true);
  });
});

describe("agentBlockReason", () => {
  it("accepts an undefined account", () => {
    expect(agentBlockReason(undefined)).toBe("noAccount");
    expect(agentBlockReason(null)).toBe("noAccount");
    expect(agentBlockReason("plain")).toBe("offlineAccount");
    expect(agentBlockReason("discord")).toBeNull();
  });
});

describe("blockReasonKey", () => {
  it("maps each reason to its own string", () => {
    expect(blockReasonKey("noAccount")).toBe("agent.blocked.noAccount");
    expect(blockReasonKey("offlineAccount")).toBe(
      "agent.blocked.offlineAccount",
    );
  });
});
