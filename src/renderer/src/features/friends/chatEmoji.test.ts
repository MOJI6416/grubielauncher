import { describe, expect, it } from "vitest";
import { EMOJI_GROUPS, insertAtCursor, jumboEmojiCount } from "./chatEmoji";
import { MAX_PENDING_IMAGES, pickChatImages } from "./chatAttachments";

describe("jumboEmojiCount", () => {
  it("counts up to three emoji, including joined and flag sequences", () => {
    expect(jumboEmojiCount("😂")).toBe(1);
    expect(jumboEmojiCount(" 🔥 🔥 ")).toBe(2);
    expect(jumboEmojiCount("❤️👍🏽🇺🇦")).toBe(3);
    expect(jumboEmojiCount("👨‍👩‍👧")).toBe(1);
  });

  it("refuses text, digits alone and more than three emoji", () => {
    expect(jumboEmojiCount("")).toBe(0);
    expect(jumboEmojiCount("ok 👍")).toBe(0);
    expect(jumboEmojiCount("123")).toBe(0);
    expect(jumboEmojiCount("😀😀😀😀")).toBe(0);
    expect(jumboEmojiCount(":)")).toBe(0);
  });

  it("only offers emoji that render as a single jumbo glyph", () => {
    for (const group of EMOJI_GROUPS) {
      for (const emoji of group.emoji) expect(jumboEmojiCount(emoji)).toBe(1);
    }
  });
});

describe("insertAtCursor", () => {
  it("replaces the selection and moves the caret after the insert", () => {
    expect(insertAtCursor("hello world", "🔥", 6, 11, 100)).toEqual({
      value: "hello 🔥",
      caret: 8,
    });
  });

  it("appends when there is no caret", () => {
    expect(insertAtCursor("gg", "👍", null, null, 100)).toEqual({
      value: "gg👍",
      caret: 4,
    });
  });

  it("refuses to cross the length limit", () => {
    expect(insertAtCursor("abc", "😀", 3, 3, 4)).toBeNull();
  });
});

describe("pickChatImages", () => {
  const file = (name: string, type = "image/png", size = 1000) => ({
    name,
    type,
    size,
  });

  it("splits images from other files, oversized files and overflow", () => {
    const pick = pickChatImages(
      [
        file("a.png"),
        file("notes.txt", "text/plain"),
        file("b.gif", ""),
        file("huge.png", "image/png", 32 * 1024 * 1024),
      ],
      0,
    );
    expect(pick.accepted.map((item) => item.name)).toEqual(["a.png", "b.gif"]);
    expect(pick.notImage).toBe(1);
    expect(pick.tooLarge).toBe(1);
    expect(pick.overflow).toBe(0);
  });

  it("stops at the tray limit", () => {
    const files = Array.from({ length: 4 }, (_, index) => file(`${index}.png`));
    const pick = pickChatImages(files, MAX_PENDING_IMAGES - 2);
    expect(pick.accepted).toHaveLength(2);
    expect(pick.overflow).toBe(2);
  });
});
