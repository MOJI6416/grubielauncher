import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, ExternalLink, Loader2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { ProviderIcon, providerName } from "./ProviderMark";
import { formatCountdown } from "./session";
import { OAUTH_WINDOW_MS, type AuthProgress } from "./useAccountsController";
import { copyToClipboard } from "@renderer/utilities/clipboard";

export function AuthProgressView({
  progress,
  onCancel,
  onReopen,
  onRetry,
}: {
  progress: AuthProgress;
  onCancel: () => void;
  onReopen: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (progress.stage !== "waiting") return;

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [progress.stage]);

  const msLeft = progress.startedAt + OAUTH_WINDOW_MS - now;
  const failed = progress.stage === "failed";
  const name = providerName(progress.provider, t);

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-5 px-10 text-center">
      <span
        className={`flex size-16 items-center justify-center rounded-2xl border ${
          failed
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-border bg-surface-3 text-foreground"
        }`}
      >
        {failed ? (
          <TriangleAlert className="size-7" />
        ) : progress.stage === "exchanging" ? (
          <Loader2 className="size-7 animate-spin" />
        ) : (
          <ProviderIcon type={progress.provider} size={28} />
        )}
      </span>

      <div className="grid max-w-md gap-2">
        <h2 className="text-lg font-semibold">
          {failed
            ? t("accounts.auth.failedTitle")
            : progress.stage === "exchanging"
              ? t("accounts.auth.exchanging")
              : t("accounts.auth.waitingTitle", { provider: name })}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {failed
            ? t(`accounts.authError.${progress.reason ?? "unknown"}`)
            : progress.stage === "exchanging"
              ? t("accounts.auth.exchangingHint")
              : t("accounts.auth.waitingHint")}
        </p>
        {failed && (
          <p className="text-xs leading-relaxed text-faint">
            {t(`accounts.authFix.${progress.reason ?? "unknown"}`)}
          </p>
        )}
      </div>

      {!failed && progress.stage === "waiting" && (
        <p className="font-mono text-xs tabular-nums text-faint">
          {t("accounts.oauthTimeLeft", { time: formatCountdown(msLeft) })}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {failed ? (
          <Button onClick={onRetry}>
            <ProviderIcon type={progress.provider} size={16} />
            {t("accounts.auth.retry")}
          </Button>
        ) : (
          progress.stage === "waiting" && (
            <>
              <Button variant="secondary" onClick={onReopen}>
                <ExternalLink className="size-4" />
                {t("accounts.auth.reopen")}
              </Button>
              <Hint content={t("accounts.auth.copyLink")}>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label={t("accounts.auth.copyLink")}
                  onClick={async () => {
                    if (!(await copyToClipboard(progress.authUrl))) return;
                    toast.success(t("common.copied"));
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </Hint>
            </>
          )
        )}

        <Button variant="ghost" onClick={onCancel}>
          <X className="size-4" />
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
