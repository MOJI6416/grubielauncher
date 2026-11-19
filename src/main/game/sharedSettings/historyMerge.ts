export const HISTORY_LIMIT = 50;

export function parseHistory(text: string | null): string[] {
  if (!text) return [];
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
}

export function serializeHistory(lines: string[]): string {
  return lines.length ? `${lines.join("\n")}\n` : "";
}

function squash(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    if (result[result.length - 1] !== line) result.push(line);
  }
  return result.slice(-HISTORY_LIMIT);
}

export function addedLines(before: string[], after: string[]): string[] {
  for (let start = 0; start <= before.length; start += 1) {
    const tail = before.slice(start);
    if (tail.length > after.length) continue;
    if (tail.every((line, index) => after[index] === line)) {
      return after.slice(tail.length);
    }
  }
  return after;
}

export function captureHistory(
  current: string[],
  baseline: string[] | null,
  profile: string[],
  mode: "session" | "adopt" | "first",
): string[] {
  if (mode === "first") return profile;
  if (mode === "adopt" || !baseline) {
    const known = new Set(profile);
    return squash([...current.filter((line) => !known.has(line)), ...profile]);
  }
  const added = addedLines(baseline, current);
  return added.length ? squash([...profile, ...added]) : profile;
}
