import type { Token } from "./highlight";

const MARKER =
  /^(\s*(?:\/\*+|\/\/+|#+|!|;|\*(?!\/))?\s*)(.*?)(\s*(?:\*\/)?\s*)$/;
const LATIN = /[A-Za-z]{2,}/;
const IDENTIFIER_ONLY = /^[\w.:\-/@#*[\]]+$/;

export const LANGUAGE_NAMES: Record<string, string> = {
  ru: "Russian",
  uk: "Ukrainian",
  en: "English",
};

export const TRANSLATION_BATCH_CHARS = 6000;
export const TRANSLATION_BATCH_ITEMS = 80;
export const TRANSLATION_MAX_BODIES = 600;

export interface CommentParts {
  prefix: string;
  body: string;
  suffix: string;
}

export function splitComment(line: string): CommentParts {
  const match = MARKER.exec(line);
  if (!match) return { prefix: "", body: line, suffix: "" };
  return { prefix: match[1], body: match[2], suffix: match[3] };
}

export function isTranslatable(body: string): boolean {
  const trimmed = body.trim();
  return LATIN.test(trimmed) && !IDENTIFIER_ONLY.test(trimmed);
}

export function commentBodies(tokens: Token[]): string[] {
  const seen = new Set<string>();
  const bodies: string[] = [];

  for (const token of tokens) {
    if (token.kind !== "comment") continue;

    for (const line of token.text.split("\n")) {
      const body = splitComment(line).body.trim();
      if (!isTranslatable(body) || seen.has(body)) continue;
      seen.add(body);
      bodies.push(body);
    }
  }

  return bodies;
}

export function translateCommentLine(
  line: string,
  translations: ReadonlyMap<string, string>,
): string {
  const parts = splitComment(line);
  const translated = translations.get(parts.body.trim());
  return translated === undefined
    ? line
    : `${parts.prefix}${translated}${parts.suffix}`;
}

export function translateCommentTokens(
  tokens: Token[],
  translations: ReadonlyMap<string, string>,
): Token[] {
  return tokens.map((token) =>
    token.kind === "comment"
      ? {
          ...token,
          text: token.text
            .split("\n")
            .map((line) => translateCommentLine(line, translations))
            .join("\n"),
        }
      : token,
  );
}

export function batchBodies(
  bodies: string[],
  maxChars = TRANSLATION_BATCH_CHARS,
  maxItems = TRANSLATION_BATCH_ITEMS,
): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let size = 2;

  for (const body of bodies) {
    const cost = JSON.stringify(body).length + 1;
    if (
      current.length &&
      (size + cost > maxChars || current.length >= maxItems)
    ) {
      batches.push(current);
      current = [];
      size = 2;
    }
    current.push(body);
    size += cost;
  }

  if (current.length) batches.push(current);
  return batches;
}

export function translationPrompt(bodies: string[], language: string): string {
  const name = LANGUAGE_NAMES[language] ?? language;

  return [
    `You translate comments from a Minecraft mod configuration file into ${name}.`,
    "Rules:",
    "- Translate only the human-readable text.",
    '- Keep option names, identifiers like minecraft:stone, numbers, units, ranges like "1 ~ 64", file paths and code exactly as they are.',
    "- Keep every translation on a single line.",
    `- Answer with a JSON array of exactly ${bodies.length} strings in the same order and nothing else.`,
    "",
    JSON.stringify(bodies),
  ].join("\n");
}

export function parseTranslationReply(
  reply: string | null | undefined,
  expected: number,
): string[] | null {
  if (!reply) return null;

  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start === -1 || end <= start) return null;

  try {
    const parsed: unknown = JSON.parse(reply.slice(start, end + 1));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== expected ||
      !parsed.every((item) => typeof item === "string")
    ) {
      return null;
    }
    return parsed.map((item: string) => item.replace(/\s*\n\s*/g, " ").trim());
  } catch {
    return null;
  }
}
