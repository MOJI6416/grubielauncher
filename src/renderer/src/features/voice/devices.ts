export type VoiceDeviceKind = "audioinput" | "audiooutput";

export interface VoiceDeviceOption {
  deviceId: string;
  label: string;
  isSystem: boolean;
}

const HARDWARE_ID_SUFFIX = /\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i;
const SYSTEM_IDS = new Set(["default", "communications"]);

export function cleanDeviceLabel(label: string): string {
  return label.replace(HARDWARE_ID_SUFFIX, "").replace(/\s+/g, " ").trim();
}

export function deviceOptions(
  devices: MediaDeviceInfo[],
  fallbackLabel: string,
): VoiceDeviceOption[] {
  const seen = new Set<string>();
  const options: VoiceDeviceOption[] = [];

  devices.forEach((device, index) => {
    if (!device.deviceId || seen.has(device.deviceId)) return;
    seen.add(device.deviceId);

    const label = cleanDeviceLabel(device.label || "");
    options.push({
      deviceId: device.deviceId,
      label: label || `${fallbackLabel} ${index + 1}`,
      isSystem: SYSTEM_IDS.has(device.deviceId),
    });
  });

  return options;
}

export interface DeviceSelection {
  deviceId: string;
  isMissing: boolean;
}

export function resolveDeviceSelection(
  savedId: string,
  options: VoiceDeviceOption[],
): DeviceSelection {
  if (!savedId) {
    return { deviceId: options[0]?.deviceId ?? "", isMissing: false };
  }

  if (options.some((option) => option.deviceId === savedId)) {
    return { deviceId: savedId, isMissing: false };
  }

  if (options.length === 0) {
    return { deviceId: "", isMissing: false };
  }

  return { deviceId: options[0].deviceId, isMissing: true };
}

export function meterSegments(level: number, segments: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0;
  return Math.min(segments, Math.round(Math.min(1, level * 1.4) * segments));
}
