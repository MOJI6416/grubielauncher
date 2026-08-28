import { describe, expect, it } from "vitest";
import { ShareStateStore } from "./ShareStateStore";

function storeWithError(): ShareStateStore {
  const store = new ShareStateStore();
  store.setError({ code: "lan_not_found", message: "world is not open to LAN" });
  return store;
}

describe("ShareStateStore", () => {
  it("clears the previous failure when a caller asks it to", () => {
    const store = storeWithError();

    store.patch({ phase: "online", lastError: undefined });

    expect(store.getState().lastError).toBeUndefined();
    expect(store.getState().phase).toBe("online");
  });

  it("keeps the failure when a patch says nothing about it", () => {
    const store = storeWithError();

    store.patch({ isHeartbeatActive: true });

    expect(store.getState().lastError?.code).toBe("lan_not_found");
  });

  it("drops the failure on reset", () => {
    const store = storeWithError();

    store.reset();

    expect(store.getState().lastError).toBeUndefined();
    expect(store.getState().phase).toBe("idle");
  });
});
