import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultStore } from "jotai";
import type { Socket } from "socket.io-client";
import type { IMessage } from "@/types/IMessage";
import { selectedFriendAtom } from "@renderer/stores/atoms";
import { forgetChatDrafts, readChatDraft, writeChatDraft } from "./chatDrafts";
import { clearOutgoing, outgoingRecipient } from "./outgoingSends";
import {
  bindChatOutbox,
  confirmChatDraft,
  flushChatDrafts,
  forgetChatOutbox,
  hasPendingReconcile,
  hasPendingResend,
  PROBE_ATTEMPTS,
  PROBE_TIMEOUT_MS,
  RESEND_WINDOW_MS,
} from "./outbox";
import type { ChatEntry } from "./chatEntries";

function entry(localId: string, value: string): ChatEntry {
  return {
    key: localId,
    localId,
    status: "failed",
    message: {
      sender: "own",
      message: { _type: "text", value },
      time: new Date(0),
    },
  };
}

function stored(id: string, value: string, seq: number): IMessage {
  return {
    id,
    seq,
    sender: "own",
    message: { _type: "text", value },
    time: new Date(1000),
  } as IMessage;
}

function fakeSocket(connected = true) {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const listeners = new Map<string, (payload: never) => void>();
  const socket = {
    connected,
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
    },
    on: (event: string, handler: (payload: never) => void) => {
      listeners.set(event, handler);
    },
    off: (event: string) => {
      listeners.delete(event);
    },
  };

  return { socket: socket as unknown as Socket, emitted, listeners };
}

function sent(emitted: Array<{ event: string; payload: unknown }>) {
  return emitted
    .filter((item) => item.event === "sendMessage")
    .map(
      (item) =>
        (item.payload as { message: IMessage }).message.message.value as string,
    );
}

describe("flushChatDrafts", () => {
  beforeEach(() => {
    forgetChatDrafts();
    forgetChatOutbox();
    clearOutgoing();
    getDefaultStore().set(selectedFriendAtom, undefined);
  });

  afterEach(() => {
    forgetChatOutbox();
  });

  it("asks what the server already has before resending anything", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const { socket, emitted } = fakeSocket();

    expect(flushChatDrafts(socket, "own")).toBe(1);
    expect(emitted).toEqual([
      {
        event: "getMessages",
        payload: { friendId: "friend-1", before: 2147483647, limit: 50 },
      },
    ]);
  });

  it("sends what the server never got", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const { socket, emitted, listeners } = fakeSocket();
    bindChatOutbox(socket, "own");
    flushChatDrafts(socket, "own");

    listeners.get("getMessages")?.({
      friendId: "friend-1",
      messages: [stored("srv-old", "hello", 1)],
    } as never);

    expect(sent(emitted)).toEqual(["first"]);
    expect(outgoingRecipient({ _type: "text", value: "first" })).toBe(
      "friend-1",
    );
  });

  it("does not hand the server a second copy when the link flaps", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const { socket, emitted, listeners } = fakeSocket();
    bindChatOutbox(socket, "own");
    flushChatDrafts(socket, "own");

    listeners.get("getMessages")?.({
      friendId: "friend-1",
      messages: [stored("srv-1", "first", 7)],
    } as never);

    expect(sent(emitted)).toEqual([]);
    expect(readChatDraft("own", "friend-1").unsent).toEqual([]);
  });

  it("resends only the part the server refused", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first"), entry("local-2", "second")],
      seen: [],
    });

    const { socket, emitted, listeners } = fakeSocket();
    bindChatOutbox(socket, "own");
    flushChatDrafts(socket, "own");

    listeners.get("getMessages")?.({
      friendId: "friend-1",
      messages: [stored("srv-1", "first", 7)],
    } as never);

    expect(sent(emitted)).toEqual(["second"]);
    expect(
      readChatDraft("own", "friend-1").unsent.map(
        (item) => item.message.message.value,
      ),
    ).toEqual(["second"]);
  });

  it("does not mistake an older message with the same text for the queued one", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: ["srv-old"],
    });

    const { socket, emitted, listeners } = fakeSocket();
    bindChatOutbox(socket, "own");
    flushChatDrafts(socket, "own");

    listeners.get("getMessages")?.({
      friendId: "friend-1",
      messages: [stored("srv-old", "first", 3)],
    } as never);

    expect(sent(emitted)).toEqual(["first"]);
  });

  it("asks once per chat while the answer is still on its way", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const { socket, listeners } = fakeSocket();
    bindChatOutbox(socket, "own");
    expect(flushChatDrafts(socket, "own")).toBe(1);
    expect(hasPendingReconcile()).toBe(true);

    const again = fakeSocket();
    expect(flushChatDrafts(again.socket, "own")).toBe(0);
    expect(again.emitted).toEqual([]);

    listeners.get("disconnect")?.(undefined as never);
    expect(hasPendingReconcile()).toBe(false);

    const afterFlap = fakeSocket();
    expect(flushChatDrafts(afterFlap.socket, "own")).toBe(1);
  });

  it("asks again on the next connection when the answer never came", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const { socket, listeners } = fakeSocket();
    bindChatOutbox(socket, "own");
    flushChatDrafts(socket, "own");
    listeners.get("disconnect")?.(undefined as never);

    const next = fakeSocket();
    expect(flushChatDrafts(next.socket, "own")).toBe(1);
  });

  it("leaves the open chat to resend on its own, so nothing goes twice", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const { socket, emitted } = fakeSocket();

    expect(flushChatDrafts(socket, "own", "friend-1")).toBe(0);
    expect(emitted).toEqual([]);
    expect(readChatDraft("own", "friend-1").unsent).toHaveLength(1);
  });

  it("stands down if the chat was opened while the answer was on its way", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const { socket, emitted, listeners } = fakeSocket();
    bindChatOutbox(socket, "own");
    flushChatDrafts(socket, "own");
    getDefaultStore().set(selectedFriendAtom, "friend-1");

    listeners.get("getMessages")?.({
      friendId: "friend-1",
      messages: [],
    } as never);

    expect(sent(emitted)).toEqual([]);
    expect(readChatDraft("own", "friend-1").unsent).toHaveLength(1);
  });

  it("ignores a history page nobody in the outbox asked for", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const { socket, emitted, listeners } = fakeSocket();
    bindChatOutbox(socket, "own");

    listeners.get("getMessages")?.({
      friendId: "friend-1",
      messages: [],
    } as never);

    expect(emitted).toEqual([]);
    expect(readChatDraft("own", "friend-1").unsent).toHaveLength(1);
  });

  it("drops the queued copy once the server echoes it back", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    expect(
      confirmChatDraft("own", "friend-1", { _type: "text", value: "first" }),
    ).toBe(true);
    expect(readChatDraft("own", "friend-1").unsent).toEqual([]);
  });

  it("keeps a message the server never acknowledged", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first"), entry("local-2", "second")],
      seen: [],
    });

    const { socket, listeners } = fakeSocket();
    bindChatOutbox(socket, "own");
    flushChatDrafts(socket, "own");
    listeners.get("getMessages")?.({
      friendId: "friend-1",
      messages: [],
    } as never);

    listeners.get("sendMessage")?.({
      id: "srv-1",
      sender: "own",
      message: { _type: "text", value: "first" },
      time: new Date(0),
    } as never);

    expect(
      readChatDraft("own", "friend-1").unsent.map(
        (item) => item.message.message.value,
      ),
    ).toEqual(["second"]);
  });

  it("confirms the chat the echo names, not the one the text guesses", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "го")],
      seen: [],
    });
    writeChatDraft("own", "friend-2", {
      text: "",
      unsent: [entry("local-2", "го")],
      seen: [],
    });

    const { socket, listeners } = fakeSocket();
    bindChatOutbox(socket, "own");
    flushChatDrafts(socket, "own");
    listeners.get("getMessages")?.({
      friendId: "friend-1",
      messages: [],
    } as never);
    listeners.get("getMessages")?.({
      friendId: "friend-2",
      messages: [],
    } as never);

    listeners.get("sendMessage")?.({
      id: "srv-2",
      sender: "own",
      friendId: "friend-2",
      clientMessageId: "local-2",
      message: { _type: "text", value: "го" },
      time: new Date(0),
    } as never);

    expect(readChatDraft("own", "friend-2").unsent).toHaveLength(0);
    expect(readChatDraft("own", "friend-1").unsent).toHaveLength(1);
  });

  it("keeps the text still sitting in the composer", () => {
    writeChatDraft("own", "friend-1", {
      text: "half a sentence",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    confirmChatDraft("own", "friend-1", { _type: "text", value: "first" });

    expect(readChatDraft("own", "friend-1").text).toBe("half a sentence");
  });

  it("holds everything back while there is no connection", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const { socket, emitted } = fakeSocket(false);

    expect(flushChatDrafts(socket, "own")).toBe(0);
    expect(emitted).toEqual([]);
    expect(readChatDraft("own", "friend-1").unsent).toHaveLength(1);
  });

  it("does nothing without an account", () => {
    const { socket, emitted } = fakeSocket();

    expect(flushChatDrafts(socket, undefined)).toBe(0);
    expect(emitted).toEqual([]);
  });
});

describe("a reconcile the server refuses", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    forgetChatDrafts();
    forgetChatOutbox();
    clearOutgoing();
    getDefaultStore().set(selectedFriendAtom, undefined);
  });

  afterEach(() => {
    forgetChatOutbox();
    vi.useRealTimers();
  });

  it("asks again on the same connection instead of sitting on the queue", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const { socket, emitted, listeners } = fakeSocket();
    bindChatOutbox(socket, "own");
    flushChatDrafts(socket, "own");
    expect(emitted).toHaveLength(1);

    vi.advanceTimersByTime(PROBE_TIMEOUT_MS);
    expect(emitted).toHaveLength(2);
    expect(hasPendingReconcile()).toBe(true);

    listeners.get("getMessages")?.({
      friendId: "friend-1",
      messages: [],
    } as never);

    expect(sent(emitted)).toEqual(["first"]);
    expect(hasPendingReconcile()).toBe(false);
  });

  it("stops asking after a few tries and stops claiming a reconcile is in flight", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const { socket, emitted } = fakeSocket();
    bindChatOutbox(socket, "own");
    flushChatDrafts(socket, "own");

    vi.advanceTimersByTime(PROBE_TIMEOUT_MS * (PROBE_ATTEMPTS + 2));

    expect(emitted).toHaveLength(PROBE_ATTEMPTS);
    expect(hasPendingReconcile()).toBe(false);
  });

  it("does not ask again once the chat has been opened", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const { socket, emitted } = fakeSocket();
    bindChatOutbox(socket, "own");
    flushChatDrafts(socket, "own");
    getDefaultStore().set(selectedFriendAtom, "friend-1");

    vi.advanceTimersByTime(PROBE_TIMEOUT_MS * 3);

    expect(emitted).toHaveLength(1);
  });

  it("does not ask again once the queue is empty", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const { socket, emitted } = fakeSocket();
    bindChatOutbox(socket, "own");
    flushChatDrafts(socket, "own");
    confirmChatDraft("own", "friend-1", { _type: "text", value: "first" });

    vi.advanceTimersByTime(PROBE_TIMEOUT_MS * 3);

    expect(emitted).toHaveLength(1);
  });

  it("forgets its timers when the link drops", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const { socket, emitted, listeners } = fakeSocket();
    bindChatOutbox(socket, "own");
    flushChatDrafts(socket, "own");
    listeners.get("disconnect")?.(undefined as never);

    vi.advanceTimersByTime(PROBE_TIMEOUT_MS * 3);

    expect(emitted).toHaveLength(1);
    expect(hasPendingReconcile()).toBe(false);
  });
});

describe("hasPendingResend", () => {
  beforeEach(() => {
    forgetChatDrafts();
    forgetChatOutbox();
    clearOutgoing();
    getDefaultStore().set(selectedFriendAtom, undefined);
  });

  afterEach(() => {
    forgetChatOutbox();
  });

  it("is quiet until the outbox actually resends something", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const { socket, listeners } = fakeSocket();
    bindChatOutbox(socket, "own");
    flushChatDrafts(socket, "own");
    expect(hasPendingResend()).toBe(false);

    listeners.get("getMessages")?.({
      friendId: "friend-1",
      messages: [stored("srv-1", "first", 7)],
    } as never);

    expect(hasPendingResend()).toBe(false);
  });

  it("owns up to a resend for as long as its answer can still arrive", () => {
    writeChatDraft("own", "friend-1", {
      text: "",
      unsent: [entry("local-1", "first")],
      seen: [],
    });

    const at = 1_700_000_000_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(at);

    const { socket, listeners } = fakeSocket();
    bindChatOutbox(socket, "own");
    flushChatDrafts(socket, "own");

    listeners.get("getMessages")?.({
      friendId: "friend-1",
      messages: [],
    } as never);

    clock.mockRestore();

    expect(hasPendingResend(at)).toBe(true);
    expect(hasPendingResend(at + RESEND_WINDOW_MS - 1)).toBe(true);
    expect(hasPendingResend(at + RESEND_WINDOW_MS)).toBe(false);
  });
});
