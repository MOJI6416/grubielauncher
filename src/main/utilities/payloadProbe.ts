import axios from "axios";
import type { Readable } from "stream";

export interface PayloadProbeResult {
  status: number;
  received: number;
  complete: boolean;
  latencyMs: number;
}

export function readAtLeast(
  stream: Readable,
  minBytes: number,
  signal: AbortSignal,
): Promise<{ received: number; ended: boolean }> {
  return new Promise((resolve) => {
    let received = 0;
    let settled = false;

    const finish = (ended: boolean) => {
      if (settled) return;
      settled = true;
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("error", onError);
      signal.removeEventListener("abort", onAbort);
      try {
        stream.destroy();
      } catch {}
      resolve({ received, ended });
    };

    const onData = (chunk: Buffer) => {
      received += chunk.length;
      if (received >= minBytes) finish(false);
    };
    const onEnd = () => finish(true);
    const onError = () => finish(false);
    const onAbort = () => finish(false);

    if (signal.aborted) {
      finish(false);
      return;
    }

    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("error", onError);
    signal.addEventListener("abort", onAbort);
  });
}

export async function probePayload(
  url: string,
  minBytes: number,
  timeoutMs: number,
): Promise<PayloadProbeResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await axios.get<Readable>(url, {
      timeout: timeoutMs,
      signal: controller.signal,
      validateStatus: () => true,
      maxRedirects: 0,
      responseType: "stream",
    });

    const { received, ended } = await readAtLeast(
      response.data,
      minBytes,
      controller.signal,
    );

    return {
      status: response.status,
      received,
      complete: received >= minBytes || ended,
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function describeStall(received: number): string {
  return `stalled after ${Math.round(received / 1024)} KB`;
}
