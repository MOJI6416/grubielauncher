import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpCircle, CircleCheck, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppUpdateCheckResult } from "@/types/AppUpdate";
import { cn } from "@/lib/utils";
import { countFeature } from "@renderer/features/usage/usage";
import { describeUpdateError } from "./updateError";
import { useAppUpdateInstall } from "./useAppUpdateInstall";

const api = window.api;

type Line = { tone: string; text: string; icon?: "ok" };

export function AppUpdateStatusLine({ result }: { result: AppUpdateCheckResult | null }) {
  const { t } = useTranslation();
  const { state, version, block, inCall } = useAppUpdateInstall();

  const line: Line | null = version
    ? {
        tone: "text-warning",
        text: [
          t("appUpdate.title", { version }),
          block
            ? t(`appUpdate.blocked.${block}`)
            : inCall
              ? t("appUpdate.callWarning")
              : "",
        ]
          .filter(Boolean)
          .join(" · "),
      }
    : state.status === "downloading"
      ? {
          tone: "text-muted-foreground",
          text: t("appUpdate.check.downloading", { version: state.version }),
        }
      : !result
        ? null
        : result.status === "upToDate"
          ? { tone: "text-success", text: t("appUpdate.check.upToDate"), icon: "ok" }
          : result.status === "unsupported"
            ? { tone: "text-muted-foreground", text: t("appUpdate.check.unsupported") }
            : result.status === "rejected"
              ? {
                  tone: "text-destructive",
                  text: t("appUpdate.check.rejected", { version: result.version }),
                }
              : result.status === "failed"
                ? {
                    tone: "text-destructive",
                    text: describeUpdateError(result.message, t),
                  }
                : null;

  if (!line) return null;

  return (
    <p className={cn("mt-1.5 flex items-start gap-1.5 text-xs leading-snug", line.tone)}>
      {line.icon === "ok" && <CircleCheck className="mt-px size-3.5 shrink-0" />}
      <span className="min-w-0">{line.text}</span>
    </p>
  );
}

export function AppUpdateButton({
  onResult,
}: {
  onResult: (result: AppUpdateCheckResult | null) => void;
}) {
  const { t } = useTranslation();
  const { version, block, isInstalling, install } = useAppUpdateInstall();
  const [isChecking, setChecking] = useState(false);

  if (version) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={Boolean(block) || isInstalling}
        onClick={() => void install()}
      >
        {isInstalling ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <ArrowUpCircle className="size-3.5" />
        )}
        {t("appUpdate.install")}
      </Button>
    );
  }

  const check = async () => {
    countFeature("app.updateCheck");
    setChecking(true);
    onResult(null);
    try {
      onResult(await api.appUpdate.check());
    } catch (error) {
      onResult({
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0"
      disabled={isChecking}
      onClick={() => void check()}
    >
      {isChecking ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <RefreshCw className="size-3.5" />
      )}
      {t("appUpdate.check.action")}
    </Button>
  );
}
