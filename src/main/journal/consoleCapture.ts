import { format } from "util";
import { describeError, journal } from "./journal";
import type { JournalLevel } from "@/types/Journal";

const METHODS: Array<["log" | "info" | "warn" | "error" | "debug", JournalLevel]> = [
  ["log", "info"],
  ["info", "info"],
  ["warn", "warn"],
  ["error", "error"],
  ["debug", "debug"],
];

const TAG = /^\s*\[([^\]\r\n]{1,40})\]:?\s*/;
const NODE_WARNING = /^\(node:\d+\) (?:\[[A-Z0-9]+\] )?\w*Warning:/;

let installed = false;

export function isNodeWarning(text: string): boolean {
  return NODE_WARNING.test(text);
}

export function splitConsoleTag(text: string): {
  scope: string;
  message: string;
} {
  if (isNodeWarning(text)) return { scope: "node", message: text };

  const match = TAG.exec(text);
  if (!match) return { scope: "console", message: text };

  const scope = match[1].trim().toLowerCase().replace(/\s+/g, "-");
  const message = text.slice(match[0].length);
  return { scope: scope || "console", message: message || text };
}

export function formatConsoleArgs(args: unknown[]): {
  text: string;
  error: unknown;
} {
  const error = args.find((arg) => arg instanceof Error);
  const text = format(
    ...args.map((arg) =>
      arg instanceof Error ? `${arg.name}: ${arg.message}` : arg,
    ),
  );
  return { text, error };
}

export function captureConsole(): void {
  if (installed) return;
  installed = true;

  for (const [method, level] of METHODS) {
    const original = console[method].bind(console) as (
      ...args: unknown[]
    ) => void;

    console[method] = (...args: unknown[]) => {
      original(...args);
      try {
        const { text, error } = formatConsoleArgs(args);
        const { scope, message } = splitConsoleTag(text);
        journal[isNodeWarning(text) ? "warn" : level](
          scope,
          message,
          error ? { error: describeError(error) } : undefined,
        );
      } catch {}
    };
  }
}
