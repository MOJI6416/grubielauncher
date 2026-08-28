export interface MotdSpan {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

const NAMED_COLORS: Record<string, string> = {
  black: "0",
  dark_blue: "1",
  dark_green: "2",
  dark_aqua: "3",
  dark_red: "4",
  dark_purple: "5",
  gold: "6",
  gray: "7",
  dark_gray: "8",
  blue: "9",
  green: "a",
  aqua: "b",
  red: "c",
  light_purple: "d",
  yellow: "e",
  white: "f",
};

const CODE_KEYS = "0123456789abcdef";

export function motdColorVariable(color: string | undefined): string | undefined {
  if (!color) return undefined;
  if (color.startsWith("#")) return color;
  return `var(--mc-${color})`;
}

type Style = Omit<MotdSpan, "text">;

function styleFromCode(code: string, current: Style): Style | null {
  const key = code.toLowerCase();

  if (key === "r") return {};
  if (CODE_KEYS.includes(key)) return { color: key };
  if (key === "l") return { ...current, bold: true };
  if (key === "o") return { ...current, italic: true };
  if (key === "n") return { ...current, underline: true };
  if (key === "m") return { ...current, strikethrough: true };
  if (key === "k") return current;

  return null;
}

function readBungeeHex(text: string, start: number): string | null {
  if (text.length < start + 14) return null;

  let hex = "#";

  for (let pair = 0; pair < 6; pair++) {
    const offset = start + 2 + pair * 2;
    if (text[offset] !== "§") return null;
    const digit = text[offset + 1];
    if (!/[0-9a-f]/i.test(digit)) return null;
    hex += digit;
  }

  return hex;
}

function pushLegacyText(text: string, style: Style, out: MotdSpan[]): Style {
  let current = style;
  let buffer = "";

  const flush = () => {
    if (!buffer) return;
    out.push({ ...current, text: buffer });
    buffer = "";
  };

  for (let index = 0; index < text.length; index++) {
    const char = text[index];

    if (char === "§" && index + 1 < text.length) {
      if (text[index + 1].toLowerCase() === "x") {
        const hex = readBungeeHex(text, index);
        if (hex) {
          flush();
          current = { color: hex };
          index += 13;
          continue;
        }
      }

      const next = styleFromCode(text[index + 1], current);
      if (next) {
        flush();
        current = next;
        index += 1;
        continue;
      }
    }

    buffer += char;
  }

  flush();

  return current;
}

function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.startsWith("#")) return /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
  return NAMED_COLORS[value];
}

function walk(node: unknown, inherited: Style, out: MotdSpan[]): void {
  if (node === null || node === undefined) return;

  if (typeof node === "string") {
    pushLegacyText(node, inherited, out);
    return;
  }

  if (typeof node === "number" || typeof node === "boolean") {
    out.push({ ...inherited, text: String(node) });
    return;
  }

  if (Array.isArray(node)) {
    let style = inherited;
    for (const child of node) {
      walk(child, style, out);
      style = inherited;
    }
    return;
  }

  if (typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  const style: Style = {
    color: normalizeColor(record.color) ?? inherited.color,
    bold: record.bold === true ? true : record.bold === false ? false : inherited.bold,
    italic:
      record.italic === true ? true : record.italic === false ? false : inherited.italic,
    underline:
      record.underlined === true
        ? true
        : record.underlined === false
          ? false
          : inherited.underline,
    strikethrough:
      record.strikethrough === true
        ? true
        : record.strikethrough === false
          ? false
          : inherited.strikethrough,
  };

  if (typeof record.text === "string" && record.text) {
    pushLegacyText(record.text, style, out);
  }

  if (Array.isArray(record.extra)) {
    for (const child of record.extra) walk(child, style, out);
  }
}

function mergeSpans(spans: MotdSpan[]): MotdSpan[] {
  const merged: MotdSpan[] = [];

  for (const span of spans) {
    if (!span.text) continue;

    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.color === span.color &&
      previous.bold === span.bold &&
      previous.italic === span.italic &&
      previous.underline === span.underline &&
      previous.strikethrough === span.strikethrough
    ) {
      previous.text += span.text;
      continue;
    }

    merged.push({ ...span });
  }

  return merged;
}

export function parseMotd(raw: string | undefined): MotdSpan[] {
  if (!raw) return [];

  let source: unknown = raw;

  try {
    source = JSON.parse(raw);
  } catch {
    source = raw;
  }

  const out: MotdSpan[] = [];
  walk(source, {}, out);

  return mergeSpans(out);
}

export function motdToPlainText(spans: MotdSpan[]): string {
  return spans.map((span) => span.text).join("");
}

export function stripMotd(raw: string | undefined): string {
  if (!raw) return "";
  return motdToPlainText(parseMotd(raw)).replace(/\s+/g, " ").trim();
}

export function motdLines(spans: MotdSpan[]): MotdSpan[][] {
  const lines: MotdSpan[][] = [[]];

  for (const span of spans) {
    const parts = span.text.split("\n");

    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...span, text: part });
    });
  }

  return lines.filter((line, index) => index === 0 || line.length > 0);
}
