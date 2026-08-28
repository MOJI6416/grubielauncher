import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ExternalLink,
  Loader2,
  LogIn,
  Minus,
  RefreshCw,
  Shirt,
  Trash2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import type { ILocalAccount } from "@/types/Account";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { useAtomValue } from "jotai";
import { internetAtom, networkAtom } from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import { OWN_PROFILE_ID } from "@renderer/features/profile/loadProfileUser";
import { formatDate } from "@renderer/utilities/date";
import { AccountHead } from "./AccountHead";
import { ProviderIcon, providerName } from "./ProviderMark";
import { SessionIcon, sessionLabel } from "./SessionMark";
import { accountIdentity } from "./identity";
import { isNicknameGameSafe } from "./nickname";
import {
  isProviderAvailable,
  providerCapabilities,
  providerFeatures,
} from "./providers";
import { readAccountSession } from "./session";
import type { AccountsController } from "./useAccountsController";

function ExpiryRow({ label, value }: { label: string; value: number }) {
  const expired = value <= Date.now();

  return (
    <div className="flex min-w-0 items-baseline gap-2 text-xs">
      <span className="min-w-0 flex-1 truncate text-faint">{label}</span>
      <span
        className={`shrink-0 font-mono tabular-nums ${
          expired ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {formatDate(new Date(value))}
      </span>
    </div>
  );
}

export function AccountDetail({
  account,
  controller,
  isRunning,
  onRemove,
}: {
  account: ILocalAccount;
  controller: AccountsController;
  isRunning: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [now] = useState(() => Date.now());

  const identity = accountIdentity(account);
  const isActive =
    controller.selectedAccount &&
    accountIdentity(controller.selectedAccount) === identity;
  const busy = controller.busyIdentity === identity;

  const session = useMemo(
    () => readAccountSession(account, now),
    [account, now],
  );
  const caps = providerCapabilities(account.type);

  const isInternetOnline = useAtomValue(internetAtom);
  const isBackendOnline = useAtomValue(networkAtom);
  const providerReachable = isProviderAvailable(account.type, {
    isInternetOnline,
    isBackendOnline,
  });
  const offlineHint = t(
    isInternetOnline ? "app.backendUnavailable" : "app.internetUnavailable",
  );
  const nicknameSafe = isNicknameGameSafe(account.nickname);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
      <div className="flex min-w-0 items-center gap-4">
        <AccountHead account={account} size={88} className="rounded-2xl" />

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <Hint content={account.nickname} variant="text" truncatedOnly>
              <h2 className="truncate text-2xl leading-tight font-semibold">
                {account.nickname}
              </h2>
            </Hint>
            {isRunning ? (
              <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium text-success">
                {t("accounts.inGame")}
              </span>
            ) : (
              isActive && (
                <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-foreground">
                  {t("accounts.inUse")}
                </span>
              )
            )}
          </div>

          <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <ProviderIcon type={account.type} size={13} />
            <span className="truncate">{providerName(account.type, t)}</span>
          </span>
        </div>
      </div>

      {!nicknameSafe && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/35 bg-warning/10 p-2.5 text-xs leading-relaxed text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span>
            {t(
              account.type === "plain"
                ? "accounts.longNicknameOffline"
                : "accounts.longNicknameHint",
            )}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!isActive && (
          <Button
            disabled={busy}
            onClick={() => void controller.useAccount(account)}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {t("accounts.use")}
          </Button>
        )}

        {account.type !== "plain" && (
          <>
            <Hint content={!isActive ? t("accounts.needsActive") : undefined}>
              <Button
                variant="secondary"
                disabled={!isActive}
                onClick={() =>
                  navigate({ name: "profile", userId: OWN_PROFILE_ID })
                }
              >
                <UserRound className="size-4" />
                {t("accounts.openProfile")}
              </Button>
            </Hint>

            {caps.skins === "managed" && (
              <Hint content={!isActive ? t("accounts.needsActive") : undefined}>
                <Button
                  variant="secondary"
                  disabled={!isActive}
                  onClick={() =>
                    navigate({
                      name: "profile",
                      userId: OWN_PROFILE_ID,
                      tab: "skins",
                    })
                  }
                >
                  <Shirt className="size-4" />
                  {t("manageSkins.title")}
                </Button>
              </Hint>
            )}

            {caps.skins === "external" && (
              <Button
                variant="secondary"
                onClick={() =>
                  void window.api.shell.openExternal("https://ely.by/skins")
                }
              >
                <ExternalLink className="size-4" />
                {t("manageSkins.title")}
              </Button>
            )}
          </>
        )}
      </div>

      {account.type !== "plain" && (
        <p className="text-xs leading-relaxed text-faint">
          {t("accounts.identityInProfile")}
        </p>
      )}

      <section className="grid gap-2 rounded-xl border border-border bg-surface-2 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <SessionIcon state={session.state} busy={busy} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {sessionLabel(session.state, t)}
          </span>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t(`accounts.sessionHint.${session.state}`)}
        </p>

        {(session.launcherExpiresAt !== null ||
          session.providerExpiresAt !== null) && (
          <div className="grid gap-1 pt-0.5">
            {session.launcherExpiresAt !== null && (
              <ExpiryRow
                label={t("accounts.launcherSession")}
                value={session.launcherExpiresAt}
              />
            )}
            {session.providerExpiresAt !== null && (
              <ExpiryRow
                label={t("accounts.providerSession", {
                  provider: providerName(account.type, t),
                })}
                value={session.providerExpiresAt}
              />
            )}
          </div>
        )}

        {account.type !== "plain" && (
          <div className="flex flex-wrap gap-2 pt-0.5">
            {session.canRenew && session.state !== "active" && (
              <Hint content={providerReachable ? undefined : offlineHint}>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || !providerReachable}
                  onClick={() => void controller.renewSession(account)}
                >
                  <RefreshCw className="size-3.5" />
                  {t("accounts.renew")}
                </Button>
              </Hint>
            )}

            {session.state === "expired" && (
              <Hint content={providerReachable ? undefined : offlineHint}>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!providerReachable}
                  onClick={() =>
                    void controller.signIn(
                      account.type as "discord" | "microsoft" | "elyby",
                    )
                  }
                >
                  <LogIn className="size-3.5" />
                  {t("accounts.signInAgain")}
                </Button>
              </Hint>
            )}
          </div>
        )}
      </section>

      <section className="grid gap-1.5">
        <p className="text-xs font-medium tracking-wide text-faint uppercase">
          {t("accounts.capabilities")}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {providerFeatures(account.type).map((feature) => (
            <span
              key={feature.key}
              className={`inline-flex min-w-0 items-center gap-2 rounded-lg bg-surface-3 px-2.5 py-1.5 text-xs ${
                feature.available ? "text-muted-foreground" : "text-faint"
              }`}
            >
              {feature.available ? (
                <Check className="size-3.5 shrink-0 text-success" />
              ) : (
                <Minus className="size-3.5 shrink-0" />
              )}
              <span className="truncate">
                {t(`accounts.feature.${feature.key}`)}
              </span>
            </span>
          ))}
        </div>
      </section>

      {account.type === "plain" && (
        <section className="grid gap-1.5">
          <p className="text-xs font-medium tracking-wide text-faint uppercase">
            {t("accounts.upgradeTitle")}
          </p>
          <p className="rounded-xl border border-border bg-surface-2 p-3 text-xs leading-relaxed text-muted-foreground">
            {t("accounts.upgradeHint")}
          </p>
        </section>
      )}

      <div className="mt-auto flex items-center justify-end gap-2 border-t border-border pt-3">
        <Hint
          content={isRunning ? t("accounts.removeWhileRunning") : undefined}
        >
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={isRunning}
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" />
            {t("accounts.remove")}
          </Button>
        </Hint>
      </div>
    </div>
  );
}
