import { describe, expect, it } from "vitest";
import {
  bindConnectionState,
  peopleLinkState,
  type ConnectionSource,
} from "./connectionState";

function fakeSocket() {
  const listeners = new Map<string, Set<() => void>>();

  const socket = {
    connected: false,
    on(event: string, handler: () => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return socket;
    },
    off(event: string, handler: () => void) {
      listeners.get(event)?.delete(handler);
      return socket;
    },
  };

  return {
    source: socket as unknown as ConnectionSource,
    connect() {
      socket.connected = true;
      for (const handler of listeners.get("connect") ?? []) handler();
    },
    emit(event: string) {
      socket.connected = event === "connect";
      for (const handler of listeners.get(event) ?? []) handler();
    },
    count(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
  };
}

describe("bindConnectionState", () => {
  it("reports a handshake that landed before the listener was attached", () => {
    const socket = fakeSocket();
    socket.connect();

    const seen: boolean[] = [];
    bindConnectionState(socket.source, (connected) => seen.push(connected));

    expect(seen).toEqual([true]);
  });

  it("reports a handshake that lands after the listener was attached", () => {
    const socket = fakeSocket();

    const seen: boolean[] = [];
    bindConnectionState(socket.source, (connected) => seen.push(connected));
    socket.connect();

    expect(seen).toEqual([false, true]);
  });

  it("drops back to disconnected on disconnect and on connect_error", () => {
    const socket = fakeSocket();

    const seen: boolean[] = [];
    bindConnectionState(socket.source, (connected) => seen.push(connected));

    socket.emit("connect");
    socket.emit("disconnect");
    socket.emit("connect");
    socket.emit("connect_error");

    expect(seen).toEqual([false, true, false, true, false]);
  });

  it("separates a missing session from a connection that is still coming up", () => {
    expect(peopleLinkState({ hasSocket: false, isConnected: false })).toBe(
      "signedOut",
    );
    expect(peopleLinkState({ hasSocket: true, isConnected: false })).toBe(
      "connecting",
    );
    expect(peopleLinkState({ hasSocket: true, isConnected: true })).toBe(
      "online",
    );
  });

  it("removes every listener it added", () => {
    const socket = fakeSocket();
    const unbind = bindConnectionState(socket.source, () => {});

    expect(socket.count("connect")).toBe(1);
    expect(socket.count("disconnect")).toBe(1);
    expect(socket.count("connect_error")).toBe(1);

    unbind();

    expect(socket.count("connect")).toBe(0);
    expect(socket.count("disconnect")).toBe(0);
    expect(socket.count("connect_error")).toBe(0);
  });
});
