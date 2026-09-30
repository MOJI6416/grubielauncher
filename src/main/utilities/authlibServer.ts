import axios from "axios";
import { Backend } from "../services/Backend";

export const AUTHLIB_PREFETCHED_PROPERTY =
  "-Dauthlibinjector.yggdrasil.prefetched";

const METADATA_TIMEOUT_MS = 8000;
const ELYBY_API_URL = "https://account.ely.by/api/authlib-injector";

export interface AuthlibServer {
  url: string;
  prefetched: string;
}

export function encodeAuthlibMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;

  const { signaturePublickey } = metadata as { signaturePublickey?: unknown };
  if (typeof signaturePublickey !== "string" || !signaturePublickey)
    return null;

  return Buffer.from(JSON.stringify(metadata), "utf8").toString("base64");
}

async function fetchGrubieServer(): Promise<AuthlibServer | null> {
  const result = await new Backend().getYggdrasilMetadata(METADATA_TIMEOUT_MS);
  if (!result) return null;

  const prefetched = encodeAuthlibMetadata(result.metadata);
  return prefetched ? { url: `${result.baseUrl}/yggdrasil`, prefetched } : null;
}

async function fetchElybyServer(): Promise<AuthlibServer | null> {
  try {
    const response = await axios.get(ELYBY_API_URL, {
      timeout: METADATA_TIMEOUT_MS,
    });
    const prefetched = encodeAuthlibMetadata(response.data);
    return prefetched ? { url: ELYBY_API_URL, prefetched } : null;
  } catch {
    return null;
  }
}

export async function resolveAuthlibServer(
  accountType: "elyby" | "discord",
): Promise<AuthlibServer | null> {
  const server =
    accountType === "discord"
      ? await fetchGrubieServer()
      : await fetchElybyServer();

  if (!server) {
    console.warn(
      `[authlib] could not prefetch ${accountType} metadata, authlib-injector will fetch it itself`,
    );
  }

  return server;
}
