import { getDefaultStore } from "jotai";
import { settingsAtom } from "@renderer/stores/atoms";
import { applySavedAudioOutput } from "./voiceDevices";
import successUrl from "../assets/sounds/success.ogg";
import notifyUrl from "../assets/sounds/notify.ogg";
import errorUrl from "../assets/sounds/error.ogg";
import achievementUrl from "../assets/sounds/achievement.mp3";
import voiceJoinUrl from "../assets/sounds/voice-join.ogg";
import voiceLeaveUrl from "../assets/sounds/voice-leave.ogg";
import voiceMuteUrl from "../assets/sounds/voice-mute.ogg";
import voiceUnmuteUrl from "../assets/sounds/voice-unmute.ogg";
import voicePttOnUrl from "../assets/sounds/voice-ptt-on.ogg";
import voicePttOffUrl from "../assets/sounds/voice-ptt-off.ogg";

export type SoundKind = "success" | "notify" | "error";

const SOUND_URLS: Record<SoundKind, string> = {
  success: successUrl,
  notify: notifyUrl,
  error: errorUrl,
};

const SOUND_VOLUME = 0.4;
const SOUND_COOLDOWN_MS = 1500;

const lastPlayedAt = new Map<SoundKind, number>();

export function playSound(kind: SoundKind) {
  const settings = getDefaultStore().get(settingsAtom);
  if (!settings.sounds) return;

  const now = Date.now();
  if (now - (lastPlayedAt.get(kind) ?? 0) < SOUND_COOLDOWN_MS) return;
  lastPlayedAt.set(kind, now);

  const audio = new Audio(SOUND_URLS[kind]);
  audio.volume = SOUND_VOLUME;
  void audio.play().catch(() => {});
}

export type VoiceSoundKind =
  | "join"
  | "leave"
  | "mute"
  | "unmute"
  | "pttOn"
  | "pttOff";

const VOICE_SOUND_URLS: Record<VoiceSoundKind, string> = {
  join: voiceJoinUrl,
  leave: voiceLeaveUrl,
  mute: voiceMuteUrl,
  unmute: voiceUnmuteUrl,
  pttOn: voicePttOnUrl,
  pttOff: voicePttOffUrl,
};

const VOICE_SOUND_COOLDOWN_MS = 250;
const voiceSoundLastPlayedAt = new Map<VoiceSoundKind, number>();

export function playVoiceSound(kind: VoiceSoundKind) {
  const settings = getDefaultStore().get(settingsAtom);
  if (!settings.sounds) return;

  const now = Date.now();
  if (now - (voiceSoundLastPlayedAt.get(kind) ?? 0) < VOICE_SOUND_COOLDOWN_MS) {
    return;
  }
  voiceSoundLastPlayedAt.set(kind, now);

  const audio = new Audio(VOICE_SOUND_URLS[kind]);
  audio.volume = SOUND_VOLUME;
  applySavedAudioOutput(audio);
  void audio.play().catch(() => {});
}

let achievementLastPlayedAt = 0;

export function playAchievementSound() {
  const settings = getDefaultStore().get(settingsAtom);
  if (!settings.sounds) return;

  const now = Date.now();
  if (now - achievementLastPlayedAt < SOUND_COOLDOWN_MS) return;
  achievementLastPlayedAt = now;

  const audio = new Audio(achievementUrl);
  audio.volume = SOUND_VOLUME;
  void audio.play().catch(() => {});
}
