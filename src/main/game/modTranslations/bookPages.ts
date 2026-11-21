export const PAGE_WIDTH = 114;
export const PAGE_LINES = 14;
const SETTLED_LINES = 8;
const UNKNOWN_ARG = "0000000000";

const WIDTHS: Record<string, number> = {
  " ": 4,
  "!": 2,
  "'": 2,
  ",": 2,
  ".": 2,
  ":": 2,
  ";": 2,
  "|": 2,
  i: 2,
  l: 3,
  "`": 3,
  I: 4,
  t: 4,
  "[": 4,
  "]": 4,
  "(": 4,
  ")": 4,
  "{": 4,
  "}": 4,
  "*": 4,
  '"': 4,
  f: 5,
  k: 5,
  "<": 5,
  ">": 5,
  "@": 7,
  "~": 7,
  "—": 9,
};
const WIDE = new Set([..."ЖЩЮЫШФжщюышф▶"]);

interface Glyph {
  char: string;
  from: number;
}

function charWidth(char: string): number {
  return WIDTHS[char] ?? (WIDE.has(char) ? 7 : 6);
}

function glyphs(format: string, arg: (index: number) => string | undefined): Glyph[] {
  const out: Glyph[] = [];
  let last = 0;
  let sequential = 0;
  for (const match of format.matchAll(/%(?:(\d+)\$)?([sd%])/g)) {
    const at = match.index ?? 0;
    for (let index = last; index < at; index++) out.push({ char: format[index], from: index });
    const text =
      match[2] === "%" ? "%" : (arg(match[1] ? Number(match[1]) : ++sequential) ?? UNKNOWN_ARG);
    for (const char of text) out.push({ char, from: at });
    last = at + match[0].length;
  }
  for (let index = last; index < format.length; index++) out.push({ char: format[index], from: index });
  return out;
}

function isRaw(format: string, glyph: Glyph): boolean {
  return format[glyph.from] === glyph.char;
}

function breakAt(format: string, list: Glyph[], start: number): number | null {
  let line = 1;
  let x = 0;
  let index = start;
  let paragraph = -1;
  let sentence = -1;
  const overflow = (at: number): number => {
    if (paragraph > start) return paragraph;
    if (sentence > start) return sentence;
    return at;
  };
  while (index < list.length) {
    const char = list[index].char;
    if (char === "\n") {
      const raw = isRaw(format, list[index]);
      line++;
      x = 0;
      index++;
      if (line > PAGE_LINES) return raw ? index : overflow(index);
      if (line > SETTLED_LINES && raw) paragraph = index;
      continue;
    }
    if (char === " ") {
      x += charWidth(char);
      index++;
      if (x > PAGE_WIDTH) {
        line++;
        x = 0;
        if (line > PAGE_LINES) return overflow(index);
      }
      continue;
    }
    let end = index;
    let width = 0;
    while (end < list.length && list[end].char !== " " && list[end].char !== "\n") {
      if (list[end].char === "§") end++;
      else width += charWidth(list[end].char);
      end++;
    }
    if (x > 0 && x + width > PAGE_WIDTH) {
      line++;
      x = 0;
      if (line > PAGE_LINES) return overflow(index);
    }
    if (width > PAGE_WIDTH) {
      line += Math.ceil(width / PAGE_WIDTH) - 1;
      x = width - (Math.ceil(width / PAGE_WIDTH) - 1) * PAGE_WIDTH;
      if (line > PAGE_LINES) return overflow(index);
    } else {
      x += width;
    }
    const lastChar = list[end - 1]?.char;
    if (
      line >= SETTLED_LINES &&
      end < list.length &&
      isRaw(format, list[end]) &&
      /[.!?:]/.test(lastChar ?? "")
    ) {
      sentence = end;
    }
    index = end;
  }
  return null;
}

export function splitBookPage(
  format: string,
  arg: (index: number) => string | undefined,
): string[] {
  const list = glyphs(format, arg);
  const chunks: string[] = [];
  let start = 0;
  while (start < list.length) {
    let end = breakAt(format, list, start);
    while (end !== null && end > start && end < list.length && list[end - 1].from === list[end].from) {
      end--;
    }
    if (end === null || end <= start || end >= list.length) {
      chunks.push(format.slice(list[start].from));
      break;
    }
    const chunk = format.slice(list[start].from, list[end].from).replace(/\s+$/, "");
    if (chunk) chunks.push(chunk);
    start = end;
    while (start < list.length && /\s/.test(list[start].char) && isRaw(format, list[start])) start++;
  }
  return chunks.length > 1 ? chunks : [format];
}
