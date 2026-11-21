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

function span(child: Json): { style: JsonObject; text: string } | null {
  if (ours(child)) return null;
  const object = normalize(child);
  if (!object || typeof object.text !== "string") return null;
  if (CONTENT_KEYS.some((key) => key !== "text" && object[key] !== undefined)) return null;
  let text = object.text;
  for (const part of Array.isArray(object.extra) ? object.extra : []) {
    const plain = plainText(part);
    if (plain === null) return null;
    text += plain;
  }
  return needsTranslation(text) ? { style: style(object), text } : null;
}

export function expandSpans(key: string, value: string): LangEntries {
  const out: LangEntries = {};
  out[key] = value.replace(/<s(\d+)>([\s\S]*?)<\/s\1>/g, (_all, index: string, inner: string) => {
    out[`${key}.${index}`] = inner;
    return `%${index}$s`;
  });
  return out;
}

export function rewriteComponent(value: Json): ComponentRewrite {
  const entries: LangEntries = {};

  const visit = (node: Json): Json => {
    if (ours(node)) {
      const args = Array.isArray(node.with) ? node.with : [];
      entries[node.translate] = node.fallback.replace(
        /(%%)|%(\d+)\$s/g,
        (all: string, escaped: string | undefined, index: string | undefined) => {
          if (escaped) return all;
          const arg = args[Number(index) - 1];
          if (ours(arg) && arg.translate === `${node.translate}.${index}`) {
            return `<s${index}>${arg.fallback}</s${index}>`;
          }
          if (arg !== undefined) visit(arg);
          return all;
        },
      );
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
    let markup = format;
    const parts: Array<{ child: Json; span: { style: JsonObject; text: string } | null }> = [];
    for (const child of extra) {
      const plain = plainText(child);
      if (plain !== null) {
        format += escapeFormat(plain);
        markup += escapeFormat(plain);
        continue;
      }
      const index = parts.length + 1;
      const styled = span(child);
      parts.push({ child, span: styled });
      format += `%${index}$s`;
      markup += styled ? `<s${index}>${escapeFormat(styled.text)}</s${index}>` : `%${index}$s`;
    }

    if (!worthTranslating(format)) {
      if (parts.length === 0) return node;
      let next = 0;
      return {
        ...object,
        extra: extra.map((child) => (plainText(child) !== null ? child : visit(parts[next++].child))),
      };
    }
    const key = componentKey(markup);
    entries[key] = markup;
    const args = parts.map(({ child, span: styled }, index) =>
      styled
        ? {
            ...styled.style,
            translate: `${key}.${index + 1}`,
            fallback: escapeFormat(styled.text),
          }
        : visit(child),
    );
    return {
      ...style(object),
      translate: key,
      fallback: format,
      ...(args.length > 0 ? { with: args } : {}),
    };
  };

  return { component: visit(value), entries };
}
