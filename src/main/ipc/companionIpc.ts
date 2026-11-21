import path from "path";
import type {
  CompanionPlaceKind,
  CompanionSession,
  CompanionSupport,
} from "@/shared/companion";
import type { UsageFeature } from "@/shared/usageFeatures";
import { check, handleSafe } from "../utilities/ipc";
import { assertWritablePath } from "../utilities/safePath";
import { isVersionRunning } from "../utilities/worldBackups";
import { gameRuntime } from "../utilities/runtime";
import { countUsage } from "../utilities/usageStats";
import { mainWindow } from "../windows/mainWindow";
import { lanShareService } from "../share";
import { companionBridge } from "../companion/bridge";
import { companionSupport, syncCompanionMod } from "../companion/companionMod";
import { scheduleCompanionManifestRefresh } from "../companion/companionCdn";
import {
  guestFromKey,
  hostMessageFor,
  sanitizeFriends,
  sanitizeToasts,
  sanitizeVoice,
} from "../companion/protocol";
import { createAvatarSource } from "../companion/avatars";
import {
  type CompanionGameHost,
  handleGameMessage,
  stopGame,
  watchScreenshots,
} from "../companion/game";
import { pushToTalkFromGame } from "../services/PushToTalk";

const isPath = check.nonEmptyString(4096);
const isName = check.nonEmptyString(255);
const isPlaceKind = check.oneOf("world", "server");
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

const gameHost: CompanionGameHost = {
  result: (session, req, ok, error) =>
    void companionBridge.result(session.versionName, session.instance, req, ok, error),
  toRenderer: (channel, payload) => send(channel, payload),
  pushScreenshot: (session, file) =>
    companionBridge.pushToast(session.versionName, session.instance, {
      id: file,
      kind: "screenshot",
      title: path.basename(file),
      body: "",
      count: 1,
      actionable: false,
    }),
  count: (feature) => countUsage(feature as UsageFeature),
  pttFromGame: (down) => pushToTalkFromGame(down),
};

function wireCompanion() {
  companionBridge.setAvatarSource(createAvatarSource());
  companionBridge.on("status", (sessions) => send("companion:status", sessions));
  companionBridge.on("connected", (session) => {
    pushHost(session);
    watchScreenshots(session, gameHost);
  });
  companionBridge.on("message", (message, session) =>
    handleGameMessage(message, session, gameHost),
  );
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
  gameRuntime.on("close", (event) => {
    stopGame(event);
    companionBridge.unregister(event.versionName, event.instance);
  });
}

export function registerCompanionIpc() {
  wireCompanion();
  scheduleCompanionManifestRefresh();

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

  handleSafe<void, [unknown]>(
    "companion:setSelf",
    undefined,
    [check.any()],
    (_, value) => {
      const record = value as { id?: unknown; name?: unknown } | null;
      companionBridge.setSelf(
        record && typeof record.id === "string" && typeof record.name === "string"
          ? { id: record.id.slice(0, 64), name: record.name.slice(0, 64) }
          : null,
      );
    },
  );

  handleSafe<void, [unknown]>(
    "companion:setFriends",
    undefined,
    [check.object(8)],
    (_, value) => companionBridge.setFriends(sanitizeFriends(value)),
  );

  handleSafe<void, [unknown]>(
    "companion:setVoice",
    undefined,
    [check.object(16)],
    (_, value) => companionBridge.setVoice(sanitizeVoice(value)),
  );

  handleSafe<boolean, [string, number, string, boolean, string | undefined]>(
    "companion:result",
    false,
    [isName, check.integer(), isShort, check.boolean(), check.optional(isShort)],
    (_, versionName, instance, req, ok, error) =>
      companionBridge.result(versionName, instance, req, ok, error),
  );

  handleSafe<void, [string, number, unknown]>(
    "companion:pushToast",
    undefined,
    [isName, check.integer(), check.object(16)],
    (_, versionName, instance, value) => {
      const [toast] = sanitizeToasts([value]);
      if (toast) companionBridge.pushToast(versionName, instance, toast);
    },
  );

  handleSafe<boolean, [string, number, string, string, CompanionPlaceKind | undefined]>(
    "companion:connect",
    false,
    [isName, check.integer(), check.nonEmptyString(255), isName, check.optional(isPlaceKind)],
    (_, versionName, instance, address, name, kind) =>
      companionBridge.connect(versionName, instance, address, name, kind ?? "server"),
  );

  handleSafe<void, [string, string, string, CompanionPlaceKind]>(
    "companion:expectPlace",
    undefined,
    [isName, check.nonEmptyString(255), isName, isPlaceKind],
    (_, versionName, address, name, kind) =>
      companionBridge.expectPlace(versionName, { address, name, kind }),
  );
}
