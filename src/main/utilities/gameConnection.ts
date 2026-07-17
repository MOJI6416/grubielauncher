export interface ParsedMinecraftServerConnection {
  serverAddress: string;
  serverPort: number;
}

const CONNECT_WITH_COMMA =
  /\bConnecting to\s+\/?([a-z0-9_.-]+)\s*,\s*(\d{1,5})\b/i;
const CONNECT_WITH_COLON = /\bConnecting to\s+\/?([a-z0-9_.-]+):(\d{1,5})\b/i;
const CONNECTED_WITH_COLON =
  /\bConnected to server\s+\/?([a-z0-9_.-]+):(\d{1,5})\b/i;
const CONNECT_FALLBACK = /\bConnecting to\s+\/?([a-z0-9_.-]+)\b/i;
const CONNECTED_FALLBACK = /\bConnected to server\s+\/?([a-z0-9_.-]+)\b/i;

function parsePort(value: string | undefined): number | null {
  const port = Number.parseInt(value || "", 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return port;
}

function isLikelyServerHost(value: string) {
  const host = value.toLowerCase();
  if (host === "localhost") return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(".");
}

function parseMatch(
  match: RegExpMatchArray | null,
  fallbackPort?: number,
): ParsedMinecraftServerConnection | null {
  if (!match?.[1]) return null;

  const serverAddress = match[1].trim();
  const explicitPort = parsePort(match[2]);
  const serverPort = explicitPort ?? fallbackPort ?? null;
  if (!serverPort) return null;

  if (!explicitPort && !isLikelyServerHost(serverAddress)) return null;

  return {
    serverAddress,
    serverPort,
  };
}

const CONNECTION_QUICK_TEST = /connect/i;

export function parseMinecraftServerConnectionLine(
  message: string,
): ParsedMinecraftServerConnection | null {
  if (!CONNECTION_QUICK_TEST.test(message)) return null;

  return (
    parseMatch(message.match(CONNECT_WITH_COMMA)) ||
    parseMatch(message.match(CONNECT_WITH_COLON)) ||
    parseMatch(message.match(CONNECTED_WITH_COLON)) ||
    parseMatch(message.match(CONNECT_FALLBACK), 25565) ||
    parseMatch(message.match(CONNECTED_FALLBACK), 25565)
  );
}
