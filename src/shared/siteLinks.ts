import { SITE_URL } from "./config";

export const DOWNLOAD_URL = SITE_URL;
export const DISCORD_INVITE_URL = "https://discord.gg/URrKha9hk7";

const PROFILE_ID = /^[a-z0-9]{1,64}$/i;
const MAX_NICKNAME = 32;
const MAX_BUTTON_LABEL = 32;
const MAX_BUTTON_URL = 512;
const MAX_BUTTONS = 2;

export function buildProfileUrl(
  nickname: string | null | undefined,
  id?: string | null,
): string | null {
  const name = (nickname ?? "").trim().slice(0, MAX_NICKNAME);
  if (!name) return null;

  const base = `${SITE_URL}/u/${encodeURIComponent(name)}`;
  const key = (id ?? "").trim();
  return PROFILE_ID.test(key) ? `${base}?id=${encodeURIComponent(key)}` : base;
}

export function buildPackUrl(code: string): string {
  return `${SITE_URL}/pack/${encodeURIComponent(code.trim())}`;
}

const SITE_LOCALES = new Set(["en", "ru", "uk", "de", "es", "fr", "pl", "pt", "tr"]);

export function buildCompanionUrl(language: string | null | undefined): string {
  const code = (language ?? "").toLowerCase().split("-")[0];
  return `${SITE_URL}/${SITE_LOCALES.has(code) ? code : "en"}#companion`;
}

export interface RpcButton {
  label: string;
  url: string;
}

export interface RpcButtonLabels {
  profile: string;
  pack: string;
  download: string;
  discord: string;
}

function usableUrl(url: string | null | undefined): url is string {
  return (
    typeof url === "string" &&
    url.length <= MAX_BUTTON_URL &&
    /^https:\/\//i.test(url)
  );
}

function label(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > MAX_BUTTON_LABEL
    ? `${text.slice(0, MAX_BUTTON_LABEL - 1).trimEnd()}…`
    : text;
}

export function buildRpcButtons({
  profileUrl,
  packUrl,
  labels,
}: {
  profileUrl?: string | null;
  packUrl?: string | null;
  labels: RpcButtonLabels;
}): RpcButton[] {
  const buttons: RpcButton[] = [];

  if (usableUrl(profileUrl)) {
    buttons.push({ label: label(labels.profile), url: profileUrl });
  }
  if (usableUrl(packUrl)) {
    buttons.push({ label: label(labels.pack), url: packUrl });
  }

  for (const fallback of [
    { label: labels.download, url: DOWNLOAD_URL },
    { label: labels.discord, url: DISCORD_INVITE_URL },
  ]) {
    if (buttons.length >= MAX_BUTTONS) break;
    buttons.push({ label: label(fallback.label), url: fallback.url });
  }

  return buttons.slice(0, MAX_BUTTONS);
}
