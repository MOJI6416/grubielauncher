import path from "path";
import fs from "fs-extra";

export async function readDefaultOptions(gameDir: string): Promise<string | null> {
  const text = await fs
    .readFile(path.join(gameDir, "config", "defaultoptions", "options.txt"), "utf8")
    .catch(() => null);
  if (text === null) return null;
  return text
    .split(/(?<=\n)/)
    .filter((line) => !line.startsWith("key_"))
    .join("");
}

export function withOption(text: string, key: string, value: string): string {
  const line = new RegExp(`^${key}:.*$`, "m");
  if (line.test(text)) return text.replace(line, () => `${key}:${value}`);
  if (!text) return `${key}:${value}`;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return text.endsWith("\n") ? `${text}${key}:${value}${eol}` : `${text}${eol}${key}:${value}`;
}
