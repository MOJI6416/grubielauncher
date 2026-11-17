import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ILocalAccount } from "@/types/Account";
import { Hint } from "@renderer/components/Hint";
import { accountAtom, accountsAtom } from "@renderer/stores/atoms";
import { AccountHead } from "@renderer/features/accounts/AccountHead";
import {
  ProviderIcon,
  providerName,
} from "@renderer/features/accounts/ProviderMark";
import { accountIdentity } from "@renderer/features/accounts/identity";
import {
  isSessionBroken,
  readAccountSession,
} from "@renderer/features/accounts/session";
import { sortAccounts } from "@renderer/features/accounts/list";
import { useRedact } from "@renderer/features/streamer/streamerMode";

export function PlayAsDialog({
  instanceName,
  onPick,
  onClose,
}: {
  instanceName: string;
  onPick: (account: ILocalAccount) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const redact = useRedact();
  const accounts = useAtomValue(accountsAtom);
  const selected = useAtomValue(accountAtom);
  const selectedIdentity = selected ? accountIdentity(selected) : null;

  const ordered = useMemo(
    () => sortAccounts(accounts, selectedIdentity),
    [accounts, selectedIdentity],
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-3 sm:max-w-sm">
        <DialogHeader className="min-w-0">
          <DialogTitle>{t("playAs.title")}</DialogTitle>
          <DialogDescription className="min-w-0">
            <Hint content={instanceName} variant="text" truncatedOnly>
              <span className="block truncate">
                {t("playAs.description", { name: redact.text(instanceName) })}
              </span>
            </Hint>
          </DialogDescription>
        </DialogHeader>

        <div
          role="list"
          className="-mx-2 flex max-h-80 flex-col overflow-y-auto"
        >
          {ordered.map((account) => {
            const identity = accountIdentity(account);
            const broken = isSessionBroken(readAccountSession(account));
            const isCurrent = identity === selectedIdentity;

            return (
              <button
                key={identity}
                type="button"
                role="listitem"
                disabled={broken}
                onClick={() => onPick(account)}
                className="group flex h-12 w-full min-w-0 items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-row-hover focus-visible:bg-row-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <AccountHead account={account} size={32} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <Hint content={account.nickname} variant="text" truncatedOnly>
                    <span className="truncate text-sm text-foreground">
                      {redact.text(account.nickname)}
                    </span>
                  </Hint>
                  <span className="flex min-w-0 items-center gap-1 text-2xs text-faint">
                    <ProviderIcon type={account.type} size={11} />
                    <Hint content={broken ? t("playAs.sessionBroken") : isCurrent ? t("playAs.current", { provider: providerName(account.type, t) }) : providerName(account.type, t)} variant="text" truncatedOnly>
                      <span className="truncate">
                        {broken
                          ? t("playAs.sessionBroken")
                          : isCurrent
                            ? t("playAs.current", {
                                provider: providerName(account.type, t),
                              })
                            : providerName(account.type, t)}
                      </span>
                    </Hint>
                  </span>
                </span>
                <Play className="size-4 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
