import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, LogIn, Settings2, UserPlus } from "lucide-react";
import type { ILocalAccount } from "@/types/Account";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  accountAtom,
  accountsAtom,
  accountsUnreadableAtom,
  authDataAtom,
  isRunningAtom,
  pendingSkinDeepLinkAtom,
} from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import { currentRouteAtom } from "@renderer/navigation/store";
import { OWN_PROFILE_ID } from "@renderer/features/profile/loadProfileUser";
import { AccountHead } from "./AccountHead";
import { ProviderIcon, providerName } from "./ProviderMark";
import { SessionDot } from "./SessionMark";
import { accountIdentity, decodeAccountToken } from "./identity";
import {
  duplicateNicknames,
  isAmbiguousNickname,
  sortAccounts,
} from "./list";
import { countBrokenSessions, readAccountSession } from "./session";
import { switchAccount } from "./switchAccount";
import { openAccounts, openAddAccount } from "./addAccountRequest";
import { showFailureToast } from "@renderer/utilities/failures";

export function AccountSwitcher() {
  const { t } = useTranslation();
  const selectedAccount = useAtomValue(accountAtom);
  const accounts = useAtomValue(accountsAtom);
  const accountsUnreadable = useAtomValue(accountsUnreadableAtom);
  const isRunning = useAtomValue(isRunningAtom);
  const route = useAtomValue(currentRouteAtom);
  const setAuthData = useSetAtom(authDataAtom);
  const pendingSkinDeepLink = useAtomValue(pendingSkinDeepLinkAtom);

  const selectedIdentity = selectedAccount
    ? accountIdentity(selectedAccount)
    : null;

  const ordered = useMemo(
    () => sortAccounts(accounts, selectedIdentity),
    [accounts, selectedIdentity],
  );
  const shortcutOrder = useMemo(() => sortAccounts(accounts), [accounts]);
  const duplicates = useMemo(() => duplicateNicknames(accounts), [accounts]);
  const broken = useMemo(() => countBrokenSessions(accounts), [accounts]);

  useEffect(() => {
    setAuthData(decodeAccountToken(selectedAccount?.accessToken));
  }, [selectedAccount, setAuthData]);

  const handledSkinDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingSkinDeepLink) {
      handledSkinDeepLinkRef.current = null;
      return;
    }
    if (handledSkinDeepLinkRef.current === pendingSkinDeepLink) return;
    handledSkinDeepLinkRef.current = pendingSkinDeepLink;

    if (!selectedAccount || selectedAccount.type === "plain") return;
    navigate({ name: "profile", userId: OWN_PROFILE_ID });
  }, [pendingSkinDeepLink, selectedAccount]);

  const switchTo = useCallback(
    async (account: ILocalAccount) => {
      if ((await switchAccount(account)) === "failed") {
        showFailureToast(t("accounts.switchFailed"), undefined, {
          channels: ["accounts:save"],
          fallbackDescription: t("accounts.saveFailedHint"),
        });
      }
    },
    [t],
  );

  const shortcutOrderRef = useRef(shortcutOrder);
  useEffect(() => {
    shortcutOrderRef.current = shortcutOrder;
  }, [shortcutOrder]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.altKey || event.shiftKey) return;
      if (!/^[1-9]$/.test(event.key)) return;

      const account = shortcutOrderRef.current[Number(event.key) - 1];
      if (!account) return;

      event.preventDefault();
      void switchTo(account);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [switchTo]);

  if (!selectedAccount) {
    return (
      <Button
        variant="secondary"
        className="h-11 w-full justify-start gap-2.5"
        onClick={() =>
          accounts.length === 0 && !accountsUnreadable
            ? openAddAccount()
            : openAccounts()
        }
      >
        <LogIn className="size-4" />
        {t("accounts.signIn")}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("accounts.accounts")}
          className="flex h-11 w-full items-center gap-2.5 rounded-lg px-1.5 text-left transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="relative shrink-0">
            <AccountHead account={selectedAccount} size={30} />
            {broken > 0 && (
              <SessionDot
                state="expired"
                className="absolute -right-0.5 -bottom-0.5"
              />
            )}
          </span>

          <span className="grid min-w-0 flex-1">
            <span className="truncate text-[0.7rem] leading-4 text-faint">
              {t("accounts.playingAs")}
            </span>
            <span className="truncate text-sm leading-4 font-medium">
              {selectedAccount.nickname}
            </span>
          </span>

          <ChevronsUpDown className="size-3.5 shrink-0 text-faint" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel className="text-faint">
          {t("accounts.accounts")}
        </DropdownMenuLabel>

        {ordered.map((account) => {
          const identity = accountIdentity(account);
          const session = readAccountSession(account);
          const isActive = identity === selectedIdentity;
          const shortcutIndex = shortcutOrder.findIndex(
            (entry) => accountIdentity(entry) === identity,
          );

          return (
            <DropdownMenuItem
              key={identity}
              onSelect={() => void switchTo(account)}
            >
              <AccountHead account={account} size={20} />

              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate leading-4">{account.nickname}</span>
                {isAmbiguousNickname(account, duplicates) && (
                  <span className="flex items-center gap-1 text-[0.65rem] leading-3 text-faint">
                    <ProviderIcon type={account.type} size={9} />
                    {providerName(account.type, t)}
                  </span>
                )}
              </span>

              <SessionDot state={session.state} className="ring-popover" />

              {shortcutIndex >= 0 && shortcutIndex < 9 && (
                <kbd className="shrink-0 font-mono text-[0.6rem] text-faint">
                  Ctrl {shortcutIndex + 1}
                </kbd>
              )}

              {isActive && <Check className="size-3.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          aria-current={route.name === "accounts"}
          onSelect={() => openAccounts()}
        >
          <Settings2 />
          {t("accounts.manage")}
          {broken > 0 && (
            <span className="ml-auto font-mono text-[0.65rem] text-destructive">
              {broken}
            </span>
          )}
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={isRunning}
          onSelect={() => openAddAccount()}
        >
          <UserPlus />
          {t("accounts.addAccount")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
