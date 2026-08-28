import { IErrorLogEntry } from "@renderer/stores/atoms";

export interface ErrorLogGroup {
  id: string;
  title: string;
  details?: string;
  crashKey?: string;
  time: number;
  count: number;
}

export function groupErrorLog(entries: IErrorLogEntry[]): ErrorLogGroup[] {
  const groups: ErrorLogGroup[] = [];

  for (const entry of entries) {
    const last = groups[groups.length - 1];

    if (
      last &&
      last.title === entry.title &&
      last.details === entry.details &&
      last.crashKey === entry.crashKey
    ) {
      last.count += 1;
      last.time = Math.max(last.time, entry.time);
      continue;
    }

    groups.push({
      id: entry.id,
      title: entry.title,
      details: entry.details,
      crashKey: entry.crashKey,
      time: entry.time,
      count: 1,
    });
  }

  return groups;
}

export function errorLogToText(groups: ErrorLogGroup[]): string {
  return groups
    .map((group) => {
      const stamp = new Date(group.time).toISOString();
      const head = group.count > 1 ? `${group.title} (x${group.count})` : group.title;
      return [`[${stamp}] ${head}`, group.details].filter(Boolean).join("\n");
    })
    .join("\n\n");
}
