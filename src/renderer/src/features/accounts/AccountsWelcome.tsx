import { useTranslation } from "react-i18next";
import { Check, ChevronRight, Minus } from "lucide-react";
import type { AccountType } from "@/types/Account";
import { Hint } from "@renderer/components/Hint";
import { ProviderIcon, providerName } from "./ProviderMark";
import {
  isProviderAvailable,
  providerCapabilities,
  PROVIDER_ORDER,
} from "./providers";

const COLUMNS = [
  "onlineServers",
  "skins",
  "capes",
  "friends",
  "worksOffline",
] as const;

type Column = (typeof COLUMNS)[number];

const SKIN_SITES: Partial<Record<AccountType, string>> = {
  elyby: "ely.by",
  littleskin: "littleskin.cn",
};

const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_repeat(5,5.5rem)_1rem] items-center gap-x-2";

function FeatureCell({
  provider,
  column,
}: {
  provider: AccountType;
  column: Column;
}) {
  const caps = providerCapabilities(provider);

  if (column === "skins" && caps.skins === "external") {
    return (
      <Hint content={SKIN_SITES[provider]} variant="text" truncatedOnly>
        <span className="truncate text-center text-xs text-muted-foreground">
          {SKIN_SITES[provider]}
        </span>
      </Hint>
    );
  }

  const available =
    column === "onlineServers"
      ? caps.onlineServers
      : column === "skins"
        ? caps.skins === "managed"
        : column === "capes"
          ? caps.capes
          : column === "friends"
            ? caps.friends
            : !caps.requiresInternet;

  return (
    <span className="flex justify-center">
      {available ? (
        <span className="flex size-5 items-center justify-center rounded-full bg-success/15 text-success">
          <Check className="size-3" strokeWidth={3} />
        </span>
      ) : (
        <Minus className="size-3.5 text-faint/60" />
      )}
    </span>
  );
}

export function AccountsWelcome({
  connectivity,
  onPick,
}: {
  connectivity: { isInternetOnline: boolean; isBackendOnline: boolean };
  onPick: (provider: AccountType) => void;
}) {
  const { t } = useTranslation();
  const online = PROVIDER_ORDER.filter((provider) => provider !== "plain");

  const row = (provider: AccountType) => {
    const available = isProviderAvailable(provider, connectivity);
    const name = providerName(provider, t);
    const pitch = available
      ? t(`accounts.providerPitch.${provider}`)
      : t(
          connectivity.isInternetOnline
            ? "app.backendUnavailable"
            : "app.internetUnavailable",
        );

    return (
      <button
        key={provider}
        type="button"
        disabled={!available}
        onClick={() => onPick(provider)}
        className={`group ${ROW_GRID} w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-[var(--dur-fast)] hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-3 text-foreground transition-colors duration-[var(--dur-fast)] group-hover:bg-surface-2">
            <ProviderIcon type={provider} size={22} />
          </span>
          <span className="flex min-w-0 flex-col">
            <Hint content={name} variant="text" truncatedOnly>
              <span className="truncate text-sm font-medium">{name}</span>
            </Hint>
            <Hint content={pitch} variant="text" truncatedOnly>
              <span className="truncate text-xs text-muted-foreground">
                {pitch}
              </span>
            </Hint>
          </span>
        </span>

        {COLUMNS.map((column) => (
          <FeatureCell key={column} provider={provider} column={column} />
        ))}

        <ChevronRight className="size-4 text-faint transition-[color,transform] duration-[var(--dur-fast)] group-hover:translate-x-0.5 group-hover:text-foreground group-disabled:translate-x-0" />
      </button>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto px-6 py-5">
      <div className="grid w-full max-w-[54rem] gap-5">
        <div className="grid gap-1.5 text-center">
          <h2 className="text-2xl font-semibold">
            {t("accounts.welcomeTitle")}
          </h2>
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">
            {t("accounts.welcomeHint")}
          </p>
        </div>

        <div className="grid gap-1 rounded-2xl border border-border bg-surface-2 p-1.5">
          <div
            className={`${ROW_GRID} px-3 pt-1.5 pb-1 text-2xs leading-tight text-faint`}
            aria-hidden
          >
            <span />
            {COLUMNS.map((column) => (
              <span key={column} className="text-center text-balance">
                {t(`accounts.featureShort.${column}`)}
              </span>
            ))}
            <span />
          </div>

          <div className="grid gap-0.5">{online.map(row)}</div>

          <div className="grid border-t border-border pt-1">{row("plain")}</div>
        </div>
      </div>
    </div>
  );
}
