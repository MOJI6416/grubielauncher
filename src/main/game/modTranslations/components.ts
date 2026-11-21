import { createHash } from "crypto";
import { LangEntries, needsTranslation } from "./unitHash";

export const COMPONENT_KEY_PREFIX = "grubie.text.";

type Json = unknown;
type JsonObject = Record<string, Json>;

const CONTENT_KEYS = ["text", "translate", "selector", "score", "keybind", "nbt", "type"];
const MAX_TEXT_CHARS = 4000;

function isObject(value: Json): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function componentKey(text: string): string {
  return `${COMPONENT_KEY_PREFIX}${createHash("sha1").update(text).digest("hex").slice(0, 16)}`;
}

function ours(value: Json): value is JsonObject & { translate: string; fallback: string } {
  return (
    isObject(value) &&
    typeof value.translate === "string" &&
    value.translate.startsWith(COMPONENT_KEY_PREFIX) &&
    typeof value.fallback === "string"
  );
}

function plainText(value: Json): string | null {
  if (typeof value === "string") return value;
  if (isObject(value) && typeof value.text === "string" && Object.keys(value).length === 1) {
    return value.text;
  }
  return null;
}

function normalize(value: Json): JsonObject | null {
  if (typeof value === "string") return { text: value };
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const [first, ...rest] = value;
    const head = normalize(first);
    if (!head) return null;
    return rest.length > 0
      ? { ...head, extra: [...(Array.isArray(head.extra) ? head.extra : []), ...rest] }
      : head;
  }
  return isObject(value) ? value : null;
}

function escapeFormat(text: string): string {
  return text.replace(/%/g, "%%");
}

function style(object: JsonObject): JsonObject {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(object)) {
    if (!CONTENT_KEYS.includes(key) && key !== "extra" && key !== "with" && key !== "fallback") {
      out[key] = value;
    }
  }
  return out;
}

function worthTranslating(text: string): boolean {
  return text.length <= MAX_TEXT_CHARS && needsTranslation(text.replace(/%\d+\$s/g, " "));
}

export interface ComponentRewrite {
  component: Json;
  entries: LangEntries;
}

export function rewriteComponent(value: Json): ComponentRewrite {
  const entries: LangEntries = {};

  const visit = (node: Json): Json => {
    if (ours(node)) {
      entries[node.translate] = node.fallback;
      if (Array.isArray(node.with)) node.with.forEach((arg) => visit(arg));
      return node;
    }
    const object = normalize(node);
    if (!object) return node;
    const hasOtherContent = CONTENT_KEYS.some(
      (key) => key !== "text" && object[key] !== undefined,
    );
    if (hasOtherContent || typeof object.text !== "string") return node;

    const extra = Array.isArray(object.extra) ? object.extra : [];
    let format = escapeFormat(object.text);
    const args: Json[] = [];
    for (const child of extra) {
      const plain = plainText(child);
      if (plain !== null) {
        format += escapeFormat(plain);
        continue;
      }
      args.push(visit(child));
      format += `%${args.length}$s`;
    }

    if (!worthTranslating(format)) return node;
    const key = componentKey(format);
    entries[key] = format;
    return {
      ...style(object),
      translate: key,
      fallback: format,
      ...(args.length > 0 ? { with: args } : {}),
    };
  };

  return { component: visit(value), entries };
}
