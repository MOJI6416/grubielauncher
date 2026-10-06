import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, PenLine, TriangleAlert } from "lucide-react";
import type { ILocalAccount } from "@/types/Account";
import type {
  NicknameAvailability,
  NicknameChangeError,
  NicknameChangeResult,
} from "@/types/Nickname";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorMessage } from "@/components/ui/form-error-message";
import { formatDate } from "@renderer/utilities/date";
import { NICKNAME_MAX, validateOfflineNickname } from "./nickname";
import { nicknameAccountId } from "./gameName";

const CHECK_DELAY_MS = 400;

type CheckState = NicknameAvailability | "checking" | "unknown";

const BLOCKING: ReadonlySet<CheckState> = new Set([
  "current",
  "reserved",
  "taken",
  "held",
]);

export function ChangeNicknameDialog({
  account,
  isRunning,
  onClose,
  onChanged,
}: {
  account: ILocalAccount;
  isRunning: boolean;
  onClose: () => void;
  onChanged: (
    result: Extract<NicknameChangeResult, { ok: true }>,
  ) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(account.nickname);
  const [check, setCheck] = useState<CheckState>("current");
  const [failure, setFailure] = useState<{
    error: NicknameChangeError;
    nextChangeAt: string | null;
  } | null>(null);
  const [pending, setPending] = useState(false);

  const value = draft.trim();
  const issue = validateOfflineNickname(value);
  const accountId = nicknameAccountId(account);

  useEffect(() => {
    setFailure(null);

    if (issue) return;
    if (value === account.nickname) {
      setCheck("current");
      return;
    }
    if (!account.accessToken || !accountId) {
      setCheck("unknown");
      return;
    }

    setCheck("checking");
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const status = await window.api.backend.checkNickname(
        account.accessToken!,
        accountId,
        value,
      );
      if (!cancelled) setCheck(status ?? "unknown");
    }, CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [account.accessToken, account.nickname, accountId, issue, value]);

  const canSubmit =
    !issue &&
    !pending &&
    !failure &&
    (check === "available" || check === "unknown");

  const submit = async () => {
    if (!canSubmit || !account.accessToken || !accountId) return;

    setPending(true);
    try {
      const result = await window.api.backend.changeNickname(
        account.accessToken,
        accountId,
        value,
      );

      if (result?.ok) {
        await onChanged(result);
        return;
      }

      const error = result?.error ?? "failed";
      if (BLOCKING.has(error as CheckState)) {
        setCheck(error as CheckState);
        return;
      }
      setFailure({ error, nextChangeAt: result?.nextChangeAt ?? null });
    } finally {
      setPending(false);
    }
  };

  const message = (() => {
    if (value !== "" && issue) {
      return {
        tone: "error" as const,
        text: t(`accounts.nicknameIssue.${issue}`),
      };
    }
    if (failure) {
      return {
        tone: "error" as const,
        text: t(`accounts.gameName.error.${failure.error}`, {
          date: failure.nextChangeAt
            ? formatDate(new Date(failure.nextChangeAt))
            : "",
        }),
      };
    }
    if (BLOCKING.has(check)) {
      return {
        tone: "error" as const,
        text: t(`accounts.gameName.status.${check}`),
      };
    }
    if (check === "available") {
      return {
        tone: "success" as const,
        text: t("accounts.gameName.status.available"),
      };
    }
    if (check === "checking") {
      return {
        tone: "muted" as const,
        text: t("accounts.gameName.status.checking"),
      };
    }
    return null;
  })();

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <PenLine className="size-5 shrink-0" />
            <span className="truncate">
              {t("accounts.gameName.dialogTitle")}
            </span>
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            {t("accounts.gameName.dialogHint")}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="game-nickname">{t("accounts.nickname")}</Label>
            <Input
              id="game-nickname"
              autoFocus
              spellCheck={false}
              autoComplete="off"
              maxLength={NICKNAME_MAX * 2}
              value={draft}
              aria-invalid={message?.tone === "error"}
              aria-describedby="game-nickname-status"
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
            {message?.tone === "error" ? (
              <FormErrorMessage show id="game-nickname-status">
                {message.text}
              </FormErrorMessage>
            ) : (
              <p
                id="game-nickname-status"
                className={`mt-1 flex min-h-5 items-center gap-1.5 text-xs ${
                  message?.tone === "success"
                    ? "text-success"
                    : "text-muted-foreground"
                }`}
                aria-live="polite"
              >
                {message?.tone === "success" && <Check className="size-3.5" />}
                {message?.tone === "muted" && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                {message?.text ?? t("accounts.gameName.rules")}
              </p>
            )}
          </div>

          <ul className="grid gap-2 rounded-lg border border-warning/35 bg-warning/10 p-3 text-xs leading-relaxed text-muted-foreground">
            {[
              t("accounts.gameName.cooldownWarning"),
              t("accounts.gameName.offlineServersWarning"),
              ...(isRunning ? [t("accounts.gameName.restartGame")] : []),
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={onClose}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PenLine className="size-4" />
              )}
              {t("accounts.gameName.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
