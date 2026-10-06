export const EMOJI_FONT_FAMILY =
  '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

const JUMBO_LIMIT = 3;
const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const EMOJI_PART =
  /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|‍|️|⃣|[#*0-9]|[\u{e0020}-\u{e007f}])+$/u;

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

export function jumboEmojiCount(text: string): number {
  const compact = text.replace(/\s+/g, "");
  if (!compact || compact.length > 64 || !segmenter) return 0;

  let count = 0;
  for (const { segment } of segmenter.segment(compact)) {
    if (!PICTOGRAPHIC.test(segment) || !EMOJI_PART.test(segment)) return 0;
    count += 1;
    if (count > JUMBO_LIMIT) return 0;
  }
  return count;
}

export interface EmojiGroup {
  id: "smileys" | "gestures" | "hearts" | "activities" | "nature";
  emoji: string[];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    id: "smileys",
    emoji: [
      "😀", "😁", "😂", "🤣", "😊", "😇", "🙂", "😉", "😍", "🥰", "😘", "😋",
      "😜", "🤪", "😎", "🤩", "🥳", "😏", "🤔", "🤨", "😐", "🙄", "😬", "😴",
      "🥱", "😮", "😱", "😳", "🥺", "😢", "😭", "😤", "😡", "🤬", "🤯", "🥶",
      "🥵", "🤢", "🤮", "🤡", "💀", "👻", "👽", "🤖", "💩", "🙈", "🙉", "🙊",
    ],
  },
  {
    id: "gestures",
    emoji: [
      "👍", "👎", "👏", "🙏", "👋", "🤝", "💪", "🙌", "🫡", "👌", "✌️", "🤞",
      "🤙", "👊", "✊", "🤘", "👀", "🫶", "🤷", "🤦", "🙋", "🙆", "🙅", "💁",
    ],
  },
  {
    id: "hearts",
    emoji: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "💕", "💖", "✨",
      "🔥", "💯", "💥", "⚡", "⭐", "🌟", "✅", "❌", "❓", "❗", "💤", "🎵",
    ],
  },
  {
    id: "activities",
    emoji: [
      "🎮", "🕹️", "🏆", "🥇", "🎉", "🎁", "🎯", "🎲", "⚔️", "🛡️", "🏹", "⛏️",
      "🪓", "🧱", "💎", "🪙", "💰", "🗺️", "🧭", "🏰", "🏠", "⛺", "🚀", "🛠️",
    ],
  },
  {
    id: "nature",
    emoji: [
      "🌈", "☀️", "🌙", "⛈️", "❄️", "🌊", "🌲", "🌵", "🍄", "🌸", "🐱", "🐶",
      "🐷", "🐔", "🐮", "🐑", "🐺", "🐝", "🕷️", "🐉", "🍿", "🍕", "🍪", "☕",
    ],
  },
];

export function insertAtCursor(
  value: string,
  insert: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  maxLength: number,
): { value: string; caret: number } | null {
  const start = selectionStart ?? value.length;
  const end = selectionEnd ?? start;
  const next = value.slice(0, start) + insert + value.slice(end);
  if (next.length > maxLength) return null;
  return { value: next, caret: start + insert.length };
}
