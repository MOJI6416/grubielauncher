import { useMemo, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Loader2, ShieldQuestion } from "lucide-react";
import {
  accountAtom,
  accountsAtom,
  pendingWebLoginAtom,
} from "@renderer/stores/atoms";
import { ILocalAccount } from "@/types/Account";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AccountHead,
  accountFace,
} from "@renderer/features/accounts/AccountHead";
import {
  ProviderIcon,
  providerName,
} from "@renderer/features/accounts/ProviderMark";
import { Hint } from "@renderer/components/Hint";
import { cn } from "@/lib/utils";
import { showFailureToast } from "@renderer/utilities/failures";

const api = window.api;

const CODE_CHARS = 6;

function webLoginCode(requestId: string): string {
  const hex = requestId
    .replace(/[^0-9a-fA-F]/g, "")
    .slice(0, CODE_CHARS)
    .toUpperCase();

  if (hex.length < CODE_CHARS) return "";

  return `${hex.slice(0, 3)}-${hex.slice(3)}`;
}

function accountKey(account: ILocalAccount): string {
  return account.id || `${account.type}_${account.nickname}`;
}

export function WebLoginPrompt() {
  const { t } = useTranslation();
  const [requestId, setRequestId] = useAtom(pendingWebLoginAtom);
  const account = useAtomValue(accountAtom);
  const accounts = useAtomValue(accountsAtom);
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);

  const candidates = useMemo(
    () => (accounts ?? []).filter((entry) => !!entry.accessToken),
    [accounts],
  );

  const chosenAccount = useMemo(() => {
    if (chosenKey) {
      const picked = candidates.find(
        (entry) => accountKey(entry) === chosenKey,
      );
      if (picked) return picked;
    }

    if (account?.accessToken) {
      const current = candidates.find(
        (entry) => accountKey(entry) === accountKey(account),
      );
      if (current) return current;
    }

    return candidates[0] ?? null;
  }, [account, candidates, chosenKey]);

  if (!requestId) return null;

  const code = webLoginCode(requestId);

  const close = () => {
    setChosenKey(null);
    setIsApproving(false);
    setIsDeclining(false);
    setRequestId(null);
  };

  const decline = async () => {
    const token = chosenAccount?.accessToken;
    if (!token) {
      close();
      return;
    }

    setIsDeclining(true);
    try {
      const ok = await api.backend.declineSiteLogin(token, requestId);
      if (!ok) {
        showFailureToast(t("webLogin.declineFailed"), undefined, {
          channels: ["backend:declineSiteLogin"],
          fallbackDescription: t("webLogin.declineFailedHint"),
        });
        return;
      }

      close();
    } finally {
      setIsDeclining(false);
    }
  };

  const approve = async () => {
    const token = chosenAccount?.accessToken;
    if (!token) {
      toast.error(t("webLogin.noAccount"));
      close();
      return;
    }

    setIsApproving(true);
    try {
      const ok = await api.backend.approveSiteLogin(token, requestId);
      if (!ok) {
        showFailureToast(t("webLogin.failed"), undefined, {
          channels: ["backend:approveSiteLogin"],
          fallbackDescription: t("webLogin.failedHint"),
        });
        return;
      }

      toast.success(t("webLogin.approved"));
      close();
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open || isApproving || isDeclining) return;
        close();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={!isApproving && !isDeclining}
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        onEscapeKeyDown={(event) => {
          if (isApproving || isDeclining) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isApproving || isDeclining) event.preventDefault();
        }}
      >
        <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-3 pr-12">
          <ShieldQuestion className="size-4 shrink-0 text-faint" />
          <DialogTitle className="min-w-0 flex-1 truncate text-sm">
            {t("webLogin.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            {t("webLogin.bodyNoName")}
          </p>

          {candidates.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-[0.7rem] font-medium tracking-wide text-faint uppercase">
                {t("webLogin.selectAccount")}
              </p>

              <ScrollArea className="max-h-40 rounded-lg border border-border bg-surface-1">
                <div className="flex flex-col gap-1 p-1.5">
                  {candidates.map((entry) => {
                    const key = accountKey(entry);
                    const isChosen =
                      !!chosenAccount && accountKey(chosenAccount) === key;

                    return (
                      <button
                        key={key}
                        type="button"
                        aria-current={isChosen}
                        disabled={isApproving || isDeclining}
                        className={cn(
                          "flex h-12 min-w-0 items-center gap-2.5 rounded-lg border border-transparent px-2 text-left transition-colors outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                          isChosen && "border-primary/45 bg-primary-soft",
                        )}
                        onClick={() => setChosenKey(key)}
                      >
                        <AccountHead account={accountFace(entry)} size={32} />

                        <span className="flex min-w-0 flex-1 flex-col">
                          <Hint
                            content={entry.nickname}
                            variant="text"
                            truncatedOnly
                          >
                            <span className="truncate text-sm font-medium">
                              {entry.nickname}
                            </span>
                          </Hint>
                          <span className="flex min-w-0 items-center gap-1 text-[0.7rem] text-faint">
                            <ProviderIcon type={entry.type} size={10} />
                            <span className="truncate">
                              {providerName(entry.type, t)}
                            </span>
                          </span>
                        </span>

                        {isChosen && (
                          <Check className="size-4 shrink-0 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          ) : !chosenAccount ? (
            <p className="rounded-lg border border-warning/40 bg-surface-2 px-3 py-2.5 text-xs leading-5 text-warning">
              {t("webLogin.noAccount")}
            </p>
          ) : (
            <div className="flex h-14 min-w-0 items-center gap-2.5 rounded-lg border border-border bg-surface-1 px-3">
              <AccountHead account={accountFace(chosenAccount)} size={36} />

              <span className="flex min-w-0 flex-1 flex-col">
                <Hint
                  content={chosenAccount.nickname}
                  variant="text"
                  truncatedOnly
                >
                  <span className="truncate text-sm font-medium">
                    {chosenAccount.nickname}
                  </span>
                </Hint>
                <span className="flex min-w-0 items-center gap-1 text-[0.7rem] text-faint">
                  <ProviderIcon type={chosenAccount.type} size={10} />
                  <span className="truncate">
                    {providerName(chosenAccount.type, t)}
                  </span>
                </span>
              </span>
            </div>
          )}

          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-warning/40 bg-surface-2 px-3 py-2.5">
            {code ? (
              <>
                <span className="text-[0.65rem] font-medium tracking-wide text-warning uppercase">
                  {t("webLogin.codeLabel")}
                </span>
                <span className="font-mono text-2xl leading-none font-semibold tracking-[0.25em] tabular-nums select-all">
                  {code}
                </span>
                <span className="text-center text-[0.7rem] leading-4 text-muted-foreground">
                  {t("webLogin.codeHint")}
                </span>
              </>
            ) : (
              <span className="text-center text-xs leading-5 text-muted-foreground">
                {t("webLogin.hint")}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface-1 px-4 py-3">
          <Button
            variant="ghost"
            disabled={isApproving || isDeclining}
            onClick={() => void decline()}
          >
            {isDeclining && <Loader2 className="animate-spin" />}
            {t("webLogin.decline")}
          </Button>
          <Button
            disabled={isApproving || isDeclining || !chosenAccount}
            onClick={() => void approve()}
          >
            {isApproving && <Loader2 className="animate-spin" />}
            {t("webLogin.approve")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
