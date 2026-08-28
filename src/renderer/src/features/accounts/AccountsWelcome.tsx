import { useTranslation } from "react-i18next";
import { Check, Minus } from "lucide-react";
import type { AccountType } from "@/types/Account";
import { Hint } from "@renderer/components/Hint";
import { ProviderIcon, providerName } from "./ProviderMark";
import {
  isProviderAvailable,
  providerFeatures,
  PROVIDER_ORDER,
} from "./providers";

export function AccountsWelcome({
  connectivity,
  onPick,
}: {
  connectivity: { isInternetOnline: boolean; isBackendOnline: boolean };
  onPick: (provider: AccountType) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-4">
      <div className="grid max-w-xl gap-1.5 text-center">
        <h2 className="text-2xl font-semibold">{t("accounts.welcomeTitle")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("accounts.welcomeHint")}
        </p>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-2 gap-2.5">
        {PROVIDER_ORDER.map((provider) => {
          const available = isProviderAvailable(provider, connectivity);

          return (
            <Hint
              key={provider}
              content={
                available
                  ? undefined
                  : t(
                      connectivity.isInternetOnline
                        ? "app.backendUnavailable"
                        : "app.internetUnavailable",
                    )
              }
            >
              <button
                type="button"
                disabled={!available}
                onClick={() => onPick(provider)}
                className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-surface-2 p-3.5 text-left transition-colors hover:border-input hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-foreground">
                    <ProviderIcon type={provider} size={17} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {providerName(provider, t)}
                    </span>
                    <span className="truncate text-xs text-faint">
                      {t(`accounts.providerPitch.${provider}`)}
                    </span>
                  </span>
                </span>

                <span className="grid gap-1">
                  {providerFeatures(provider).map((feature) => (
                    <span
                      key={feature.key}
                      className={`flex min-w-0 items-center gap-1.5 text-xs ${
                        feature.available
                          ? "text-muted-foreground"
                          : "text-faint"
                      }`}
                    >
                      {feature.available ? (
                        <Check className="size-3 shrink-0 text-success" />
                      ) : (
                        <Minus className="size-3 shrink-0" />
                      )}
                      <span className="truncate">
                        {t(`accounts.feature.${feature.key}`)}
                      </span>
                    </span>
                  ))}
                </span>
              </button>
            </Hint>
          );
        })}
      </div>
    </div>
  );
}
