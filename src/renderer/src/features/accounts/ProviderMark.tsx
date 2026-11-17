import { WifiOff } from "lucide-react";
import type { AccountType } from "@/types/Account";
import type { TFunction } from "i18next";
import { cn } from "@/lib/utils";
import discordLogo from "@renderer/assets/providers/discord.svg";
import microsoftLogo from "@renderer/assets/providers/microsoft.svg";
import elybyLogo from "@renderer/assets/providers/elyby.svg";
import littleskinLogo from "@renderer/assets/providers/littleskin.png";

const PROVIDER_LOGOS: Partial<Record<string, string>> = {
  discord: discordLogo,
  microsoft: microsoftLogo,
  elyby: elybyLogo,
  littleskin: littleskinLogo,
};

export function hasProviderLogo(type: string | null | undefined): boolean {
  return !!type && !!PROVIDER_LOGOS[type];
}

export function ProviderIcon({
  type,
  size = 14,
  className,
}: {
  type: AccountType | (string & {});
  size?: number;
  className?: string;
}) {
  const logo = PROVIDER_LOGOS[type];
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        aria-hidden
        draggable={false}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cn("shrink-0 object-contain select-none", className)}
      />
    );
  }

  return <WifiOff size={size} className={className} />;
}

export function providerName(type: AccountType, t: TFunction): string {
  if (type === "microsoft") return t("accounts.microsoft");
  if (type === "elyby") return t("accounts.elyby");
  if (type === "discord") return t("accounts.discord");

  return t("accounts.offline");
}
