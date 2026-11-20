import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import rpcLocales from "@/shared/rpcLocales.json";
import { buildProfileUrl, buildRpcButtons } from "@/shared/siteLinks";
import { BrandMark } from "@renderer/shell/BrandMark";
import { AccountHead } from "@renderer/features/accounts/AccountHead";
import { useOwnProfileVisibility } from "@renderer/features/profile/ownProfileVisibility";
import { accountAtom, authDataAtom } from "@renderer/stores/atoms";

type RpcLanguage = keyof typeof rpcLocales;

function rpcLocale(language: string | undefined) {
  const short = (language || "en").toLowerCase().split("-")[0];
  return short in rpcLocales ? rpcLocales[short as RpcLanguage] : rpcLocales.en;
}

export function DiscordActivityPreview({
  enabled,
  hideServer,
}: {
  enabled: boolean;
  hideServer: boolean;
}) {
  const { t, i18n } = useTranslation();
  const account = useAtomValue(accountAtom);
  const authData = useAtomValue(authDataAtom);
  const visibility = useOwnProfileVisibility();
  const locale = rpcLocale(i18n.resolvedLanguage || i18n.language);

  const profileUrl =
    visibility?.isPublic && account
      ? buildProfileUrl(account.nickname, authData?.sub)
      : null;
  const buttons = buildRpcButtons({ profileUrl, labels: locale.buttons });

  return (
    <div className="grid gap-1.5">
      <div
        aria-label={t("settings.discordPreview.label")}
        role="img"
        className={cn(
          "relative grid w-full max-w-80 gap-2 rounded-lg border border-border bg-surface-1 p-2.5 transition-opacity",
          !enabled && "opacity-50",
        )}
      >
        <span className="text-3xs font-semibold tracking-[0.06em] text-faint uppercase">
          {locale.playing} {locale.details.launcher}
        </span>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-foreground">
            <BrandMark className="size-6" />
            {account && (
              <span className="absolute -right-1.5 -bottom-1.5 rounded-md bg-surface-1 p-0.5">
                <AccountHead
                  account={{
                    type: account.type,
                    nickname: account.nickname,
                    uuid: authData?.uuid,
                  }}
                  size={18}
                  className="rounded-[4px]"
                />
              </span>
            )}
          </span>
          <div className="grid min-w-0 gap-0.5 text-xs leading-4">
            <span className="truncate font-medium text-foreground">
              {locale.details.launcher}
            </span>
            <span className="truncate text-muted-foreground">
              {locale.states.idle}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {buttons.map((button) => (
            <span
              key={button.url}
              className="flex h-6 min-w-0 items-center justify-center rounded-md bg-surface-3 px-2 text-2xs text-muted-foreground"
            >
              <span className="truncate">{button.label}</span>
            </span>
          ))}
        </div>
        {!enabled && (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-surface-3 text-muted-foreground">
              <EyeOff className="size-4" />
            </span>
          </span>
        )}
      </div>
      <p className="text-2xs leading-4 text-faint">
        {!enabled
          ? t("settings.discordPreview.hidden")
          : hideServer
            ? t("settings.discordPreview.inGameNoServer")
            : t("settings.discordPreview.inGame")}
      </p>
    </div>
  );
}
