import { useMemo, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import {
  accountAtom,
  accountsAtom,
  pendingWebLoginAtom,
} from "../../stores/atoms";
import { ILocalAccount } from "@/types/Account";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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

  const candidates = useMemo(
    () => (accounts ?? []).filter((entry) => !!entry.accessToken),
    [accounts],
  );

  const chosenAccount = useMemo(() => {
    if (chosenKey) {
      const picked = candidates.find((entry) => accountKey(entry) === chosenKey);
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
    setRequestId(null);
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
      if (ok) {
        toast.success(t("webLogin.approved"));
      } else {
        showFailureToast(t("webLogin.failed"), undefined, {
          channels: ["backend:approveSiteLogin"],
          fallbackDescription: t("webLogin.failedHint"),
        });
      }
    } finally {
      close();
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open || isApproving) return;
        close();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={!isApproving}
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => {
          if (isApproving) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isApproving) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("webLogin.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {chosenAccount?.nickname
              ? t("webLogin.body", { nickname: chosenAccount.nickname })
              : t("webLogin.bodyNoName")}
          </p>

          {candidates.length > 1 && (
            <div className="grid gap-2">
              <Label>
                {t("webLogin.selectAccount")}
              </Label>
              <ScrollArea className="max-h-48 rounded-lg border bg-card">
                <div className="grid gap-2 p-2">
                  {candidates.map((entry) => {
                    const key = accountKey(entry);
                    const isChosen =
                      !!chosenAccount && accountKey(chosenAccount) === key;

                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={isApproving}
                        className={cn(
                          "flex min-w-0 items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                          isChosen && "border-primary bg-accent",
                        )}
                        onClick={() => setChosenKey(key)}
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage
                            src={entry.image || ""}
                            alt={entry.nickname}
                          />
                          <AvatarFallback>
                            {entry.nickname.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">
                          {entry.nickname}
                        </p>
                        {isChosen && (
                          <Check className="size-4 shrink-0 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>
              {code ? t("webLogin.code", { code }) : t("webLogin.hint")}
            </AlertTitle>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="secondary" disabled={isApproving} onClick={close}>
            {t("webLogin.decline")}
          </Button>
          <Button
            disabled={isApproving || !chosenAccount}
            onClick={() => void approve()}
          >
            {isApproving && <Loader2 className="animate-spin" />}
            {t("webLogin.approve")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
