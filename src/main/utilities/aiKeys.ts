import { app } from "electron";
import { randomUUID } from "crypto";
import fs from "fs-extra";
import path from "path";
import {
  AiProviderInput,
  AiProviderProfile,
  AiProvidersState,
} from "@/types/Agent";
import { writeJsonAtomic } from "./atomicJson";
import { decodeSecret, encodeSecret, StoredSecrets } from "./secretStore";

type PersistedProvider = Omit<AiProviderProfile, "hasKey">;

type PersistedState = {
  providers: PersistedProvider[];
  selectedId: string | null;
};

const MAX_PROVIDERS = 12;
const MAX_LABEL_LENGTH = 64;
const MAX_MODEL_LENGTH = 200;
const MAX_URL_LENGTH = 512;

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}

function getLauncherDir(): string {
  return path.join(app.getPath("appData"), ".grubielauncher");
}

function getProvidersPath(): string {
  return path.join(getLauncherDir(), "ai-providers.json");
}

function getProviderSecretsPath(): string {
  return path.join(getLauncherDir(), "ai-providers.secrets.json");
}

function isMissingFileError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

let writeChain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AiProviderError("Base URL is required");
  }

  const trimmed = value.trim().slice(0, MAX_URL_LENGTH);

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new AiProviderError("Base URL is not a valid URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AiProviderError("Base URL must use http or https");
  }

  return trimmed.replace(/\/+$/, "");
}

function normalizeText(value: unknown, max: number, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AiProviderError(`${field} is required`);
  }
  return value.trim().slice(0, max);
}

function buildKeyHint(apiKey: string): string {
  const tail = apiKey.trim().slice(-4);
  return tail ? `…${tail}` : "";
}

function normalizePersistedProvider(value: any): PersistedProvider | null {
  if (!value || typeof value !== "object") return null;
  if (typeof value.id !== "string" || value.id.trim() === "") return null;

  try {
    return {
      id: value.id,
      label: normalizeText(value.label, MAX_LABEL_LENGTH, "Label"),
      baseUrl: normalizeBaseUrl(value.baseUrl),
      model: normalizeText(value.model, MAX_MODEL_LENGTH, "Model"),
      keyHint: typeof value.keyHint === "string" ? value.keyHint : "",
    };
  } catch {
    return null;
  }
}

async function readPersistedState(): Promise<PersistedState> {
  let data: any;
  try {
    data = await fs.readJSON(getProvidersPath(), "utf-8");
  } catch (error) {
    if (isMissingFileError(error)) return { providers: [], selectedId: null };
    throw error;
  }

  const providers = Array.isArray(data?.providers)
    ? data.providers
        .map(normalizePersistedProvider)
        .filter((item: PersistedProvider | null): item is PersistedProvider =>
          Boolean(item),
        )
        .slice(0, MAX_PROVIDERS)
    : [];

  const selectedId =
    typeof data?.selectedId === "string" &&
    providers.some((item: PersistedProvider) => item.id === data.selectedId)
      ? data.selectedId
      : (providers[0]?.id ?? null);

  return { providers, selectedId };
}

async function readSecrets(): Promise<StoredSecrets> {
  let data: unknown;
  try {
    data = await fs.readJSON(getProviderSecretsPath(), "utf-8");
  } catch (error) {
    if (isMissingFileError(error)) return {};
    throw error;
  }

  return typeof data === "object" && data ? (data as StoredSecrets) : {};
}

async function writePersistedState(state: PersistedState): Promise<void> {
  await fs.ensureDir(getLauncherDir());
  await writeJsonAtomic(getProvidersPath(), state, { mode: 0o600 });
}

async function writeSecrets(secrets: StoredSecrets): Promise<void> {
  await fs.ensureDir(getLauncherDir());
  await writeJsonAtomic(getProviderSecretsPath(), secrets, { mode: 0o600 });
}

function toPublicState(
  state: PersistedState,
  secrets: StoredSecrets,
): AiProvidersState {
  return {
    providers: state.providers.map((provider) => ({
      ...provider,
      hasKey: decodeSecret(secrets[provider.id]) !== undefined,
    })),
    selectedId: state.selectedId,
  };
}

async function readPublicState(): Promise<AiProvidersState> {
  const [state, secrets] = await Promise.all([
    readPersistedState(),
    readSecrets(),
  ]);
  return toPublicState(state, secrets);
}

export function listProviders(): Promise<AiProvidersState> {
  return withLock(readPublicState);
}

export function saveProvider(
  input: AiProviderInput,
): Promise<AiProvidersState> {
  return withLock(async () => {
    const [state, secrets] = await Promise.all([
      readPersistedState(),
      readSecrets(),
    ]);

    const existingIndex = input.id
      ? state.providers.findIndex((provider) => provider.id === input.id)
      : -1;

    if (existingIndex < 0 && state.providers.length >= MAX_PROVIDERS) {
      throw new AiProviderError("Too many providers");
    }

    const id =
      existingIndex >= 0 ? state.providers[existingIndex].id : randomUUID();
    const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
    const previousHint =
      existingIndex >= 0 ? state.providers[existingIndex].keyHint : "";

    const provider: PersistedProvider = {
      id,
      label: normalizeText(input.label, MAX_LABEL_LENGTH, "Label"),
      baseUrl: normalizeBaseUrl(input.baseUrl),
      model: normalizeText(input.model, MAX_MODEL_LENGTH, "Model"),
      keyHint: apiKey ? buildKeyHint(apiKey) : previousHint,
    };

    if (existingIndex >= 0) state.providers[existingIndex] = provider;
    else state.providers.push(provider);

    if (apiKey) {
      secrets[id] = encodeSecret(apiKey, "AI provider key");
      await writeSecrets(secrets);
    }

    if (!state.selectedId) state.selectedId = id;
    await writePersistedState(state);

    return toPublicState(state, secrets);
  });
}

export function deleteProvider(id: string): Promise<AiProvidersState> {
  return withLock(async () => {
    const [state, secrets] = await Promise.all([
      readPersistedState(),
      readSecrets(),
    ]);

    state.providers = state.providers.filter((provider) => provider.id !== id);
    if (state.selectedId === id) {
      state.selectedId = state.providers[0]?.id ?? null;
    }

    if (secrets[id]) {
      delete secrets[id];
      await writeSecrets(secrets);
    }

    await writePersistedState(state);
    return toPublicState(state, secrets);
  });
}

export function selectProvider(id: string): Promise<AiProvidersState> {
  return withLock(async () => {
    const [state, secrets] = await Promise.all([
      readPersistedState(),
      readSecrets(),
    ]);

    if (!state.providers.some((provider) => provider.id === id)) {
      throw new AiProviderError("Unknown provider");
    }

    state.selectedId = id;
    await writePersistedState(state);
    return toPublicState(state, secrets);
  });
}

export type ResolvedProvider = {
  profile: PersistedProvider;
  apiKey: string;
};

export function resolveProvider(id: string): Promise<ResolvedProvider | null> {
  return withLock(async () => {
    const [state, secrets] = await Promise.all([
      readPersistedState(),
      readSecrets(),
    ]);

    const profile = state.providers.find((provider) => provider.id === id);
    if (!profile) return null;

    return { profile, apiKey: decodeSecret(secrets[id]) ?? "" };
  });
}
