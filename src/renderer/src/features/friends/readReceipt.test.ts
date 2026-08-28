import { describe, expect, it } from "vitest";
import type { IMessage } from "@/types/IMessage";
import { createPendingEntry, toChatEntries } from "./chatEntries";
import { lastReadOwnKey, mergeReadSeq } from "./readReceipt";

function message(seq: number, sender: string): IMessage {
  return {
    id: `m${seq}`,
    sender,
    seq,
    message: { _type: "text", value: `#${seq}` },
    time: new Date(2026, 7, 17, 10, 0, seq),
  };
}

const history = toChatEntries([
  message(1, "me"),
  message(2, "peer"),
  message(3, "me"),
  message(4, "me"),
]);

describe("mergeReadSeq", () => {
  it("only ever moves forward", () => {
    expect(mergeReadSeq(5, 7)).toBe(7);
    expect(mergeReadSeq(7, 5)).toBe(7);
  });

  it("ignores junk", () => {
    expect(mergeReadSeq(5, undefined)).toBe(5);
    expect(mergeReadSeq(5, "nope")).toBe(5);
  });
});

describe("lastReadOwnKey", () => {
  it("marks the newest own message the peer has read", () => {
    expect(lastReadOwnKey(history, "me", 3)).toBe("m3");
  });

  it("marks the last message when everything is read", () => {
    expect(lastReadOwnKey(history, "me", 9)).toBe("m4");
  });

  it("marks nothing when the peer has read nothing", () => {
    expect(lastReadOwnKey(history, "me", 0)).toBeUndefined();
  });

  it("never marks a message that is still being sent", () => {
    const pending = createPendingEntry("local-1", message(0, "me"));
    expect(lastReadOwnKey([...history, pending], "me", 9)).toBe("m4");
  });

  it("marks nothing without a signed in user", () => {
    expect(lastReadOwnKey(history, undefined, 9)).toBeUndefined();
  });
});
