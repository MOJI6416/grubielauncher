export interface OptionEntry {
  key: string;
  value: string;
}

export interface OptionsDoc {
  bom: boolean;
  eol: string;
  trailing: boolean;
  lines: Array<OptionEntry | string>;
}

export function parseOptionsText(source: string | null): OptionsDoc {
  let text = source ?? "";
  const bom = text.startsWith("\uFEFF");
  if (bom) text = text.slice(1);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (!text) return { bom, eol, trailing: true, lines: [] };

  const raw = text.split(/\r?\n/);
  const trailing = raw[raw.length - 1] === "";
  if (trailing) raw.pop();

  return {
    bom,
    eol,
    trailing,
    lines: raw.map((line) => {
      const separator = line.indexOf(":");
      if (separator <= 0) return line;
      return {
        key: line.slice(0, separator),
        value: line.slice(separator + 1),
      };
    }),
  };
}

export function serializeOptionsDoc(doc: OptionsDoc): string {
  const body = doc.lines
    .map((line) =>
      typeof line === "string" ? line : `${line.key}:${line.value}`,
    )
    .join(doc.eol);
  const tail = doc.trailing && doc.lines.length > 0 ? doc.eol : "";
  return `${doc.bom ? "\uFEFF" : ""}${body}${tail}`;
}

export function optionEntries(doc: OptionsDoc): OptionEntry[] {
  const latest = new Map<string, string>();
  for (const line of doc.lines) {
    if (typeof line !== "string") latest.set(line.key, line.value);
  }
  return [...latest].map(([key, value]) => ({ key, value }));
}

export function getOption(doc: OptionsDoc, key: string): string | undefined {
  let found: string | undefined;
  for (const line of doc.lines) {
    if (typeof line !== "string" && line.key === key) found = line.value;
  }
  return found;
}

export function setOption(
  doc: OptionsDoc,
  key: string,
  value: string,
): boolean {
  let changed = false;
  let present = false;
  for (const line of doc.lines) {
    if (typeof line === "string" || line.key !== key) continue;
    present = true;
    if (line.value !== value) {
      line.value = value;
      changed = true;
    }
  }
  if (!present) {
    doc.lines.push({ key, value });
    changed = true;
  }
  return changed;
}

export function prependOption(
  doc: OptionsDoc,
  key: string,
  value: string,
): void {
  doc.lines.unshift({ key, value });
}
