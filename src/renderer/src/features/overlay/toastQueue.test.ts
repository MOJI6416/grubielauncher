import { describe, expect, it } from "vitest";
import {
  MAX_TOASTS,
  type QueuedToast,
  isFullscreenOptions,
  latestActionable,
  nextExpiry,
  pruneToasts,
  upsertToast,
} from "./toastQueue";

const body = (count: number) => `${count}`;

function message(id: string) {
  return { id, kind: "message" as const, title: id, body, face: null };
}

describe("overlay toasts", () => {
  it("folds new messages from one chat into one toast with a counter", () => {
    let list: QueuedToast[] = [];
    list = upsertToast(list, message("message:a"), 1000);
    list = upsertToast(list, message("message:a"), 2000);

    expect(list).toHaveLength(1);
    expect(list[0].count).toBe(2);
    expect(list[0].expiresAt).toBe(10_000);
  });

  it("keeps the newest few on screen", () => {
    let list: QueuedToast[] = [];
    for (let index = 0; index < MAX_TOASTS + 2; index += 1) {
      list = upsertToast(list, message(`message:${index}`), index);
    }
    expect(list.map((toast) => toast.id)).toEqual([
      "message:4",
      "message:3",
      "message:2",
    ]);
  });

  it("drops toasts once their time is up", () => {
    const list = upsertToast([], message("message:a"), 0);
    expect(pruneToasts(list, 7_999)).toBe(list);
    expect(pruneToasts(list, 8_000)).toEqual([]);
    expect(nextExpiry(list)).toBe(8_000);
    expect(nextExpiry([])).toBeNull();
  });

  it("lets the hotkey accept the latest invite, not a message", () => {
    const accept = () => undefined;
    let list: QueuedToast[] = [];
    list = upsertToast(
      list,
      { id: "invite:1", kind: "invite", title: "a", body, face: null, accept },
      100,
    );
    list = upsertToast(
      list,
      { id: "call:1", kind: "call", title: "b", body, face: null, accept },
      200,
    );
    list = upsertToast(list, message("message:c"), 300);

    expect(latestActionable(list)?.id).toBe("call:1");
    expect(latestActionable([list[0]])).toBeUndefined();
  });
});

describe("game window mode", () => {
  it("reads exclusive fullscreen from options.txt", () => {
    expect(isFullscreenOptions("version:3955\nfullscreen:true\nfov:0.0\n")).toBe(true);
    expect(isFullscreenOptions("fullscreen:false\r\n")).toBe(false);
    expect(isFullscreenOptions("fullscreenResolution:1920x1080@60:24\n")).toBe(false);
    expect(isFullscreenOptions("")).toBe(false);
  });

  it("tolerates Windows line endings", () => {
    expect(isFullscreenOptions("gamma:0.5\r\nfullscreen:true\r\n")).toBe(true);
  });
});
