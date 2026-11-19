const SITE_HOST = "grubielauncher.com";
const PACK_SHARE_BASE_URL = `https://${SITE_HOST}/pack`;
const GROUP_INVITE_BASE_URL = `https://${SITE_HOST}/g`;
const PACK_CODE_PATTERN = /^[a-fA-F0-9]{24}$/;
const SHORT_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}$/i;
const GROUP_CODE_PATTERN = /^[a-zA-Z0-9]{4}-?[a-zA-Z0-9]{4}$/;

export function buildPackShareUrl(shareCode: string) {
  return `${PACK_SHARE_BASE_URL}/${encodeURIComponent(shareCode)}`;
}

export function buildGroupInviteUrl(code: string) {
  return `${GROUP_INVITE_BASE_URL}/${encodeURIComponent(code)}`;
}

function normalizePackCode(code: string): string | null {
  if (PACK_CODE_PATTERN.test(code)) return code;
  if (!SHORT_CODE_PATTERN.test(code)) return null;

  const compact = code.replace("-", "").toUpperCase();
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function isPackCode(value: string) {
  return normalizePackCode(value) !== null;
}

export function parsePackShareCode(input: string) {
  const value = input.trim();
  if (!value) return "";

  const slashCode = value.match(/^\/?([a-fA-F0-9]{24})$/);
  if (slashCode) return slashCode[1];

  try {
    const url = new URL(value);
    const isPublicPackUrl = isSiteUrl(url);
    const isProtocolPackUrl = url.protocol === "grubielauncher:";

    if (isPublicPackUrl) {
      const segments = url.pathname.split("/").filter(Boolean);
      const packIndex = segments.indexOf("pack");
      const code = packIndex >= 0 ? segments[packIndex + 1] : "";
      const normalized = code ? normalizePackCode(code) : null;

      if (normalized) return normalized;
    }

    if (isProtocolPackUrl && url.hostname === "pack") {
      const code = normalizePackCode(
        decodeURIComponent(url.pathname.replace(/^\/+/, "")),
      );
      if (code) return code;
    }
  } catch {}

  return value;
}

function isSiteUrl(url: URL) {
  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    url.hostname.replace(/^www\./, "") === SITE_HOST
  );
}

export function parseGroupJoinCode(input: string): string | null {
  try {
    const url = new URL(input.trim());

    if (isSiteUrl(url)) {
      const segments = url.pathname.split("/").filter(Boolean);
      const index = segments.indexOf("g");
      const code = index >= 0 && index <= 1 ? segments[index + 1] : "";
      return code && GROUP_CODE_PATTERN.test(code) ? code : null;
    }

    if (url.protocol !== "grubielauncher:" || url.hostname !== "group") {
      return null;
    }

    const [action, code] = decodeURIComponent(
      url.pathname.replace(/^\/+/, ""),
    ).split("/");
    if (action !== "join" || !code || !GROUP_CODE_PATTERN.test(code)) {
      return null;
    }

    return code;
  } catch {
    return null;
  }
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
