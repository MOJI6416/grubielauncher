const USER_PATH_PATTERNS: Array<[RegExp, string]> = [
  [/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\r\n"']+/gi, "$1<user>"],
  [/(\/(?:home|Users)\/)[^/\r\n"']+/gi, "$1<user>"],
];

const REDACTIONS: Array<[RegExp, string]> = [
  [/\bbearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <token>"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "<jwt>"],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "<email>"],
  [
    /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    "<uuid>",
  ],
  [/\b[0-9a-fA-F]{32}\b/g, "<uuid>"],
  [
    /([\w-]*[_-](?:token|secret|password|api[_-]?key|credential|session)[\w-]*|(?:token|secret|password|api[_-]?key|credential|session)[_-][\w-]*)(\s*=\s*)\S+/gi,
    "$1$2<secret>",
  ],
  [
    /\b(accessToken|access_token|sessionId|session|password|apiKey|api_key|secret|token|credential)(["'\s]*[:=]["'\s]*)[^\s"',}]+/gi,
    "$1$2<secret>",
  ],
  [
    /(--(?:accessToken|session|uuid|xuid|clientId))[,\s]+[^\s,\]]+/gi,
    "$1 <secret>",
  ],
  [/([\\/]Users[\\/])[^\\/\r\n"']+/gi, "$1<user>"],
  [
    /\b(USERNAME|USERDOMAIN|COMPUTERNAME|LOGNAME|HOSTNAME)(\s*=\s*)\S+/gi,
    "$1$2<host>",
  ],
  [/(--username[,\s]+)[^\s,\]]+/gi, "$1<player>"],
  [/(Setting user:\s*)\S+/gi, "$1<player>"],
  [/(\[CHAT\][^<\r\n]*)<[^>\r\n]{1,32}>/g, "$1<player>"],
  [
    /(\[CHAT\]\s*(?:\[[^\]\r\n]{1,24}\]\s*)*)[A-Za-z0-9_]{3,16}(?=\s*[:»])/g,
    "$1<player>",
  ],
  [
    /\b[A-Za-z0-9_]{3,16}\s+(joined|left)\s+the\s+game\b/g,
    "<player> $1 the game",
  ],
];

const IP_REDACTIONS: Array<[RegExp, string]> = [
  [/\b(?:\d{1,3}\.){3}\d{1,3}:\d{1,5}\b/g, "<ip>"],
  [
    /\b(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d{1,3}\.\d{1,3}\b/g,
    "<ip>",
  ],
  [
    /(\/|@|\bto\s+|\bhost[:=\s]+|\baddress[:=\s]+)(?:\d{1,3}\.){3}\d{1,3}\b/gi,
    "$1<ip>",
  ],
];

const NOISE_PATTERNS: RegExp[] = [
  /^\s*$/,
  /\[(?:DEBUG|TRACE)\]/,
  /\/(?:DEBUG|TRACE)\]/,
  /^\s*at (?:java\.base|jdk\.internal)\//,
];

const KEEP_LINE_PATTERN =
  /exception|error|caused by|failed|fatal|crash|missing|incompatib|conflict/i;

const MAX_REPEATED_LINES = 3;

export function redactSecrets(text: string): string {
  let result = text;

  for (const [pattern, replacement] of USER_PATH_PATTERNS) {
    result = result.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of REDACTIONS) {
    result = result.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of IP_REDACTIONS) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

const NICKNAME_DENYLIST = new Set([
  "java",
  "main",
  "mods",
  "mode",
  "mine",
  "error",
  "client",
  "server",
  "forge",
  "fabric",
  "quilt",
  "render",
  "thread",
  "minecraft",
  "worker",
  "sound",
  "chunk",
  "world",
]);

export function redactNickname(text: string, nickname?: string): string {
  const trimmed = nickname?.trim();
  if (!trimmed || trimmed.length < 3) return text;
  if (NICKNAME_DENYLIST.has(trimmed.toLowerCase())) return text;

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "<player>");
}

function isNoise(line: string): boolean {
  if (KEEP_LINE_PATTERN.test(line)) return false;

  return NOISE_PATTERNS.some((pattern) => pattern.test(line));
}

function normalizeForDedupe(line: string): string {
  return line
    .replace(/^\[[^\]]*\]\s*/, "")
    .replace(/\d+/g, "#")
    .trim();
}

export function compactLog(text: string, maxChars: number): string {
  const kept: string[] = [];
  const seen = new Map<string, number>();

  for (const line of text.split(/\r?\n/)) {
    if (isNoise(line)) continue;

    const key = normalizeForDedupe(line);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);

    if (count > MAX_REPEATED_LINES) continue;

    kept.push(line.trimEnd());
  }

  const joined = kept.join("\n");
  if (joined.length <= maxChars) return joined;

  const tail = joined.slice(-maxChars);
  const newlineIndex = tail.indexOf("\n");

  return newlineIndex === -1 ? tail : tail.slice(newlineIndex + 1);
}

export function prepareLogForAnalysis(
  text: string,
  options: { maxChars: number; nickname?: string },
): string {
  return compactLog(
    redactNickname(redactSecrets(text), options.nickname),
    options.maxChars,
  );
}
