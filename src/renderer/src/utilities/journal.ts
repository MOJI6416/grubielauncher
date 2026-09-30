import type { JournalLevel, JournalUiEntry } from "@/types/Journal";

const FLUSH_DELAY_MS = 400;
const MAX_BATCH = 100;
const MAX_QUEUE = 1000;
const MAX_STACK_LINES = 12;

const queue: JournalUiEntry[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let captureInstalled = false;

function send(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;

  const batch = queue.splice(0, MAX_BATCH);
  try {
    window.api?.journal?.write(batch);
  } catch {}

  if (queue.length > 0) schedule();
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(send, FLUSH_DELAY_MS);
}

function toPlain(data: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  } catch {
    return { unserializable: true };
  }
}

function push(
  level: JournalLevel,
  scope: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  queue.push({
    t: Date.now(),
    l: level,
    s: scope,
    m: message,
    ...(data ? { d: toPlain(data) } : {}),
  });

  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  if (queue.length >= MAX_BATCH) send();
  else schedule();
}

export function describeUiError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const anyError = error as Error & { code?: unknown; status?: unknown };
    return {
      name: error.name,
      message: error.message,
      code: typeof anyError.code === "string" ? anyError.code : undefined,
      status: typeof anyError.status === "number" ? anyError.status : undefined,
      stack: error.stack?.split("\n").slice(0, MAX_STACK_LINES).join("\n"),
    };
  }

  if (error && typeof error === "object") return toPlain(error as Record<string, unknown>);
  return { message: String(error) };
}

export const uiJournal = {
  debug(scope: string, message: string, data?: Record<string, unknown>) {
    push("debug", scope, message, data);
  },
  info(scope: string, message: string, data?: Record<string, unknown>) {
    push("info", scope, message, data);
  },
  warn(scope: string, message: string, data?: Record<string, unknown>) {
    push("warn", scope, message, data);
  },
  error(scope: string, message: string, data?: Record<string, unknown>) {
    push("error", scope, message, data);
  },
  failure(
    scope: string,
    message: string,
    error: unknown,
    data?: Record<string, unknown>,
  ) {
    push("error", scope, message, { ...data, error: describeUiError(error) });
  },
  flush: send,
};

export function installUiErrorCapture(): void {
  if (captureInstalled) return;
  captureInstalled = true;

  window.addEventListener("error", (event) => {
    uiJournal.error("error", "uncaught error", {
      message: event.message,
      source: event.filename
        ? `${event.filename.split(/[?#]/)[0]}:${event.lineno}:${event.colno}`
        : undefined,
      error: event.error ? describeUiError(event.error) : undefined,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    uiJournal.error("error", "unhandled promise rejection", {
      error: describeUiError(event.reason),
    });
  });

  window.addEventListener("online", () => uiJournal.info("net", "browser online"));
  window.addEventListener("offline", () => uiJournal.warn("net", "browser offline"));
  window.addEventListener("pagehide", send);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") send();
  });

  document.addEventListener(
    "click",
    (event) => {
      const label = describeClickTarget(event.target);
      if (label) uiJournal.info("click", label);
    },
    { capture: true, passive: true },
  );

  watchBlankWindow();
}

const CLICKABLE =
  'button, a, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="switch"], input, select, summary, label';
const MAX_LABEL_CHARS = 80;

export function describeClickTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;

  const element = target.closest(CLICKABLE);
  if (!element) return null;

  if (element instanceof HTMLInputElement && element.type !== "checkbox" && element.type !== "radio") {
    return `${element.type || "text"} field${element.name ? ` ${element.name}` : ""}`;
  }

  const text =
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    (element as HTMLElement).innerText ||
    element.textContent ||
    "";
  const label = text.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_CHARS);
  const role = element.getAttribute("role") || element.tagName.toLowerCase();

  return label ? `${role}: ${label}` : role;
}

const BLANK_CHECK_MS = 5000;

export function isWindowBlank(root: Element | null, body: HTMLElement | null): boolean {
  if (!root || !body) return true;
  if (root.childElementCount === 0) return true;
  return (root.textContent ?? "").trim().length === 0;
}

function watchBlankWindow(): void {
  let reported = false;

  window.setInterval(() => {
    if (document.visibilityState !== "visible") return;

    const root = document.getElementById("root");
    const blank = isWindowBlank(root, document.body);

    if (blank && !reported) {
      reported = true;
      uiJournal.error("ui", "window content is blank", {
        rootChildren: root?.childElementCount ?? null,
        bodyChildren: document.body?.childElementCount ?? null,
        size: `${window.innerWidth}x${window.innerHeight}`,
        url: location.pathname,
      });
      send();
    } else if (!blank && reported) {
      reported = false;
      uiJournal.info("ui", "window content is back");
    }
  }, BLANK_CHECK_MS);
}
