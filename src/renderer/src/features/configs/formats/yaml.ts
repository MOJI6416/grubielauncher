import type { ConfigField, ParseResult } from "../document";
import { fieldId } from "../document";

const NUMBER = /^[+-]?(?:\d[\d_]*\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

interface Parent {
  indent: number;
  key: string;
  field: ConfigField | null;
}

function splitKey(
  body: string,
): { key: string; rest: string; restOffset: number } | null {
  if (body.startsWith('"') || body.startsWith("'")) {
    const quote = body[0];
    const close = body.indexOf(quote, 1);
    if (close === -1) return null;
    const after = body.slice(close + 1);
    const colon = /^\s*:(?=\s|$)/.exec(after);
    if (!colon) return null;
    return {
      key: body.slice(1, close),
      rest: after.slice(colon[0].length),
      restOffset: close + 1 + colon[0].length,
    };
  }

  const match = /^([^#\s][^#]*?)\s*:(?=\s|$)/.exec(body);
  if (!match) return null;
  return {
    key: match[1],
    rest: body.slice(match[0].length),
    restOffset: match[0].length,
  };
}

function stripInlineComment(value: string): string {
  const hash = /\s#/.exec(value);
  return (hash ? value.slice(0, hash.index) : value).trimEnd();
}

export function parseYamlDocument(text: string): ParseResult {
  const fields: ConfigField[] = [];
  const stack: Parent[] = [];
  const lines = text.split("\n");
  let pending: string[] = [];
  let offset = 0;
  let blockIndent = -1;

  for (let index = 0; index < lines.length; index++) {
    const lineStart = offset;
    const line = lines[index].replace(/\r$/, "");
    offset += lines[index].length + 1;

    const indentMatch = /^[ \t]*/.exec(line)?.[0] ?? "";
    const body = line.slice(indentMatch.length);
    const indent = indentMatch.length;

    if (!body) {
      if (blockIndent === -1) pending = [];
      continue;
    }

    if (blockIndent !== -1) {
      if (indent > blockIndent) continue;
      blockIndent = -1;
    }

    if (indentMatch.includes("\t")) {
      return {
        issue: {
          code: "tabIndent",
          offset: lineStart + indentMatch.indexOf("\t"),
        },
        fields,
      };
    }

    if (body.startsWith("#")) {
      pending.push(body.replace(/^#+\s?/, "").trim());
      continue;
    }

    if (body === "---" || body === "...") {
      stack.length = 0;
      pending = [];
      continue;
    }

    while (stack.length && stack[stack.length - 1].indent >= indent) {
      if (body.startsWith("- ") || body === "-") {
        if (stack[stack.length - 1].indent === indent) break;
      }
      stack.pop();
    }

    if (body.startsWith("- ") || body === "-") {
      const parent = stack[stack.length - 1];
      const item = stripInlineComment(body.slice(1).trim());
      if (parent?.field) {
        const simple = item !== "" && !/^[[{]/.test(item) && !splitKey(item);
        if (parent.field.kind === "list" && simple) {
          (parent.field.value as string[]).push(
            item.replace(/^(["'])(.*)\1$/, "$2"),
          );
        } else {
          parent.field.kind = "complex";
          parent.field.value = null;
        }
      }
      pending = [];
      continue;
    }

    const pair = splitKey(body);
    if (!pair) {
      pending = [];
      continue;
    }

    const section = stack.map((parent) => parent.key);
    const rawRest = pair.rest;
    const leading = /^\s*/.exec(rawRest)?.[0].length ?? 0;
    const valueOffset = lineStart + indent + pair.restOffset + leading;
    const valueText = rawRest.slice(leading);

    if (!valueText || valueText.startsWith("#")) {
      const field: ConfigField = {
        id: fieldId(section, pair.key),
        section,
        key: pair.key,
        kind: "list",
        value: [],
        raw: "",
        from: valueOffset,
        to: valueOffset,
        comments: pending,
      };
      const next = lines.slice(index + 1).find((candidate) => candidate.trim());
      const nextIndent = next ? /^\s*/.exec(next)![0].length : 0;
      const startsList = next?.trim().startsWith("-") ?? false;
      if (startsList && nextIndent >= indent) fields.push(field);
      stack.push({ indent, key: pair.key, field: startsList ? field : null });
      pending = [];
      continue;
    }

    if (/^[|>][+-]?\d*$/.test(stripInlineComment(valueText))) {
      fields.push({
        id: fieldId(section, pair.key),
        section,
        key: pair.key,
        kind: "complex",
        value: null,
        raw: valueText,
        from: valueOffset,
        to: valueOffset + valueText.length,
        comments: pending,
      });
      blockIndent = indent;
      pending = [];
      continue;
    }

    if (valueText.startsWith('"') || valueText.startsWith("'")) {
      const quote = valueText[0] as '"' | "'";
      let close = -1;
      for (let cursor = 1; cursor < valueText.length; cursor++) {
        if (quote === '"' && valueText[cursor] === "\\") {
          cursor++;
          continue;
        }
        if (valueText[cursor] === quote) {
          if (quote === "'" && valueText[cursor + 1] === "'") {
            cursor++;
            continue;
          }
          close = cursor;
          break;
        }
      }

      if (close === -1) {
        return {
          issue: { code: "unterminatedString", offset: valueOffset },
          fields,
        };
      }

      const raw = valueText.slice(0, close + 1);
      const inner = raw.slice(1, -1);
      fields.push({
        id: fieldId(section, pair.key),
        section,
        key: pair.key,
        kind: "string",
        value:
          quote === '"'
            ? inner.replace(/\\(.)/g, (_, char: string) =>
                char === "n" ? "\n" : char === "t" ? "\t" : char,
              )
            : inner.replace(/''/g, "'"),
        raw,
        from: valueOffset,
        to: valueOffset + raw.length,
        comments: pending,
        quote,
      });
      pending = [];
      continue;
    }

    const raw = stripInlineComment(valueText);

    if (raw.startsWith("[") || raw.startsWith("{")) {
      const open = raw[0];
      const close = open === "[" ? "]" : "}";
      let depth = 0;
      for (const char of raw) {
        if (char === open) depth++;
        if (char === close) depth--;
      }
      if (depth > 0) {
        return {
          issue: { code: "unclosedBracket", offset: valueOffset, detail: open },
          fields,
        };
      }
      fields.push({
        id: fieldId(section, pair.key),
        section,
        key: pair.key,
        kind: "complex",
        value: null,
        raw,
        from: valueOffset,
        to: valueOffset + raw.length,
        comments: pending,
      });
      pending = [];
      continue;
    }

    const lower = raw.toLowerCase();
    const isBoolean = lower === "true" || lower === "false";
    const isNumber = NUMBER.test(raw);

    fields.push({
      id: fieldId(section, pair.key),
      section,
      key: pair.key,
      kind: isBoolean ? "boolean" : isNumber ? "number" : "string",
      value: isBoolean
        ? lower === "true"
        : isNumber
          ? Number(raw.replace(/_/g, ""))
          : raw,
      raw,
      from: valueOffset,
      to: valueOffset + raw.length,
      comments: pending,
      numberStyle: isNumber
        ? /[.eE]/.test(raw)
          ? "float"
          : "integer"
        : undefined,
    });
    pending = [];
  }

  return { issue: null, fields };
}
