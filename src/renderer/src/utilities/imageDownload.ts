export interface DownloadedImage {
  data: ArrayBuffer;
  contentType: string | null;
}

export async function downloadImage(
  url: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<DownloadedImage> {
  const signals = [
    options.signal,
    options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined,
  ].filter((signal): signal is AbortSignal => !!signal);

  const response = await fetch(url, {
    signal: signals.length > 0 ? AbortSignal.any(signals) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Image download failed with status ${response.status}`);
  }

  return {
    data: await response.arrayBuffer(),
    contentType: response.headers.get("content-type"),
  };
}
