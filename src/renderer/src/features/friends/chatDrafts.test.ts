import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatDraftFriendIds,
  forgetChatDrafts,
  groupDraftKey,
  readChatDraft,
  writeChatDraft,
} from "./chatDrafts";
import type { ChatEntry } from "./chatEntries";

let disk: Map<string, string>;

function mountDisk() {
  disk = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return disk.size;
      },
      key: (index: number) => [...disk.keys()][index] ?? null,
      getItem: (key: string) => disk.get(key) ?? null,
      setItem: (key: string, value: string) => void disk.set(key, value),
      removeItem: (key: string) => void disk.delete(key),
    },
  });
}

function entry(localId: string, status: ChatEntry["status"]): ChatEntry {
  return {
    key: localId,
    localId,
    status,
    message: {
      sender: "own",
      message: { _type: "text", value: localId },
      time: new Date(0),
    },
  };
}

describe("chatDrafts", () => {
  beforeEach(() => {
    mountDisk();
    forgetChatDrafts();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("keeps the typed text of a chat the user stepped away from", () => {
    writeChatDraft("account-1", "friend-1", {
      text: "half a sentence",
      unsent: [],
      seen: [],
    });

    expect(readChatDraft("account-1", "friend-1").text).toBe("half a sentence");
    expect(readChatDraft("account-1", "friend-2").text).toBe("");
  });

  it("stores an in-flight message as failed so it can be resent", () => {
    writeChatDraft("account-1", "friend-1", {
      text: "",
      unsent: [entry("local-1", "pending")],
      seen: [],
    });

    expect(readChatDraft("account-1", "friend-1").unsent).toEqual([
      entry("local-1", "failed"),
    ]);
  });

  it("forgets a chat with nothing left to keep", () => {
    writeChatDraft("account-1", "friend-1", {
      text: "draft",
      unsent: [],
      seen: [],
    });
    writeChatDraft("account-1", "friend-1", {
      text: "   ",
      unsent: [],
      seen: [],
    });

    expect(readChatDraft("account-1", "friend-1")).toEqual({
      text: "",
      unsent: [],
      seen: [],
    });
  });

  it("never shows one account the draft of another", () => {
    writeChatDraft("account-1", "friend-1", {
      text: "private to account 1",
      unsent: [entry("local-1", "pending")],
      seen: ["srv-1"],
    });

    expect(readChatDraft("account-2", "friend-1")).toEqual({
      text: "",
      unsent: [],
      seen: [],
    });
    expect(readChatDraft("account-1", "friend-1").text).toBe(
      "private to account 1",
    );
  });

  it("remembers what the chat had already shown, so a resent duplicate is not mistaken for an echo", () => {
    writeChatDraft("account-1", "friend-1", {
      text: "",
      unsent: [entry("local-1", "pending")],
      seen: ["srv-7", "srv-8"],
    });

    expect(readChatDraft("account-1", "friend-1").seen).toEqual([
      "srv-7",
      "srv-8",
    ]);
  });

  it("keeps what earlier visits had shown when the chat is reopened without its history", () => {
    writeChatDraft("account-1", "friend-1", {
      text: "",
      unsent: [entry("local-1", "pending")],
      seen: ["srv-7"],
    });
    writeChatDraft("account-1", "friend-1", {
      text: "",
      unsent: [entry("local-1", "failed")],
      seen: [],
    });

    expect(readChatDraft("account-1", "friend-1").seen).toEqual(["srv-7"]);
  });

  it("adds newly shown messages to what it already remembered", () => {
    writeChatDraft("account-1", "friend-1", {
      text: "",
      unsent: [entry("local-1", "failed")],
      seen: ["srv-7"],
    });
    writeChatDraft("account-1", "friend-1", {
      text: "",
      unsent: [entry("local-1", "failed")],
      seen: ["srv-7", "srv-9"],
    });

    expect(readChatDraft("account-1", "friend-1").seen).toEqual([
      "srv-7",
      "srv-9",
    ]);
  });

  it("keeps nothing when the account is unknown", () => {
    writeChatDraft(undefined, "friend-1", {
      text: "draft",
      unsent: [],
      seen: [],
    });

    expect(readChatDraft(undefined, "friend-1").text).toBe("");
  });

  it("keeps what the leaving account wrote when the account changes", () => {
    writeChatDraft("account-1", "friend-1", {
      text: "draft",
      unsent: [entry("local-1", "failed")],
      seen: [],
    });
    forgetChatDrafts();

    expect(readChatDraft("account-2", "friend-1").text).toBe("");
    expect(readChatDraft("account-1", "friend-1").text).toBe("draft");
    expect(readChatDraft("account-1", "friend-1").unsent).toHaveLength(1);
  });

  it("keeps an unsent message and the typed text through a restart", async () => {
    writeChatDraft("account-1", "friend-1", {
      text: "half a sentence",
      unsent: [entry("local-1", "pending")],
      seen: ["srv-7"],
    });

    vi.resetModules();
    const restarted = await import("./chatDrafts");
    const draft = restarted.readChatDraft("account-1", "friend-1");

    expect(draft.text).toBe("half a sentence");
    expect(draft.unsent).toEqual([entry("local-1", "failed")]);
    expect(draft.seen).toEqual(["srv-7"]);
  });

  it("leaves nothing behind after a restart when the chat was emptied", async () => {
    writeChatDraft("account-1", "friend-1", {
      text: "draft",
      unsent: [],
      seen: [],
    });
    writeChatDraft("account-1", "friend-1", { text: "", unsent: [], seen: [] });

    vi.resetModules();
    const restarted = await import("./chatDrafts");

    expect(restarted.readChatDraft("account-1", "friend-1")).toEqual({
      text: "",
      unsent: [],
      seen: [],
    });
  });

  it("ignores a damaged draft left on disk", async () => {
    disk.set("friends.draft.account-1:friend-1", "{not json");

    vi.resetModules();
    const restarted = await import("./chatDrafts");

    expect(restarted.readChatDraft("account-1", "friend-1")).toEqual({
      text: "",
      unsent: [],
      seen: [],
    });
  });

  it("lists the chats that still hold something unsent, after a restart too", async () => {
    writeChatDraft("account-1", "friend-1", {
      text: "",
      unsent: [entry("local-1", "failed")],
      seen: [],
    });
    writeChatDraft("account-1", "friend-2", {
      text: "only typed",
      unsent: [],
      seen: [],
    });
    writeChatDraft("account-2", "friend-3", {
      text: "",
      unsent: [entry("local-2", "failed")],
      seen: [],
    });

    expect(chatDraftFriendIds("account-1").sort()).toEqual([
      "friend-1",
      "friend-2",
    ]);
    expect(chatDraftFriendIds("account-2")).toEqual(["friend-3"]);
    expect(chatDraftFriendIds(undefined)).toEqual([]);

    vi.resetModules();
    const restarted = await import("./chatDrafts");

    expect(restarted.chatDraftFriendIds("account-1").sort()).toEqual([
      "friend-1",
      "friend-2",
    ]);
  });

  it("keeps group drafts out of the direct-chat resend queue", async () => {
    writeChatDraft("account-1", groupDraftKey("group-1"), {
      text: "napishu pozzhe",
      unsent: [entry("local-3", "failed")],
      seen: [],
    });
    writeChatDraft("account-1", "friend-1", {
      text: "",
      unsent: [entry("local-4", "failed")],
      seen: [],
    });

    expect(chatDraftFriendIds("account-1")).toEqual(["friend-1"]);
    expect(readChatDraft("account-1", groupDraftKey("group-1")).text).toBe(
      "napishu pozzhe",
    );

    vi.resetModules();
    const restarted = await import("./chatDrafts");

    expect(restarted.chatDraftFriendIds("account-1")).toEqual(["friend-1"]);
    expect(
      restarted.readChatDraft("account-1", restarted.groupDraftKey("group-1"))
        .unsent,
    ).toHaveLength(1);
  });
});
