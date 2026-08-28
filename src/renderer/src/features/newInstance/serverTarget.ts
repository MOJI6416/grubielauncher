import { toNbtSafeText } from "@/shared/nbtText";

const HOST_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;
const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export interface ServerTarget {
  host: string;
  port: number | null;
  address: string;
}

export function parseServerAddress(raw: string): ServerTarget | null {
  let value = raw.trim().toLowerCase();
  if (!value) return null;

  value = value.replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "");
  if (!value) return null;

  let host = value;
  let port: number | null = null;

  const separator = value.lastIndexOf(":");
  if (separator > 0) {
    const rawPort = value.slice(separator + 1);
    if (!/^\d+$/.test(rawPort)) return null;

    port = Number(rawPort);
    if (port < 1 || port > 65535) return null;

    host = value.slice(0, separator);
  }

  if (!host || host.length > 253) return null;
  if (!HOST_PATTERN.test(host)) return null;

  const ipv4 = IPV4_PATTERN.exec(host);
  if (ipv4 && ipv4.slice(1).some((part) => Number(part) > 255)) return null;
  if (!ipv4 && !host.includes(".")) return null;

  return {
    host,
    port,
    address: port === null ? host : `${host}:${port}`,
  };
}

export function minecraftVersionFromPing(
  versionName: string | null | undefined,
): string | null {
  if (!versionName) return null;

  const matches = [...versionName.matchAll(/\d+\.\d+(?:\.\d+)?/g)];
  if (matches.length === 0) return null;

  return matches[matches.length - 1][0];
}

export function serverListName(
  motd: string | null | undefined,
  host: string,
): string {
  const line = toNbtSafeText(motd?.split("\n")[0] ?? "")
    .replace(/§[0-9a-fk-or]/gi, "")
    .trim();

  return line.slice(0, 32).trim() || host;
}

export function serverInstanceName(target: ServerTarget): string {
  const parts = target.host.split(".").filter(Boolean);
  if (parts.length === 0) return target.host;

  const labels = IPV4_PATTERN.test(target.host)
    ? [target.host]
    : parts.slice(0, Math.max(1, parts.length - 1));

  const name = labels[labels.length - 1] ?? target.host;

  return name.charAt(0).toUpperCase() + name.slice(1);
}
