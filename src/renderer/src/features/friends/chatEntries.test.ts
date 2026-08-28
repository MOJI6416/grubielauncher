import { describe, expect, it } from "vitest";
import type { IMessage } from "@/types/IMessage";
import {
  appendedEntries,
  applyReactions,
  createPendingEntry,
  dropEntry,
  firstUnreadKey,
  markEntryFailed,
  markEntryPending,
  quoteMessage,
  removeMessage,
  resolveEcho,
  toChatEntries,
  unsentEntries,
} from "./chatEntries";

function makeMessage(patch: Partial<IMessage> = {}): IMessage {
  return {
    sender: "me",
    message: { _type: "text", value: "hi" },
    time: new Date("2026-08-15T10:00:00Z"),
    ...patch,
  };
}

describe("toChatEntries", () => {
  it("keeps server ids as keys", () => {
    const entries = toChatEntries([makeMessage({ id: "m1" })]);
    expect(entries[0].key).toBe("m1");
    expect(entries[0].status).toBe("sent");
  });

  it("generates a stable key for a message without an id", () => {
    const entries = toChatEntries([makeMessage(), makeMessage()]);
    expect(entries[0].key).not.toBe(entries[1].key);
  });
});

describe("appendedEntries", () => {
  const page = toChatEntries([
    makeMessage({ id: "m1" }),
    makeMessage({ id: "m2" }),
    makeMessage({ id: "m3" }),
  ]);

  it("counts every message added at the end", () => {
    const next = [
      ...page,
      ...toChatEntries([makeMessage({ id: "m4" }), makeMessage({ id: "m5" })]),
    ];
    expect(appendedEntries(page, next).map((entry) => entry.key)).toEqual([
      "m4",
      "m5",
    ]);
  });

  it("ignores older pages prepended by history paging", () => {
    const next = [...toChatEntries([makeMessage({ id: "m0" })]), ...page];
    expect(appendedEntries(page, next)).toEqual([]);
  });

  it("ignores a removed last message", () => {
    expect(appendedEntries(page, page.slice(0, 2))).toEqual([]);
  });

  it("ignores an unchanged list", () => {
    expect(appendedEntries(page, page)).toEqual([]);
  });

  it("ignores the first page", () => {
    expect(appendedEntries([], page)).toEqual([]);
  });
});

describe("resolveEcho", () => {
  it("replaces the pending copy of our own message", () => {
    const entries = [createPendingEntry("local-1", makeMessage())];
    const next = resolveEcho(entries, makeMessage({ id: "m1" }), "me");

    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("sent");
    expect(next[0].key).toBe("m1");
  });

  it("replaces a failed copy too, so a retry never duplicates", () => {
    const entries = markEntryFailed(
      [createPendingEntry("local-1", makeMessage())],
      "local-1",
    );
    const next = resolveEcho(entries, makeMessage({ id: "m1" }), "me");

    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("sent");
  });

  it("appends a message from the other side", () => {
    const entries = toChatEntries([makeMessage({ id: "m1" })]);
    const next = resolveEcho(
      entries,
      makeMessage({ id: "m2", sender: "friend", message: { _type: "text", value: "yo" } }),
      "me",
    );

    expect(next).toHaveLength(2);
    expect(next[1].message.sender).toBe("friend");
  });

  it("ignores a duplicate echo of a message we already have", () => {
    const entries = toChatEntries([makeMessage({ id: "m1" })]);
    expect(resolveEcho(entries, makeMessage({ id: "m1" }), "me")).toBe(entries);
  });

  it("does not steal a pending entry with different content", () => {
    const entries = [
      createPendingEntry("local-1", makeMessage({ message: { _type: "text", value: "one" } })),
    ];
    const next = resolveEcho(
      entries,
      makeMessage({ id: "m1", message: { _type: "text", value: "two" } }),
      "me",
    );

    expect(next).toHaveLength(2);
    expect(next[0].status).toBe("pending");
  });

  it("appends our own message when nothing is pending", () => {
    const next = resolveEcho([], makeMessage({ id: "m1" }), "me");
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("sent");
  });

  it("resolves the exact bubble the echoed key names", () => {
    // Two identical texts in flight: matching on the text alone settles the
    // wrong one and leaves the other pending forever.
    const entries = [
      createPendingEntry("local-1", makeMessage()),
      createPendingEntry("local-2", makeMessage()),
    ];
    const next = resolveEcho(
      entries,
      makeMessage({ id: "m2", clientMessageId: "local-2" }),
      "me",
    );

    expect(next).toHaveLength(2);
    expect(next[0].status).toBe("pending");
    expect(next[1].status).toBe("sent");
    expect(next[1].key).toBe("m2");
  });

  it("still matches on content when the echo carries no key", () => {
    const entries = [createPendingEntry("local-1", makeMessage())];
    const next = resolveEcho(entries, makeMessage({ id: "m1" }), "me");

    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("sent");
  });
});

describe("pending entry lifecycle", () => {
  const entries = [createPendingEntry("local-1", makeMessage())];

  it("marks a pending entry as failed", () => {
    expect(markEntryFailed(entries, "local-1")[0].status).toBe("failed");
  });

  it("puts a failed entry back in flight", () => {
    const failed = markEntryFailed(entries, "local-1");
    expect(markEntryPending(failed, "local-1")[0].status).toBe("pending");
  });

  it("never re-marks a delivered entry", () => {
    const sent = toChatEntries([makeMessage({ id: "m1" })]);
    expect(markEntryFailed(sent, "m1")[0].status).toBe("sent");
  });

  it("drops a local entry", () => {
    expect(dropEntry(entries, "local-1")).toHaveLength(0);
  });

  it("lists everything still unsent", () => {
    const mixed = [...toChatEntries([makeMessage({ id: "m1" })]), ...entries];
    expect(unsentEntries(mixed).map((entry) => entry.localId)).toEqual([
      "local-1",
    ]);
  });
});

describe("removeMessage and applyReactions", () => {
  const entries = toChatEntries([
    makeMessage({ id: "m1" }),
    makeMessage({ id: "m2" }),
  ]);

  it("removes a deleted message", () => {
    expect(removeMessage(entries, "m1").map((entry) => entry.key)).toEqual([
      "m2",
    ]);
  });

  it("replaces reactions on one message only", () => {
    const next = applyReactions(entries, "m2", [
      { emoji: "👍", users: ["me"] },
    ]);

    expect(next[0].message.reactions).toBeUndefined();
    expect(next[1].message.reactions).toHaveLength(1);
  });

  it("clears reactions when the server sends nothing", () => {
    const next = applyReactions(entries, "m1", undefined);
    expect(next[0].message.reactions).toEqual([]);
  });
});

describe("firstUnreadKey", () => {
  const entries = toChatEntries([
    makeMessage({ id: "m1", sender: "friend" }),
    makeMessage({ id: "m2", sender: "me" }),
    makeMessage({ id: "m3", sender: "friend" }),
    makeMessage({ id: "m4", sender: "friend" }),
  ]);

  it("points at the first of the unread incoming messages", () => {
    expect(firstUnreadKey(entries, "me", 2)).toBe("m3");
  });

  it("clamps to the oldest incoming message", () => {
    expect(firstUnreadKey(entries, "me", 99)).toBe("m1");
  });

  it("is undefined without unread messages", () => {
    expect(firstUnreadKey(entries, "me", 0)).toBeUndefined();
  });

  it("is undefined when we wrote everything", () => {
    const own = toChatEntries([makeMessage({ id: "m1" })]);
    expect(firstUnreadKey(own, "me", 1)).toBeUndefined();
  });
});

describe("quoteMessage", () => {
  it("wraps the message so the dialog names what will be deleted", () => {
    expect(quoteMessage("го в майн")).toBe("«го в майн»");
  });

  it("collapses line breaks into one line", () => {
    expect(quoteMessage(" первая\n\nвторая ")).toBe("«первая вторая»");
  });

  it("cuts a long message instead of stretching the dialog", () => {
    const quote = quoteMessage("a".repeat(300));
    expect(quote.length).toBe(123);
    expect(quote.endsWith("…»")).toBe(true);
  });

  it("gives nothing for an empty message", () => {
    expect(quoteMessage("   ")).toBe("");
  });
});
