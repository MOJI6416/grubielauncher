import type { AccountType, ILocalAccount } from "@/types/Account";
import { accountSubject } from "./identity";

const PROVIDER_PROFILE_URL: Partial<Record<AccountType, string>> = {
  microsoft: "https://www.minecraft.net/msaprofile/mygames/editprofile",
  elyby: "https://account.ely.by/",
};

export function canChooseNickname(type: AccountType): boolean {
  return type === "discord";
}

export function providerProfileUrl(type: AccountType): string | null {
  return PROVIDER_PROFILE_URL[type] ?? null;
}

export function nicknameAccountId(account: ILocalAccount): string | null {
  return accountSubject(account) || account.id || null;
}
