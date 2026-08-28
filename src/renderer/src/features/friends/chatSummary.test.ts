import { describe, expect, it } from "vitest";
import type { IMessage } from "@/types/IMessage";
import {
  describePreview,
  dropPreviewMessage,
  dropPreviews,
  normalizeChatsSummary,
  previewFromMessage,
  previewOfMessage,
  setPreview,
  applyChatsSummary,
  type ChatPreview,
} from "./chatSummary";

function preview(patch: Partial<ChatPreview> = {}): ChatPreview {
  return {
    id: "m1",
    seq: 10,
    senderId: "peer",
    type: "text",
    value: "hello",
    time: "2026-08-17T10:00:00.000Z",
    ...patch,
  };
}

describe("normalizeChatsSummary", () => {
  it("reads the counters as numbers", () => {
    const summaries = normalizeChatsSummary({
      generatedAt: "2026-08-17T10:00:00.000Z",
      chats: [
        {
          peerId: "a",
          unread: 7,
          lastSeq: 42,
          lastReadSeq: 35,
          peerReadSeq: 40,
          peerReadAt: "2026-08-17T09:00:00.000Z",
          lastMessage: {
            id: "m9",
            seq: 42,
            senderId: "a",
            type: "text",
            value: "hey",
            time: "2026-08-17T09:59:00.000Z",
          },
        },
      ],
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0].unread).toBe(7);
    expect(summaries[0].peerReadSeq).toBe(40);
    expect(summaries[0].lastMessage?.value).toBe("hey");
  });

  it("survives junk", () => {
    expect(normalizeChatsSummary(null)).toEqual([]);
    expect(normalizeChatsSummary({ chats: "nope" })).toEqual([]);
    expect(
      normalizeChatsSummary({ chats: [null, {}, { peerId: "" }] }),
    ).toEqual([]);
  });

  it("clamps negative or missing counters to zero", () => {
    const [summary] = normalizeChatsSummary({
      chats: [{ peerId: "a", unread: -3 }],
    });

    expect(summary.unread).toBe(0);
    expect(summary.lastSeq).toBe(0);
    expect(summary.peerReadAt).toBeNull();
    expect(summary.lastMessage).toBeNull();
  });

  it("drops a preview without a sender", () => {
    const [summary] = normalizeChatsSummary({
      chats: [{ peerId: "a", lastMessage: { id: "m1", value: "x" } }],
    });

    expect(summary.lastMessage).toBeNull();
  });
});

describe("applyChatsSummary", () => {
  const empty = { previews: {}, unread: {} };

  it("keeps only conversations with unread messages and indexes previews by peer", () => {
    const summaries = normalizeChatsSummary({
      chats: [
        {
          peerId: "a",
          unread: 3,
          lastSeq: 5,
          lastMessage: { id: "m1", seq: 5, senderId: "a", type: "text", value: "hi" },
        },
        { peerId: "b", unread: 0 },
      ],
    });

    const applied = applyChatsSummary(summaries, empty);

    expect(applied.unread).toEqual({ a: 3 });
    expect(Object.keys(applied.previews)).toEqual(["a"]);
  });

  it("does not undo a message that arrived while the summary was in flight", () => {
    const summaries = normalizeChatsSummary({
      chats: [
        {
          peerId: "a",
          unread: 0,
          lastSeq: 5,
          lastMessage: { id: "m1", seq: 5, senderId: "own", type: "text", value: "old" },
        },
      ],
    });

    const applied = applyChatsSummary(summaries, {
      previews: { a: preview({ id: "m2", seq: 9, value: "fresh" }) },
      unread: { a: 1 },
    });

    expect(applied.previews.a.value).toBe("fresh");
    expect(applied.unread).toEqual({ a: 1 });
  });

  it("keeps a chat the summary does not know about yet", () => {
    const applied = applyChatsSummary(normalizeChatsSummary({ chats: [] }), {
      previews: { a: preview({ seq: 3 }) },
      unread: { a: 2 },
    });

    expect(applied.previews.a.seq).toBe(3);
    expect(applied.unread).toEqual({ a: 2 });
  });

  it("takes the server side of a chat it has not fallen behind on", () => {
    const summaries = normalizeChatsSummary({
      chats: [
        {
          peerId: "a",
          unread: 0,
          lastSeq: 12,
          lastMessage: { id: "m3", seq: 12, senderId: "a", type: "text", value: "newer" },
        },
      ],
    });

    const applied = applyChatsSummary(summaries, {
      previews: { a: preview({ seq: 10 }) },
      unread: { a: 4 },
    });

    expect(applied.previews.a.value).toBe("newer");
    expect(applied.unread).toEqual({});
  });
});

describe("previewFromMessage", () => {
  it("keeps the text of a text message", () => {
    const message: IMessage = {
      id: "m2",
      sender: "peer",
      seq: 11,
      message: { _type: "text", value: "hello there" },
      time: new Date("2026-08-17T10:00:00.000Z"),
    };

    expect(previewFromMessage(message)).toMatchObject({
      id: "m2",
      seq: 11,
      senderId: "peer",
      type: "text",
      value: "hello there",
    });
  });

  it("does not leak the value of an image message", () => {
    const message: IMessage = {
      id: "m3",
      sender: "peer",
      message: { _type: "image", value: "https://cdn/secret.png" },
      time: new Date("2026-08-17T10:00:00.000Z"),
    };

    expect(previewFromMessage(message)).toMatchObject({
      seq: null,
      type: "image",
      value: "",
    });
  });
});

describe("setPreview", () => {
  it("replaces an older preview", () => {
    const previews = { a: preview({ seq: 5 }) };
    const next = setPreview(previews, "a", preview({ seq: 6, value: "new" }));

    expect(next.a.value).toBe("new");
  });

  it("ignores a preview that is not newer", () => {
    const previews = { a: preview({ seq: 6 }) };
    expect(setPreview(previews, "a", preview({ seq: 5 }))).toBe(previews);
  });

  it("accepts a preview without a seq as the newest", () => {
    const previews = { a: preview({ seq: 6 }) };
    const next = setPreview(previews, "a", preview({ seq: null, value: "pending" }));

    expect(next.a.value).toBe("pending");
  });
});

describe("dropPreviews", () => {
  it("forgets people who are no longer friends", () => {
    const previews = { a: preview(), b: preview() };
    expect(Object.keys(dropPreviews(previews, ["a"]))).toEqual(["a"]);
  });

  it("returns the same object when nothing changes", () => {
    const previews = { a: preview() };
    expect(dropPreviews(previews, ["a", "b"])).toBe(previews);
  });
});

describe("describePreview", () => {
  it("returns the text of a text message", () => {
    expect(describePreview(preview(), "me")).toEqual({
      isOwn: false,
      type: "text",
      text: "hello",
      labelKey: "",
    });
  });

  it("collapses newlines so the row stays one line", () => {
    expect(describePreview(preview({ value: "a\n\nb" }))?.text).toBe("a b");
  });

  it("marks a message written by the current user", () => {
    expect(describePreview(preview({ senderId: "me" }), "me")?.isOwn).toBe(true);
  });

  it("names non-text messages instead of showing their value", () => {
    expect(describePreview(preview({ type: "image", value: "" }))).toMatchObject({
      labelKey: "friends.chatImage",
      text: "",
    });
    expect(
      describePreview(preview({ type: "modpack", value: "" }))?.labelKey,
    ).toBe("friends.chatAttachModpack");
    expect(
      describePreview(preview({ type: "groupInvite", value: "" }))?.labelKey,
    ).toBe("friends.chatGroupInvite");
  });

  it("has nothing to say about an empty or system message", () => {
    expect(describePreview(null)).toBeNull();
    expect(describePreview(preview({ value: "   " }))).toBeNull();
    expect(describePreview(preview({ type: "system", value: "{}" }))).toBeNull();
  });
});

describe("dropPreviewMessage", () => {
  const previews = {
    "peer-1": preview({ id: "m1", value: "будет удалено" }),
    "peer-2": preview({ id: "m2", value: "остаётся" }),
  };

  it("finds whose row still shows a deleted message", () => {
    expect(previewOfMessage(previews, "m2")).toBe("peer-2");
    expect(previewOfMessage(previews, "m9")).toBeNull();
    expect(previewOfMessage(previews, "")).toBeNull();
  });

  it("takes the deleted message out of the list preview", () => {
    const next = dropPreviewMessage(previews, "m1");

    expect(next["peer-1"]).toBeUndefined();
    expect(next["peer-2"]).toBe(previews["peer-2"]);
  });

  it("leaves the previews alone when the message was not the last one", () => {
    expect(dropPreviewMessage(previews, "m9")).toBe(previews);
  });
});
