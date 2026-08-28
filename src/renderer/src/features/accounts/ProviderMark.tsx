import { FaDiscord, FaMicrosoft } from "react-icons/fa";
import { TbSquareLetterE } from "react-icons/tb";
import { WifiOff } from "lucide-react";
import type { AccountType } from "@/types/Account";
import type { TFunction } from "i18next";

export function ProviderIcon({
  type,
  size = 14,
  className,
}: {
  type: AccountType;
  size?: number;
  className?: string;
}) {
  if (type === "microsoft")
    return <FaMicrosoft size={size} className={className} />;
  if (type === "elyby")
    return <TbSquareLetterE size={size} className={className} />;
  if (type === "discord")
    return <FaDiscord size={size} className={className} />;

  return <WifiOff size={size} className={className} />;
}

export function providerName(type: AccountType, t: TFunction): string {
  if (type === "microsoft") return t("accounts.microsoft");
  if (type === "elyby") return t("accounts.elyby");
  if (type === "discord") return t("accounts.discord");

  return t("accounts.offline");
}
