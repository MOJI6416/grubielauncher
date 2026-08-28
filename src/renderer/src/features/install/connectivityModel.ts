import {
  ConnectivityCheckPlanEntry,
  ConnectivityCheckResult,
  ConnectivityGroup,
} from "@/types/Connectivity";
import { DownloadSource } from "@/types/Settings";

export const CONNECTIVITY_GROUP_ORDER: ConnectivityGroup[] = [
  "grubie",
  "minecraft",
  "mirror",
  "mods",
  "loaders",
  "java",
];

export type LatencyTone = "fast" | "ok" | "slow";

export interface ConnectivityGroupRow {
  id: string;
  name: string;
  result: ConnectivityCheckResult | null;
}

export interface ConnectivityGroupView {
  group: ConnectivityGroup;
  rows: ConnectivityGroupRow[];
  results: ConnectivityCheckResult[];
  okCount: number;
  total: number;
}

export function mergeConnectivityResult(
  results: ConnectivityCheckResult[],
  incoming: ConnectivityCheckResult,
): ConnectivityCheckResult[] {
  const index = results.findIndex((result) => result.id === incoming.id);
  if (index === -1) return [...results, incoming];

  const next = results.slice();
  next[index] = incoming;
  return next;
}

export function groupConnectivity(
  results: ConnectivityCheckResult[],
  plan: ConnectivityCheckPlanEntry[] = [],
): ConnectivityGroupView[] {
  const views: ConnectivityGroupView[] = [];
  const byId = new Map(results.map((result) => [result.id, result]));

  for (const group of CONNECTIVITY_GROUP_ORDER) {
    const list = results
      .filter((result) => result.group === group)
      .sort((left, right) => left.name.localeCompare(right.name));

    const planned = plan
      .filter((entry) => entry.group === group)
      .sort((left, right) => left.name.localeCompare(right.name));

    const rows: ConnectivityGroupRow[] = planned.length
      ? planned.map((entry) => ({
          id: entry.id,
          name: entry.name,
          result: byId.get(entry.id) ?? null,
        }))
      : list.map((result) => ({ id: result.id, name: result.name, result }));

    if (rows.length === 0) continue;

    views.push({
      group,
      rows,
      results: list,
      okCount: list.filter((result) => result.ok).length,
      total: rows.length,
    });
  }

  return views;
}

export function latencyTone(ms: number | null | undefined): LatencyTone {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "ok";
  if (ms < 150) return "fast";
  if (ms < 900) return "ok";
  return "slow";
}

export function buildConnectivityReport(
  results: ConnectivityCheckResult[],
  source: DownloadSource,
): string {
  const lines = [`source: ${source}`];

  for (const view of groupConnectivity(results)) {
    lines.push("");
    lines.push(`${view.group}: ${view.okCount}/${view.total}`);

    for (const result of view.results) {
      lines.push(
        result.ok
          ? `  ok   ${result.id} ${result.latencyMs ?? "?"}ms ${result.target}`
          : `  fail ${result.id} ${result.target}${
              result.error ? ` — ${result.error}` : ""
            }`,
      );
    }
  }

  return lines.join("\n");
}
