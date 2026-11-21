import { pickEntry, pickSpatial, type Box, type Direction } from "./spatial";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

const LAYER = [
  "[role='dialog']",
  "[role='alertdialog']",
  "[role='menu']",
  "[data-radix-popper-content-wrapper]",
].join(",");

const SCOPE = "[data-gamepad-scope]";
const ROW = "[data-gamepad-row]";
const ROW_CURRENT = "[data-gamepad-current]";

const COMPOSITE_ALL_AXES = [
  "[role='menu']",
  "[role='menubar']",
  "[role='listbox']",
  "[role='tree']",
  "[role='grid']",
  "[cmdk-root]",
].join(",");

const COMPOSITE_ONE_AXIS = [
  "[role='tablist']",
  "[role='radiogroup']",
  "[role='toolbar']",
  "[role='slider']",
].join(",");

const TEXT_INPUT =
  "textarea, [contenteditable='true'], input:not([type]), input[type='text'], input[type='search'], input[type='email'], input[type='password'], input[type='url'], input[type='number'], input[type='tel']";

const OPENS_ON_KEY =
  "[role='option'], [role='combobox'], [aria-haspopup='menu'], [aria-haspopup='listbox'], [aria-haspopup='true']";

const CLICKS_NATIVELY =
  "button, a[href], summary, input[type='checkbox'], input[type='radio'], input[type='submit'], input[type='button'], [role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio'], [role='tab'], [role='radio'], [role='switch'], [role='checkbox']";

const ARROW_KEYS: Record<Direction, string> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};

function toBox(rect: DOMRect): Box {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  };
}

function isShown(element: HTMLElement): boolean {
  if (element.closest("[inert], [aria-hidden='true']")) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  const style = getComputedStyle(element);
  return style.visibility !== "hidden" && style.pointerEvents !== "none";
}

function isLayerOpen(layer: Element): boolean {
  if (layer.querySelector("[role='tooltip']")) return false;
  if (layer instanceof HTMLElement && !isShown(layer)) return false;
  return layer.getAttribute("data-state") !== "closed";
}

function outermostLayer(layer: Element): Element {
  let current = layer;
  for (
    let parent = current.parentElement?.closest(LAYER);
    parent;
    parent = current.parentElement?.closest(LAYER)
  ) {
    current = parent;
  }
  return current;
}

export function topLayer(): Element | null {
  const layers = [...document.querySelectorAll(LAYER)].filter(isLayerOpen);
  const last = layers.at(-1);
  return last ? outermostLayer(last) : null;
}

export function activeScope(): Element {
  const layer = topLayer();
  if (layer) return layer;
  const scopes = [...document.querySelectorAll<HTMLElement>(SCOPE)].filter(
    isShown,
  );
  return scopes.at(-1) ?? document.body;
}

export function focusables(scope: Element): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isShown);
}

function currentFocus(scope: Element): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  return scope.contains(active) ? active : null;
}

export function focusElement(element: HTMLElement): void {
  element.focus({ preventScroll: true, focusVisible: true } as FocusOptions);
  element.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function dispatchKey(target: Element, key: string): boolean {
  const event = new KeyboardEvent("keydown", {
    key,
    code: key === " " ? "Space" : key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  target.dispatchEvent(
    new KeyboardEvent("keyup", { key, code: event.code, bubbles: true }),
  );
  return event.defaultPrevented;
}

function axisOf(container: Element): "horizontal" | "vertical" {
  const orientation = container.getAttribute("aria-orientation");
  if (orientation === "horizontal" || orientation === "vertical") {
    return orientation;
  }
  const rect = container.getBoundingClientRect();
  return rect.width >= rect.height ? "horizontal" : "vertical";
}

function handlesArrow(element: HTMLElement, direction: Direction): boolean {
  if (element.closest(COMPOSITE_ALL_AXES)) return true;

  const group = element.closest(COMPOSITE_ONE_AXIS);
  if (!group) return false;
  const vertical = direction === "up" || direction === "down";
  return vertical === (axisOf(group) === "vertical");
}

export function enterScope(scope: Element = activeScope()): HTMLElement | null {
  const candidates = focusables(scope);
  const preferred =
    candidates.find((element) => element.matches("[data-gamepad-entry]")) ??
    candidates.find((element) => element.hasAttribute("autofocus"));
  const target =
    preferred ??
    candidates[
      pickEntry(
        candidates.map((element) => toBox(element.getBoundingClientRect())),
      )
    ];
  if (target) focusElement(target);
  return target ?? null;
}

export function moveFocus(direction: Direction): boolean {
  const scope = activeScope();
  const current = currentFocus(scope);
  if (!current) return enterScope(scope) !== null;

  if (
    handlesArrow(current, direction) &&
    dispatchKey(current, ARROW_KEYS[direction])
  ) {
    const moved = document.activeElement;
    if (moved instanceof HTMLElement && moved !== current) focusElement(moved);
    return true;
  }

  const row = current.closest(ROW);
  const horizontal = direction === "left" || direction === "right";
  const candidates = focusables(scope).filter(
    (element) =>
      element !== current && (!row || !horizontal || row.contains(element)),
  );
  const index = pickSpatial(
    toBox(current.getBoundingClientRect()),
    candidates.map((element) => toBox(element.getBoundingClientRect())),
    direction,
  );
  if (index < 0) return false;

  const target = candidates[index];
  const targetRow = target.closest(ROW);
  const entry =
    targetRow && targetRow !== row
      ? targetRow.querySelector<HTMLElement>(ROW_CURRENT)
      : null;
  focusElement(entry && isShown(entry) ? entry : target);
  return true;
}

export function activateFocus(): boolean {
  const scope = activeScope();
  const current = currentFocus(scope);
  if (!current) return enterScope(scope) !== null;

  if (current.matches(TEXT_INPUT)) {
    dispatchKey(current, "Enter");
    return true;
  }

  if (current.matches(OPENS_ON_KEY) || !current.matches(CLICKS_NATIVELY)) {
    if (dispatchKey(current, "Enter")) return true;
  }

  current.click();
  return true;
}

export function dismissLayer(): boolean {
  const layer = topLayer();
  if (!layer) return false;
  const target = currentFocus(layer) ?? layer;
  dispatchKey(target, "Escape");
  return true;
}

export function openContextMenu(): boolean {
  const current = currentFocus(activeScope());
  if (!current) return false;
  const rect = current.getBoundingClientRect();
  const clientX = rect.left + Math.min(rect.width / 2, 24);
  const clientY = rect.top + rect.height / 2;
  current.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 2,
    }),
  );
  return true;
}

function switchSection(step: 1 | -1): boolean {
  const rows = [
    ...document.querySelectorAll<HTMLElement>("[data-nav-row]"),
  ].filter(
    (row) => isShown(row) && row.getAttribute("aria-disabled") !== "true",
  );
  if (rows.length < 2) return false;
  const current = rows.findIndex(
    (row) => row.getAttribute("aria-current") === "page",
  );
  const next =
    current < 0
      ? rows[step > 0 ? 0 : rows.length - 1]
      : rows[(current + step + rows.length) % rows.length];
  next.click();
  focusElement(next);
  return true;
}

export function switchTab(step: 1 | -1): boolean {
  const scope = activeScope();
  const lists = [
    ...scope.querySelectorAll<HTMLElement>("[role='tablist']"),
  ].filter(isShown);
  const current = currentFocus(scope);
  const list =
    (current && lists.find((candidate) => candidate.contains(current))) ??
    lists[0];
  if (!list) return scope === document.body ? switchSection(step) : false;

  const tabs = [...list.querySelectorAll<HTMLElement>("[role='tab']")].filter(
    (tab) =>
      isShown(tab) &&
      !tab.hasAttribute("disabled") &&
      tab.getAttribute("aria-disabled") !== "true",
  );
  if (tabs.length < 2) return false;

  const selected = tabs.findIndex(
    (tab) => tab.getAttribute("aria-selected") === "true",
  );
  const next = tabs[(Math.max(selected, 0) + step + tabs.length) % tabs.length];
  next.click();
  focusElement(next);
  return true;
}

function scrollableFrom(element: Element | null): HTMLElement | null {
  for (let node = element; node; node = node.parentElement) {
    if (!(node instanceof HTMLElement)) continue;
    const style = getComputedStyle(node);
    const scrolls = style.overflowY === "auto" || style.overflowY === "scroll";
    if (scrolls && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}

export function scrollTarget(): HTMLElement | null {
  const scope = activeScope();
  const fromFocus = scrollableFrom(currentFocus(scope));
  if (fromFocus) return fromFocus;

  const candidates = [
    scope,
    ...scope.querySelectorAll(
      "[class*='overflow-y-auto'], [class*='overflow-auto'], [class*='overflow-y-scroll']",
    ),
  ].filter(
    (node): node is HTMLElement =>
      node instanceof HTMLElement &&
      scrollableFrom(node) === node &&
      isShown(node),
  );
  return (
    candidates.sort(
      (a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight,
    )[0] ?? null
  );
}

export function scrollBy(pixels: number): boolean {
  const target = scrollTarget();
  if (!target) return false;
  target.scrollBy({ top: pixels });
  return true;
}

export function scrollPage(step: 1 | -1): boolean {
  const target = scrollTarget();
  if (!target) return false;
  target.scrollBy({
    top: step * target.clientHeight * 0.85,
    behavior: "smooth",
  });
  return true;
}
