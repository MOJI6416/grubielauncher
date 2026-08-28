import { getDefaultStore } from "jotai";
import i18n from "@renderer/i18n";
import {
  accountAtom,
  selectedVersionAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { countOverrides } from "@/shared/instanceSettings";
import { UNTRUSTED_NOTICE } from "./untrusted";

const api = window.api;

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ru: "Russian",
  uk: "Ukrainian",
};

const MAX_LISTED_INSTANCES = 40;

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
      ? `, overrides ${overridden} launcher setting(s) of its own`
      : "";

    return `- ${conf.name}${marker}: Minecraft ${conf.version.id}, ${loader}, ${conf.loader.mods.length} mods${settingsNote}`;
  });

  if (versions.length > MAX_LISTED_INSTANCES) {
    lines.push(`- … and ${versions.length - MAX_LISTED_INSTANCES} more`);
  }

  return lines.join("\n");
}

export async function buildSystemPrompt(): Promise<string> {
  const store = getDefaultStore();
  const settings = store.get(settingsAtom);
  const account = store.get(accountAtom);

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
    "- If the request leaves out which instance, which mod or which Minecraft version it means, call ask_user FIRST and wait for the answer. Having only one instance, or one being selected, is not permission to assume it is the right one.",
    "- Prefer calling a tool over guessing. Never invent instance names, mod names, versions or settings that a tool has not returned.",
    "- Call several read tools when you need to before answering; the user sees each call as it happens.",
    "- Keep answers short and concrete. Use markdown lists for enumerations.",
    "- Call update_plan before any task that needs more than two or three tool calls, and update it as you go.",
    "- Tools that change something ask the user for permission first. If a tool comes back saying the user declined, do not retry it — ask what they want instead.",
    "- Check what a tool returned before reporting success. Some tools apply only part of what you asked and tell you what they dropped.",
    "- Minecraft version ids, loader names, mod file names and error identifiers must be copied verbatim, never translated.",
    `- Write your answers in ${resolveLanguage()}.`,
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
  ]
    .filter((line) => line !== "")
    .join("\n");
}
