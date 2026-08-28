const api = window.api;

export const AGENT_SHORTCUT_LABEL =
  api.platform === "darwin" ? "⌘ I" : "Ctrl I";

export function isAgentShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.code === "KeyI"
  );
}
