import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { UserPlus, WifiOff, X } from "lucide-react";
import type { ILocalAccount } from "@/types/Account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorMessage } from "@/components/ui/form-error-message";
import { NICKNAME_MAX, validateOfflineNickname } from "./nickname";

export function OfflineAccountForm({
  accounts,
  onCancel,
  onSubmit,
}: {
  accounts: ILocalAccount[];
  onCancel: () => void;
  onSubmit: (nickname: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState("");
  const [pending, setPending] = useState(false);

  const issue = useMemo(
    () => validateOfflineNickname(nickname, accounts),
    [accounts, nickname],
  );
  const showError = nickname.trim() !== "" && issue !== null;

  const submit = async () => {
    if (issue || pending) return;
    setPending(true);
    try {
      await onSubmit(nickname);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-5 px-10">
      <span className="flex size-16 items-center justify-center rounded-2xl border border-border bg-surface-3 text-foreground">
        <WifiOff className="size-7" />
      </span>

      <div className="grid max-w-md gap-2 text-center">
        <h2 className="text-lg font-semibold">{t("accounts.offlineTitle")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("accounts.offlineHint")}
        </p>
      </div>

      <div className="grid w-full max-w-sm gap-2">
        <Label htmlFor="offline-nickname">{t("accounts.nickname")}</Label>
        <Input
          id="offline-nickname"
          autoFocus
          spellCheck={false}
          maxLength={NICKNAME_MAX * 2}
          placeholder="Notch"
          value={nickname}
          aria-invalid={showError}
          aria-describedby={showError ? "offline-nickname-error" : undefined}
          onChange={(event) => setNickname(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
        />
        <FormErrorMessage show={showError} id="offline-nickname-error">
          {t(`accounts.nicknameIssue.${issue ?? "empty"}`)}
        </FormErrorMessage>
      </div>

      <div className="flex items-center gap-2">
        <Button disabled={Boolean(issue) || pending} onClick={() => void submit()}>
          <UserPlus className="size-4" />
          {t("common.add")}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          <X className="size-4" />
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
