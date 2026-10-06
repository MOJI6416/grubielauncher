export const MIN_CONTENT_QUERY = 2;
const PREVIEW_BEFORE = 14;
const PREVIEW_AFTER = 80;

export interface TextRange {
  from: number;
  to: number;
}

export interface LineMatch {
  line: number;
  column: number;
  length: number;
  preview: string;
  previewColumn: number;
}

export interface FileMatches {
  relative: string;
  matches: LineMatch[];
  total: number;
}

export function findRanges(
  text: string,
  query: string,
  limit = 5000,
): TextRange[] {
  const needle = query.toLowerCase();
  if (!needle) return [];

  const haystack = text.toLowerCase();
  if (haystack.length !== text.length) return [];

  const ranges: TextRange[] = [];
  let index = haystack.indexOf(needle);

  while (index !== -1 && ranges.length < limit) {
    ranges.push({ from: index, to: index + needle.length });
    index = haystack.indexOf(needle, index + needle.length);
  }

  return ranges;
}

function previewOf(line: string, column: number, length: number) {
  const leading = line.length - line.trimStart().length;
  const start = Math.max(leading, column - PREVIEW_BEFORE);
  const end = Math.min(line.length, column + length + PREVIEW_AFTER);
  const head = start > leading ? "…" : "";
  const tail = end < line.length ? "…" : "";

  return {
    preview: `${head}${line.slice(start, end).trimEnd()}${tail}`,
    previewColumn: column - start + head.length,
  };
}

export function findLineMatches(
  text: string,
  query: string,
  limit = 20,
): { matches: LineMatch[]; total: number } {
  const ranges = findRanges(text, query);
  const matches: LineMatch[] = [];
  let line = 0;
  let lineStart = 0;
  let cursor = 0;

  for (const range of ranges) {
    while (cursor < range.from) {
      if (text.charCodeAt(cursor) === 10) {
        line++;
        lineStart = cursor + 1;
      }
      cursor++;
    }

    if (matches.length >= limit) continue;
    if (matches.length && matches[matches.length - 1].line === line) continue;

    const lineEnd = text.indexOf("\n", lineStart);
    const lineText = text
      .slice(lineStart, lineEnd === -1 ? text.length : lineEnd)
      .replace(/\r$/, "");
    const column = range.from - lineStart;

    matches.push({
      line,
      column,
      length: range.to - range.from,
      ...previewOf(lineText, column, range.to - range.from),
    });
  }

  return { matches, total: ranges.length };
}

export function searchFiles(
  files: Iterable<{ relative: string; text: string }>,
  query: string,
  perFile = 20,
): FileMatches[] {
  const trimmed = query.trim();
  if (trimmed.length < MIN_CONTENT_QUERY) return [];

  const results: FileMatches[] = [];

  for (const file of files) {
    const { matches, total } = findLineMatches(file.text, trimmed, perFile);
    if (total > 0) results.push({ relative: file.relative, matches, total });
  }

  return results;
}
