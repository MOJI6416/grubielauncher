export type AgentErrorKind =
  | "auth"
  | "credit"
  | "rateLimit"
  | "badModel"
  | "noTools"
  | "context"
  | "timeout"
  | "network"
  | "server"
  | "stepLimit"
  | "emptyTurn"
  | "unknown";

export type AgentErrorRecovery =
  | "providers"
  | "model"
  | "retry"
  | "continue"
  | "newChat"
  | "connectivity"
  | "none";

export type AgentErrorReport = {
  kind: AgentErrorKind;
  titleKey: string;
  hintKey: string;
  recovery: AgentErrorRecovery;
  detail: string | null;
  code: string | null;
};

const DETAIL_MAX = 240;

const INTERNAL: Record<
  string,
  { kind: AgentErrorKind; recovery: AgentErrorRecovery }
> = {
  stepLimit: { kind: "stepLimit", recovery: "continue" },
  emptyTurn: { kind: "emptyTurn", recovery: "retry" },
  emptyTurnWithTools: { kind: "noTools", recovery: "model" },
  emptyTurnMidRun: { kind: "emptyTurn", recovery: "retry" },
  unknownProvider: { kind: "auth", recovery: "providers" },
  missingApiKey: { kind: "auth", recovery: "providers" },
};

function statusOf(code: string | null): number | null {
  if (!code) return null;
  const match = /^AI-(\d{3})$/.exec(code);
  return match ? Number(match[1]) : null;
}

function statusInText(text: string): number | null {
  const match = /\b(?:status|code|error)\D{0,3}(\d{3})\b/.exec(text);
  if (!match) return null;

  const status = Number(match[1]);
  return status >= 400 && status <= 599 ? status : null;
}

function detailOf(message: string): string | null {
  const clean = message.replace(/\s+/g, " ").trim();
  if (clean === "") return null;
  return clean.length > DETAIL_MAX ? `${clean.slice(0, DETAIL_MAX)}…` : clean;
}

function matchText(
  text: string,
): { kind: AgentErrorKind; recovery: AgentErrorRecovery } | null {
  if (/context (length|window)|maximum context|too many tokens|context_length/.test(text)) {
    return { kind: "context", recovery: "newChat" };
  }
  if (/(tool|function)[^.]{0,40}(not supported|unsupported|does not support)/.test(text)) {
    return { kind: "noTools", recovery: "model" };
  }
  if (/no support for tools|does not support tool/.test(text)) {
    return { kind: "noTools", recovery: "model" };
  }
  if (/rate limit|too many requests|temporarily rate-limited/.test(text)) {
    return { kind: "rateLimit", recovery: "retry" };
  }
  if (/insufficient (credit|funds|balance|quota)|not enough credit|payment required|billing/.test(text)) {
    return { kind: "credit", recovery: "providers" };
  }
  if (/invalid api key|incorrect api key|no auth credentials|unauthorized|invalid token/.test(text)) {
    return { kind: "auth", recovery: "providers" };
  }
  if (/(model|endpoint)[^.]{0,40}(not found|not exist|unavailable)|no endpoints found/.test(text)) {
    return { kind: "badModel", recovery: "model" };
  }
  if (/timed out|timeout|sent nothing for/.test(text)) {
    return { kind: "timeout", recovery: "retry" };
  }
  if (/fetch failed|network|econnreset|enotfound|socket hang up|getaddrinfo/.test(text)) {
    return { kind: "network", recovery: "connectivity" };
  }

  return null;
}

function fromStatus(
  status: number,
): { kind: AgentErrorKind; recovery: AgentErrorRecovery } | null {
  if (status === 401 || status === 403) {
    return { kind: "auth", recovery: "providers" };
  }
  if (status === 402) return { kind: "credit", recovery: "providers" };
  if (status === 429) return { kind: "rateLimit", recovery: "retry" };
  if (status === 404) return { kind: "badModel", recovery: "model" };
  if (status === 400 || status === 422) {
    return { kind: "unknown", recovery: "model" };
  }
  if (status >= 500) return { kind: "server", recovery: "retry" };

  return null;
}

export function classifyAgentError(input: {
  message: string;
  code?: string | null;
}): AgentErrorReport {
  const message = input.message ?? "";
  const code = input.code?.trim() ? input.code.trim() : null;

  const internal = INTERNAL[message];
  if (internal) {
    return {
      kind: internal.kind,
      titleKey: `agent.errors.${message}.title`,
      hintKey: `agent.errors.${message}.hint`,
      recovery: internal.recovery,
      detail: null,
      code,
    };
  }

  const text = message.toLowerCase();
  const status = statusOf(code) ?? statusInText(text);

  const resolved =
    matchText(text) ??
    (status !== null ? fromStatus(status) : null) ??
    (code === "AI-TIMEOUT"
      ? { kind: "timeout" as const, recovery: "retry" as const }
      : code === "AI-NETWORK"
        ? { kind: "network" as const, recovery: "connectivity" as const }
        : null) ?? { kind: "unknown" as const, recovery: "retry" as const };

  return {
    kind: resolved.kind,
    titleKey: `agent.errors.${resolved.kind}.title`,
    hintKey: `agent.errors.${resolved.kind}.hint`,
    recovery: resolved.recovery,
    detail: detailOf(message),
    code,
  };
}
