export const PAIRS: Record<string, string> = {
  "{": "}",
  "[": "]",
  "(": ")",
  '"': '"',
  "'": "'",
  "`": "`",
};

const CLOSERS = new Set(Object.values(PAIRS));
const QUOTES = new Set(['"', "'", "`"]);
const WORD_BEFORE_QUOTE = /[A-Za-z0-9_$]/;

export interface EditPatch {
  from: number;
  to: number;
  insert: string;
  caret: number;
  selectTo?: number;
}

export function applyPatch(text: string, patch: EditPatch): string {
  return text.slice(0, patch.from) + patch.insert + text.slice(patch.to);
}

function indentOf(line: string): string {
  return /^[\t ]*/.exec(line)?.[0] ?? "";
}

function lineStart(text: string, position: number): number {
  return text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
}

export function autoPairPatch(
  text: string,
  start: number,
  end: number,
  key: string,
): EditPatch | null {
  const closing = PAIRS[key];

  if (closing) {
    if (start !== end) {
      return {
        from: start,
        to: end,
        insert: key + text.slice(start, end) + closing,
        caret: start + 1,
        selectTo: end + 1,
      };
    }

    if (QUOTES.has(key)) {
      const before = text[start - 1] ?? "";
      if (WORD_BEFORE_QUOTE.test(before) || before === key) return null;
      if (text[start] === key) {
        return { from: start, to: start, insert: "", caret: start + 1 };
      }
    }

    return {
      from: start,
      to: start,
      insert: key + closing,
      caret: start + 1,
    };
  }

  if (CLOSERS.has(key) && start === end && text[start] === key) {
    return { from: start, to: start, insert: "", caret: start + 1 };
  }

  return null;
}

export function pairBackspacePatch(
  text: string,
  start: number,
  end: number,
): EditPatch | null {
  if (start !== end || start === 0) return null;

  const opener = text[start - 1];
  if (!PAIRS[opener] || PAIRS[opener] !== text[start]) return null;

  return { from: start - 1, to: start + 1, insert: "", caret: start - 1 };
}

export function newlinePatch(
  text: string,
  start: number,
  end: number,
): EditPatch {
  const line = text.slice(lineStart(text, start), start);
  const indent = indentOf(line);
  const opener = line.trimEnd().slice(-1);
  const closer = PAIRS[opener];
  const nextChar = text[end] ?? "";

  if (closer && !QUOTES.has(opener)) {
    const inner = `${indent}  `;

    if (nextChar === closer) {
      return {
        from: start,
        to: end,
        insert: `\n${inner}\n${indent}`,
        caret: start + inner.length + 1,
      };
    }

    return {
      from: start,
      to: end,
      insert: `\n${inner}`,
      caret: start + inner.length + 1,
    };
  }

  return {
    from: start,
    to: end,
    insert: `\n${indent}`,
    caret: start + indent.length + 1,
  };
}
