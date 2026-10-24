import { MOD_KEY } from "@renderer/utilities/platform";

export const AGENT_SHORTCUT_LABEL = `${MOD_KEY} I`;

export function isAgentShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.code === "KeyI"
  );
}
