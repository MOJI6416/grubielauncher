
const TAGS_KEY = "grubie:versionTags";
const ORDER_KEY = "grubie:versionOrder";

export function loadVersionTags(): Record<string, string[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(TAGS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveVersionTags(tags: Record<string, string[]>): void {
  try {
    localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
  } catch {}
}

export function loadManualOrder(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveManualOrder(order: string[]): void {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {}
}

export function renameVersionOrganizeKey(
  oldKey: string,
  newKey: string,
): string[] {
  const order = loadManualOrder();
  if (!oldKey || !newKey || oldKey === newKey) return order;

  const idx = order.indexOf(oldKey);
  if (idx !== -1) {
    order[idx] = newKey;
    saveManualOrder(order);
  }

  const tags = loadVersionTags();
  if (oldKey in tags) {
    tags[newKey] = tags[oldKey];
    delete tags[oldKey];
    saveVersionTags(tags);
  }

  return order;
}
