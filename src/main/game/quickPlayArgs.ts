export interface QuickPlayInput {
  quickSingle?: string;
  quickMultiplayer?: string;
  savedServer?: string;
  supportsSingleplayer: boolean;
  supportsMultiplayer: boolean;
  isLegacyManifest: boolean;
}

const DEFAULT_PORT = "25565";

function splitAddress(address: string) {
  const separatorIndex = address.lastIndexOf(":");
  const portCandidate =
    separatorIndex > 0 ? address.slice(separatorIndex + 1) : "";
  const hasPort = /^\d+$/.test(portCandidate);

  return {
    host: hasPort ? address.slice(0, separatorIndex) : address,
    port: hasPort ? portCandidate : DEFAULT_PORT,
  };
}

export function buildQuickPlayArguments({
  quickSingle,
  quickMultiplayer,
  savedServer,
  supportsSingleplayer,
  supportsMultiplayer,
  isLegacyManifest,
}: QuickPlayInput): string[] {
  if (quickSingle) {
    if (!supportsSingleplayer) return [];
    return ["--quickPlaySingleplayer", quickSingle];
  }

  const address = quickMultiplayer || savedServer;
  if (!address) return [];

  if (supportsMultiplayer) return ["--quickPlayMultiplayer", address];
  if (isLegacyManifest) return [];

  const { host, port } = splitAddress(address);
  return ["--server", host, "--port", port];
}
