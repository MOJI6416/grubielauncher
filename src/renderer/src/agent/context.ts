import { getDefaultStore } from "jotai";
import i18n from "@renderer/i18n";
import {
  accountAtom,
  aiCrashesAtom,
  aiCrashKey,
  consolesAtom,
  crashAnalysesAtom,
  selectedVersionAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { countOverrides } from "@/shared/instanceSettings";
import { UNTRUSTED_NOTICE } from "./untrusted";
import { REPLIES_RULE } from "./replies";
import { agentChatAtom } from "./store";

const api = window.api;

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ru: "Russian",
  uk: "Ukrainian",
  de: "German",
  es: "Latin American Spanish",
  fr: "French",
  pl: "Polish",
  pt: "Brazilian Portuguese",
  tr: "Turkish",
};

const MAX_LISTED_INSTANCES = 40;
const MAX_LISTED_RUNS = 6;

function resolveLanguage(): string {
  const code = i18n.resolvedLanguage ?? "en";
  return LANGUAGE_NAMES[code] ?? "English";
}

function describeInstances(): string {
  const store = getDefaultStore();
  const versions = store.get(versionsAtom);
  const selected = store.get(selectedVersionAtom);

  if (versions.length === 0) return "The user has no instances yet.";

  const lines = versions.slice(0, MAX_LISTED_INSTANCES).map((version) => {
    const conf = version.version;
    const loader =
      conf.loader.name === "vanilla"
        ? "vanilla"
        : `${conf.loader.name} ${conf.loader.version?.id ?? "?"}`;
    const marker = selected?.version.name === conf.name ? " [selected]" : "";
    const overridden = countOverrides(conf.overrides);
    const settingsNote = overridden
      ? `, overrides ${overridden} launcher setting(s) of its own${conf.overrides?.java ? " (Java chosen by hand)" : ""}`
      : "";

    return `- ${conf.name}${marker}: Minecraft ${conf.version.id}, ${loader}, ${conf.loader.mods.length} mods${settingsNote}`;
  });

  if (versions.length > MAX_LISTED_INSTANCES) {
    lines.push(`- … and ${versions.length - MAX_LISTED_INSTANCES} more`);
  }

  return lines.join("\n");
}

function clockTime(time: number): string {
  const date = new Date(time);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function describeRecentRuns(): string {
  const store = getDefaultStore();
  const consoles = store.get(consolesAtom).consoles;

  if (consoles.length === 0) {
    return "No game was launched since the launcher started.";
  }

  const analyses = store.get(crashAnalysesAtom);
  const unresolved = store.get(aiCrashesAtom);

  return [...consoles]
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, MAX_LISTED_RUNS)
    .map((entry) => {
      const key = aiCrashKey(entry.versionName, entry.instance);
      const analysis = analyses[key]?.analysis;
      const crash = unresolved[key]?.crash;
      const outcome =
        entry.status === "running"
          ? "still running"
          : entry.status === "error"
            ? "crashed"
            : "closed";
      const details = analysis
        ? `, the launcher crash rules matched "${analysis.ruleId}"`
        : crash
          ? `, exit code ${crash.exitCode}, no crash rule matched`
          : "";

      return `- ${entry.versionName}: started at ${clockTime(entry.startTime)}, ${outcome}${details}`;
    })
    .join("\n");
}

const MAX_UNDONE_INPUT = 200;

export function describeUndone(): string {
  return getDefaultStore()
    .get(agentChatAtom)
    .timeline.filter(
      (item) => item.kind === "tool" && item.undoState === "done",
    )
    .map((item) =>
      item.kind === "tool"
        ? `- ${item.name} ${(item.input ?? "").slice(0, MAX_UNDONE_INPUT)}`
        : "",
    )
    .join("\n");
}

export async function buildSystemPrompt(): Promise<string> {
  const store = getDefaultStore();
  const settings = store.get(settingsAtom);
  const account = store.get(accountAtom);

  const undone = describeUndone();

  const [launcherVersion, totalMemory] = await Promise.all([
    api.other.getVersion().catch(() => "unknown"),
    api.os.totalmem().catch(() => 0),
  ]);

  const totalMemoryMb = totalMemory
    ? Math.round(totalMemory / (1024 * 1024))
    : 0;

  return [
    "You are the built-in assistant of Grubie Launcher, a Minecraft launcher.",
    "You help the user manage their instances, mods and settings by calling the tools you are given.",
    "",
    "Rules:",
    "- If the request leaves out which instance, which mod or which Minecraft version it means, call ask_user FIRST and wait for the answer. Having only one instance, or one being selected, is not permission to assume it is the right one. The only exception is a question about a crash when exactly one recent game session below crashed. Once the user names an instance, its Minecraft version and loader are known from the list below: never ask about them.",
    "- The launcher state, the instance list and the recent game sessions below are refreshed with every user message, so trust them over what earlier messages said. When the user asks why the game crashed without naming an instance and exactly one recent session crashed, that is the one they mean: read its log instead of asking.",
    "- Prefer calling a tool over guessing. Never invent instance names, mod names, versions or settings that a tool has not returned.",
    "- Call several read tools when you need to before answering; the user sees each call as it happens.",
    "- Keep answers short and concrete. Use markdown lists for enumerations.",
    "- Call update_plan only for a task that needs five or more tool calls, such as creating an instance and filling it with mods. Call it at most twice — at the start and when the work is done — and in the same turn as another tool call, never on its own: every extra turn makes the user wait.",
    "- Tools that change something ask the user for permission first with a card that shows what will change, so do not ask \"shall I apply it?\" in text: call the tool and let the user decide on the card. If a tool comes back saying the user declined, do not retry it — ask what they want instead.",
    "- Check what a tool returned before reporting success. Some tools apply only part of what you asked and tell you what they dropped.",
    "- Minecraft version ids, loader names, mod file names and error identifiers must be copied verbatim, never translated.",
    `- Write your answers in ${resolveLanguage()}.`,
    `- ${REPLIES_RULE}`,
    `- ${UNTRUSTED_NOTICE}`,
    "",
    "Launcher state:",
    `- Launcher version ${launcherVersion} on ${api.platform}`,
    totalMemoryMb ? `- ${totalMemoryMb} MB of system RAM` : "",
    `- Default allocated to the game: ${settings.xmx} MB${settings.optimizedJvm ? ", optimized JVM flags on" : ""} — an instance can override this, so read get_instance before you talk about the memory of one instance`,
    account
      ? `- Signed in as ${account.nickname} (${account.type})`
      : "- No account selected",
    "",
    "Instances:",
    describeInstances(),
    "",
    "Recent game sessions in this launcher run, newest first:",
    describeRecentRuns(),
    ...(undone
      ? [
          "",
          "Changes from this chat that the user reverted with the Undo button, so they are no longer in effect:",
          undone,
        ]
      : []),
  ]
    .filter((line) => line !== "")
    .join("\n");
}
