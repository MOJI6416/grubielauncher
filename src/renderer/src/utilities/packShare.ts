const PACK_SHARE_BASE_URL = "https://grubielauncher.com/pack";
const PACK_CODE_PATTERN = /^[a-fA-F0-9]{24}$/;

export function buildPackShareUrl(shareCode: string) {
  return `${PACK_SHARE_BASE_URL}/${encodeURIComponent(shareCode)}`;
}

export function parsePackShareCode(input: string) {
  const value = input.trim();
  if (!value) return "";

  const slashCode = value.match(/^\/?([a-fA-F0-9]{24})$/);
  if (slashCode) return slashCode[1];

  try {
    const url = new URL(value);
    const isPublicPackUrl =
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.hostname.replace(/^www\./, "") === "grubielauncher.com";
    const isProtocolPackUrl = url.protocol === "grubielauncher:";

    if (isPublicPackUrl) {
      const segments = url.pathname.split("/").filter(Boolean);
      const packIndex = segments.indexOf("pack");
      const code = packIndex >= 0 ? segments[packIndex + 1] : "";

      if (code && PACK_CODE_PATTERN.test(code)) return code;
    }

    if (isProtocolPackUrl && url.hostname === "pack") {
      const code = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      if (PACK_CODE_PATTERN.test(code)) return code;
    }
  } catch {}

  return value;
}

export async function withPackRequestTimeout<T>(
  request: Promise<T>,
  timeoutMs = 15000,
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      request,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("PACK_REQUEST_TIMEOUT")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
