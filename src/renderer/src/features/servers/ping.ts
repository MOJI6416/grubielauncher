export type LatencyTone = "success" | "warning" | "destructive";

export type PingFailure =
  | "timeout"
  | "refused"
  | "dns"
  | "badResponse"
  | "unknown";

export function describePingError(error: string | undefined): PingFailure {
  if (!error) return "unknown";

  const value = error.toLowerCase();

  if (value.includes("enotfound") || value.includes("eai_again")) return "dns";
  if (value.includes("econnrefused")) return "refused";
  if (value.includes("timeout") || value.includes("etimedout")) return "timeout";
  if (value.includes("bad_response")) return "badResponse";

  return "unknown";
}

export function latencyBars(latencyMs: number | undefined): number {
  if (latencyMs === undefined || latencyMs < 0) return 0;
  if (latencyMs < 150) return 5;
  if (latencyMs < 300) return 4;
  if (latencyMs < 600) return 3;
  if (latencyMs < 1000) return 2;
  return 1;
}

export function latencyTone(latencyMs: number | undefined): LatencyTone {
  if (latencyMs === undefined || latencyMs < 0) return "destructive";
  if (latencyMs < 120) return "success";
  if (latencyMs < 250) return "warning";
  return "destructive";
}

export async function runWithConcurrency<TInput, TResult>(
  items: TInput[],
  limit: number,
  worker: (item: TInput) => Promise<TResult>,
  onResult?: (item: TInput, result: TResult) => void,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  const size = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  const runners = Array.from({ length: size }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;

      const result = await worker(items[index]);
      results[index] = result;
      onResult?.(items[index], result);
    }
  });

  await Promise.all(runners);

  return results;
}
