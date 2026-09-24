import { BACKEND_URL, BACKEND_URL_DIRECT } from "@/shared/config";
import { reportApiFailure } from "./apiHost";
import { probePayload } from "./payloadProbe";

export const API_PAYLOAD_PATH =
  "/curseforge/search?query=&modType=6&offset=0&limit=20";

const PROBE_MIN_BYTES = 64 * 1024;
const PROBE_TIMEOUT_MS = 10_000;
const RECHECK_MS = 10 * 60 * 1000;

export type ApiRoute = "primary" | "direct" | "none";

async function carriesPayload(baseUrl: string): Promise<boolean> {
  try {
    const result = await probePayload(
      `${baseUrl}${API_PAYLOAD_PATH}`,
      PROBE_MIN_BYTES,
      PROBE_TIMEOUT_MS,
    );
    return result.status === 200 && result.complete;
  } catch {
    return false;
  }
}

export async function probeApiRoute(): Promise<ApiRoute> {
  if (await carriesPayload(BACKEND_URL)) return "primary";
  if (!(await carriesPayload(BACKEND_URL_DIRECT))) return "none";

  reportApiFailure(BACKEND_URL);
  return "direct";
}

export function scheduleApiRouteProbe(delayMs = 5000): void {
  const run = async () => {
    const route = await probeApiRoute();
    if (route === "direct") setTimeout(() => void run(), RECHECK_MS);
  };

  setTimeout(() => void run(), delayMs);
}
