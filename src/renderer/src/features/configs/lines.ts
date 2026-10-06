import type { Token, TokenKind } from "./highlight";

export type HighlightTone = "match" | "active";

export interface Highlight {
  from: number;
  to: number;
  tone: HighlightTone;
}

export interface Segment {
  text: string;
  kind: TokenKind;
  tone?: HighlightTone;
  caret?: true;
}

export function buildLines(
  tokens: Token[],
  highlights: Highlight[],
  caret: number | null,
): Segment[][] {
  const sorted = [...highlights].sort((a, b) => a.from - b.from);
  const lines: Segment[][] = [[]];
  let offset = 0;
  let pointer = 0;
  let caretPlaced = caret === null;

  const placeCaret = (at: number) => {
    if (!caretPlaced && caret === at) {
      lines[lines.length - 1].push({ text: "", kind: "text", caret: true });
      caretPlaced = true;
    }
  };

  const toneAt = (position: number): HighlightTone | undefined => {
    while (pointer < sorted.length && sorted[pointer].to <= position) pointer++;
    const current = sorted[pointer];
    return current && current.from <= position ? current.tone : undefined;
  };

  const nextBoundary = (position: number, end: number): number => {
    let boundary = end;
    const current = sorted[pointer];
    if (current) {
      if (current.from > position) boundary = Math.min(boundary, current.from);
      else if (current.to > position) boundary = Math.min(boundary, current.to);
    }
    if (!caretPlaced && caret !== null && caret > position) {
      boundary = Math.min(boundary, caret);
    }
    return boundary;
  };

  for (const token of tokens) {
    let position = offset;
    const end = offset + token.text.length;

    while (position < end) {
      placeCaret(position);

      if (token.text.charCodeAt(position - offset) === 10) {
        lines.push([]);
        position++;
        continue;
      }

      const newline = token.text.indexOf("\n", position - offset);
      const lineEnd = newline === -1 ? end : offset + newline;
      const tone = toneAt(position);
      const stop = Math.max(position + 1, nextBoundary(position, lineEnd));

      lines[lines.length - 1].push({
        text: token.text.slice(position - offset, stop - offset),
        kind: token.kind,
        ...(tone ? { tone } : {}),
      });
      position = stop;
    }

    offset = end;
  }

  placeCaret(offset);
  return lines;
}

export function lineStartOffsets(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

export function lineOfOffset(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;

  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (starts[middle] <= offset) low = middle;
    else high = middle - 1;
  }

  return low;
}

export function lineRange(
  text: string,
  starts: number[],
  line: number,
): { from: number; to: number } {
  const from = starts[Math.max(0, Math.min(line, starts.length - 1))] ?? 0;
  const next = text.indexOf("\n", from);
  return { from, to: next === -1 ? text.length : next };
}
