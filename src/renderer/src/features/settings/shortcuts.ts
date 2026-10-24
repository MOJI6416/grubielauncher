import { ALT_KEY, MOD_KEY, SHIFT_KEY } from "@renderer/utilities/platform";

export type ShortcutGroupId =
  | "global"
  | "palette"
  | "lists"
  | "logs"
  | "chat";

export interface ShortcutDef {
  id: string;
  combos: string[][];
}

export interface ShortcutGroup {
  id: ShortcutGroupId;
  items: ShortcutDef[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: "global",
    items: [
      { id: "palette", combos: [[MOD_KEY, "K"]] },
      { id: "paletteActions", combos: [[MOD_KEY, SHIFT_KEY, "P"]] },
      { id: "assistant", combos: [[MOD_KEY, "I"]] },
      { id: "search", combos: [[MOD_KEY, "F"]] },
      { id: "account", combos: [[MOD_KEY, "1…9"]] },
      { id: "back", combos: [[ALT_KEY, "←"]] },
      { id: "forward", combos: [[ALT_KEY, "→"]] },
      { id: "close", combos: [["Esc"]] },
    ],
  },
  {
    id: "palette",
    items: [
      { id: "modeActions", combos: [[">"]] },
      { id: "modeInstances", combos: [["@"]] },
      { id: "modeSettings", combos: [["#"]] },
      { id: "modeHelp", combos: [["?"]] },
      { id: "move", combos: [["↑"], ["↓"]] },
      { id: "open", combos: [["Enter"]] },
    ],
  },
  {
    id: "lists",
    items: [
      { id: "move", combos: [["↑"], ["↓"]] },
      { id: "open", combos: [["Enter"]] },
      { id: "mark", combos: [["Space"]] },
      { id: "removeServer", combos: [["Delete"]] },
      { id: "moveServer", combos: [["Alt", "↑"], ["Alt", "↓"]] },
      { id: "tab", combos: [["←"], ["→"]] },
      { id: "tabEdge", combos: [["Home"], ["End"]] },
      { id: "gallery", combos: [["←"], ["→"]] },
    ],
  },
  {
    id: "logs",
    items: [
      { id: "nextMatch", combos: [["Enter"]] },
      { id: "prevMatch", combos: [["Shift", "Enter"]] },
      { id: "clearSearch", combos: [["Esc"]] },
      { id: "history", combos: [["↑"], ["↓"]] },
    ],
  },
  {
    id: "chat",
    items: [
      { id: "send", combos: [["Enter"]] },
      { id: "newline", combos: [["Shift", "Enter"]] },
      { id: "cancelReply", combos: [["Esc"]] },
      { id: "switchFriend", combos: [["↑"], ["↓"]] },
    ],
  },
];

export function shortcutKey(group: ShortcutGroupId, id: string): string {
  return `${group}.${id}`;
}

export function shortcutKeys(): string[] {
  return SHORTCUT_GROUPS.flatMap((group) =>
    group.items.map((item) => shortcutKey(group.id, item.id)),
  );
}
