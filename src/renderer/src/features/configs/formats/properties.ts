import type { ConfigField, FieldKind, ParseResult } from "../document";
import { fieldId } from "../document";

const COMMENT = /^\s*(?:#|!|;|\/\/)\s?(.*)$/;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function inferScalar(raw: string): {
  kind: FieldKind;
  value: boolean | number | string;
  numberStyle?: "integer" | "float";
} {
  const trimmed = raw.trim();
  if (/^(?:true|false)$/i.test(trimmed)) {
    return { kind: "boolean", value: trimmed.toLowerCase() === "true" };
  }
  if (NUMBER.test(trimmed)) {
    return {
      kind: "number",
      value: Number(trimmed),
      numberStyle: /[.eE]/.test(trimmed) ? "float" : "integer",
    };
  }
  return { kind: "string", value: raw };
}

export function parsePropertiesDocument(
  text: string,
  format: "properties" | "ini",
): ParseResult {
  const fields: ConfigField[] = [];
  let section: string[] = [];
  let pending: string[] = [];
  let offset = 0;

  for (const fullLine of text.split("\n")) {
    const lineStart = offset;
    offset += fullLine.length + 1;
    const line = fullLine.replace(/\r$/, "");
    const trimmed = line.trim();

    if (!trimmed) {
      pending = [];
      continue;
    }

    const comment = COMMENT.exec(line);
    if (comment) {
      pending.push(comment[1].trim());
      continue;
    }

    if (format === "ini" && trimmed.startsWith("[")) {
      if (!trimmed.endsWith("]")) {
        return {
          issue: {
            code: "invalidHeader",
            offset: lineStart + line.indexOf("[") + trimmed.length,
          },
          fields,
        };
      }
      section = [trimmed.slice(1, -1).trim()];
      pending = [];
      continue;
    }

    const separator = (() => {
      const equals = line.indexOf("=");
      const colon = line.indexOf(":");
      const candidates = [equals, colon].filter((index) => index > 0);
      if (candidates.length) return Math.min(...candidates);
      if (format !== "properties") return -1;
      const space = /\S\s/.exec(line);
      return space ? space.index + 1 : -1;
    })();

    if (separator === -1) {
      pending = [];
      continue;
    }

    const key = line.slice(0, separator).trim();
    if (!key) {
      pending = [];
      continue;
    }

    let valueStart = separator + 1;
    while (line[valueStart] === " " || line[valueStart] === "\t") valueStart++;
    let valueEnd = line.length;
    while (
      valueEnd > valueStart &&
      (line[valueEnd - 1] === " " || line[valueEnd - 1] === "\t")
    ) {
      valueEnd--;
    }

    const raw = line.slice(valueStart, valueEnd);
    const continues =
      format === "properties" && /(?:^|[^\\])(?:\\\\)*\\$/.test(raw);
    const scalar = continues
      ? { kind: "complex" as const, value: raw }
      : inferScalar(raw);

    fields.push({
      id: fieldId(section, key),
      section,
      key,
      comments: pending,
      raw,
      from: lineStart + valueStart,
      to: lineStart + valueEnd,
      ...scalar,
    });
    pending = [];
  }

  return { issue: null, fields };
}
