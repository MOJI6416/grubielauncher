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
import { LittleSkinAccountForm } from "./LittleSkinAccountForm";
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
import { RemovalItem, RemovalList } from "@renderer/components/RemovalCollapse";
import { MOD_KEY } from "@renderer/utilities/platform";

const SEARCH_THRESHOLD = 6;

type OpenForm = { kind: "plain" } | { kind: "littleskin"; login: string };

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
  const [form, setForm] = useState<OpenForm | null>(null);
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
  const accountKeys = useMemo(
    () => new Set(accounts.map((account) => accountIdentity(account))),
    [accounts],
  );

  useEffect(() => {
    if (!addRequested) return;

    setAddRequested(false);
    setFocused(null);
    setForm(null);
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
    setForm(null);
    void controller.signIn(provider);
  };

  const openForm = (next: OpenForm) => {
    controller.cancelAuth();
    setForm(next);
  };

  const pickProvider = (provider: ILocalAccount["type"]) => {
    if (provider === "plain") {
      openForm({ kind: "plain" });
      return;
    }
    if (provider === "littleskin") {
      openForm({ kind: "littleskin", login: "" });
      return;
    }
    startSignIn(provider);
  };

  const signInAgain = (account: ILocalAccount) => {
    if (account.type === "littleskin") {
      openForm({ kind: "littleskin", login: account.nickname });
      return;
    }
    if (account.type !== "plain") startSignIn(account.type);
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

  if (accounts.length === 0 && !progress && !form) {
    return (
      <div className="h-full min-h-0 rounded-xl border border-border bg-card">
        <AccountsWelcome connectivity={connectivity} onPick={pickProvider} />
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
              <div
                className="flex flex-col gap-0.5"
                role="listbox"
                onKeyDown={(event) => {
                  if (event.key !== "Delete" || event.repeat) return;
                  if (!focusedAccount) return;
                  if (running.has(accountIdentity(focusedAccount))) return;
                  event.preventDefault();
                  setPendingRemoval(focusedAccount);
                }}
              >
                {visible.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-faint">
                    {t("common.notFound")}
                  </p>
                )}

                <RemovalList sourceKeys={accountKeys}>
                  {visible.map((account) => {
                    const identity = accountIdentity(account);
                    const isFocused =
                      focusedAccount !== null &&
                      accountIdentity(focusedAccount) === identity;
                    const isActive = selectedIdentity === identity;
                    const session = readAccountSession(account);

                    return (
                      <RemovalItem key={identity} itemKey={identity}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isFocused}
                          onClick={() => {
                            setFocused(identity);
                            setForm(null);
                          }}
                          onDoubleClick={() =>
                            void controller.useAccount(account)
                          }
                          className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-row-hover aria-selected:bg-row-selected"
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

                            <span className="flex min-w-0 items-center gap-1 text-2xs text-faint">
                              <ProviderIcon type={account.type} size={10} />
                              <Hint
                                content={providerName(account.type, t)}
                                variant="text"
                                truncatedOnly
                              >
                                <span className="truncate">
                                  {providerName(account.type, t)}
                                </span>
                              </Hint>
                              {session.state !== "offline" && (
                                <>
                                  <span aria-hidden>·</span>
                                  <Hint
                                    content={t(
                                      `accounts.session.${session.state}`,
                                    )}
                                    variant="text"
                                    truncatedOnly
                                  >
                                    <span className="truncate">
                                      {t(`accounts.session.${session.state}`)}
                                    </span>
                                  </Hint>
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
                      </RemovalItem>
                    );
                  })}
                </RemovalList>
              </div>
            </div>

            {accounts.length > 1 && (
              <p className="px-1.5 pb-0.5 text-3xs text-faint">
                {t("accounts.switchShortcut", { mod: MOD_KEY })}
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
            const opensForm = provider === "plain" || provider === "littleskin";

            const pitch = available
              ? t(`accounts.providerPitch.${provider}`)
              : t(
                  isInternetOnline
                    ? "app.backendUnavailable"
                    : "app.internetUnavailable",
                );

            return (
              <button
                key={provider}
                type="button"
                data-selected={form?.kind === provider}
                disabled={!available || (!opensForm && progress !== null)}
                onClick={() => pickProvider(provider)}
                className="flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-row-hover disabled:cursor-not-allowed disabled:opacity-45 data-[selected=true]:bg-row-selected"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-3 text-foreground">
                  <ProviderIcon type={provider} size={15} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <Hint
                    content={providerName(provider, t)}
                    variant="text"
                    truncatedOnly
                  >
                    <span className="truncate text-sm">
                      {providerName(provider, t)}
                    </span>
                  </Hint>
                  <Hint content={pitch} variant="text" truncatedOnly>
                    <span className="truncate text-2xs text-faint">
                      {pitch}
                    </span>
                  </Hint>
                </span>
              </button>
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
        ) : form?.kind === "plain" ? (
          <OfflineAccountForm
            accounts={accounts}
            onCancel={() => setForm(null)}
            onSubmit={async (nickname) => {
              if (!(await controller.addOfflineAccount(nickname))) return;
              setForm(null);
              setFocused(null);
            }}
          />
        ) : form?.kind === "littleskin" ? (
          <LittleSkinAccountForm
            key={form.login}
            initialLogin={form.login}
            onCancel={() => setForm(null)}
            onSignIn={controller.signInLittleSkin}
            onChooseProfile={controller.chooseLittleSkinProfile}
            onStartOAuth={controller.startLittleSkinOAuth}
            onFinishOAuth={controller.finishLittleSkinOAuth}
            onCancelOAuth={controller.cancelLittleSkinOAuth}
            onDone={() => {
              setForm(null);
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
            onSignInAgain={() => signInAgain(focusedAccount)}
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
          title={t("accounts.removeQuestion", {
            nickname: pendingRemoval.nickname,
          })}
          content={[
            { text: t("accounts.removeLoss") },
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
