import { describe, expect, it } from "vitest";
import {
  answerUser,
  cancelAllWaiters,
  stopAllWaiters,
  STOP_ANSWER,
  waitForUser,
} from "./pending";

describe("agent waiters", () => {
  it("resolves with the answer the user picked", async () => {
    const pending = waitForUser("permission-1");
    answerUser("permission-1", "once");

    await expect(pending).resolves.toBe("once");
  });

  it("tells a stop apart from a decline", async () => {
    const declined = waitForUser("permission-2");
    cancelAllWaiters();
    await expect(declined).resolves.toBeNull();

    const stopped = waitForUser("permission-3");
    stopAllWaiters();
    await expect(stopped).resolves.toBe(STOP_ANSWER);
  });

  it("ignores an answer for a waiter that is already gone", () => {
    expect(() => answerUser("permission-4", "once")).not.toThrow();
  });
});
