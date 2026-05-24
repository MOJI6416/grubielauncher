export type LoaderInstallerDetailKey =
  | "installationProgress.installerDetails.starting"
  | "installationProgress.installerDetails.checkingJava"
  | "installationProgress.installerDetails.extractingJson"
  | "installationProgress.installerDetails.checkingClient"
  | "installationProgress.installerDetails.downloadingLibraries"
  | "installationProgress.installerDetails.preparingProcessors"
  | "installationProgress.installerDetails.runningProcessor"
  | "installationProgress.installerDetails.patching"
  | "installationProgress.installerDetails.injectingProfile"
  | "installationProgress.installerDetails.completed"
  | "installationProgress.installerDetails.legacyFallback";

export interface LoaderInstallerProgressState {
  progressPercent: number;
  downloadEvents: number;
  processorEvents: number;
  patchEvents: number;
  lastDetailKey?: LoaderInstallerDetailKey;
}

export interface LoaderInstallerProgressUpdate {
  progressPercent: number;
  detailsKey: LoaderInstallerDetailKey;
  detailsParams?: Record<string, string | number>;
}

export interface LoaderInstallerProgressOptions {
  startPercent?: number;
  endPercent?: number;
}

const DEFAULT_START_PERCENT = 38;
const DEFAULT_END_PERCENT = 58;

export function createLoaderInstallerProgressState(
  startPercent = DEFAULT_START_PERCENT,
): LoaderInstallerProgressState {
  return {
    progressPercent: startPercent,
    downloadEvents: 0,
    processorEvents: 0,
    patchEvents: 0,
  };
}

function clampProgress(
  value: number,
  startPercent: number,
  endPercent: number,
) {
  return Math.max(startPercent, Math.min(endPercent, value));
}

function updateProgress(
  state: LoaderInstallerProgressState,
  progressPercent: number,
  detailsKey: LoaderInstallerDetailKey,
  options: Required<LoaderInstallerProgressOptions>,
  detailsParams?: Record<string, string | number>,
): LoaderInstallerProgressUpdate {
  const nextProgress = clampProgress(
    progressPercent,
    options.startPercent,
    options.endPercent,
  );
  state.progressPercent = Math.max(state.progressPercent, nextProgress);
  state.lastDetailKey = detailsKey;

  return {
    progressPercent: Math.round(state.progressPercent),
    detailsKey,
    detailsParams,
  };
}

function extractTaskName(line: string) {
  const taskMatch = line.match(/\bTask:\s*([A-Z0-9_.-]+)/i);
  if (taskMatch?.[1]) return taskMatch[1];

  const processorTaskMatch = line.match(/\bProcessor:\s*[^:]+:\s*(.+)$/i);
  if (processorTaskMatch?.[1]) {
    return processorTaskMatch[1].trim().slice(0, 80);
  }

  const argsTaskMatch = line.match(/--task,\s*([A-Z0-9_.-]+)/i);
  if (argsTaskMatch?.[1]) return argsTaskMatch[1];

  return undefined;
}

export function parseLoaderInstallerProgressLine(
  line: string,
  state: LoaderInstallerProgressState,
  inputOptions: LoaderInstallerProgressOptions = {},
): LoaderInstallerProgressUpdate | null {
  const text = line.trim();
  if (!text) return null;

  const options = {
    startPercent: inputOptions.startPercent ?? DEFAULT_START_PERCENT,
    endPercent: inputOptions.endPercent ?? DEFAULT_END_PERCENT,
  };
  const span = options.endPercent - options.startPercent;

  if (
    /Successfully installed client into launcher|Installation complete/i.test(
      text,
    )
  ) {
    return updateProgress(
      state,
      options.endPercent,
      "installationProgress.installerDetails.completed",
      options,
    );
  }

  if (
    /UnrecognizedOptionException|installClient.+not a recognized option/i.test(
      text,
    )
  ) {
    return updateProgress(
      state,
      options.startPercent + span * 0.18,
      "installationProgress.installerDetails.legacyFallback",
      options,
    );
  }

  if (/Injecting profile/i.test(text)) {
    return updateProgress(
      state,
      options.startPercent + span * 0.92,
      "installationProgress.installerDetails.injectingProfile",
      options,
    );
  }

  if (
    /Patching\b|applying patches|Loading patches file|Adding new files|write output file|overall work/i.test(
      text,
    )
  ) {
    state.patchEvents++;
    const progress =
      options.startPercent +
      span * 0.72 +
      Math.min(3, state.patchEvents * 0.03);
    return updateProgress(
      state,
      progress,
      "installationProgress.installerDetails.patching",
      options,
      extractTaskName(text) ? { item: extractTaskName(text)! } : undefined,
    );
  }

  if (/Building Processors?|Building Processor/i.test(text)) {
    return updateProgress(
      state,
      options.startPercent + span * 0.58,
      "installationProgress.installerDetails.preparingProcessors",
      options,
    );
  }

  if (/\bTask:\s*|Processor:\s*|--task,/i.test(text)) {
    state.processorEvents++;
    const progress =
      options.startPercent +
      span * 0.62 +
      Math.min(2.5, state.processorEvents * 0.25);
    return updateProgress(
      state,
      progress,
      "installationProgress.installerDetails.runningProcessor",
      options,
      extractTaskName(text) ? { item: extractTaskName(text)! } : undefined,
    );
  }

  if (
    /Downloading libraries|Found \d+ additional library directories/i.test(text)
  ) {
    return updateProgress(
      state,
      options.startPercent + span * 0.42,
      "installationProgress.installerDetails.downloadingLibraries",
      options,
    );
  }

  if (
    /Downloading library from|Download completed: Checksum validated|Extraction completed: Checksum validated|File .+ exists\. Checksum valid/i.test(
      text,
    )
  ) {
    state.downloadEvents++;
    const progress =
      options.startPercent +
      span * 0.25 +
      Math.min(3.5, state.downloadEvents * 0.04);
    return updateProgress(
      state,
      progress,
      "installationProgress.installerDetails.downloadingLibraries",
      options,
    );
  }

  if (/Considering minecraft client jar/i.test(text)) {
    return updateProgress(
      state,
      options.startPercent + span * 0.18,
      "installationProgress.installerDetails.checkingClient",
      options,
    );
  }

  if (/Extracting json/i.test(text)) {
    return updateProgress(
      state,
      options.startPercent + span * 0.1,
      "installationProgress.installerDetails.extractingJson",
      options,
    );
  }

  if (
    /JVM info|Found java version|java\.net\.preferIPv4Stack|^Host:/i.test(text)
  ) {
    return updateProgress(
      state,
      options.startPercent + span * 0.04,
      "installationProgress.installerDetails.checkingJava",
      options,
    );
  }

  return null;
}
