import type { ConfigField, ParseResult } from "../document";
import { fieldId } from "../document";

const FIELD = /^(\s*)([BIDS]):("?)(.+?)\3=(.*)$/;
const LIST = /^\s*([BIDS]):("?)([^=<]+?)\2\s*<\s*$/;
const INLINE_LIST = /^\s*([BIDS]):("?)([^=<]+?)\2\s*<(.*)>\s*$/;
const CATEGORY = /^\s*("?)(.+?)\1\s*\{\s*$/;
const INTEGER = /^[+-]?\d+$/;
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function isForgeCfg(text: string): boolean {
  return /^\s*[BIDS]:\S/m.test(text) || /^\s*~CONFIG_VERSION:/m.test(text);
}

export function parseForgeCfg(text: string): ParseResult {
  const fields: ConfigField[] = [];
  const categories: { name: string; offset: number }[] = [];
  const lines = text.split("\n");
  let pending: string[] = [];
  let offset = 0;

  for (let index = 0; index < lines.length; index++) {
    const lineStart = offset;
    const line = lines[index].replace(/\r$/, "");
    offset += lines[index].length + 1;
    const trimmed = line.trim();

    if (!trimmed) {
      pending = [];
      continue;
    }

    if (trimmed.startsWith("#")) {
      const body = trimmed.replace(/^#+\s?/, "").trim();
      if (!/^#+$/.test(trimmed) && body && !/^#{3,}/.test(trimmed)) {
        pending.push(body);
      }
      continue;
    }

    if (trimmed.startsWith("~")) continue;

    if (trimmed === "}") {
      if (!categories.length) {
        return {
          issue: {
            code: "unexpectedClose",
            offset: lineStart + line.indexOf("}"),
            detail: "}",
          },
          fields,
        };
      }
      categories.pop();
      pending = [];
      continue;
    }

    const inline = INLINE_LIST.exec(line);
    if (inline) {
      const section = categories.map((category) => category.name);
      const listOffset = lineStart + line.indexOf("<");
      fields.push({
        id: fieldId(section, inline[3]),
        section,
        key: inline[3],
        kind: "complex",
        value: inline[4],
        raw: inline[4],
        from: listOffset,
        to: listOffset,
        comments: pending,
      });
      pending = [];
      continue;
    }

    const list = LIST.exec(line);
    if (list) {
      const items: string[] = [];
      const listOffset = lineStart + line.indexOf("<");
      let closed = false;
      let cursor = offset;

      for (index++; index < lines.length; index++) {
        const itemLine = lines[index].replace(/\r$/, "");
        cursor += lines[index].length + 1;
        if (itemLine.trim() === ">") {
          closed = true;
          break;
        }
        if (itemLine.trim()) items.push(itemLine.trim());
      }

      if (!closed) {
        return {
          issue: { code: "unclosedBracket", offset: listOffset, detail: "<" },
          fields,
        };
      }

      const section = categories.map((category) => category.name);
      fields.push({
        id: fieldId(section, list[3]),
        section,
        key: list[3],
        kind: "list",
        value: items,
        raw: "",
        from: listOffset,
        to: listOffset,
        comments: pending,
      });
      offset = cursor;
      pending = [];
      continue;
    }

    const field = FIELD.exec(line);
    if (field) {
      const [, , type, , key, raw] = field;
      const valueStart = lineStart + line.length - raw.length;
      const section = categories.map((category) => category.name);
      const value = raw.trim();
      const isBoolean = type === "B" && /^(?:true|false)$/i.test(value);
      const isNumber =
        (type === "I" && INTEGER.test(value)) ||
        (type === "D" && DECIMAL.test(value));

      fields.push({
        id: fieldId(section, key),
        section,
        key,
        kind: isBoolean ? "boolean" : isNumber ? "number" : "string",
        value: isBoolean
          ? value.toLowerCase() === "true"
          : isNumber
            ? Number(value)
            : raw,
        raw,
        from: valueStart,
        to: valueStart + raw.length,
        comments: pending,
        numberStyle: !isNumber ? undefined : type === "I" ? "integer" : "float",
      });
      pending = [];
      continue;
    }

    if (/^\s*[BIDS]:/.test(line)) {
      return {
        issue: { code: "expectedEquals", offset: lineStart + line.length },
        fields,
      };
    }

    const category = CATEGORY.exec(line);
    if (category) {
      categories.push({
        name: category[2],
        offset: lineStart + line.indexOf("{"),
      });
      pending = [];
      continue;
    }

    pending = [];
  }

  if (categories.length) {
    const last = categories[categories.length - 1];
    return {
      issue: { code: "unclosedBracket", offset: last.offset, detail: "{" },
      fields,
    };
  }

  return { issue: null, fields };
}
