import { getDefaultStore } from "jotai";
import { toast } from "sonner";
import type {
  ConnectionQuality,
  LocalAudioTrack,
  Participant,
  RemoteAudioTrack,
  RemoteTrack,
  Room,
} from "livekit-client";
import i18n from "@renderer/i18n";
import { playVoiceSound } from "./sounds";
import { voiceGetSavedDevice, voiceSaveDevice } from "./voiceDevices";

export { voiceGetSavedDevice };
import { settingsAtom, voiceSessionAtom } from "@renderer/stores/atoms";
import { voiceLocalLevelAtom } from "@renderer/features/voice/state";
import {
  clampParticipantVolume,
  DEFAULT_PARTICIPANT_VOLUME,
  levelBucket,
} from "@renderer/features/voice/participants";
import { micIssueFromError } from "@renderer/features/voice/errors";
import {
  INITIAL_VOICE_SESSION,
  IVoiceSessionState,
  IVoiceTokenResponse,
  VoiceQuality,
} from "@/types/Voice";

const VOLUMES_STORAGE_KEY = "voice.volumes";
const LOCAL_MUTES_STORAGE_KEY = "voice.localMutes";
const LEVEL_SAMPLE_MS = 150;
const PTT_RELEASE_DELAY_MS = 180;
const DEVICE_CHANGE_DEBOUNCE_MS = 500;

const api = window.api;
const store = getDefaultStore();

type LivekitModule = typeof import("livekit-client");
let livekit: LivekitModule | null = null;

async function loadLivekit(): Promise<LivekitModule> {
  if (!livekit) {
    livekit = await import("livekit-client");
  }
  return livekit;
}

const MAX_STORED_VOLUMES = 200;

let room: Room | null = null;
let micMutedBeforeDeafen = false;
let pttEnabled = false;
let pttPressed = false;
let levelTimer: ReturnType<typeof setInterval> | null = null;
const audioElements = new Map<string, HTMLAudioElement[]>();
const audioTracks = new Map<string, RemoteAudioTrack[]>();
const volumes = new Map<string, number>(loadVolumes());
const localMutes = new Set<string>(loadLocalMutes());
const qualities = new Map<string, VoiceQuality>();

function canTransmitByPtt(): boolean {
  const session = getSession();
  return isInCall() && pttEnabled && !session.isMicMuted && !session.isDeafened;
}

let pttReleaseTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPttRelease() {
  if (!pttReleaseTimer) return;
  clearTimeout(pttReleaseTimer);
  pttReleaseTimer = null;
}

api.voice.onPttDown(() => {
  const wasPressed = pttPressed;
  cancelPttRelease();
  pttPressed = true;
  if (!wasPressed && canTransmitByPtt()) playVoiceSound("pttOn");
  if (isInCall()) setSession({ pttPressed: true });
  void applyMicState();
});

api.voice.onPttUp(() => {
  if (!pttPressed) return;
  if (canTransmitByPtt()) playVoiceSound("pttOff");

  cancelPttRelease();
  pttReleaseTimer = setTimeout(() => {
    pttReleaseTimer = null;
    pttPressed = false;
    if (isInCall()) setSession({ pttPressed: false });
    void applyMicState();
  }, PTT_RELEASE_DELAY_MS);
});

store.sub(settingsAtom, () => {
  void syncPtt();
  void syncNoiseSuppression();
});

function isInCall(): boolean {
  return !!room && getSession().state !== "disconnected";
}

let noiseProcessorActive = false;
let pttHookFailureReported = false;
let noiseSuppressionFailed = false;

async function disableNoiseSuppressionAfterFailure(reason: string) {
  noiseProcessorActive = false;
  noiseSuppressionFailed = true;
  setSession({ isNoiseSuppressionActive: false });

  const publication =
    room && livekit
      ? room.localParticipant.getTrackPublication(
          livekit.Track.Source.Microphone,
        )
      : undefined;
  const track = publication?.track as LocalAudioTrack | undefined;
  await track?.stopProcessor().catch(() => undefined);
  await applyMicState();

  console.error("[Voice] RNNoise disabled:", reason);
  toast.error(i18n.t("voice.noiseSuppressionFailed"), { duration: 8000 });
}

async function syncNoiseSuppression() {
  if (!room || !livekit || !isInCall()) return;

  const enabled = store.get(settingsAtom).voiceNoiseSuppression;
  if (!enabled) noiseSuppressionFailed = false;
  if (enabled === noiseProcessorActive) return;
  if (enabled && noiseSuppressionFailed) return;

  const publication = room.localParticipant.getTrackPublication(
    livekit.Track.Source.Microphone,
  );
  const track = publication?.track as LocalAudioTrack | undefined;
  if (!track) return;

  try {
    if (enabled) {
      const { RnnoiseTrackProcessor } = await import("./rnnoiseProcessor");
      const processor = new RnnoiseTrackProcessor((reason) => {
        void disableNoiseSuppressionAfterFailure(reason);
      });
      await track.setProcessor(processor);
      noiseProcessorActive = true;
      setSession({ isNoiseSuppressionActive: true });

      if (store.get(settingsAtom).devMode) {
        toast.info(
          `[devMode] RNNoise on (ctx ${processor.contextSampleRate ?? "?"}Hz)`,
          { duration: 6000 },
        );
      }
    } else {
      await track.stopProcessor();
      noiseProcessorActive = false;
      setSession({ isNoiseSuppressionActive: false });
    }
  } catch (error) {
    console.error("[Voice] Failed to toggle noise suppression:", error);
    const reason = error instanceof Error ? error.message : String(error);
    await disableNoiseSuppressionAfterFailure(reason);
  }
}

async function syncPtt() {
  const settings = store.get(settingsAtom);
  const bind = settings.voicePttBind;
  pttEnabled = Boolean(settings.voicePtt && bind);

  if (!isInCall()) return;

  if (pttEnabled && bind) {
    const hookReady = await api.voice
      .setPtt({ type: bind.type, code: bind.code })
      .catch(() => false);

    if (!hookReady) {
      pttEnabled = false;
      pttPressed = false;
      await api.voice.setPtt(null).catch(() => undefined);

      if (!pttHookFailureReported) {
        pttHookFailureReported = true;
        toast.error(i18n.t("voice.pttUnavailable"), { duration: 8000 });
      }
    } else {
      pttHookFailureReported = false;
    }
  } else {
    pttPressed = false;
    await api.voice.setPtt(null).catch(() => undefined);
  }

  setSession({
    pttEnabled,
    pttPressed,
    pttBindLabel: pttEnabled ? (bind?.label ?? "") : "",
  });

  await applyMicState();
}

async function applyMicState() {
  if (!room) return;

  const session = getSession();
  const shouldEnable =
    !session.isMicMuted && !session.isDeafened && (!pttEnabled || pttPressed);

  try {
    await room.localParticipant.setMicrophoneEnabled(shouldEnable);
    if (shouldEnable && getSession().micIssue !== "none") {
      setSession({ micIssue: "none" });
    }
  } catch (error) {
    console.error("[Voice] Failed to apply microphone state:", error);

    if (shouldEnable) {
      setSession({ micIssue: micIssueFromError(error) });
    }
  }

  syncParticipants();
}

function loadVolumes(): [string, number][] {
  try {
    const raw = localStorage.getItem(VOLUMES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Object.entries(parsed).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && entry[1] >= 0 && entry[1] <= 2,
    );
  } catch {
    return [];
  }
}

function saveVolumes() {
  try {
    const entries = [...volumes].filter(
      ([, volume]) => volume !== DEFAULT_PARTICIPANT_VOLUME,
    );

    localStorage.setItem(
      VOLUMES_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(entries.slice(-MAX_STORED_VOLUMES))),
    );
  } catch {
    return;
  }
}

function loadLocalMutes(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_MUTES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function saveLocalMutes() {
  try {
    localStorage.setItem(
      LOCAL_MUTES_STORAGE_KEY,
      JSON.stringify([...localMutes].slice(-MAX_STORED_VOLUMES)),
    );
  } catch {
    return;
  }
}

function getSession(): IVoiceSessionState {
  return store.get(voiceSessionAtom);
}

function setSession(update: Partial<IVoiceSessionState>) {
  store.set(voiceSessionAtom, { ...getSession(), ...update });
}

function getVolume(identity: string): number {
  return volumes.get(identity) ?? DEFAULT_PARTICIPANT_VOLUME;
}

function applyTrackVolume(identity: string) {
  const silenced = getSession().isDeafened || localMutes.has(identity);
  const effective = silenced ? 0 : getVolume(identity);
  for (const track of audioTracks.get(identity) || []) {
    track.setVolume(effective);
  }
}

function applyTrackSubscriptions() {
  if (!room || !livekit) return;

  const subscribed = !getSession().isDeafened;
  const audioKind = livekit.Track.Kind.Audio;

  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.trackPublications.values()) {
      if (publication.kind !== audioKind) continue;
      publication.setSubscribed(subscribed);
    }
  }
}

function readQuality(participant: Participant): VoiceQuality {
  return (
    qualities.get(participant.identity) ??
    (participant.connectionQuality as VoiceQuality | undefined) ??
    "unknown"
  );
}

function syncParticipants() {
  if (
    !room ||
    !livekit ||
    room.state === livekit.ConnectionState.Disconnected
  ) {
    setSession({ participants: [], isTransmitting: false });
    return;
  }

  const local = room.localParticipant;

  setSession({
    isTransmitting: local.isMicrophoneEnabled && !getSession().isMicMuted,
    quality: readQuality(local),
    participants: [
      {
        identity: local.identity,
        name: local.name || local.identity,
        isLocal: true,
        isSpeaking: local.isSpeaking,
        isMuted: !local.isMicrophoneEnabled,
        volume: DEFAULT_PARTICIPANT_VOLUME,
        isLocallyMuted: false,
        quality: readQuality(local),
      },
      ...[...room.remoteParticipants.values()].map((participant) => ({
        identity: participant.identity,
        name: participant.name || participant.identity,
        isLocal: false,
        isSpeaking: participant.isSpeaking,
        isMuted: !participant.isMicrophoneEnabled,
        volume: getVolume(participant.identity),
        isLocallyMuted: localMutes.has(participant.identity),
        quality: readQuality(participant),
      })),
    ],
  });
}

function removeAudioElements() {
  for (const elements of audioElements.values()) {
    for (const element of elements) element.remove();
  }
  audioElements.clear();
  audioTracks.clear();
}

function startLevelSampling() {
  stopLevelSampling();

  levelTimer = setInterval(() => {
    if (!room) return;
    const next = levelBucket(room.localParticipant.audioLevel);
    if (store.get(voiceLocalLevelAtom) !== next) {
      store.set(voiceLocalLevelAtom, next);
    }
  }, LEVEL_SAMPLE_MS);
}

function stopLevelSampling() {
  if (levelTimer) clearInterval(levelTimer);
  levelTimer = null;
  if (store.get(voiceLocalLevelAtom) !== 0) store.set(voiceLocalLevelAtom, 0);
}

function releaseRoomResources() {
  flushParticipantVolumes();
  micMutedBeforeDeafen = false;
  cancelPttRelease();
  pttPressed = false;
  noiseProcessorActive = false;
  noiseSuppressionFailed = false;
  qualities.clear();
  stopLevelSampling();
  removeAudioElements();
}

function cleanup() {
  const previousState = getSession().state;
  if (previousState === "connected" || previousState === "reconnecting") {
    playVoiceSound("leave");
  }

  releaseRoomResources();
  room = null;
  void api.voice.setPtt(null).catch(() => undefined);
  void api.voice.setSessionActive(false).catch(() => undefined);
  store.set(voiceSessionAtom, INITIAL_VOICE_SESSION);
}

async function applySavedOutputDevice(targetRoom: Room) {
  const outputId = voiceGetSavedDevice("audiooutput");
  if (outputId) {
    await targetRoom
      .switchActiveDevice("audiooutput", outputId)
      .catch(() => undefined);
  }
}

export async function voiceConnect(
  grant: IVoiceTokenResponse,
  info: { roomId: string; roomName: string; isRoomOwner: boolean },
) {
  if (!grant?.token || !grant?.url) {
    throw new Error("no_token");
  }

  const lk = await loadLivekit();
  const { RoomEvent, Track } = lk;

  const previousRoom = room;
  const previousSession = getSession();

  const inputDeviceId = voiceGetSavedDevice("audioinput");
  const nextRoom = new lk.Room({
    webAudioMix: true,
    ...(inputDeviceId
      ? { audioCaptureDefaults: { deviceId: { ideal: inputDeviceId } } }
      : {}),
  });

  store.set(voiceSessionAtom, {
    ...INITIAL_VOICE_SESSION,
    state: "connecting",
    roomId: info.roomId,
    roomName: info.roomName,
    isRoomOwner: info.isRoomOwner,
  });

  nextRoom
    .on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, publication, participant) => {
        if (room !== nextRoom) return;
        if (track.kind !== Track.Kind.Audio) return;
        if (getSession().isDeafened) {
          publication.setSubscribed(false);
          return;
        }

        const element = track.attach();
        document.body.appendChild(element);
        const existing = audioElements.get(participant.identity) || [];
        audioElements.set(participant.identity, [...existing, element]);

        const audioTrack = track as RemoteAudioTrack;
        const existingTracks = audioTracks.get(participant.identity) || [];
        audioTracks.set(participant.identity, [...existingTracks, audioTrack]);
        applyTrackVolume(participant.identity);
      },
    )
    .on(
      RoomEvent.TrackUnsubscribed,
      (track: RemoteTrack, _pub, participant) => {
        const detached = track.detach();
        detached.forEach((element) => element.remove());
        const remaining = (
          audioElements.get(participant.identity) || []
        ).filter((element) => !detached.includes(element));
        if (remaining.length > 0) {
          audioElements.set(participant.identity, remaining);
        } else {
          audioElements.delete(participant.identity);
        }

        const remainingTracks = (
          audioTracks.get(participant.identity) || []
        ).filter((candidate) => candidate !== track);
        if (remainingTracks.length > 0) {
          audioTracks.set(participant.identity, remainingTracks);
        } else {
          audioTracks.delete(participant.identity);
        }
      },
    )
    .on(RoomEvent.ParticipantConnected, () => {
      if (room !== nextRoom) return;
      syncParticipants();
      if (!getSession().isDeafened) playVoiceSound("join");
    })
    .on(RoomEvent.ParticipantDisconnected, (participant) => {
      if (room !== nextRoom) return;
      qualities.delete(participant.identity);
      syncParticipants();
      if (!getSession().isDeafened) playVoiceSound("leave");
    })
    .on(
      RoomEvent.ConnectionQualityChanged,
      (quality: ConnectionQuality, participant: Participant) => {
        if (room !== nextRoom) return;
        qualities.set(participant.identity, quality as VoiceQuality);
        syncParticipants();
      },
    )
    .on(RoomEvent.ActiveSpeakersChanged, () => {
      if (room !== nextRoom) return;
      syncParticipants();
    })
    .on(RoomEvent.TrackMuted, () => {
      if (room !== nextRoom) return;
      syncParticipants();
    })
    .on(RoomEvent.TrackUnmuted, () => {
      if (room !== nextRoom) return;
      syncParticipants();
    })
    .on(RoomEvent.LocalTrackPublished, () => {
      if (room !== nextRoom) return;
      syncParticipants();
    })
    .on(RoomEvent.MediaDevicesError, (error: Error) => {
      if (room !== nextRoom) return;
      setSession({ micIssue: micIssueFromError(error) });
    })
    .on(RoomEvent.Reconnecting, () => {
      if (room !== nextRoom) return;
      setSession({ state: "reconnecting" });
    })
    .on(RoomEvent.Reconnected, () => {
      if (room !== nextRoom) return;
      setSession({ state: "connected" });
      syncParticipants();
      void applyMicState();
      void syncNoiseSuppression();
    })
    .on(RoomEvent.Disconnected, () => {
      if (room !== nextRoom) return;
      cleanup();
    });

  try {
    await nextRoom.connect(grant.url, grant.token);
  } catch (error) {
    await nextRoom.disconnect().catch(() => undefined);

    if (previousRoom) {
      store.set(voiceSessionAtom, previousSession);
      syncParticipants();
    } else {
      store.set(voiceSessionAtom, INITIAL_VOICE_SESSION);
    }

    throw error;
  }

  room = nextRoom;
  if (previousRoom) {
    releaseRoomResources();
    await previousRoom.disconnect().catch(() => undefined);
  }

  let micIssue: IVoiceSessionState["micIssue"] = "none";
  try {
    await nextRoom.localParticipant.setMicrophoneEnabled(true);
  } catch (error) {
    micIssue = micIssueFromError(error);
    console.error("[Voice] Failed to enable microphone:", error);
  }
  await applySavedOutputDevice(nextRoom);

  if (room !== nextRoom) return;
  setSession({
    state: "connected",
    connectedAt: Date.now(),
    micIssue,
    isMicMuted: micIssue !== "none",
  });
  playVoiceSound("join");
  void api.voice.setSessionActive(true).catch(() => undefined);
  startLevelSampling();
  await syncPtt();
  await syncNoiseSuppression();
  syncParticipants();
}

export async function voiceDisconnect() {
  const current = room;
  cleanup();
  if (current) await current.disconnect().catch(() => undefined);
}

export async function voiceRetryMic() {
  if (!room) return;

  setSession({ micIssue: "none", isMicMuted: false });
  await applyMicState();

  if (getSession().micIssue === "none") {
    await syncNoiseSuppression();
  }
}

export async function voiceSetMicMuted(muted: boolean) {
  if (!room) return;
  if (getSession().isMicMuted !== muted) {
    playVoiceSound(muted ? "mute" : "unmute");
  }
  if (getSession().isDeafened) {
    micMutedBeforeDeafen = muted;

    if (!muted) {
      await voiceSetDeafened(false);
      return;
    }
  }
  setSession({ isMicMuted: muted });
  await applyMicState();
}

export async function voiceSetDeafened(deafened: boolean) {
  if (!room) return;

  if (deafened) {
    micMutedBeforeDeafen = getSession().isMicMuted;
    setSession({ isDeafened: true, isMicMuted: true });
  } else {
    setSession({ isDeafened: false, isMicMuted: micMutedBeforeDeafen });
  }

  for (const identity of audioTracks.keys()) {
    applyTrackVolume(identity);
  }

  applyTrackSubscriptions();

  await applyMicState();
}

let saveVolumesTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSaveVolumes() {
  if (saveVolumesTimer) clearTimeout(saveVolumesTimer);

  saveVolumesTimer = setTimeout(() => {
    saveVolumesTimer = null;
    saveVolumes();
  }, 300);
}

export function flushParticipantVolumes() {
  if (!saveVolumesTimer) return;

  clearTimeout(saveVolumesTimer);
  saveVolumesTimer = null;
  saveVolumes();
}

export function voiceSetParticipantVolume(identity: string, volume: number) {
  const clamped = clampParticipantVolume(volume);
  volumes.delete(identity);
  volumes.set(identity, clamped);
  scheduleSaveVolumes();
  applyTrackVolume(identity);
  syncParticipants();
}

export function voiceSetParticipantMuted(identity: string, muted: boolean) {
  if (muted) {
    localMutes.add(identity);
  } else {
    localMutes.delete(identity);
  }
  saveLocalMutes();
  applyTrackVolume(identity);
  syncParticipants();
}

export type VoiceDeviceListing = {
  devices: MediaDeviceInfo[];
  error: unknown;
};

export async function voiceGetDevices(
  kind: "audioinput" | "audiooutput",
): Promise<VoiceDeviceListing> {
  try {
    const lk = await loadLivekit();
    return { devices: await lk.Room.getLocalDevices(kind, true), error: null };
  } catch (error) {
    console.error("[Voice] Failed to list devices:", error);
    return { devices: [], error };
  }
}

export async function voiceSwitchDevice(
  kind: "audioinput" | "audiooutput",
  deviceId: string,
): Promise<{ ok: boolean; error: unknown }> {
  if (room) {
    try {
      await room.switchActiveDevice(kind, deviceId);
    } catch (error) {
      console.error("[Voice] Failed to switch device:", error);
      return { ok: false, error };
    }
  }

  voiceSaveDevice(kind, deviceId);
  return { ok: true, error: null };
}

async function handleDeviceChange() {
  if (!room) return;

  for (const kind of ["audioinput", "audiooutput"] as const) {
    const savedId = voiceGetSavedDevice(kind);
    if (!savedId) continue;

    const { devices, error } = await voiceGetDevices(kind);
    if (error || devices.length === 0) continue;
    if (devices.some((device) => device.deviceId === savedId)) continue;

    voiceSaveDevice(kind, "");
    await room.switchActiveDevice(kind, "default").catch(() => undefined);
    toast.warning(
      i18n.t(
        kind === "audioinput"
          ? "voice.inputDeviceGone"
          : "voice.outputDeviceGone",
      ),
      { duration: 8000 },
    );
  }
}

let deviceChangeTimer: ReturnType<typeof setTimeout> | null = null;

navigator.mediaDevices?.addEventListener?.("devicechange", () => {
  if (deviceChangeTimer) clearTimeout(deviceChangeTimer);
  deviceChangeTimer = setTimeout(() => {
    deviceChangeTimer = null;
    void handleDeviceChange();
  }, DEVICE_CHANGE_DEBOUNCE_MS);
});
