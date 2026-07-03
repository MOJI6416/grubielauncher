import { getDefaultStore } from "jotai";
import { settingsAtom } from "@renderer/stores/atoms";
import { applySavedAudioOutput } from "./voiceDevices";
import incomingUrl from "../assets/sounds/call-incoming.ogg";
import outgoingUrl from "../assets/sounds/call-outgoing.ogg";

const CALL_SOUND_VOLUME = 0.35;

let activeAudio: HTMLAudioElement | null = null;

export function startCallSound(kind: "incoming" | "outgoing") {
  stopCallSound();

  const settings = getDefaultStore().get(settingsAtom);
  if (!settings.sounds) return;

  const audio = new Audio(kind === "incoming" ? incomingUrl : outgoingUrl);
  audio.loop = true;
  audio.volume = CALL_SOUND_VOLUME;
  applySavedAudioOutput(audio);
  activeAudio = audio;
  void audio.play().catch(() => {});
}

export function stopCallSound() {
  if (!activeAudio) return;
  activeAudio.pause();
  activeAudio.src = "";
  activeAudio = null;
}
