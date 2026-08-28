import { beforeEach, describe, expect, it } from "vitest";
import {
  OUTGOING_TTL_MS,
  clearOutgoing,
  outgoingRecipient,
  rememberOutgoing,
} from "./outgoingSends";

const text = (value: string) => ({ _type: "text" as const, value });

describe("outgoingSends", () => {
  beforeEach(() => clearOutgoing());

  it("returns null for a body nobody sent", () => {
    expect(outgoingRecipient(text("привет"))).toBeNull();
  });

  it("remembers who the message was addressed to", () => {
    rememberOutgoing("friend-a", text("привет"));
    expect(outgoingRecipient(text("привет"))).toBe("friend-a");
  });

  it("keeps recipients apart by body", () => {
    rememberOutgoing("friend-a", text("первое"));
    rememberOutgoing("friend-b", text("второе"));

    expect(outgoingRecipient(text("первое"))).toBe("friend-a");
    expect(outgoingRecipient(text("второе"))).toBe("friend-b");
  });

  it("separates identical bodies of different types", () => {
    rememberOutgoing("friend-a", { _type: "image", value: "same" });
    expect(outgoingRecipient(text("same"))).toBeNull();
  });

  it("hands identical bodies out in the order they were sent", () => {
    rememberOutgoing("friend-a", text("го"), 1000);
    rememberOutgoing("friend-b", text("го"), 2000);

    expect(outgoingRecipient(text("го"), "srv-1", 2100)).toBe("friend-a");
    expect(outgoingRecipient(text("го"), "srv-2", 2200)).toBe("friend-b");
  });

  it("keeps answering the same for one message id", () => {
    rememberOutgoing("friend-a", text("го"), 1000);
    rememberOutgoing("friend-b", text("го"), 2000);

    expect(outgoingRecipient(text("го"), "srv-1", 2100)).toBe("friend-a");
    expect(outgoingRecipient(text("го"), "srv-1", 2150)).toBe("friend-a");
    expect(outgoingRecipient(text("го"), "srv-2", 2200)).toBe("friend-b");
  });

  it("does not consume a send when the echo carries no id", () => {
    rememberOutgoing("friend-a", text("го"), 1000);

    expect(outgoingRecipient(text("го"), undefined, 1100)).toBe("friend-a");
    expect(outgoingRecipient(text("го"), "srv-1", 1200)).toBe("friend-a");
  });

  it("forgets sends older than the window", () => {
    rememberOutgoing("friend-a", text("го"), 1000);
    expect(
      outgoingRecipient(text("го"), "srv-1", 1000 + OUTGOING_TTL_MS),
    ).toBeNull();
  });

  it("forgets a resolved message once the window passes", () => {
    rememberOutgoing("friend-a", text("го"), 1000);
    expect(outgoingRecipient(text("го"), "srv-1", 1100)).toBe("friend-a");
    expect(
      outgoingRecipient(text("го"), "srv-1", 1000 + OUTGOING_TTL_MS),
    ).toBeNull();
  });

  it("drops everything on account switch", () => {
    rememberOutgoing("friend-a", text("привет"));
    clearOutgoing();
    expect(outgoingRecipient(text("привет"))).toBeNull();
  });
});
