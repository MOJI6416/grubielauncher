import path from "path";

const CONSOLE_LINES = 300;

const consoles = new Map<string, string[]>();

export function resetServerConsole(serverPath: string): string[] {
  const key = path.resolve(serverPath);
  const lines: string[] = [];
  consoles.delete(key);
  consoles.set(key, lines);
  return lines;
}

export function appendServerConsole(lines: string[], line: string): void {
  const trimmed = line.trimEnd();
  if (!trimmed.trim()) return;

  lines.push(trimmed);
  if (lines.length > CONSOLE_LINES) lines.splice(0, lines.length - CONSOLE_LINES);
}

export function readServerConsole(serverPath: string): string[] {
  return [...(consoles.get(path.resolve(serverPath)) ?? [])];
}

export function recentServerPaths(): string[] {
  return [...consoles.keys()].reverse();
}
