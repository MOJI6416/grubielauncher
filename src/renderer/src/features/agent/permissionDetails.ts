import type { AgentRisk } from "@renderer/agent/types";

export type PermissionValue =
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[]; more: number }
  | { kind: "count"; count: number };

export type PermissionRow = { key: string; value: PermissionValue };

export type PermissionSummary = {
  rows: PermissionRow[];
  hidden: number;
  raw: string | null;
};

export type PermissionAction = "deny" | "once" | "always";

const MAX_ROWS = 6;
const MAX_LIST = 4;
const MAX_TEXT = 90;

function text(value: string): PermissionValue {
  const clean = value.replace(/\s+/g, " ").trim();
  return {
    kind: "text",
    text: clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT)}…` : clean,
  };
}

function primitive(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);

  return null;
}

function describeValue(value: unknown): PermissionValue | null {
  const simple = primitive(value);
  if (simple !== null) {
    return simple.trim() === "" ? null : text(simple);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return null;

    const items = value
      .map((entry) => primitive(entry) ?? primitive((entry as any)?.name))
      .filter((entry): entry is string => entry !== null && entry.trim() !== "");

    if (items.length === 0) return { kind: "count", count: value.length };

    return {
      kind: "list",
      items: items.slice(0, MAX_LIST),
      more: Math.max(0, value.length - MAX_LIST),
    };
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length === 0 ? null : { kind: "count", count: keys.length };
  }

  return null;
}

export function describeArguments(raw: string | undefined): PermissionSummary {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "" || trimmed === "{}") {
    return { rows: [], hidden: 0, raw: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { rows: [], hidden: 0, raw: trimmed };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const value = describeValue(parsed);
    return value
      ? { rows: [{ key: "value", value }], hidden: 0, raw: null }
      : { rows: [], hidden: 0, raw: trimmed };
  }

  const rows: PermissionRow[] = [];
  let hidden = 0;

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const described = describeValue(value);
    if (!described) continue;

    if (rows.length >= MAX_ROWS) {
      hidden += 1;
      continue;
    }

    rows.push({ key, value: described });
  }

  return { rows, hidden, raw: rows.length === 0 ? trimmed : null };
}

export function permissionActions(risk: AgentRisk): PermissionAction[] {
  return risk === "destructive"
    ? ["deny", "once"]
    : ["deny", "always", "once"];
}
