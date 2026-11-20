import type {
  CompanionSession,
  CompanionSupport,
} from "@/shared/companion";
import { check, handleSafe } from "../utilities/ipc";
import { assertWritablePath } from "../utilities/safePath";
import { isVersionRunning } from "../utilities/worldBackups";
import { gameRuntime } from "../utilities/runtime";
import { countUsage } from "../utilities/usageStats";
import { mainWindow } from "../windows/mainWindow";
import { lanShareService } from "../share";
import { companionBridge } from "../companion/bridge";
import { companionSupport, syncCompanionMod } from "../companion/companionMod";
import {
  guestFromKey,
  hostMessageFor,
  sanitizeToasts,
} from "../companion/protocol";

const isPath = check.nonEmptyString(4096);
const isName = check.nonEmptyString(255);
const isShort = check.nonEmptyString(64);

function send(channel: string, ...args: unknown[]) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }
  try {
    mainWindow.webContents.send(channel, ...args);
  } catch {}
}

function pushHost(session?: Pick<CompanionSession, "versionName" | "instance">) {
  const state = lanShareService.getState();
  const peers = lanShareService.getPeers();
  const targets = session ? [session] : companionBridge.sessions();
  for (const target of targets) {
    companionBridge.setHost(
      target.versionName,
      target.instance,
      hostMessageFor(target, state, peers),
    );
  }
}

function wireCompanion() {
  companionBridge.on("status", (sessions) => send("companion:status", sessions));
  companionBridge.on("connected", (session) => pushHost(session));
  companionBridge.on("accept", (id) => {
    countUsage("companion.accept");
    send("companion:accept", id);
  });
  companionBridge.on("kick", (key, session) => {
    const state = lanShareService.getState();
    if (
      !state.sessionId ||
      state.target?.versionName !== session.versionName ||
      state.target?.instance !== session.instance
    ) {
      return;
    }
    const guest = guestFromKey(key, lanShareService.getPeers());
    if (!guest) return;
    countUsage("companion.kick");
    void lanShareService.kickGuest(guest).catch((error) => {
      console.warn("[companion] kick failed:", error);
    });
  });

  lanShareService.on("stateChanged", () => pushHost());
  lanShareService.on("peersChanged", () => pushHost());
  gameRuntime.on("close", (event) =>
    companionBridge.unregister(event.versionName, event.instance),
  );
}

export function registerCompanionIpc() {
  wireCompanion();

  handleSafe<CompanionSupport, [string, string]>(
    "companion:support",
    { supported: false, version: null },
    [isShort, isShort],
    (_, minecraft, loader) => companionSupport(minecraft, loader),
  );

  handleSafe<boolean, [string, boolean, string, string]>(
    "companion:sync",
    false,
    [isPath, check.boolean(), isShort, isShort],
    async (_, versionPath, enabled, minecraft, loader) => {
      assertWritablePath(versionPath, "companion:sync");
      if (isVersionRunning(versionPath)) return false;
      const installed = await syncCompanionMod(versionPath, {
        companionMod: enabled,
        version: { id: minecraft },
        loader: { name: loader },
      });
      return Boolean(installed);
    },
  );

  handleSafe<CompanionSession[]>("companion:sessions", [], () =>
    companionBridge.sessions(),
  );

  handleSafe<void, [unknown[]]>(
    "companion:setToasts",
    undefined,
    [check.arrayOf(check.object(16), 16)],
    (_, items) => companionBridge.setToasts(sanitizeToasts(items)),
  );

  handleSafe<boolean, [string, number, string, string]>(
    "companion:connect",
    false,
    [isName, check.integer(), check.nonEmptyString(255), isName],
    (_, versionName, instance, address, name) =>
      companionBridge.connect(versionName, instance, address, name),
  );
}
