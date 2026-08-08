export type FailureSide =
  | "network"
  | "grubie"
  | "mirror"
  | "curseforge"
  | "modrinth"
  | "mojang"
  | "loader"
  | "elyby"
  | "microsoft"
  | "discord"
  | "external"
  | "disk"
  | "game"
  | "launcher"
  | "unknown";

export type FailureCause =
  | "offline"
  | "dns"
  | "refused"
  | "timeout"
  | "reset"
  | "tls"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "rateLimited"
  | "serverError"
  | "badRequest"
  | "conflict"
  | "tooLarge"
  | "downloadFailed"
  | "checksum"
  | "archive"
  | "blockedMod"
  | "untrusted"
  | "diskFull"
  | "accessDenied"
  | "fileBusy"
  | "fileMissing"
  | "javaMissing"
  | "pathPolicy"
  | "invalidArgument"
  | "cancelled"
  | "unknown";

export interface FailureInfo {
  code: string;
  side: FailureSide;
  cause: FailureCause;
  status?: number;
  host?: string;
  url?: string;
  channel?: string;
  message: string;
  time: number;
}

export interface FailureContext {
  channel?: string;
  url?: string;
  side?: FailureSide;
}

const SIDE_CODES: Record<FailureSide, string> = {
  network: "NET",
  grubie: "GRB",
  mirror: "MIR",
  curseforge: "CF",
  modrinth: "MR",
  mojang: "MJ",
  loader: "LDR",
  elyby: "ELY",
  microsoft: "MS",
  discord: "DSC",
  external: "EXT",
  disk: "DISK",
  game: "GAME",
  launcher: "APP",
  unknown: "ERR",
};

const CAUSE_CODES: Record<FailureCause, string> = {
  offline: "OFFLINE",
  dns: "DNS",
  refused: "REFUSED",
  timeout: "TIMEOUT",
  reset: "RESET",
  tls: "TLS",
  unauthorized: "401",
  forbidden: "403",
  notFound: "404",
  rateLimited: "429",
  serverError: "5XX",
  badRequest: "400",
  conflict: "409",
  tooLarge: "413",
  downloadFailed: "DOWNLOAD",
  checksum: "CHECKSUM",
  archive: "ARCHIVE",
  blockedMod: "BLOCKED",
  untrusted: "UNTRUSTED",
  diskFull: "FULL",
  accessDenied: "ACCESS",
  fileBusy: "BUSY",
  fileMissing: "MISSING",
  javaMissing: "JAVA",
  pathPolicy: "PATHPOLICY",
  invalidArgument: "BADARG",
  cancelled: "CANCELLED",
  unknown: "UNKNOWN",
};

const HOST_SIDES: Array<[string, FailureSide]> = [
  ["mirror.grubielauncher.com", "mirror"],
  ["grubielauncher.com", "grubie"],
  ["forgecdn.net", "curseforge"],
  ["curseforge.com", "curseforge"],
  ["modrinth.com", "modrinth"],
  ["mojang.com", "mojang"],
  ["minecraft.net", "mojang"],
  ["fabricmc.net", "loader"],
  ["quiltmc.org", "loader"],
  ["minecraftforge.net", "loader"],
  ["neoforged.net", "loader"],
  ["papermc.io", "loader"],
  ["purpurmc.org", "loader"],
  ["spigotmc.org", "loader"],
  ["getbukkit.org", "loader"],
  ["ely.by", "elyby"],
  ["microsoftonline.com", "microsoft"],
  ["live.com", "microsoft"],
  ["xboxlive.com", "microsoft"],
  ["microsoft.com", "microsoft"],
  ["discord.com", "discord"],
  ["discordapp.com", "discord"],
  ["discordapp.net", "discord"],
];

const NETWORK_ERRNO: Record<string, FailureCause> = {
  ENOTFOUND: "dns",
  EAI_AGAIN: "dns",
  ECONNREFUSED: "refused",
  ECONNRESET: "reset",
  EPIPE: "reset",
  ETIMEDOUT: "timeout",
  ECONNABORTED: "timeout",
  ERR_NETWORK: "offline",
  ENETUNREACH: "offline",
  ENETDOWN: "offline",
  EHOSTUNREACH: "offline",
  EAI_NODATA: "dns",
};

const DISK_ERRNO: Record<string, FailureCause> = {
  ENOSPC: "diskFull",
  EDQUOT: "diskFull",
  EACCES: "accessDenied",
  EPERM: "accessDenied",
  EROFS: "accessDenied",
  EBUSY: "fileBusy",
  ETXTBSY: "fileBusy",
  ENOENT: "fileMissing",
  EMFILE: "accessDenied",
  ENFILE: "accessDenied",
  EXDEV: "accessDenied",
  EISDIR: "accessDenied",
  ENOTEMPTY: "fileBusy",
  ENAMETOOLONG: "accessDenied",
};

const TLS_TOKENS = [
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
];

export function hostFromUrl(url: unknown): string | undefined {
  if (typeof url !== "string" || url === "") return undefined;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    const match = url.match(/https?:\/\/([^/\s:]+)/i);
    return match ? match[1].toLowerCase() : undefined;
  }
}

export function sideFromHost(host: unknown): FailureSide | undefined {
  if (typeof host !== "string" || host === "") return undefined;
  const normalized = host.toLowerCase();
  for (const [suffix, side] of HOST_SIDES) {
    if (normalized === suffix || normalized.endsWith(`.${suffix}`)) return side;
  }
  return "external";
}

function errorMessage(error: unknown): string {
  if (error === null || error === undefined) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "object") {
    const anyError = error as Record<string, unknown>;
    if (typeof anyError.message === "string") return anyError.message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function serverMessage(error: unknown): string {
  const data = (error as Record<string, any> | null)?.response?.data;
  if (!data) return "";

  const detail = typeof data === "string" ? data : (data.message ?? data.error);
  const text = Array.isArray(detail)
    ? detail.join("; ")
    : typeof detail === "string"
      ? detail
      : "";

  return text.startsWith("<") ? "" : text.trim().slice(0, 200);
}

function statusFromError(error: unknown, message: string): number | undefined {
  const anyError = error as Record<string, any> | null;
  const responseStatus = anyError?.response?.status ?? anyError?.status;
  if (typeof responseStatus === "number" && responseStatus >= 100) {
    return responseStatus;
  }

  const match = message.match(/status code (\d{3})|\bHTTP (\d{3})\b/i);
  if (match) return Number(match[1] || match[2]);
  return undefined;
}

function causeFromStatus(status: number): FailureCause {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 408) return "timeout";
  if (status === 409) return "conflict";
  if (status === 413) return "tooLarge";
  if (status === 429) return "rateLimited";
  if (status >= 500) return "serverError";
  return "badRequest";
}

function errnoFromError(error: unknown, message: string): string | undefined {
  const raw = (error as Record<string, unknown> | null)?.code;
  if (typeof raw === "string" && raw !== "") return raw.toUpperCase();

  const match = message.match(
    /\b(ENOSPC|EDQUOT|EACCES|EPERM|EROFS|EBUSY|ETXTBSY|ENOENT|EMFILE|ENFILE|EXDEV|EISDIR|ENOTEMPTY|ENAMETOOLONG|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|EPIPE|ETIMEDOUT|ECONNABORTED|ENETUNREACH|ENETDOWN|EHOSTUNREACH)\b/,
  );
  return match ? match[1] : undefined;
}

function causeFromMessage(message: string): FailureCause | undefined {
  const text = message.toLowerCase();

  if (
    text === "aborterror" ||
    text.includes("canceled") ||
    text.includes("cancelled")
  ) {
    return "cancelled";
  }
  if (text.includes("checksum mismatch")) return "checksum";
  if (text.includes("manual download required") || text.includes("blocked::")) {
    return "blockedMod";
  }
  if (
    text.includes("refused untrusted") ||
    text.includes("unsafe tar linkpath")
  ) {
    return "untrusted";
  }
  if (
    text.includes("unsupported archive format") ||
    text.includes("end of central directory") ||
    text.includes("invalid or unsupported zip") ||
    text.includes("invalid zip") ||
    text.includes("corrupted zip")
  ) {
    return "archive";
  }
  if (
    text.includes("failed to download") ||
    text.includes("download stalled")
  ) {
    return "downloadFailed";
  }
  if (text.includes("network error")) return "offline";
  if (text.includes("timeout of") || text.includes("timed out"))
    return "timeout";
  if (
    text.includes("java") &&
    (text.includes("not found") || text.includes("missing"))
  ) {
    return "javaMissing";
  }
  return undefined;
}

export function classifyError(
  error: unknown,
  context: FailureContext = {},
): FailureInfo {
  const message = errorMessage(error);
  const anyError = error as Record<string, any> | null;

  const url =
    context.url ||
    (typeof anyError?.config?.url === "string"
      ? anyError.config.url
      : undefined) ||
    (typeof anyError?.url === "string" ? anyError.url : undefined);

  const baseUrl =
    typeof anyError?.config?.baseURL === "string"
      ? anyError.config.baseURL
      : undefined;

  const host = hostFromUrl(url) || hostFromUrl(baseUrl) || hostFromUrl(message);

  let side: FailureSide | undefined = context.side || sideFromHost(host);
  let cause: FailureCause = "unknown";
  const status = statusFromError(error, message);

  const errno = errnoFromError(error, message);
  const upperMessage = message.toUpperCase();
  const isTls = TLS_TOKENS.some((token) => upperMessage.includes(token));

  if (isTls) {
    cause = "tls";
    side = "network";
  } else if (errno && NETWORK_ERRNO[errno]) {
    cause = NETWORK_ERRNO[errno];
    if (cause !== "timeout") side = "network";
    else side = side || "network";
  } else if (errno && DISK_ERRNO[errno]) {
    cause = DISK_ERRNO[errno];
    side = "disk";
  } else if (status !== undefined) {
    cause = causeFromStatus(status);
    side = side || "external";
  } else {
    const guessed = causeFromMessage(message);
    if (guessed) {
      cause = guessed;
      if (guessed === "offline") side = "network";
      if (guessed === "javaMissing") side = "game";
      if (guessed === "untrusted") side = "launcher";
    }
  }

  const resolvedSide: FailureSide = side || "unknown";
  const codeSuffix =
    status !== undefined && status >= 400 ? String(status) : CAUSE_CODES[cause];

  const detail = serverMessage(error);
  const detailedMessage =
    detail && !message.includes(detail) ? `${message}: ${detail}` : message;

  return {
    code: `${SIDE_CODES[resolvedSide]}-${codeSuffix}`,
    side: resolvedSide,
    cause,
    status,
    host,
    url: typeof url === "string" ? url : undefined,
    channel: context.channel,
    message: detailedMessage.slice(0, 500),
    time: Date.now(),
  };
}

export function isCancelledFailure(info: FailureInfo | null | undefined) {
  return info?.cause === "cancelled";
}
