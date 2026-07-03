import { BrowserWindow } from "electron";
import { uIOhook, UiohookKey } from "uiohook-napi";
import { VoicePttBind } from "@/types/Settings";

type PttInput = {
  type: "key" | "mouse";
  code: number;
};

const CAPTURE_TIMEOUT_MS = 10_000;
const MIN_CAPTURE_MOUSE_BUTTON = 3;

const KEY_LABELS = new Map<number, string>(
  Object.entries(UiohookKey).map(([name, code]) => [code as number, name]),
);

let listenersAttached = false;
let hookStarted = false;
let activeBind: PttInput | null = null;
let isPressed = false;
let captureResolve: ((bind: VoicePttBind | null) => void) | null = null;
let captureTimeout: NodeJS.Timeout | null = null;

function labelFor(input: PttInput): string {
  if (input.type === "mouse") return `Mouse ${input.code}`;
  return KEY_LABELS.get(input.code) || `Key ${input.code}`;
}

function matchesBind(input: PttInput): boolean {
  return (
    !!activeBind &&
    activeBind.type === input.type &&
    activeBind.code === input.code
  );
}

function broadcast(channel: string) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel);
  }
}

function finishCapture(bind: VoicePttBind | null) {
  const resolve = captureResolve;
  captureResolve = null;
  if (captureTimeout) {
    clearTimeout(captureTimeout);
    captureTimeout = null;
  }
  resolve?.(bind);
  maybeStopHook();
}

function handleDown(input: PttInput) {
  if (captureResolve) {
    if (input.type === "key" && input.code === UiohookKey.Escape) {
      finishCapture(null);
      return;
    }
    if (input.type === "mouse" && input.code < MIN_CAPTURE_MOUSE_BUTTON) {
      return;
    }

    finishCapture({
      type: input.type,
      code: input.code,
      label: labelFor(input),
    });
    return;
  }

  if (matchesBind(input) && !isPressed) {
    isPressed = true;
    broadcast("voice:pttDown");
  }
}

function handleUp(input: PttInput) {
  if (matchesBind(input) && isPressed) {
    isPressed = false;
    broadcast("voice:pttUp");
  }
}

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  uIOhook.on("keydown", (event) => {
    handleDown({ type: "key", code: event.keycode });
  });
  uIOhook.on("keyup", (event) => {
    handleUp({ type: "key", code: event.keycode });
  });
  uIOhook.on("mousedown", (event) => {
    handleDown({ type: "mouse", code: event.button as number });
  });
  uIOhook.on("mouseup", (event) => {
    handleUp({ type: "mouse", code: event.button as number });
  });
}

function ensureHook(): boolean {
  attachListeners();
  if (hookStarted) return true;

  try {
    uIOhook.start();
    hookStarted = true;
    return true;
  } catch (error) {
    console.error("[PushToTalk] Failed to start input hook:", error);
    return false;
  }
}

function maybeStopHook() {
  if (activeBind || captureResolve || !hookStarted) return;

  try {
    uIOhook.stop();
  } catch (error) {
    console.error("[PushToTalk] Failed to stop input hook:", error);
  }
  hookStarted = false;
}

export function setPttBind(bind: PttInput | null) {
  if (isPressed) {
    isPressed = false;
    broadcast("voice:pttUp");
  }

  activeBind = bind ? { type: bind.type, code: bind.code } : null;

  if (activeBind) {
    ensureHook();
  } else {
    maybeStopHook();
  }
}

export function capturePttBind(): Promise<VoicePttBind | null> {
  if (captureResolve) finishCapture(null);

  if (!ensureHook()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    captureResolve = resolve;
    captureTimeout = setTimeout(() => finishCapture(null), CAPTURE_TIMEOUT_MS);
  });
}

export function disposePushToTalk() {
  if (captureResolve) finishCapture(null);
  activeBind = null;
  isPressed = false;

  if (hookStarted) {
    try {
      uIOhook.stop();
    } catch (error) {
      console.error("[PushToTalk] Failed to stop input hook:", error);
    }
    hookStarted = false;
  }
}
