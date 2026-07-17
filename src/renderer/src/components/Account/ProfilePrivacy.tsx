import { IUser } from "@/types/IUser";
import { ILocalAccount } from "@/types/Account";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShieldCheck } from "lucide-react";
import { useCallback, useState } from "react";
import { useAtom } from "jotai";
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  networkAtom,
} from "@renderer/stores/atoms";
import {
  ensureAccountSession,
  isAccountSessionRefreshError,
} from "@renderer/utilities/accountSession";
import { useTranslation } from "react-i18next";

const api = window.api;

type PrivacyField = "publicLeaderboard" | "publicProfile";

export function ProfilePrivacy({ user }: { user: IUser }) {
  const { t } = useTranslation();
  const [account, setSelectedAccount] = useAtom(accountAtom);
  const [accounts, setAccounts] = useAtom(accountsAtom);
  const [authData] = useAtom(authDataAtom);
  const [isBackendOnline] = useAtom(networkAtom);
  const [publicLeaderboard, setPublicLeaderboard] = useState(
    user.publicLeaderboard !== false,
  );
  const [publicProfile, setPublicProfile] = useState(
    user.publicProfile !== false,
  );
  const [toggling, setToggling] = useState(false);

  const handleToggle = useCallback(
    async (field: PrivacyField, checked: boolean) => {
      if (!account?.accessToken || !isBackendOnline) return;

      const setValue =
        field === "publicLeaderboard" ? setPublicLeaderboard : setPublicProfile;
      setValue(checked);
      setToggling(true);
      try {
        let acc: ILocalAccount = account;
        if (authData && account.type !== "plain") {
          const refreshed = await ensureAccountSession({
            accounts,
            authData,
            selectedAccount: account,
            setAccounts,
            setSelectedAccount,
          });
          acc = refreshed.account;
        }
        const updated = await api.backend.updateUser(
          acc.accessToken || "",
          user._id,
          field === "publicLeaderboard"
            ? { publicLeaderboard: checked }
            : { publicProfile: checked },
        );
        if (updated) setValue(updated[field] !== false);
      } catch (err) {
        setValue(!checked);
        if (!isAccountSessionRefreshError(err)) console.error(err);
      } finally {
        setToggling(false);
      }
    },
    [
      account,
      accounts,
      authData,
      isBackendOnline,
      setAccounts,
      setSelectedAccount,
      user._id,
    ],
  );

  const rows: {
    field: PrivacyField;
    checked: boolean;
    title: string;
    description: string;
  }[] = [
    {
      field: "publicLeaderboard",
      checked: publicLeaderboard,
      title: t("accountInfo.publicLeaderboard"),
      description: t("accountInfo.publicLeaderboardDescription"),
    },
    {
      field: "publicProfile",
      checked: publicProfile,
      title: t("accountInfo.publicProfile"),
      description: t("accountInfo.publicProfileDescription"),
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          aria-label={t("accountInfo.privacy")}
        >
          <ShieldCheck className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-3">
        <div className="grid gap-3">
          <p className="text-sm font-medium">{t("accountInfo.privacy")}</p>
          {rows.map((row) => (
            <div
              className="flex items-center justify-between gap-3"
              key={row.field}
            >
              <div className="min-w-0">
                <p className="text-sm">{row.title}</p>
                <p className="text-xs text-muted-foreground">
                  {row.description}
                </p>
              </div>
              <Switch
                checked={row.checked}
                disabled={toggling || !isBackendOnline}
                onCheckedChange={(checked) => handleToggle(row.field, checked)}
                aria-label={row.title}
              />
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
