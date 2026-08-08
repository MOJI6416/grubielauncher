import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { IAiLogAnalysis, IAiLogRequest } from "@/types/AiAnalysis";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertTriangle,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import {
  accountAtom,
  aiCrashesAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import { toast } from "sonner";

const api = window.api;

type Stage = "consent" | "loading" | "result" | "error";

export function AiCrashAnalysis({
  crashKey,
  onClose,
}: {
  crashKey: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const account = useAtomValue(accountAtom);
  const settings = useAtomValue(settingsAtom);
  const crashes = useAtomValue(aiCrashesAtom);
  const setCrashes = useSetAtom(aiCrashesAtom);

  const entry = crashes[crashKey];
  const crash = entry?.crash;
  const storedAnalysis = entry?.analysis ?? null;

  const [request, setRequest] = useState<IAiLogRequest | null>(null);
  const [stage, setStage] = useState<Stage>(
    storedAnalysis ? "result" : "consent",
  );
  const [analysis, setAnalysis] = useState<IAiLogAnalysis | null>(
    storedAnalysis,
  );
  const [errorReason, setErrorReason] = useState<string>("unavailable");
  const [showLog, setShowLog] = useState(false);
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const autoStartedRef = useRef(false);
  const analyzeRef = useRef<
    ((prepared: IAiLogRequest, allowRefresh?: boolean) => Promise<void>) | null
  >(null);

  const analyze = useCallback(
    async (prepared: IAiLogRequest, allowRefresh = true) => {
      const accessToken = account?.accessToken;
      if (!accessToken) {
        setErrorReason("unauthorized");
        setStage("error");
        return;
      }

      setStage("loading");

      const locale = ["en", "ru", "uk"].includes(i18n.resolvedLanguage || "")
        ? (i18n.resolvedLanguage as string)
        : "en";

      const result = await api.ai.analyzeCrash(
        accessToken,
        prepared.id,
        locale,
      );

      if (!result.ok) {
        if (result.error.reason === "unavailable" && allowRefresh && crash) {
          const refreshed = await api.ai
            .prepareCrashReport(
              crash.versionPath,
              crash.exitCode,
              account?.nickname,
              crash.versionName,
              crash.instance,
            )
            .catch(() => null);

          if (refreshed) {
            setRequest(refreshed);
            await analyzeRef.current?.(refreshed, false);
            return;
          }
        }

        setErrorReason(result.error.reason);
        setStage("error");
        return;
      }

      setAnalysis(result.analysis);
      setStage("result");
      setCrashes((prev) => {
        const current = prev[crashKey];
        if (!current) return prev;

        return {
          ...prev,
          [crashKey]: { ...current, analysis: result.analysis },
        };
      });
    },
    [
      account?.accessToken,
      account?.nickname,
      crash,
      crashKey,
      i18n.resolvedLanguage,
      setCrashes,
    ],
  );

  useEffect(() => {
    analyzeRef.current = analyze;
  }, [analyze]);

  const hasStoredAnalysisRef = useRef(!!storedAnalysis);
  const autoAnalyzeRef = useRef(settings.aiLogAnalysis);

  useEffect(() => {
    hasStoredAnalysisRef.current = !!storedAnalysis;
    autoAnalyzeRef.current = settings.aiLogAnalysis;
  }, [storedAnalysis, settings.aiLogAnalysis]);

  const versionPath = crash?.versionPath;
  const exitCode = crash?.exitCode;
  const nickname = account?.nickname;
  const versionName = crash?.versionName;
  const instance = crash?.instance;

  useEffect(() => {
    if (!versionPath) return;

    let cancelled = false;

    void api.ai
      .prepareCrashReport(
        versionPath,
        exitCode,
        nickname,
        versionName,
        instance,
      )
      .then((prepared) => {
        if (cancelled) return;

        setRequest(prepared);

        if (!prepared) {
          if (!hasStoredAnalysisRef.current) {
            setErrorReason("noLog");
            setStage("error");
          }
          return;
        }

        if (
          !hasStoredAnalysisRef.current &&
          autoAnalyzeRef.current &&
          !autoStartedRef.current
        ) {
          autoStartedRef.current = true;
          void analyzeRef.current?.(prepared);
        }
      })
      .catch(() => {
        if (cancelled || hasStoredAnalysisRef.current) return;

        setErrorReason("noLog");
        setStage("error");
      });

    return () => {
      cancelled = true;
    };
  }, [versionPath, exitCode, nickname, versionName, instance]);

  const sendFeedback = async (helpful: boolean) => {
    if (!analysis?.analysisId || feedback !== null) return;

    const accessToken = account?.accessToken;
    if (!accessToken) return;

    setFeedback(helpful);

    const sent = await api.ai.sendFeedback(
      accessToken,
      analysis.analysisId,
      helpful,
    );

    if (sent.counted) {
      toast.success(t("aiCrash.feedbackSent"));
      return;
    }

    if (sent.ok) return;

    setFeedback(null);
    toast.error(t("aiCrash.feedbackFailed"));
  };

  const confidenceVariant =
    analysis?.confidence === "high"
      ? "default"
      : analysis?.confidence === "medium"
        ? "secondary"
        : "outline";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b bg-muted/20 px-5 py-4 text-left">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/20 text-primary">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <DialogTitle className="truncate text-base">
                {t("aiCrash.title")}
              </DialogTitle>
              <DialogDescription className="truncate">
                {crash?.versionName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 min-w-0 flex-1 auto-rows-min gap-3 overflow-x-hidden overflow-y-auto px-5 py-1">
          {stage === "consent" && (
            <>
              <Alert>
                <ShieldCheck />
                <AlertDescription>
                  {t("aiCrash.consentDescription")}
                </AlertDescription>
              </Alert>

              <div className="grid min-w-0 gap-1 rounded-lg border bg-muted/15 p-3 text-xs text-muted-foreground">
                <span>{t("aiCrash.sentItems")}</span>
                <span className="text-foreground">
                  {t("aiCrash.sentSummary", {
                    chars: request?.log.length ?? 0,
                    mods: request?.context.mods?.length ?? 0,
                  })}
                </span>
              </div>
            </>
          )}

          {request && (
            <div className="grid gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="justify-start px-0 text-xs"
                onClick={() => setShowLog((value) => !value)}
              >
                <FileText className="size-3.5" />
                {showLog
                  ? t("aiCrash.hideLog")
                  : stage === "consent"
                    ? t("aiCrash.showLog")
                    : t("aiCrash.showSentLog")}
              </Button>

              {showLog && (
                <pre className="max-h-56 overflow-auto rounded-lg border bg-muted/10 p-3 text-[11px] leading-relaxed break-all whitespace-pre-wrap text-muted-foreground">
                  {request.log}
                </pre>
              )}
            </div>
          )}

          {stage === "loading" && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/15 p-4">
              <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {t("aiCrash.loading")}
              </p>
            </div>
          )}

          {stage === "error" && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>
                {t(`aiCrash.errors.${errorReason}`, {
                  defaultValue: t("aiCrash.errors.unavailable"),
                })}
              </AlertDescription>
            </Alert>
          )}

          {stage === "result" && analysis && (
            <div className="grid min-w-0 gap-3">
              <div className="min-w-0 rounded-lg border bg-muted/15 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant={confidenceVariant}>
                    {t(`aiCrash.confidence.${analysis.confidence}`)}
                  </Badge>
                </div>
                <p className="text-sm [overflow-wrap:anywhere] hyphens-auto">
                  {analysis.cause}
                </p>
              </div>

              {analysis.suspects.length > 0 && (
                <div className="grid min-w-0 gap-2 rounded-lg border bg-muted/15 p-3">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {t("aiCrash.suspects")}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.suspects.map((suspect) => (
                      <Badge
                        key={suspect}
                        variant="outline"
                        className="max-w-full bg-muted/30 break-all whitespace-normal"
                      >
                        {suspect}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {analysis.steps.length > 0 && (
                <div className="grid min-w-0 gap-2 rounded-lg border bg-muted/15 p-3">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    {t("aiCrash.steps")}
                  </h3>
                  <ol className="grid min-w-0 list-decimal gap-1.5 pl-4 text-sm">
                    {analysis.steps.map((step, index) => (
                      <li
                        key={index}
                        className="min-w-0 [overflow-wrap:anywhere] hyphens-auto"
                      >
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground/70">
                {t("aiCrash.disclaimer")}
              </p>

              {analysis.analysisId && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t("aiCrash.feedbackQuestion")}
                  </span>
                  <Button
                    variant={feedback === true ? "default" : "outline"}
                    size="icon"
                    className="size-7"
                    disabled={feedback !== null}
                    onClick={() => void sendFeedback(true)}
                  >
                    <ThumbsUp className="size-3.5" />
                  </Button>
                  <Button
                    variant={feedback === false ? "default" : "outline"}
                    size="icon"
                    className="size-7"
                    disabled={feedback !== null}
                    onClick={() => void sendFeedback(false)}
                  >
                    <ThumbsDown className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="m-0 shrink-0 gap-2 rounded-none border-t bg-muted/25 px-5 py-4 sm:justify-between">
          {request?.reportPath ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void api.shell.openPath(request.reportPath!)}
            >
              <FileText className="size-3.5" />
              {t("crash.openReport")}
            </Button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <Button variant="secondary" className="min-w-24" onClick={onClose}>
              {t("common.close")}
            </Button>

            {(stage === "consent" || stage === "error") && (
              <Button
                className="min-w-24"
                disabled={!request}
                onClick={() => request && void analyze(request)}
              >
                <Sparkles className="size-3.5" />
                {stage === "error"
                  ? t("aiCrash.retry")
                  : t("aiCrash.analyzeAction")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
