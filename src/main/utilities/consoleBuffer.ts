const MAX_LINES = 400;
const MAX_LINE_CHARS = 2000;
const MAX_INSTANCES = 6;

const buffers = new Map<string, string[]>();

function bufferKey(versionName: string, instance: number) {
  return `${versionName}#${instance}`;
}

export function recordConsoleOutput(
  versionName: string,
  instance: number,
  message: string,
) {
  if (!message) return;

  const key = bufferKey(versionName, instance);
  const lines = buffers.get(key) ?? [];

  for (const line of message.split(/\r?\n/)) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;

    lines.push(
      trimmed.length > MAX_LINE_CHARS
        ? trimmed.slice(0, MAX_LINE_CHARS)
        : trimmed,
    );
  }

  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);

  buffers.delete(key);
  buffers.set(key, lines);

  while (buffers.size > MAX_INSTANCES) {
    const oldest = buffers.keys().next().value;
    if (!oldest) break;
    buffers.delete(oldest);
  }
}

export function getConsoleOutput(versionName: string, instance: number) {
  return buffers.get(bufferKey(versionName, instance))?.join("\n") ?? "";
}

export function clearConsoleOutput(versionName: string, instance: number) {
  buffers.delete(bufferKey(versionName, instance));
}
