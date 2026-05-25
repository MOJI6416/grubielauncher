import type { ILocalAccount } from "@/types/Account";
import type { ShareState } from "@/types/Share";

export function getShareAccountKey(account: ILocalAccount | undefined | null) {
  return account ? `${account.type}_${account.nickname}` : null;
}

export function isShareStateActiveForAccountBinding(state: ShareState) {
  return (
    !!state.sessionId ||
    !!state.candidate ||
    !!state.target ||
    !["idle", "lan_not_found"].includes(state.phase)
  );
}

export function canCurrentAccountManageShare(
  ownerAccountKey: string | null,
  account: ILocalAccount | undefined | null,
) {
  if (!ownerAccountKey) return true;
  return getShareAccountKey(account) === ownerAccountKey;
}
