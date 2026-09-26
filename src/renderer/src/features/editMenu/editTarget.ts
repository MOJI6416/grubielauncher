export type EditCommand = "cut" | "copy" | "paste" | "selectAll";

export type EditMenuItem =
  | { kind: "command"; command: EditCommand; enabled: boolean }
  | { kind: "copyLink"; url: string }
  | { kind: "separator" };

export interface EditTargetInfo {
  isEditable: boolean;
  isPassword: boolean;
  isReadOnly: boolean;
  hasValue: boolean;
  hasFieldSelection: boolean;
  pageSelection: string;
  linkUrl: string | null;
}

const TEXT_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "url",
  "email",
  "tel",
  "password",
  "number",
]);

function isWebLink(url: string | null): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

export function describeEditTarget(
  target: EventTarget | null,
  pageSelection: string,
): EditTargetInfo {
  const element = target instanceof Element ? target : null;
  const field = element?.closest("input, textarea") as
    | HTMLInputElement
    | HTMLTextAreaElement
    | null;
  const editableHost = element?.closest("[contenteditable='true'], [contenteditable='']") ?? null;
  const link = element?.closest("a[href]") as HTMLAnchorElement | null;

  const isTextField =
    !!field &&
    (field.tagName === "TEXTAREA" ||
      TEXT_INPUT_TYPES.has((field as HTMLInputElement).type ?? ""));

  if (isTextField && field) {
    const start = field.selectionStart ?? 0;
    const end = field.selectionEnd ?? 0;
    return {
      isEditable: !field.disabled,
      isPassword: (field as HTMLInputElement).type === "password",
      isReadOnly: field.readOnly,
      hasValue: field.value.length > 0,
      hasFieldSelection: end > start,
      pageSelection: "",
      linkUrl: null,
    };
  }

  return {
    isEditable: !!editableHost,
    isPassword: false,
    isReadOnly: false,
    hasValue: !!editableHost?.textContent,
    hasFieldSelection: !!editableHost && pageSelection.length > 0,
    pageSelection,
    linkUrl: link?.href ?? null,
  };
}

export function buildEditMenu(info: EditTargetInfo): EditMenuItem[] {
  const items: EditMenuItem[] = [];

  if (info.isEditable) {
    const canTake = info.hasFieldSelection && !info.isPassword;
    items.push(
      { kind: "command", command: "cut", enabled: canTake && !info.isReadOnly },
      { kind: "command", command: "copy", enabled: canTake },
      { kind: "command", command: "paste", enabled: !info.isReadOnly },
      { kind: "separator" },
      { kind: "command", command: "selectAll", enabled: info.hasValue },
    );
  } else if (info.pageSelection.trim().length > 0) {
    items.push({ kind: "command", command: "copy", enabled: true });
  }

  if (isWebLink(info.linkUrl)) {
    if (items.length > 0) items.push({ kind: "separator" });
    items.push({ kind: "copyLink", url: info.linkUrl });
  }

  return items;
}
