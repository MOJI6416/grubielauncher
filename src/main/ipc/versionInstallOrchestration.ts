import {
  VERSION_INSTALL_CANCELLED,
  VersionInstallOptions,
  VersionInstallResult,
} from "@/types/InstallationProgress";

export function getInstallErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown installation error.";
  }
}

export function createInstallRuntimeOptions(
  options: VersionInstallOptions | undefined,
  signal: AbortSignal,
) {
  return {
    ...options,
    signal,
  };
}

export function createInstallErrorResult(
  error: unknown,
  signalAborted: boolean,
): VersionInstallResult {
  if (
    signalAborted ||
    (error instanceof Error && error.message === VERSION_INSTALL_CANCELLED)
  ) {
    return {
      success: false,
      cancelled: true,
      error: VERSION_INSTALL_CANCELLED,
    };
  }

  return {
    success: false,
    error: getInstallErrorMessage(error),
  };
}
