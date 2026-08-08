import dns from "dns/promises";
import net from "net";

export function isSafeRemoteUrl(url: unknown): url is string {
  if (typeof url !== "string" || url === "") return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    isPrivateIpv4(host) ||
    isPrivateIpv6(host)
  ) {
    return false;
  }

  return true;
}

function isPrivateIpv4(host: string): boolean {
  return (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^0\./.test(host)
  );
}

function isPrivateIpv6(host: string): boolean {
  if (!host.includes(":")) return false;

  if (host === "::1" || host === "::") return true;

  const mapped = /^::ffff:(?:0:)?(.+)$/.exec(host);
  if (mapped) {
    const tail = mapped[1];
    if (tail.includes(".")) return isPrivateIpv4(tail) || tail === "0.0.0.0";

    const words = tail.split(":");
    if (words.length === 2) {
      const high = Number.parseInt(words[0], 16);
      const low = Number.parseInt(words[1], 16);
      if (Number.isFinite(high) && Number.isFinite(low)) {
        const dotted = [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
        return isPrivateIpv4(dotted) || dotted === "0.0.0.0";
      }
    }
  }

  return /^f[cd][0-9a-f]{0,2}:/.test(host) || /^fe[89ab][0-9a-f]?:/.test(host);
}

export function isSafeRemoteImageUrl(url: unknown): url is string {
  if (!isSafeRemoteUrl(url)) return false;
  return new URL(url).protocol === "https:";
}

function isPrivateAddress(address: string): boolean {
  const host = address.toLowerCase().replace(/^\[|\]$/g, "");
  return isPrivateIpv4(host) || isPrivateIpv6(host);
}

export async function isSafeRemoteFetchUrl(url: unknown): Promise<boolean> {
  if (!isSafeRemoteImageUrl(url)) return false;

  const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (net.isIP(host) !== 0) return true;

  try {
    const addresses = await dns.lookup(host, { all: true, verbatim: true });
    if (addresses.length === 0) return false;
    return !addresses.some((entry) => isPrivateAddress(entry.address));
  } catch {
    return false;
  }
}

