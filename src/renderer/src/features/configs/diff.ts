export type DiffKind = "equal" | "insert" | "delete";

export interface DiffLine {
  kind: DiffKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface DiffStats {
  added: number;
  removed: number;
}

export type DiffBlock =
  | { kind: "lines"; lines: DiffLine[] }
  | { kind: "skip"; count: number };

const MAX_EDIT_DISTANCE = 4000;
const MAX_TRACE_CELLS = 8_000_000;

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.replace(/\r\n/g, "\n").split("\n");
}

function myers(a: string[], b: string[]): DiffKind[] | null {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  const limit = Math.min(
    max,
    MAX_EDIT_DISTANCE,
    Math.floor(MAX_TRACE_CELLS / v.length),
  );

  for (let d = 0; d <= limit; d++) {
    trace.push(v.slice());

    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
          ? v[offset + k + 1]
          : v[offset + k - 1] + 1;
      let y = x - k;

      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }

      v[offset + k] = x;

      if (x >= n && y >= m) return backtrack(trace, a.length, b.length, d);
    }
  }

  return null;
}

function backtrack(
  trace: Int32Array[],
  n: number,
  m: number,
  depth: number,
): DiffKind[] {
  const offset = n + m;
  const ops: DiffKind[] = [];
  let x = n;
  let y = m;

  for (let d = depth; d > 0; d--) {
    const v = trace[d];
    const k = x - y;
    const previousK =
      k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
        ? k + 1
        : k - 1;
    const previousX = v[offset + previousK];
    const previousY = previousX - previousK;

    while (x > previousX && y > previousY) {
      ops.push("equal");
      x--;
      y--;
    }

    if (x === previousX) {
      ops.push("insert");
      y--;
    } else {
      ops.push("delete");
      x--;
    }
  }

  while (x > 0 && y > 0) {
    ops.push("equal");
    x--;
    y--;
  }

  return ops.reverse();
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const middleA = a.slice(prefix, a.length - suffix);
  const middleB = b.slice(prefix, b.length - suffix);
  const ops = myers(middleA, middleB) ?? [
    ...middleA.map((): DiffKind => "delete"),
    ...middleB.map((): DiffKind => "insert"),
  ];

  const result: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  for (let index = 0; index < prefix; index++) {
    result.push({
      kind: "equal",
      text: a[index],
      oldLine: index + 1,
      newLine: index + 1,
    });
  }

  for (const op of ops) {
    if (op === "equal") {
      result.push({
        kind: "equal",
        text: middleA[oldIndex],
        oldLine: prefix + oldIndex + 1,
        newLine: prefix + newIndex + 1,
      });
      oldIndex++;
      newIndex++;
    } else if (op === "delete") {
      result.push({
        kind: "delete",
        text: middleA[oldIndex],
        oldLine: prefix + oldIndex + 1,
        newLine: null,
      });
      oldIndex++;
    } else {
      result.push({
        kind: "insert",
        text: middleB[newIndex],
        oldLine: null,
        newLine: prefix + newIndex + 1,
      });
      newIndex++;
    }
  }

  for (let index = 0; index < suffix; index++) {
    const oldLine = a.length - suffix + index;
    const newLine = b.length - suffix + index;
    result.push({
      kind: "equal",
      text: a[oldLine],
      oldLine: oldLine + 1,
      newLine: newLine + 1,
    });
  }

  return result;
}

export function diffStats(lines: DiffLine[]): DiffStats {
  let added = 0;
  let removed = 0;

  for (const line of lines) {
    if (line.kind === "insert") added++;
    else if (line.kind === "delete") removed++;
  }

  return { added, removed };
}

export function diffBlocks(lines: DiffLine[], context = 3): DiffBlock[] {
  const keep = new Array<boolean>(lines.length).fill(false);

  lines.forEach((line, index) => {
    if (line.kind === "equal") return;
    const start = Math.max(0, index - context);
    const end = Math.min(lines.length - 1, index + context);
    for (let cursor = start; cursor <= end; cursor++) keep[cursor] = true;
  });

  const blocks: DiffBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    if (keep[index]) {
      const chunk: DiffLine[] = [];
      while (index < lines.length && keep[index]) chunk.push(lines[index++]);
      blocks.push({ kind: "lines", lines: chunk });
    } else {
      let count = 0;
      while (index < lines.length && !keep[index]) {
        count++;
        index++;
      }
      blocks.push({ kind: "skip", count });
    }
  }

  return blocks;
}
