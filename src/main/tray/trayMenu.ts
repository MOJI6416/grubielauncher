import {
  TRAY_MAX_INSTANCES,
  TrayCommand,
  TrayLabels,
  TrayModel,
} from "@/types/Tray";

export type { TrayCommand };

export type TrayMenuEntry =
  | { kind: "item"; label: string; command: TrayCommand; enabled?: boolean }
  | { kind: "check"; label: string; command: TrayCommand; checked: boolean }
  | { kind: "label"; label: string }
  | { kind: "submenu"; label: string; items: TrayMenuEntry[] }
  | { kind: "separator" };

const TOOLTIP_LIMIT = 127;

const LABEL_KEYS: (keyof TrayLabels)[] = [
  "open",
  "play",
  "running",
  "voice",
  "mute",
  "deafen",
  "leave",
  "incoming",
  "accept",
  "decline",
  "quit",
  "installUpdate",
  "playing",
  "hintTitle",
  "hintBody",
];

const TRAY_COMMANDS = new Set<TrayCommand["type"]>([
  "launch",
  "toggleMute",
  "toggleDeafen",
  "leaveVoice",
  "acceptCall",
  "declineCall",
  "open",
  "quit",
  "installUpdate",
]);

export function buildTrayMenu(model: TrayModel): TrayMenuEntry[] {
  const { labels } = model;
  const entries: TrayMenuEntry[] = [
    { kind: "item", label: labels.open, command: { type: "open" } },
  ];

  const instances = model.instances.slice(0, TRAY_MAX_INSTANCES);
  if (instances.length > 0) {
    entries.push({
      kind: "submenu",
      label: labels.play,
      items: instances.map((instance) => ({
        kind: "item",
        label: instance.running
          ? `${instance.name} · ${labels.running}`
          : instance.name,
        enabled: !instance.running,
        command: { type: "launch", versionName: instance.name },
      })),
    });
  }

  if (model.incomingCall) {
    entries.push(
      { kind: "separator" },
      {
        kind: "label",
        label: `${labels.incoming}: ${model.incomingCall.nickname}`,
      },
      { kind: "item", label: labels.accept, command: { type: "acceptCall" } },
      { kind: "item", label: labels.decline, command: { type: "declineCall" } },
    );
  }

  if (model.voice) {
    entries.push(
      { kind: "separator" },
      { kind: "label", label: `${labels.voice}: ${model.voice.title}` },
      {
        kind: "check",
        label: labels.mute,
        checked: model.voice.muted,
        command: { type: "toggleMute" },
      },
      {
        kind: "check",
        label: labels.deafen,
        checked: model.voice.deafened,
        command: { type: "toggleDeafen" },
      },
      { kind: "item", label: labels.leave, command: { type: "leaveVoice" } },
    );
  }

  entries.push({ kind: "separator" });
  if (model.updateVersion && labels.installUpdate) {
    entries.push({
      kind: "item",
      label: labels.installUpdate,
      command: { type: "installUpdate" },
    });
  }
  entries.push({ kind: "item", label: labels.quit, command: { type: "quit" } });

  return entries;
}

export function buildTrayTooltip(
  model: TrayModel | null,
  appName: string,
): string {
  if (!model) return appName;

  const lines = [appName];
  if (model.incomingCall) {
    lines.push(`${model.labels.incoming}: ${model.incomingCall.nickname}`);
  }
  if (model.playing.length > 0) {
    lines.push(`${model.labels.playing}: ${model.playing.join(", ")}`);
  }
  if (model.voice) {
    lines.push(`${model.labels.voice}: ${model.voice.title}`);
  }

  const text = lines.join("\n");
  return text.length > TOOLTIP_LIMIT
    ? `${text.slice(0, TOOLTIP_LIMIT - 1)}…`
    : text;
}

function text(value: unknown, max = 120): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

export function sanitizeTrayCommand(value: unknown): TrayCommand | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { type?: unknown; versionName?: unknown };
  if (typeof raw.type !== "string") return null;
  if (!TRAY_COMMANDS.has(raw.type as TrayCommand["type"])) return null;

  if (raw.type === "launch") {
    const versionName = text(raw.versionName, 255);
    return versionName ? { type: "launch", versionName } : null;
  }

  return { type: raw.type } as TrayCommand;
}

export function sanitizeTrayModel(value: unknown): TrayModel | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<TrayModel>;
  const rawLabels = (raw.labels ?? {}) as Record<string, unknown>;

  const labels = Object.fromEntries(
    LABEL_KEYS.map((key) => [key, text(rawLabels[key], 200)]),
  ) as unknown as TrayLabels;

  const voice =
    raw.voice && typeof raw.voice === "object"
      ? {
          title: text(raw.voice.title),
          muted: raw.voice.muted === true,
          deafened: raw.voice.deafened === true,
          since: count(raw.voice.since),
          participants: count(raw.voice.participants),
        }
      : null;

  return {
    lang: text(raw.lang, 10),
    accent: text(raw.accent, 20),
    closeToTray: raw.closeToTray === true,
    instances: (Array.isArray(raw.instances) ? raw.instances : [])
      .filter((instance) => typeof instance?.name === "string" && instance.name)
      .slice(0, TRAY_MAX_INSTANCES)
      .map((instance) => ({
        name: text(instance.name),
        running: instance.running === true,
        image: text(instance.image, 2048) || undefined,
        minecraft: text(instance.minecraft, 40) || undefined,
        loader: text(instance.loader, 20) || undefined,
      })),
    playing: (Array.isArray(raw.playing) ? raw.playing : [])
      .map((name) => text(name))
      .filter(Boolean)
      .slice(0, 5),
    voice,
    incomingCall:
      raw.incomingCall && typeof raw.incomingCall === "object"
        ? { nickname: text(raw.incomingCall.nickname, 40) }
        : null,
    updateVersion: text(raw.updateVersion, 40) || null,
    labels,
  };
}
