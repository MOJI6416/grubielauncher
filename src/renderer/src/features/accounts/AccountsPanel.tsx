import { useEffect, useMemo, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { RefreshCw, Search, TriangleAlert, UserRound } from "lucide-react";
import type { ILocalAccount } from "@/types/Account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { Hint } from "@renderer/components/Hint";
import {
  accountsUnreadableAtom,
  consolesAtom,
  internetAtom,
  networkAtom,
} from "@renderer/stores/atoms";
import { AccountHead } from "./AccountHead";
import { AccountDetail } from "./AccountDetail";
import { AccountsWelcome } from "./AccountsWelcome";
import { AuthProgressView } from "./AuthProgressView";
import { OfflineAccountForm } from "./OfflineAccountForm";
import { ProviderIcon, providerName } from "./ProviderMark";
import { SessionIcon } from "./SessionMark";
import { accountIdentity } from "./identity";
import {
  filterAccounts,
  removalRisk,
  runningAccountIdentities,
  sortAccounts,
} from "./list";
import { isNicknameGameSafe } from "./nickname";
import {
  isProviderAvailable,
  PROVIDER_ORDER,
  type OnlineProvider,
} from "./providers";
import { readAccountSession } from "./session";
import { addAccountRequestAtom } from "./addAccountRequest";
import { loadAccounts } from "./loadAccounts";
import { useAccountsController } from "./useAccountsController";

const SEARCH_THRESHOLD = 6;

export function AccountsPanel() {
  const { t } = useTranslation();
  const controller = useAccountsController();
  const consoles = useAtomValue(consolesAtom);
  const accountsUnreadable = useAtomValue(accountsUnreadableAtom);
  const isInternetOnline = useAtomValue(internetAtom);
  const isBackendOnline = useAtomValue(networkAtom);
  const [addRequested, setAddRequested] = useAtom(addAccountRequestAtom);

  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [offlineFormOpen, setOfflineFormOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<ILocalAccount | null>(
    null,
  );
  const [highlightAdd, setHighlightAdd] = useState(false);
  const [reloading, setReloading] = useState(false);

  const { accounts, selectedAccount, progress } = controller;
  const selectedIdentity = selectedAccount
    ? accountIdentity(selectedAccount)
    : null;

  const ordered = useMemo(
    () => sortAccounts(accounts, selectedIdentity),
    [accounts, selectedIdentity],
  );
  const visible = useMemo(
    () => filterAccounts(ordered, query),
    [ordered, query],
  );

  useEffect(() => {
    if (!addRequested) return;

    setAddRequested(false);
    setFocused(null);
    setOfflineFormOpen(false);
    setHighlightAdd(true);

    const timer = window.setTimeout(() => setHighlightAdd(false), 2400);
    return () => window.clearTimeout(timer);
  }, [addRequested, setAddRequested]);

  const focusedAccount = useMemo(() => {
    const byFocus = focused
      ? accounts.find((account) => accountIdentity(account) === focused)
      : undefined;
    return byFocus ?? selectedAccount ?? ordered[0] ?? null;
  }, [accounts, focused, ordered, selectedAccount]);

  const running = useMemo(
    () => runningAccountIdentities(consoles.consoles),
    [consoles.consoles],
  );

  const connectivity = { isInternetOnline, isBackendOnline };

  const startSignIn = (provider: OnlineProvider) => {
    setOfflineFormOpen(false);
    void controller.signIn(provider);
  };

  const risk = pendingRemoval
    ? removalRisk(accounts, pendingRemoval, {
        isRunning: running.has(accountIdentity(pendingRemoval)),
        selectedIdentity,
      })
    : null;

  if (accountsUnreadable && accounts.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-xl border border-border bg-card p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlert className="text-warning" />
            </EmptyMedia>
            <EmptyTitle>{t("accounts.loadFailedTitle")}</EmptyTitle>
            <EmptyDescription>{t("accounts.loadFailedHint")}</EmptyDescription>
          </EmptyHeader>
          <Button
            variant="secondary"
            disabled={reloading}
            onClick={async () => {
              setReloading(true);
              try {
                await loadAccounts();
              } finally {
                setReloading(false);
              }
            }}
          >
            <RefreshCw className={reloading ? "animate-spin" : undefined} />
            {t("common.retry")}
          </Button>
        </Empty>
      </div>
    );
  }

  if (accounts.length === 0 && !progress && !offlineFormOpen) {
    return (
      <div className="h-full min-h-0 rounded-xl border border-border bg-card">
        <AccountsWelcome
          connectivity={connectivity}
          onPick={(provider) => {
            if (provider === "plain") {
              setOfflineFormOpen(true);
              return;
            }
            startSignIn(provider as OnlineProvider);
          }}
        />
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[19rem_minmax(0,1fr)] gap-3">
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        {accounts.length > 0 && (
          <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-border bg-card p-2">
            <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
              <p className="text-sm font-medium">{t("accounts.accounts")}</p>
              <span className="font-mono text-xs tabular-nums text-faint">
                {accounts.length}
              </span>
            </div>

            {accounts.length > SEARCH_THRESHOLD && (
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-faint" />
                <Input
                  value={query}
                  className="h-8 pl-7 text-xs"
                  placeholder={t("common.search")}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            )}

            <div className="max-h-[13.5rem] overflow-x-hidden overflow-y-auto">
              <div className="flex flex-col gap-0.5" role="listbox">
                {visible.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-faint">
                    {t("common.notFound")}
                  </p>
                )}

                {visible.map((account) => {
                  const identity = accountIdentity(account);
                  const isFocused =
                    focusedAccount !== null &&
                    accountIdentity(focusedAccount) === identity;
                  const isActive = selectedIdentity === identity;
                  const session = readAccountSession(account);

                  return (
                    <button
                      key={identity}
                      type="button"
                      role="option"
                      aria-selected={isFocused}
                      aria-current={isFocused}
                      onClick={() => {
                        setFocused(identity);
                        setOfflineFormOpen(false);
                      }}
                      onDoubleClick={() => void controller.useAccount(account)}
                      className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-accent/40 aria-[current=true]:bg-primary-soft"
                    >
                      <AccountHead account={account} size={34} />

                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Hint
                            content={account.nickname}
                            variant="text"
                            truncatedOnly
                          >
                            <span className="truncate text-sm font-medium">
                              {account.nickname}
                            </span>
                          </Hint>
                          {!isNicknameGameSafe(account.nickname) && (
                            <TriangleAlert className="size-3 shrink-0 text-warning" />
                          )}
                        </span>

                        <span className="flex min-w-0 items-center gap-1 text-[0.7rem] text-faint">
                          <ProviderIcon type={account.type} size={10} />
                          <span className="truncate">
                            {providerName(account.type, t)}
                          </span>
                          {session.state !== "offline" && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="truncate">
                                {t(`accounts.session.${session.state}`)}
                              </span>
                            </>
                          )}
                        </span>
                      </span>

                      <SessionIcon
                        state={session.state}
                        busy={controller.busyIdentity === identity}
                        className="shrink-0"
                      />

                      {isActive && (
                        <span
                          aria-label={t("accounts.inUse")}
                          className="h-8 w-0.5 shrink-0 rounded-full bg-primary"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {accounts.length > 1 && (
              <p className="px-1.5 pb-0.5 text-[0.65rem] text-faint">
                {t("accounts.switchShortcut")}
              </p>
            )}
          </div>
        )}

        <div
          className={`flex shrink-0 flex-col gap-1 rounded-xl border bg-card p-2 transition-colors duration-[var(--dur)] ${
            highlightAdd ? "border-primary" : "border-border"
          }`}
        >
          <p className="px-1 pt-0.5 pb-1 text-sm font-medium">
            {t("accounts.addSection")}
          </p>

          {PROVIDER_ORDER.map((provider) => {
            const available = isProviderAvailable(provider, connectivity);
            const isOffline = provider === "plain";

            return (
              <Hint
                key={provider}
                content={
                  available
                    ? undefined
                    : t(
                        isInternetOnline
                          ? "app.backendUnavailable"
                          : "app.internetUnavailable",
                      )
                }
              >
                <button
                  type="button"
                  aria-current={isOffline && offlineFormOpen}
                  disabled={!available || (!isOffline && progress !== null)}
                  onClick={() => {
                    if (!isOffline) {
                      startSignIn(provider as OnlineProvider);
                      return;
                    }
                    controller.cancelAuth();
                    setOfflineFormOpen(true);
                  }}
                  className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-45 aria-[current=true]:bg-primary-soft"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-3 text-foreground">
                    <ProviderIcon type={provider} size={15} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">
                      {providerName(provider, t)}
                    </span>
                    <span className="truncate text-[0.7rem] text-faint">
                      {t(`accounts.providerPitch.${provider}`)}
                    </span>
                  </span>
                </button>
              </Hint>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 rounded-xl border border-border bg-card p-4">
        {progress ? (
          <AuthProgressView
            progress={progress}
            onCancel={controller.cancelAuth}
            onReopen={controller.reopenAuthWindow}
            onRetry={() => startSignIn(progress.provider)}
          />
        ) : offlineFormOpen ? (
          <OfflineAccountForm
            accounts={accounts}
            onCancel={() => setOfflineFormOpen(false)}
            onSubmit={async (nickname) => {
              if (!(await controller.addOfflineAccount(nickname))) return;
              setOfflineFormOpen(false);
              setFocused(null);
            }}
          />
        ) : focusedAccount ? (
          <AccountDetail
            key={accountIdentity(focusedAccount)}
            account={focusedAccount}
            controller={controller}
            isRunning={running.has(accountIdentity(focusedAccount))}
            onRemove={() => setPendingRemoval(focusedAccount)}
          />
        ) : (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserRound />
              </EmptyMedia>
              <EmptyTitle>{t("accounts.emptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("accounts.emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      {pendingRemoval && (
        <Confirmation
          title={t("accounts.remove")}
          content={[
            {
              text: t("accounts.confirmation", {
                nickname: pendingRemoval.nickname,
              }),
            },
            ...(risk !== null
              ? [
                  {
                    text: t(`accounts.removeRisk.${risk}`),
                    color: "warning" as const,
                  },
                ]
              : []),
          ]}
          buttons={[
            {
              text: t("common.delete"),
              color: "danger",
              onClick: async () => {
                const target = pendingRemoval;
                setPendingRemoval(null);
                setFocused(null);
                await controller.removeAccount(target);
              },
            },
            {
              text: t("common.cancel"),
              color: "default",
              onClick: () => setPendingRemoval(null),
            },
          ]}
          onClose={() => setPendingRemoval(null)}
        />
      )}
    </div>
  );
}
