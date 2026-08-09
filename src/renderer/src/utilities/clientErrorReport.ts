import { getApiBase } from "./apiBase";

const LIMITS = {
  release: 32,
  message: 500,
  stack: 4000,
  locale: 8,
  platform: 32,
} as const;

const MAX_REPORTS_PER_SESSION = 3;

let sent = 0;

function trim(value: string | undefined, max: number): string | undefined {
  const text = (value || "").trim().slice(0, max);

  return text || undefined;
}

export function reportLauncherError(
  message: string,
  stack: string | undefined,
  locale: string,
): void {
  if (sent >= MAX_REPORTS_PER_SESSION) return;
  sent += 1;

  void (async () => {
    const api = window.api;
    const release = await api?.other.getVersion().catch(() => undefined);

    await fetch(`${getApiBase()}/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify({
        source: "launcher",
        release: trim(release, LIMITS.release),
        message: trim(message, LIMITS.message),
        stack: trim(stack, LIMITS.stack),
        locale: trim(locale, LIMITS.locale),
        platform: trim(api?.platform, LIMITS.platform),
      }),
    });
  })().catch(() => {});
}
