const INPUT_DEVICE_STORAGE_KEY = "voice.inputDeviceId";
const OUTPUT_DEVICE_STORAGE_KEY = "voice.outputDeviceId";

export type VoiceDeviceKind = "audioinput" | "audiooutput";

function storageKey(kind: VoiceDeviceKind): string {
  return kind === "audioinput"
    ? INPUT_DEVICE_STORAGE_KEY
    : OUTPUT_DEVICE_STORAGE_KEY;
}

export function voiceGetSavedDevice(kind: VoiceDeviceKind): string {
  try {
    return localStorage.getItem(storageKey(kind)) || "";
  } catch {
    return "";
  }
}

export function voiceSaveDevice(kind: VoiceDeviceKind, deviceId: string) {
  try {
    localStorage.setItem(storageKey(kind), deviceId);
  } catch {
    return;
  }
}

export function applySavedAudioOutput(audio: HTMLAudioElement) {
  const outputId = voiceGetSavedDevice("audiooutput");
  const sinkAudio = audio as HTMLAudioElement & {
    setSinkId?: (id: string) => Promise<void>;
  };
  if (outputId && typeof sinkAudio.setSinkId === "function") {
    void sinkAudio.setSinkId(outputId).catch(() => undefined);
  }
}
