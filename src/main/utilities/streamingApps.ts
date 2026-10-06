const STREAMING_APPS: { name: string; processes: string[] }[] = [
  {
    name: "OBS Studio",
    processes: ["obs64.exe", "obs32.exe", "obs.exe", "obs"],
  },
  {
    name: "Streamlabs",
    processes: [
      "streamlabs obs.exe",
      "streamlabs desktop.exe",
      "streamlabs obs",
      "streamlabs desktop",
    ],
  },
  { name: "XSplit", processes: ["xsplit.core.exe"] },
  { name: "PRISM Live Studio", processes: ["prismlivestudio.exe"] },
  {
    name: "Twitch Studio",
    processes: ["twitch studio.exe", "twitchstudio.exe"],
  },
  {
    name: "Meld Studio",
    processes: ["meld studio.exe", "meldstudio.exe", "meld studio"],
  },
  { name: "vMix", processes: ["vmix64.exe", "vmix.exe"] },
  { name: "Wirecast", processes: ["wirecast.exe", "wirecast"] },
];

const APP_BY_PROCESS = new Map(
  STREAMING_APPS.flatMap((entry) =>
    entry.processes.map((process) => [process, entry.name] as const),
  ),
);

export function parseTasklist(stdout: string): string[] {
  const names: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^"([^"]+)"/.exec(line.trim());
    if (match) names.push(match[1]);
  }
  return names;
}

export function parsePs(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(line.lastIndexOf("/") + 1));
}

export function findStreamingApp(processNames: string[]): string | null {
  for (const name of processNames) {
    const found = APP_BY_PROCESS.get(name.trim().toLowerCase());
    if (found) return found;
  }
  return null;
}
