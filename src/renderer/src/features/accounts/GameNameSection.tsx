import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ExternalLink, PenLine, RotateCcw } from "lucide-react";
import type { ILocalAccount } from "@/types/Account";
import type { INicknameStatus, NicknameChangeResult } from "@/types/Nickname";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { formatDate } from "@renderer/utilities/date";
import { withSessionNickname } from "@/shared/sessionNickname";
import { ChangeNicknameDialog } from "./ChangeNicknameDialog";
import {
  canChooseNickname,
  nicknameAccountId,
  providerProfileUrl,
} from "./gameName";
import { providerName } from "./ProviderMark";
import type { AccountsController } from "./useAccountsController";

type ChangeSuccess = Extract<NicknameChangeResult, { ok: true }>;

export function GameNameSection({
  account,
  controller,
  isRunning,
  reachable,
  offlineHint,
}: {
  account: ILocalAccount;
  controller: AccountsController;
  isRunning: boolean;
  reachable: boolean;
  offlineHint: string;
}) {
  const { t } = useTranslation();
  const provider = providerName(account.type, t);

  if (!canChooseNickname(account.type)) {
    const url = providerProfileUrl(account.type);

    return (
      <section className="grid gap-2 rounded-xl border border-border bg-surface-2 p-3">
        <p className="text-sm font-medium">{t("accounts.gameName.title")}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("accounts.gameName.managedByProvider", { provider })}
        </p>
        {url && (
          <div className="pt-0.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void window.api.shell.openExternal(url)}
            >
              <ExternalLink className="size-3.5" />
              {t("accounts.gameName.openProviderSite", { provider })}
            </Button>
          </div>
        )}
      </section>
    );
  }

  return (
    <CustomNameControls
      account={account}
      controller={controller}
      isRunning={isRunning}
      reachable={reachable}
      offlineHint={offlineHint}
      provider={provider}
    />
  );
}

function CustomNameControls({
  account,
  controller,
  isRunning,
  reachable,
  offlineHint,
  provider,
}: {
  account: ILocalAccount;
  controller: AccountsController;
  isRunning: boolean;
  reachable: boolean;
  offlineHint: string;
  provider: string;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<INicknameStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const accountId = nicknameAccountId(account);
  const token = account.accessToken;

  useEffect(() => {
    if (!reachable || !token || !accountId) return;

    let cancelled = false;
    void window.api.backend.getNicknameStatus(token, accountId).then((next) => {
      if (!cancelled && next) setStatus(next);
    });

    return () => {
      cancelled = true;
    };
  }, [accountId, reachable, token]);

  useEffect(() => {
    if (!status || status.nickname === account.nickname) return;
    void controller.replaceAccount(account, {
      ...account,
      nickname: status.nickname,
    });
  }, [account, controller, status]);

  const applySession = useCallback(
    async (result: ChangeSuccess) => {
      setStatus(result.status);
      await controller.replaceAccount(
        account,
        withSessionNickname({ ...account, accessToken: result.accessToken }),
      );
    },
    [account, controller],
  );

  const afterChange = (result: ChangeSuccess, message: string) => {
    toast.success(message, {
      description: isRunning ? t("accounts.gameName.restartGame") : undefined,
    });
    return applySession(result);
  };

  const reset = async () => {
    if (!token || !accountId) return;

    const result = await window.api.backend.resetNickname(token, accountId);
    setResetOpen(false);

    if (result?.ok) {
      await afterChange(
        result,
        t("accounts.gameName.resetDone", { nickname: result.status.nickname }),
      );
      return;
    }

    const error = result?.error ?? "failed";
    toast.error(
      t(
        error === "taken" || error === "held"
          ? "accounts.gameName.error.providerTaken"
          : `accounts.gameName.error.${error}`,
        {
          provider,
          date: result?.nextChangeAt
            ? formatDate(new Date(result.nextChangeAt))
            : "",
        },
      ),
    );
  };

  const nextChangeAt = status?.nextChangeAt
    ? new Date(status.nextChangeAt)
    : null;
  const locked = nextChangeAt !== null;
  const blockedHint = !reachable
    ? offlineHint
    : locked
      ? t("accounts.gameName.error.cooldown", {
          date: formatDate(nextChangeAt),
        })
      : undefined;

  return (
    <section className="grid gap-2 rounded-xl border border-border bg-surface-2 p-3">
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {t("accounts.gameName.title")}
        </p>
        {status && (
          <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted-foreground">
            {status.custom
              ? t("accounts.gameName.custom")
              : t("accounts.gameName.fromProvider", { provider })}
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("accounts.gameName.customHint", { provider })}
      </p>

      {(status?.custom || nextChangeAt) && (
        <div className="grid gap-1 text-xs">
          {status?.custom && (
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-faint">
                {t("accounts.gameName.providerNickname", { provider })}
              </span>
              <span className="shrink-0 font-mono text-muted-foreground">
                {status.providerNickname}
              </span>
            </div>
          )}
          {nextChangeAt && (
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-faint">
                {t("accounts.gameName.nextChange")}
              </span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                {formatDate(nextChangeAt)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-0.5">
        <Hint content={blockedHint}>
          <Button
            size="sm"
            variant="secondary"
            disabled={!reachable || locked || !token || !accountId}
            onClick={() => setDialogOpen(true)}
          >
            <PenLine className="size-3.5" />
            {t("accounts.gameName.change")}
          </Button>
        </Hint>

        {status?.custom && (
          <Hint content={blockedHint}>
            <Button
              size="sm"
              variant="ghost"
              disabled={!reachable || locked}
              onClick={() => setResetOpen(true)}
            >
              <RotateCcw className="size-3.5" />
              {t("accounts.gameName.reset", { provider })}
            </Button>
          </Hint>
        )}
      </div>

      {dialogOpen && (
        <ChangeNicknameDialog
          account={account}
          isRunning={isRunning}
          onClose={() => setDialogOpen(false)}
          onChanged={async (result) => {
            setDialogOpen(false);
            await afterChange(
              result,
              t("accounts.gameName.changed", {
                nickname: result.status.nickname,
              }),
            );
          }}
        />
      )}

      {resetOpen && status && (
        <Confirmation
          title={t("accounts.gameName.reset", { provider })}
          content={[
            {
              text: t("accounts.gameName.resetConfirm", {
                nickname: status.providerNickname,
              }),
            },
            ...(isRunning
              ? [
                  {
                    text: t("accounts.gameName.restartGame"),
                    color: "warning" as const,
                  },
                ]
              : []),
          ]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setResetOpen(false),
            },
            {
              text: t("accounts.gameName.resetAction"),
              color: "primary",
              onClick: reset,
            },
          ]}
          onClose={() => setResetOpen(false)}
        />
      )}
    </section>
  );
}
