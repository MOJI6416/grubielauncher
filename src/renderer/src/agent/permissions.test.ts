import { beforeEach, describe, expect, it } from "vitest";
import {
  canGrantAlways,
  clearGrants,
  grantAlways,
  grantScope,
  listGrants,
  needsPermission,
  parseGrantKey,
  revokeAlways,
} from "./permissions";

beforeEach(() => {
  clearGrants();
});

describe("needsPermission", () => {
  it("lets read tools run without asking", () => {
    expect(needsPermission("list_instances", "read")).toBe(false);
  });

  it("asks for write tools until they are granted", () => {
    expect(needsPermission("add_mods", "write")).toBe(true);
    grantAlways("add_mods");
    expect(needsPermission("add_mods", "write")).toBe(false);
  });

  it("keeps a grant scoped to the tool it was given for", () => {
    grantAlways("add_mods");
    expect(needsPermission("remove_mods", "write")).toBe(true);
  });

  it("keeps a grant scoped to the instance it was given for", () => {
    grantAlways("remove_mods", "Fresh Pack");

    expect(needsPermission("remove_mods", "write", "Fresh Pack")).toBe(false);
    expect(needsPermission("remove_mods", "write", "Main Pack")).toBe(true);
    expect(needsPermission("remove_mods", "write", null)).toBe(true);
  });

  it("does not widen an unscoped grant to a named instance", () => {
    grantAlways("set_memory");

    expect(needsPermission("set_memory", "write", null)).toBe(false);
    expect(needsPermission("set_memory", "write", "Fresh Pack")).toBe(true);
  });

  it("always asks for destructive tools, even after a grant", () => {
    grantAlways("delete_instance");
    expect(needsPermission("delete_instance", "destructive")).toBe(true);
  });
});

describe("canGrantAlways", () => {
  it("offers always-allow only for write tools", () => {
    expect(canGrantAlways("write")).toBe(true);
    expect(canGrantAlways("destructive")).toBe(false);
    expect(canGrantAlways("read")).toBe(false);
  });
});

describe("revokeAlways", () => {
  it("takes a single grant back without touching the others", () => {
    grantAlways("add_mods");
    grantAlways("set_memory");

    revokeAlways("add_mods");

    expect(listGrants()).toEqual(["set_memory"]);
    expect(needsPermission("add_mods", "write")).toBe(true);
  });
});

describe("clearGrants", () => {
  it("drops every grant", () => {
    grantAlways("add_mods");
    grantAlways("set_memory");
    expect(listGrants()).toHaveLength(2);

    clearGrants();

    expect(listGrants()).toEqual([]);
    expect(needsPermission("add_mods", "write")).toBe(true);
  });
});

describe("grantScope", () => {
  it("takes the instance name out of the tool input", () => {
    expect(grantScope({ instance: "Fresh Pack", memoryMb: 8192 })).toBe(
      "Fresh Pack",
    );
  });

  it("has no scope when the call names no instance", () => {
    expect(grantScope({ memoryMb: 8192 })).toBeNull();
    expect(grantScope({ instance: "   " })).toBeNull();
    expect(grantScope(null)).toBeNull();
  });
});

describe("parseGrantKey", () => {
  it("reads back a scoped grant, spaces in the name included", () => {
    grantAlways("remove_mods", "My Modpack 2");

    expect(parseGrantKey(listGrants()[0])).toEqual({
      name: "remove_mods",
      scope: "My Modpack 2",
    });
  });

  it("reads back an unscoped grant", () => {
    expect(parseGrantKey("set_memory")).toEqual({
      name: "set_memory",
      scope: null,
    });
  });
});
