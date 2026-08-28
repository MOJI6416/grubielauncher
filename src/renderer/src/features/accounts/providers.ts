import type { AccountType } from "@/types/Account";

export type OnlineProvider = "discord" | "microsoft" | "elyby";

export const PROVIDER_ORDER: AccountType[] = [
  "discord",
  "microsoft",
  "elyby",
  "plain",
];

export type SkinSupport = "managed" | "external" | "none";

export interface ProviderCapabilities {
  requiresInternet: boolean;
  requiresBackend: boolean;
  skins: SkinSupport;
  capes: boolean;
  resetSkin: boolean;
  friends: boolean;
  onlineServers: boolean;
}

const CAPABILITIES: Record<AccountType, ProviderCapabilities> = {
  discord: {
    requiresInternet: true,
    requiresBackend: true,
    skins: "managed",
    capes: true,
    resetSkin: false,
    friends: true,
    onlineServers: false,
  },
  microsoft: {
    requiresInternet: true,
    requiresBackend: false,
    skins: "managed",
    capes: false,
    resetSkin: true,
    friends: true,
    onlineServers: true,
  },
  elyby: {
    requiresInternet: true,
    requiresBackend: false,
    skins: "external",
    capes: false,
    resetSkin: false,
    friends: true,
    onlineServers: false,
  },
  plain: {
    requiresInternet: false,
    requiresBackend: false,
    skins: "none",
    capes: false,
    resetSkin: false,
    friends: false,
    onlineServers: false,
  },
};

export function providerCapabilities(type: AccountType): ProviderCapabilities {
  return CAPABILITIES[type] ?? CAPABILITIES.plain;
}

export function providerRank(type: AccountType): number {
  const index = PROVIDER_ORDER.indexOf(type);
  return index === -1 ? PROVIDER_ORDER.length : index;
}

export interface ProviderFeature {
  key: string;
  available: boolean;
}

export function providerFeatures(type: AccountType): ProviderFeature[] {
  const caps = providerCapabilities(type);

  return [
    { key: "onlineServers", available: caps.onlineServers },
    caps.skins === "external"
      ? { key: "skinsExternal", available: true }
      : { key: "skinsManaged", available: caps.skins === "managed" },
    { key: "capes", available: caps.capes },
    { key: "friends", available: caps.friends },
    { key: "worksOffline", available: !caps.requiresInternet },
  ];
}

export function isProviderAvailable(
  type: AccountType,
  state: { isInternetOnline: boolean; isBackendOnline: boolean },
): boolean {
  const caps = providerCapabilities(type);
  if (caps.requiresInternet && !state.isInternetOnline) return false;
  if (caps.requiresBackend && !state.isBackendOnline) return false;

  return true;
}
