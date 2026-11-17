import { createHash } from "crypto";

export type LangEntries = Record<string, string>;

export function canonicalEntries(entries: LangEntries): string {
  const sorted: LangEntries = {};
  for (const key of Object.keys(entries).sort()) sorted[key] = entries[key];
  return JSON.stringify(sorted);
}

export function unitHash(entries: LangEntries): string {
  return createHash("sha256")
    .update(`v1\n${canonicalEntries(entries)}`)
    .digest("hex");
}

const PLACEHOLDER =
  /%(?:\d+\$)?[-#+0,(]*\d*(?:\.\d+)?[a-zA-Z%]|\{[\w.$-]*\}|§[0-9a-fk-orA-FK-OR]|\\n|\n|<\/?[a-zA-Z][\w:-]*\s*\/?>|\$\([^)]*\)|\$\{[^}]*\}/g;

export function needsTranslation(value: string): boolean {
  if (typeof value !== "string") return false;
  const stripped = value.replace(PLACEHOLDER, " ").trim();
  if (!stripped) return false;
  if (/^https?:\/\//i.test(stripped)) return false;
  if (/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(stripped)) return false;
  return /[A-Za-z]{2,}/.test(stripped);
}
