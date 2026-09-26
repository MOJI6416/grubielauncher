import { useEffect, useMemo, useRef } from "react";
import { getDefaultStore, useAtomValue } from "jotai";
import { selectAtom } from "jotai/utils";
import { useTranslation } from "react-i18next";
import { DEFAULT_SETTINGS, resolveCloseToTray } from "@/types/Settings";
import type { TrayAction, TrayLabels } from "@/types/Tray";
import { buildTrayModel } from "@renderer/features/tray/trayModel";
import {
  appUpdateAtom,
  readyVersion,
} from "@renderer/features/appUpdate/appUpdate";
import { runGame } from "@renderer/features/launch/runGame";
import {
  consolesAtom,
  friendSocketAtom,
  groupsAtom,
  settingsAtom,
  versionsAtom,
  voiceCallAtom,
  voiceSessionAtom,
} from "@renderer/stores/atoms";
import {
  voiceDisconnect,
  voiceSetDeafened,
  voiceSetMicMuted,
} from "@renderer/utilities/voiceClient";

const api = window.api;

const trayVoiceAtom = selectAtom(
  voiceSessionAtom,
  (session) => ({
    state: session.state,
    roomId: session.roomId,
    roomName: session.roomName,
    isMicMuted: session.isMicMuted,
    isDeafened: session.isDeafened,
    connectedAt: session.connectedAt,
    participantCount: session.participants.length,
  }),
  (a, b) =>
    a.state === b.state &&
    a.roomId === b.roomId &&
    a.roomName === b.roomName &&
    a.isMicMuted === b.isMicMuted &&
    a.isDeafened === b.isDeafened &&
    a.connectedAt === b.connectedAt &&
    a.participantCount === b.participantCount,
);

async function launchFromTray(versionName: string): Promise<void> {
  const store = getDefaultStore();
  const version = store
    .get(versionsAtom)
    .find((item) => item.version.name === versionName);

  if (!version) {
    void api.other.restoreWindow();
    return;
  }

  await runGame({ version });

  const started = store
    .get(consolesAtom)
    .consoles.some(
      (console) =>
        console.versionName === versionName && console.status === "running",
    );
  if (!started) void api.other.restoreWindow();
}

function answerCall(event: "voiceCallAccept" | "voiceCallDecline"): void {
  const store = getDefaultStore();
  const call = store.get(voiceCallAtom);
  if (call.status !== "incoming" || !call.callId) return;

  store.get(friendSocketAtom)?.emit(event, { callId: call.callId });
}

export function TrayHost() {
  const { t, i18n } = useTranslation();
  const versions = useAtomValue(versionsAtom);
  const consoles = useAtomValue(consolesAtom);
  const session = useAtomValue(trayVoiceAtom);
  const call = useAtomValue(voiceCallAtom);
  const groups = useAtomValue(groupsAtom);
  const settings = useAtomValue(settingsAtom);
  const updateVersion = readyVersion(useAtomValue(appUpdateAtom));
  const lastPushed = useRef("");

  const labels = useMemo<TrayLabels>(
    () => ({
      open: t("tray.open"),
      play: t("tray.play"),
      running: t("tray.running"),
      voice: t("tray.voice"),
      mute: t("tray.mute"),
      deafen: t("tray.deafen"),
      leave: t("tray.leave"),
      incoming: t("tray.incoming"),
      accept: t("tray.accept"),
      decline: t("tray.decline"),
      quit: t("tray.quit"),
      installUpdate: updateVersion
        ? t("tray.installUpdate", { version: updateVersion })
        : "",
      playing: t("tray.playing"),
      hintTitle: t("tray.hintTitle"),
      hintBody: t("tray.hintBody"),
    }),
    [t, i18n.language, updateVersion],
  );

  const model = useMemo(
    () =>
      buildTrayModel({
        lang: i18n.language,
        accent: settings.accent,
        instances: versions.map((item) => ({
          name: item.version.name,
          installed: item.hasManifest,
          lastLaunch: item.version.lastLaunch ?? null,
          image: item.version.image || null,
          minecraft: item.version.version.id,
          loader: item.version.loader.name,
        })),
        running: consoles.consoles
          .filter((console) => console.status === "running")
          .map((console) => console.versionName),
        session,
        call,
        groupNames: new Map(groups.map((group) => [group._id, group.name])),
        closeToTray: resolveCloseToTray(settings.closeToTray, api.platform),
        updateVersion,
        labels,
      }),
    [
      call,
      consoles,
      groups,
      i18n.language,
      labels,
      session,
      settings.accent,
      settings.closeToTray,
      updateVersion,
      versions,
    ],
  );

  const isLoaded = settings !== DEFAULT_SETTINGS;

  useEffect(() => {
    if (!isLoaded) return;
    const serialized = JSON.stringify(model);
    if (serialized === lastPushed.current) return;
    lastPushed.current = serialized;
    void api.tray.update(model).catch(() => undefined);
  }, [isLoaded, model]);

  useEffect(
    () =>
      api.tray.onAction((action: TrayAction) => {
        const current = getDefaultStore().get(voiceSessionAtom);

        switch (action.type) {
          case "launch":
            void launchFromTray(action.versionName);
            break;
          case "toggleMute":
            void voiceSetMicMuted(!current.isMicMuted);
            break;
          case "toggleDeafen":
            void voiceSetDeafened(!current.isDeafened);
            break;
          case "leaveVoice":
            void voiceDisconnect();
            break;
          case "acceptCall":
            answerCall("voiceCallAccept");
            break;
          case "declineCall":
            answerCall("voiceCallDecline");
            break;
        }
      }),
    [],
  );

  return null;
}
