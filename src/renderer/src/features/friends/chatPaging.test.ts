import { describe, expect, it } from "vitest";
import type { IMessage } from "@/types/IMessage";
import { createPendingEntry, toChatEntries } from "./chatEntries";
import {
  applyHistoryPage,
  dropEchoedDrafts,
  historyFailure,
  knownMessageIds,
  oldestSeq,
} from "./chatPaging";

function message(seq: number, id = `m${seq}`): IMessage {
  return {
    id,
    sender: "peer",
    seq,
    message: { _type: "text", value: `#${seq}` },
    time: new Date(2026, 7, 17, 10, 0, seq),
  };
}

const page = (seqs: number[], patch: Record<string, unknown> = {}) => ({
  messages: seqs.map((seq) => message(seq)),
  hasMore: true,
  cursor: seqs[0] ?? null,
  ...patch,
});

describe("oldestSeq", () => {
  it("finds the smallest seq of the loaded history", () => {
    expect(oldestSeq(toChatEntries([message(7), message(9)]))).toBe(7);
  });

  it("ignores entries that have no seq yet", () => {
    const pending = createPendingEntry("local-1", message(0));
    delete pending.message.seq;

    expect(oldestSeq([pending])).toBeNull();
  });
});

describe("dropEchoedDrafts", () => {
  const own = (value: string, at: Date): IMessage => ({
    sender: "me",
    message: { _type: "text", value },
    time: at,
  });

  const stored = (value: string, at: Date, seq: number): IMessage => ({
    ...own(value, at),
    id: `s${seq}`,
    seq,
  });

  it("drops a draft the server already stored", () => {
    const sentAt = new Date(2026, 7, 17, 10, 0, 0);
    const draft = createPendingEntry("local-1", own("привет", sentAt));
    const page = toChatEntries([
      stored("привет", new Date(sentAt.getTime() + 400), 12),
    ]);

    expect(dropEchoedDrafts(page, [draft])).toHaveLength(0);
  });

  it("keeps a draft that only repeats an old message", () => {
    const draft = createPendingEntry(
      "local-1",
      own("привет", new Date(2026, 7, 17, 10, 0, 0)),
    );
    const page = toChatEntries([
      stored("привет", new Date(2026, 7, 16, 10, 0, 0), 4),
    ]);

    expect(dropEchoedDrafts(page, [draft])).toHaveLength(1);
  });

  it("matches every stored copy only once", () => {
    const sentAt = new Date(2026, 7, 17, 10, 0, 0);
    const drafts = [
      createPendingEntry("local-1", own("да", sentAt)),
      createPendingEntry("local-2", own("да", new Date(sentAt.getTime() + 10))),
    ];
    const page = toChatEntries([
      stored("да", new Date(sentAt.getTime() + 200), 12),
    ]);

    const kept = dropEchoedDrafts(page, drafts);
    expect(kept).toHaveLength(1);
    expect(kept[0].localId).toBe("local-2");
  });

  it("drops the draft the stored row names, whatever its text", () => {
    const sentAt = new Date(2026, 7, 17, 10, 0, 0);
    const drafts = [
      createPendingEntry("local-1", own("да", sentAt)),
      createPendingEntry("local-2", own("да", new Date(sentAt.getTime() + 10))),
    ];
    const page = toChatEntries([
      {
        ...stored("да", new Date(sentAt.getTime() + 200), 12),
        clientMessageId: "local-2",
      },
    ]);

    const kept = dropEchoedDrafts(page, drafts);
    expect(kept).toHaveLength(1);
    expect(kept[0].localId).toBe("local-1");
  });

  it("keeps a new draft that only repeats a stored message of its own", () => {
    const sentAt = new Date(2026, 7, 17, 10, 0, 0);
    const page = toChatEntries([
      {
        ...stored("ок", sentAt, 12),
        clientMessageId: "local-delivered",
      },
    ]);
    const draft = createPendingEntry(
      "local-new",
      own("ок", new Date(sentAt.getTime() + 20_000)),
    );

    const kept = dropEchoedDrafts(page, [draft]);
    expect(kept).toHaveLength(1);
    expect(kept[0].localId).toBe("local-new");
  });

  it("keeps drafts nobody echoed", () => {
    const drafts = [createPendingEntry("local-1", own("ау", new Date()))];
    expect(dropEchoedDrafts([], drafts)).toBe(drafts);
  });

  it("never counts a message the chat already shows as an echo", () => {
    const sentAt = new Date(2026, 7, 17, 10, 0, 0);
    const delivered = stored("да", sentAt, 12);
    const draft = createPendingEntry(
      "local-1",
      own("да", new Date(sentAt.getTime() + 20_000)),
    );
    const page = toChatEntries([delivered]);

    const kept = dropEchoedDrafts(page, [draft], new Set([delivered.id!]));
    expect(kept).toHaveLength(1);
    expect(kept[0].localId).toBe("local-1");
  });
});

describe("knownMessageIds", () => {
  it("collects the ids of messages the chat already holds", () => {
    const entries = [
      ...toChatEntries([message(4), message(5)]),
      createPendingEntry("local-1", message(0, "")),
    ];

    expect([...knownMessageIds(entries)]).toEqual(["m4", "m5"]);
  });
});

describe("applyHistoryPage", () => {
  it("keeps what arrived while a slow page was still on the way", () => {
    const opened = toChatEntries([message(8), message(9)]);
    const arrivedMeanwhile = toChatEntries([message(10)]);

    const result = applyHistoryPage(
      [...opened, ...arrivedMeanwhile],
      page([8, 9]),
      { requestedOlder: false, cursor: null },
    );

    expect(result.entries.map((entry) => entry.message.seq)).toEqual([
      8, 9, 10,
    ]);
  });

  it("does not duplicate a message the late page already carries", () => {
    const result = applyHistoryPage(toChatEntries([message(10)]), page([9, 10]), {
      requestedOlder: false,
      cursor: null,
    });

    expect(result.entries.map((entry) => entry.message.seq)).toEqual([9, 10]);
  });

  it("keeps the newest messages when a late older page lands as a first page", () => {
    const loaded = toChatEntries([message(70), message(71), message(72)]);

    const late = applyHistoryPage(loaded, page([20, 21]), {
      requestedOlder: false,
      cursor: 70,
    });

    expect(late.entries.map((entry) => entry.message.seq)).toEqual([
      20, 21, 70, 71, 72,
    ]);
    expect(late.cursor).toBe(20);
  });

  it("replaces the history on the first page", () => {
    const result = applyHistoryPage([], page([8, 9, 10]), {
      requestedOlder: false,
      cursor: null,
    });

    expect(result.mode).toBe("replace");
    expect(result.entries.map((entry) => entry.message.seq)).toEqual([8, 9, 10]);
    expect(result.cursor).toBe(8);
    expect(result.hasMore).toBe(true);
  });

  it("keeps an unsent duplicate when the chat is reopened and only remembers the ids", () => {
    const sentAt = new Date(2026, 7, 17, 10, 0, 0);
    const delivered: IMessage = {
      id: "s12",
      seq: 12,
      sender: "me",
      message: { _type: "text", value: "ок" },
      time: sentAt,
    };
    const draft = createPendingEntry("local-1", {
      sender: "me",
      message: { _type: "text", value: "ок" },
      time: new Date(sentAt.getTime() + 20_000),
    });

    const reopened = applyHistoryPage(
      [draft],
      { messages: [delivered], hasMore: false, cursor: 12 },
      { requestedOlder: false, cursor: null, seen: new Set(["s12"]) },
    );

    expect(reopened.entries).toHaveLength(2);
    expect(reopened.entries[1].localId).toBe("local-1");
  });

  it("still resolves the echo of a message the chat has never seen", () => {
    const sentAt = new Date(2026, 7, 17, 10, 0, 0);
    const stored: IMessage = {
      id: "s13",
      seq: 13,
      sender: "me",
      message: { _type: "text", value: "ок" },
      time: new Date(sentAt.getTime() + 300),
    };
    const draft = createPendingEntry("local-1", {
      sender: "me",
      message: { _type: "text", value: "ок" },
      time: sentAt,
    });

    const reopened = applyHistoryPage(
      [draft],
      { messages: [stored], hasMore: false, cursor: 13 },
      { requestedOlder: false, cursor: null, seen: new Set(["s12"]) },
    );

    expect(reopened.entries).toHaveLength(1);
    expect(reopened.entries[0].message.id).toBe("s13");
  });

  it("keeps unsent messages when the history is replaced", () => {
    const pending = createPendingEntry("local-1", message(0, ""));
    const result = applyHistoryPage([pending], page([8]), {
      requestedOlder: false,
      cursor: null,
    });

    expect(result.entries).toHaveLength(2);
    expect(result.entries[1].status).toBe("pending");
  });

  it("keeps an unsent repeat of a message the chat already shows", () => {
    const sentAt = new Date(2026, 7, 17, 10, 0, 0);
    const delivered: IMessage = {
      id: "srv1",
      seq: 12,
      sender: "me",
      message: { _type: "text", value: "завтра в 20" },
      time: sentAt,
    };
    const failed = createPendingEntry("local-1", {
      sender: "me",
      message: { _type: "text", value: "завтра в 20" },
      time: new Date(sentAt.getTime() + 30_000),
    });

    const result = applyHistoryPage(
      [...toChatEntries([delivered]), failed],
      { messages: [delivered], hasMore: false, cursor: 12 },
      { requestedOlder: false, cursor: null },
    );

    expect(result.entries).toHaveLength(2);
    expect(result.entries[1].localId).toBe("local-1");
  });

  it("puts an older page on top and keeps the order", () => {
    const existing = toChatEntries([message(8), message(9)]);
    const result = applyHistoryPage(existing, page([5, 6, 7]), {
      requestedOlder: true,
      cursor: 8,
    });

    expect(result.mode).toBe("prepend");
    expect(result.added).toBe(3);
    expect(result.entries.map((entry) => entry.message.seq)).toEqual([
      5, 6, 7, 8, 9,
    ]);
    expect(result.cursor).toBe(5);
  });

  it("does not duplicate a message that is already loaded", () => {
    const existing = toChatEntries([message(7), message(8)]);
    const result = applyHistoryPage(existing, page([6, 7]), {
      requestedOlder: true,
      cursor: 7,
    });

    expect(result.entries.map((entry) => entry.message.seq)).toEqual([6, 7, 8]);
  });

  it("keeps the entries untouched when an older page comes back empty", () => {
    const existing = toChatEntries([message(8)]);
    const result = applyHistoryPage(
      existing,
      { messages: [], hasMore: false, cursor: null },
      { requestedOlder: true, cursor: 8 },
    );

    expect(result.entries).toBe(existing);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBe(8);
  });

  it("treats a page that is not older as a replacement even when older was asked", () => {
    const existing = toChatEntries([message(8)]);
    const result = applyHistoryPage(existing, page([8, 9, 10]), {
      requestedOlder: true,
      cursor: 8,
    });

    expect(result.mode).toBe("replace");
    expect(result.entries.map((entry) => entry.message.seq)).toEqual([8, 9, 10]);
  });

  it("reads a missing hasMore as the end of the history", () => {
    const result = applyHistoryPage([], { messages: [message(1)] }, {
      requestedOlder: false,
      cursor: null,
    });

    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
  });
});

describe("applyHistoryPage with deletions", () => {
  it("does not bring back a message deleted while the page was in flight", () => {
    const merged = applyHistoryPage([], page([4, 5, 6]), {
      requestedOlder: false,
      cursor: null,
      removed: new Set(["m5"]),
    });

    expect(merged.entries.map((entry) => entry.message.id)).toEqual([
      "m4",
      "m6",
    ]);
  });
});

describe("historyFailure", () => {
  it("blames the older page while its request is still outstanding", () => {
    expect(
      historyFailure({ requestedOlder: true, historyPending: false }),
    ).toBe("older");
  });

  it("blames the conversation when its own request is outstanding", () => {
    expect(
      historyFailure({ requestedOlder: false, historyPending: true }),
    ).toBe("history");
  });

  it("calls a refusal stale when nothing is waiting for it", () => {
    expect(
      historyFailure({ requestedOlder: false, historyPending: false }),
    ).toBe("stale");
  });

  it("blames nobody while a queued chat is also asking for its history", () => {
    expect(
      historyFailure({
        requestedOlder: false,
        historyPending: true,
        ambiguous: true,
      }),
    ).toBe("unknown");
    expect(
      historyFailure({
        requestedOlder: true,
        historyPending: false,
        ambiguous: true,
      }),
    ).toBe("unknown");
  });
});
