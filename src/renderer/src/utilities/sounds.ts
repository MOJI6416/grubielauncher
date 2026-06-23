import { getDefaultStore } from "jotai";
import { settingsAtom } from "@renderer/stores/atoms";
import successUrl from "../assets/sounds/success.ogg";
import notifyUrl from "../assets/sounds/notify.ogg";
import errorUrl from "../assets/sounds/error.ogg";
import achievementUrl from "../assets/sounds/achievement.mp3";

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
