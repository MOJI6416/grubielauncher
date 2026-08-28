export interface ShareAddressInfo {
  raw: string;
  handle: string;
  domain: string;
  masked: string;
}

const HANDLE_MASK = "••••••";

export function parseShareAddress(
  raw: string | null | undefined,
): ShareAddressInfo | null {
  if (!raw) return null;

  const trimmed = raw.trim().replace(/^\w+:\/\//, "").replace(/\/+$/, "");
  if (!trimmed) return null;

  const [hostPart] = trimmed.split("/");
  const host = hostPart.split(":")[0];
  if (!host || !host.includes(".")) {
    return { raw: trimmed, handle: trimmed, domain: "", masked: HANDLE_MASK };
  }

  const dot = host.indexOf(".");
  const handle = host.slice(0, dot);
  const domain = host.slice(dot + 1);

  return {
    raw: trimmed,
    handle,
    domain,
    masked: `${HANDLE_MASK}.${domain}`,
  };
}

export function isShareAddressUsable(
  address: string | null | undefined,
  visibility: string | null | undefined,
): boolean {
  return !!address && visibility === "public";
}
