export const APP_PAGE_HOSTS = [
  "bundle",
  "tray",
  "overlay",
  "updater",
  "setup",
] as const;

export type AppPageHost = (typeof APP_PAGE_HOSTS)[number];

export function isAppPageHost(host: string): host is AppPageHost {
  return (APP_PAGE_HOSTS as readonly string[]).includes(host);
}

export function appPageUrl(host: AppPageHost, page: string): string {
  return `app://${host}/${page}`;
}
