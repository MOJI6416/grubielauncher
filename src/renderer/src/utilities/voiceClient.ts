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
  splitParticipantVolume,
  volumePercent,
} from "@renderer/features/voice/participants";
import { micIssueFromError } from "@renderer/features/voice/errors";
import {
  audioQualityWindow,
  captureSettingsSummary,
  type InboundAudioCounters,
  isDegradedAudio,
  readInboundAudio,
} from "@renderer/features/voice/callQuality";
import { voiceRoomKind } from "@renderer/features/voice/roomModel";
import {
  createSpeakingDetector,
  rmsDb,
} from "@renderer/features/voice/speaking";
import { levelFraction } from "@renderer/features/voice/noiseGate";
import { createBoostChain } from "@renderer/features/voice/boostLimiter";
import { uiJournal } from "./journal";
import { clampGateDb } from "@/shared/voiceGate";
import {
  sameProcessingConfig,
  type VoiceProcessingConfig,
  VoiceTrackProcessor,
} from "./voiceProcessing";
import {
  INITIAL_VOICE_SESSION,
  IVoiceSessionState,
  IVoiceTokenResponse,
  VoiceQuality,
} from "@/types/Voice";

const VOLUMES_STORAGE_KEY = "voice.volumes";
const LOCAL_MUTES_STORAGE_KEY = "voice.localMutes";
const LEVEL_SAMPLE_MS = 60;
const LEVEL_PROBE_FFT = 1024;
const PTT_RELEASE_DELAY_MS = 180;
const DEVICE_CHANGE_DEBOUNCE_MS = 500;
const QUALITY_SAMPLE_MS = 10_000;
const DEGRADED_LOG_COOLDOWN_MS = 60_000;

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
let playbackContext: AudioContext | null = null;
let micMutedBeforeDeafen = false;
let pttEnabled = false;
let pttPressed = false;
let levelTimer: ReturnType<typeof setInterval> | null = null;
const audioElements = new Map<string, HTMLAudioElement[]>();
const audioTracks = new Map<string, RemoteAudioTrack[]>();
const volumes = new Map<string, number>(loadVolumes());
const localMutes = new Set<string>(loadLocalMutes());
const qualities = new Map<string, VoiceQuality>();
const boostGains = new WeakMap<RemoteAudioTrack, GainNode>();
const inboundCounters = new WeakMap<RemoteAudioTrack, InboundAudioCounters>();
const degradedLoggedAt = new Map<string, number>();
let qualityTimer: ReturnType<typeof setInterval> | null = null;
let callStartedAt = 0;
let qualityWindows = 0;
let degradedWindows = 0;

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
  void syncVoiceProcessing();
  void syncCaptureProcessing();
});

type CaptureProcessing = {
  autoGainControl: boolean;
  echoCancellation: boolean;
};

let appliedProcessing: CaptureProcessing | null = null;

function captureProcessing(): CaptureProcessing {
  const settings = store.get(settingsAtom);
  return {
    autoGainControl: settings.voiceAutoGain,
    echoCancellation: settings.voiceEchoCancellation,
  };
}

async function syncCaptureProcessing() {
  if (!room || !livekit || !isInCall() || !appliedProcessing) return;

  const next = captureProcessing();
  if (
    next.autoGainControl === appliedProcessing.autoGainControl &&
    next.echoCancellation === appliedProcessing.echoCancellation
  ) {
    return;
  }

  appliedProcessing = next;
  const options = { ...room.options.audioCaptureDefaults, ...next };
  room.options.audioCaptureDefaults = options;

  const track = room.localParticipant.getTrackPublication(
    livekit.Track.Source.Microphone,
  )?.track as LocalAudioTrack | undefined;
  if (!track) return;

  try {
    await track.restartTrack(options);
    uiJournal.info("voice", "capture processing changed", { ...next });
  } catch (error) {
    console.error("[Voice] Failed to restart microphone:", error);
    uiJournal.warn("voice", "capture processing change failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function isInCall(): boolean {
  return !!room && getSession().state !== "disconnected";
}

let voiceProcessor: VoiceTrackProcessor | null = null;
let pttHookFailureReported = false;
let noiseSuppressionFailed = false;
let processingFailed = false;

function microphoneTrack(): LocalAudioTrack | undefined {
  if (!room || !livekit) return undefined;
  return room.localParticipant.getTrackPublication(
    livekit.Track.Source.Microphone,
  )?.track as LocalAudioTrack | undefined;
}

function desiredProcessing(): VoiceProcessingConfig | null {
  const settings = store.get(settingsAtom);
  const denoise = settings.voiceNoiseSuppression && !noiseSuppressionFailed;
  const gateDb = settings.voiceGate
    ? clampGateDb(settings.voiceGateThreshold)
    : null;
  return denoise || gateDb !== null ? { denoise, gateDb } : null;
}

function handleDenoiseFailure(reason: string) {
  if (noiseSuppressionFailed) return;
  noiseSuppressionFailed = true;
  console.error("[Voice] Noise suppression disabled:", reason);
  uiJournal.warn("voice", "noise suppression failed", { reason });
  toast.error(i18n.t("voice.noiseSuppressionFailed"), { duration: 8000 });
  void syncVoiceProcessing();
}

async function handleProcessingFailure(reason: string) {
  if (processingFailed) return;
  processingFailed = true;

  const hadProcessor = voiceProcessor !== null;
  voiceProcessor = null;
  setSession({ isNoiseSuppressionActive: false });
  if (hadProcessor) {
    await microphoneTrack()
      ?.stopProcessor()
      .catch(() => undefined);
  }
  await applyMicState();

  console.error("[Voice] Microphone processing disabled:", reason);
  uiJournal.warn("voice", "processing failed", { reason });
  toast.error(i18n.t("voice.processingFailed"), { duration: 8000 });
}

async function syncVoiceProcessing() {
  if (!room || !livekit || !isInCall()) return;

  const settings = store.get(settingsAtom);
  if (!settings.voiceNoiseSuppression) noiseSuppressionFailed = false;
  if (!settings.voiceNoiseSuppression && !settings.voiceGate) {
    processingFailed = false;
  }
  if (processingFailed) return;

  const track = microphoneTrack();
  if (!track) return;
  const config = desiredProcessing();

  try {
    if (!config) {
      if (!voiceProcessor) return;
      voiceProcessor = null;
      await track.stopProcessor();
      setSession({ isNoiseSuppressionActive: false });
      return;
    }

    if (voiceProcessor) {
      if (!sameProcessingConfig(voiceProcessor.currentConfig, config)) {
        voiceProcessor.configure(config);
        uiJournal.info("voice", "processing changed", { ...config });
      }
      setSession({ isNoiseSuppressionActive: config.denoise });
      return;
    }

    const processor = new VoiceTrackProcessor(config, {
      onDenoiseFailed: handleDenoiseFailure,
      onFailed: (reason) => void handleProcessingFailure(reason),
    });
    voiceProcessor = processor;
    await track.setProcessor(processor);
    setSession({ isNoiseSuppressionActive: config.denoise });
    uiJournal.info("voice", "processing on", { ...config });
  } catch (error) {
    console.error("[Voice] Failed to apply microphone processing:", error);
    await handleProcessingFailure(
      error instanceof Error ? error.message : String(error),
    );
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

function applyTrackBoost(track: RemoteAudioTrack, boost: number) {
  const existing = boostGains.get(track);

  if (boost <= 1) {
    if (!existing) return;
    boostGains.delete(track);
    track.setWebAudioPlugins([]);
    return;
  }

  if (existing) {
    existing.gain.setTargetAtTime(boost, existing.context.currentTime, 0.05);
    return;
  }

  if (!playbackContext || playbackContext.state === "closed") return;

  const chain = createBoostChain(playbackContext, boost);
  boostGains.set(track, chain.gain);
  track.setWebAudioPlugins(chain.nodes);
}

function applyTrackVolume(identity: string) {
  const silenced = getSession().isDeafened || localMutes.has(identity);
  const { level, boost } = splitParticipantVolume(
    silenced ? 0 : getVolume(identity),
  );
  for (const track of audioTracks.get(identity) || []) {
    applyTrackBoost(track, boost);
    track.setVolume(level);
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

interface LevelProbe {
  track: MediaStreamTrack;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  samples: Float32Array<ArrayBuffer>;
}

const levelProbes = new Map<string, LevelProbe>();
const speakingStates = new Map<string, boolean>();
const speakingDetector = createSpeakingDetector();

function attachLevelProbe(identity: string, track: MediaStreamTrack) {
  if (levelProbes.get(identity)?.track === track) return;
  detachLevelProbe(identity);
  if (!playbackContext || playbackContext.state === "closed") return;

  const source = playbackContext.createMediaStreamSource(
    new MediaStream([track]),
  );
  const analyser = playbackContext.createAnalyser();
  analyser.fftSize = LEVEL_PROBE_FFT;
  source.connect(analyser);
  levelProbes.set(identity, {
    track,
    source,
    analyser,
    samples: new Float32Array(LEVEL_PROBE_FFT),
  });
}

function detachLevelProbe(identity: string) {
  const probe = levelProbes.get(identity);
  if (!probe) return;
  probe.source.disconnect();
  levelProbes.delete(identity);
  speakingStates.delete(identity);
  speakingDetector.forget(identity);
}

function detachAllLevelProbes() {
  for (const identity of [...levelProbes.keys()]) detachLevelProbe(identity);
  speakingDetector.clear();
}

function speakingOf(identity: string, fallback: boolean): boolean {
  return speakingStates.get(identity) ?? fallback;
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
        isSpeaking: speakingOf(local.identity, local.isSpeaking),
        isMuted: !local.isMicrophoneEnabled,
        volume: DEFAULT_PARTICIPANT_VOLUME,
        isLocallyMuted: false,
        quality: readQuality(local),
      },
      ...[...room.remoteParticipants.values()].map((participant) => ({
        identity: participant.identity,
        name: participant.name || participant.identity,
        isLocal: false,
        isSpeaking: speakingOf(participant.identity, participant.isSpeaking),
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

    const localIdentity = room.localParticipant.identity;
    const localTrack = microphoneTrack()?.mediaStreamTrack;
    if (localTrack) attachLevelProbe(localIdentity, localTrack);

    const now = performance.now();
    let changed = false;

    for (const [identity, probe] of levelProbes) {
      probe.analyser.getFloatTimeDomainData(probe.samples);
      const db = rmsDb(probe.samples);

      if (identity === localIdentity) {
        const next = levelBucket(levelFraction(db));
        if (store.get(voiceLocalLevelAtom) !== next) {
          store.set(voiceLocalLevelAtom, next);
        }
      }

      const speaking = speakingDetector.update(identity, db, now);
      if (speakingStates.get(identity) !== speaking) {
        speakingStates.set(identity, speaking);
        changed = true;
      }
    }

    if (changed) syncParticipants();
  }, LEVEL_SAMPLE_MS);
}

function stopLevelSampling() {
  if (levelTimer) clearInterval(levelTimer);
  levelTimer = null;
  if (store.get(voiceLocalLevelAtom) !== 0) store.set(voiceLocalLevelAtom, 0);
}

async function sampleCallQuality(target: Room) {
  for (const [identity, tracks] of [...audioTracks]) {
    for (const track of tracks) {
      const report = await track.receiver?.getStats().catch(() => null);
      if (room !== target) return;

      const next = report ? readInboundAudio(report) : null;
      if (!next) continue;

      const window = audioQualityWindow(
        inboundCounters.get(track) ?? null,
        next,
      );
      inboundCounters.set(track, next);
      if (!window) continue;

      qualityWindows += 1;
      if (!isDegradedAudio(window)) continue;
      degradedWindows += 1;

      const now = Date.now();
      if (
        now - (degradedLoggedAt.get(identity) ?? 0) <
        DEGRADED_LOG_COOLDOWN_MS
      ) {
        continue;
      }
      degradedLoggedAt.set(identity, now);
      uiJournal.warn("voice", "degraded incoming audio", {
        ...window,
        volumePct: volumePercent(getVolume(identity)),
      });
    }
  }
}

function startQualityTracking(target: Room) {
  stopQualityTracking();
  callStartedAt = Date.now();
  qualityTimer = setInterval(() => {
    void sampleCallQuality(target);
  }, QUALITY_SAMPLE_MS);
}

function stopQualityTracking() {
  if (qualityTimer) clearInterval(qualityTimer);
  qualityTimer = null;

  if (callStartedAt) {
    uiJournal.info("voice", "call ended", {
      durationSec: Math.round((Date.now() - callStartedAt) / 1000),
      qualityWindows,
      degradedWindows,
    });
  }

  callStartedAt = 0;
  qualityWindows = 0;
  degradedWindows = 0;
  degradedLoggedAt.clear();
}

function closePlaybackContext() {
  const context = playbackContext;
  playbackContext = null;
  if (context && context.state !== "closed") {
    void context.close().catch(() => undefined);
  }
}

function releaseRoomResources() {
  flushParticipantVolumes();
  micMutedBeforeDeafen = false;
  cancelPttRelease();
  pttPressed = false;
  void voiceProcessor?.destroy();
  voiceProcessor = null;
  noiseSuppressionFailed = false;
  processingFailed = false;
  qualities.clear();
  stopLevelSampling();
  stopQualityTracking();
  removeAudioElements();
  detachAllLevelProbes();
  closePlaybackContext();
  appliedProcessing = null;
}

function cleanup() {
  const previousState = getSession().state;
  if (previousState === "connected" || previousState === "reconnecting") {
    playVoiceSound("leave");
  }

  releaseRoomResources();
  room = null;
  watchDevices(false);
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
  const nextPlayback = new AudioContext({ latencyHint: "interactive" });
  const processing = captureProcessing();
  const nextRoom = new lk.Room({
    webAudioMix: { audioContext: nextPlayback },
    audioCaptureDefaults: {
      ...(inputDeviceId ? { deviceId: { ideal: inputDeviceId } } : {}),
      ...processing,
    },
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
        attachLevelProbe(participant.identity, audioTrack.mediaStreamTrack);
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
          detachLevelProbe(participant.identity);
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
      void syncVoiceProcessing();
    })
    .on(RoomEvent.Disconnected, () => {
      if (room !== nextRoom) return;
      cleanup();
    });

  try {
    await nextRoom.connect(grant.url, grant.token);
  } catch (error) {
    await nextRoom.disconnect().catch(() => undefined);
    void nextPlayback.close().catch(() => undefined);

    if (previousRoom) {
      store.set(voiceSessionAtom, previousSession);
      syncParticipants();
    } else {
      store.set(voiceSessionAtom, INITIAL_VOICE_SESSION);
    }

    throw error;
  }

  room = nextRoom;
  if (previousRoom) releaseRoomResources();
  playbackContext = nextPlayback;
  appliedProcessing = processing;
  if (previousRoom) await previousRoom.disconnect().catch(() => undefined);

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
  startQualityTracking(nextRoom);
  watchDevices(true);

  const micTrack = nextRoom.localParticipant.getTrackPublication(
    Track.Source.Microphone,
  )?.track;
  uiJournal.info("voice", "connected", {
    room: voiceRoomKind(info.roomId),
    participants: nextRoom.remoteParticipants.size + 1,
    micIssue,
    capture: captureSettingsSummary(
      micTrack?.mediaStreamTrack.getSettings() as
        | Record<string, unknown>
        | undefined,
    ),
    playbackSampleRate: nextPlayback.sampleRate,
  });
  await syncPtt();
  await syncVoiceProcessing();
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
    await syncVoiceProcessing();
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
let isWatchingDevices = false;

function onDeviceChange() {
  if (deviceChangeTimer) clearTimeout(deviceChangeTimer);
  deviceChangeTimer = setTimeout(() => {
    deviceChangeTimer = null;
    void handleDeviceChange();
  }, DEVICE_CHANGE_DEBOUNCE_MS);
}

function watchDevices(watch: boolean) {
  if (watch === isWatchingDevices) return;
  isWatchingDevices = watch;

  if (watch) {
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    return;
  }

  navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
  if (deviceChangeTimer) clearTimeout(deviceChangeTimer);
  deviceChangeTimer = null;
}
