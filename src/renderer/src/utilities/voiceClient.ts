import { getDefaultStore } from "jotai";
import { toast } from "sonner";
import type {
  LocalAudioTrack,
  RemoteAudioTrack,
  RemoteTrack,
  Room,
} from "livekit-client";
import i18n from "@renderer/i18n";
import { playVoiceSound } from "./sounds";
import { voiceGetSavedDevice, voiceSaveDevice } from "./voiceDevices";

export { voiceGetSavedDevice };
import { settingsAtom, voiceSessionAtom } from "@renderer/stores/atoms";
import {
  INITIAL_VOICE_SESSION,
  IVoiceSessionState,
  IVoiceTokenResponse,
} from "@/types/Voice";

const VOLUMES_STORAGE_KEY = "voice.volumes";

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

const MAX_PARTICIPANT_VOLUME = 2;

let room: Room | null = null;
let micMutedBeforeDeafen = false;
let pttEnabled = false;
let pttPressed = false;
const audioElements = new Map<string, HTMLAudioElement[]>();
const audioTracks = new Map<string, RemoteAudioTrack[]>();
const volumes = new Map<string, number>(loadVolumes());

function canTransmitByPtt(): boolean {
  const session = getSession();
  return (
    isInCall() && pttEnabled && !session.isMicMuted && !session.isDeafened
  );
}

api.voice.onPttDown(() => {
  const wasPressed = pttPressed;
  pttPressed = true;
  if (!wasPressed && canTransmitByPtt()) playVoiceSound("pttOn");
  void applyMicState();
});

api.voice.onPttUp(() => {
  const wasPressed = pttPressed;
  pttPressed = false;
  if (wasPressed && canTransmitByPtt()) playVoiceSound("pttOff");
  void applyMicState();
});

store.sub(settingsAtom, () => {
  void syncPtt();
  void syncNoiseSuppression();
});

function isInCall(): boolean {
  return !!room && getSession().state !== "disconnected";
}

let noiseProcessorActive = false;

async function disableNoiseSuppressionAfterFailure(reason: string) {
  noiseProcessorActive = false;

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
  if (enabled === noiseProcessorActive) return;

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

      if (store.get(settingsAtom).devMode) {
        toast.info(
          `[devMode] RNNoise on (ctx ${processor.contextSampleRate ?? "?"}Hz)`,
          { duration: 6000 },
        );
      }
    } else {
      await track.stopProcessor();
      noiseProcessorActive = false;
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
    await api.voice
      .setPtt({ type: bind.type, code: bind.code })
      .catch(() => undefined);
  } else {
    pttPressed = false;
    await api.voice.setPtt(null).catch(() => undefined);
  }

  await applyMicState();
}

async function applyMicState() {
  if (!room) return;

  const session = getSession();
  const shouldEnable =
    !session.isMicMuted &&
    !session.isDeafened &&
    (!pttEnabled || pttPressed);

  await room.localParticipant
    .setMicrophoneEnabled(shouldEnable)
    .catch(() => undefined);
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
    localStorage.setItem(
      VOLUMES_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(volumes)),
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
  return volumes.get(identity) ?? 1;
}

function applyTrackVolume(identity: string) {
  const effective = getSession().isDeafened ? 0 : getVolume(identity);
  for (const track of audioTracks.get(identity) || []) {
    track.setVolume(effective);
  }
}

function syncParticipants() {
  if (
    !room ||
    !livekit ||
    room.state === livekit.ConnectionState.Disconnected
  ) {
    setSession({ participants: [] });
    return;
  }

  const local = room.localParticipant;
  setSession({
    participants: [
      {
        identity: local.identity,
        name: local.name || local.identity,
        isLocal: true,
        isSpeaking: local.isSpeaking,
        isMuted: !local.isMicrophoneEnabled,
        volume: 1,
      },
      ...[...room.remoteParticipants.values()].map((participant) => ({
        identity: participant.identity,
        name: participant.name || participant.identity,
        isLocal: false,
        isSpeaking: participant.isSpeaking,
        isMuted: !participant.isMicrophoneEnabled,
        volume: getVolume(participant.identity),
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

function cleanup() {
  const previousState = getSession().state;
  if (previousState === "connected" || previousState === "reconnecting") {
    playVoiceSound("leave");
  }

  room = null;
  micMutedBeforeDeafen = false;
  pttPressed = false;
  noiseProcessorActive = false;
  removeAudioElements();
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
  if (room) await voiceDisconnect();

  if (!grant?.token || !grant?.url) {
    throw new Error("no_token");
  }

  const lk = await loadLivekit();
  const { RoomEvent, Track } = lk;

  const inputDeviceId = voiceGetSavedDevice("audioinput");
  const nextRoom = new lk.Room({
    // Web-audio mixing lets participant volume boost above 100% via gain.
    webAudioMix: true,
    ...(inputDeviceId
      ? { audioCaptureDefaults: { deviceId: inputDeviceId } }
      : {}),
  });
  room = nextRoom;

  store.set(voiceSessionAtom, {
    ...INITIAL_VOICE_SESSION,
    state: "connecting",
    roomId: info.roomId,
    roomName: info.roomName,
    isRoomOwner: info.isRoomOwner,
  });

  nextRoom
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant) => {
      if (track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      document.body.appendChild(element);
      const existing = audioElements.get(participant.identity) || [];
      audioElements.set(participant.identity, [...existing, element]);

      const audioTrack = track as RemoteAudioTrack;
      const existingTracks = audioTracks.get(participant.identity) || [];
      audioTracks.set(participant.identity, [...existingTracks, audioTrack]);
      applyTrackVolume(participant.identity);
    })
    .on(
      RoomEvent.TrackUnsubscribed,
      (track: RemoteTrack, _pub, participant) => {
        const detached = track.detach();
        detached.forEach((element) => element.remove());
        const remaining = (audioElements.get(participant.identity) || []).filter(
          (element) => !detached.includes(element),
        );
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
      syncParticipants();
      if (!getSession().isDeafened) playVoiceSound("join");
    })
    .on(RoomEvent.ParticipantDisconnected, () => {
      syncParticipants();
      if (!getSession().isDeafened) playVoiceSound("leave");
    })
    .on(RoomEvent.ActiveSpeakersChanged, syncParticipants)
    .on(RoomEvent.TrackMuted, syncParticipants)
    .on(RoomEvent.TrackUnmuted, syncParticipants)
    .on(RoomEvent.LocalTrackPublished, syncParticipants)
    .on(RoomEvent.Reconnecting, () => setSession({ state: "reconnecting" }))
    .on(RoomEvent.Reconnected, () => {
      setSession({ state: "connected" });
      syncParticipants();
    })
    .on(RoomEvent.Disconnected, () => {
      if (room !== nextRoom) return;
      cleanup();
    });

  try {
    await nextRoom.connect(grant.url, grant.token);
  } catch (error) {
    if (room === nextRoom) cleanup();
    await nextRoom.disconnect().catch(() => undefined);
    throw error;
  }

  if (room !== nextRoom) return;

  let micReady = true;
  try {
    await nextRoom.localParticipant.setMicrophoneEnabled(true);
  } catch (error) {
    micReady = false;
    console.error("[Voice] Failed to enable microphone:", error);
    toast.warning(i18n.t("voice.micUnavailable"), { duration: 8000 });
  }
  await applySavedOutputDevice(nextRoom);

  if (room !== nextRoom) return;
  setSession({ state: "connected", isMicMuted: !micReady });
  playVoiceSound("join");
  void api.voice.setSessionActive(true).catch(() => undefined);
  await syncPtt();
  await syncNoiseSuppression();
  syncParticipants();
}

export async function voiceDisconnect() {
  const current = room;
  cleanup();
  if (current) await current.disconnect().catch(() => undefined);
}

export async function voiceSetMicMuted(muted: boolean) {
  if (!room) return;
  if (getSession().isMicMuted !== muted) {
    playVoiceSound(muted ? "mute" : "unmute");
  }
  if (getSession().isDeafened) {
    micMutedBeforeDeafen = muted;
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

  await applyMicState();
}

export function voiceSetParticipantVolume(identity: string, volume: number) {
  const clamped = Math.min(MAX_PARTICIPANT_VOLUME, Math.max(0, volume));
  volumes.set(identity, clamped);
  saveVolumes();
  applyTrackVolume(identity);
  syncParticipants();
}

export async function voiceGetDevices(
  kind: "audioinput" | "audiooutput",
): Promise<MediaDeviceInfo[]> {
  try {
    const lk = await loadLivekit();
    return await lk.Room.getLocalDevices(kind, true);
  } catch {
    return [];
  }
}

export async function voiceSwitchDevice(
  kind: "audioinput" | "audiooutput",
  deviceId: string,
) {
  voiceSaveDevice(kind, deviceId);

  if (room) {
    await room.switchActiveDevice(kind, deviceId).catch(() => undefined);
  }
}
