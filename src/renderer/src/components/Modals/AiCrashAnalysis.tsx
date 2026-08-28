import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue, useSetAtom } from "jotai";
import {
  AiAnalysisConfidence,
  IAiLogAnalysis,
  IAiLogRequest,
} from "@/types/AiAnalysis";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Copy,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";
import {
  accountAtom,
  aiCrashesAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import { toast } from "sonner";
import { askAgent } from "@renderer/features/agent/openAgent";
import { agentBlockReason } from "@renderer/navigation/access";
import { Hint } from "@renderer/components/Hint";
import { CrashCard } from "@renderer/features/logs/CrashCard";
import { describeExitCode } from "@renderer/features/logs/runs";
import { formatBytes } from "@renderer/utilities/file";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const api = window.api;

type Stage = "consent" | "loading" | "result" | "error";

const CONFIDENCE_TONE: Record<AiAnalysisConfidence, string> = {
  high: "border-success/40 text-success",
  medium: "border-warning/40 text-warning",
  low: "border-border text-faint",
};

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

  const retry = useCallback(async () => {
    if (request) {
      await analyze(request);
      return;
    }

    if (!versionPath) return;

    setStage("loading");

    const prepared = await api.ai
      .prepareCrashReport(
        versionPath,
        exitCode,
        nickname,
        versionName,
        instance,
      )
      .catch(() => null);

    if (!prepared) {
      setErrorReason("noLog");
      setStage("error");
      return;
    }

    setRequest(prepared);
    await analyze(prepared);
  }, [
    analyze,
    exitCode,
    instance,
    nickname,
    request,
    versionName,
    versionPath,
  ]);

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

    if (sent.counted || sent.ok) return;

    setFeedback(null);
    toast.error(t("aiCrash.feedbackFailed"));
  };

  const copyAnalysis = useCallback(async () => {
    if (!analysis) return;

    const lines = [
      analysis.cause,
      analysis.suspects.length
        ? `${t("aiCrash.suspects")}: ${analysis.suspects.join(", ")}`
        : null,
      ...analysis.steps.map((step, index) => `${index + 1}. ${step}`),
    ].filter(Boolean);

    if (!(await copyToClipboard(lines.join("\n")))) return;
    toast.success(t("common.copied"));
  }, [analysis, t]);

  const sizeLabels = useMemo(
    () => [
      t("sizes.0"),
      t("sizes.1"),
      t("sizes.2"),
      t("sizes.3"),
      t("sizes.4"),
    ],
    [t],
  );

  const facts = useMemo(() => {
    if (!request) return [];

    const context = request.context;
    const rows: { label: string; value: string }[] = [
      {
        label: t("aiCrash.fact.chars"),
        value: request.log.length.toLocaleString(i18n.resolvedLanguage || "en"),
      },
      {
        label: t("aiCrash.fact.mods"),
        value: String(context.mods?.length ?? 0),
      },
    ];

    if (context.mcVersion) {
      rows.push({
        label: t("aiCrash.fact.minecraft"),
        value: context.mcVersion,
      });
    }
    if (context.loaderName) {
      rows.push({
        label: t("aiCrash.fact.loader"),
        value: [context.loaderName, context.loaderVersion]
          .filter(Boolean)
          .join(" "),
      });
    }
    if (context.javaVersion) {
      rows.push({
        label: t("aiCrash.fact.java"),
        value: [context.javaVersion, context.javaArch]
          .filter(Boolean)
          .join(" "),
      });
    }
    if (context.memoryMb) {
      rows.push({
        label: t("aiCrash.fact.memory"),
        value: formatBytes(context.memoryMb * 1024 * 1024, sizeLabels, 0),
      });
    }
    if (context.os) {
      rows.push({ label: t("aiCrash.fact.os"), value: context.os });
    }
    if (typeof context.exitCode === "number") {
      rows.push({
        label: t("aiCrash.fact.exit"),
        value: String(context.exitCode),
      });
    }

    return rows;
  }, [request, sizeLabels, t, i18n.resolvedLanguage]);

  const exit = useMemo(() => {
    if (typeof exitCode !== "number") return null;
    return { code: exitCode, info: describeExitCode(exitCode) };
  }, [exitCode]);

  const agentBlocked = Boolean(agentBlockReason(account?.type));

  const handOverToAgent = () => {
    if (!versionName) return;
    askAgent(t("aiCrash.askAgentPrompt", { name: versionName }));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-0 border-b border-border bg-surface-1 px-4 py-3 text-left">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-destructive/35 bg-destructive/10 text-destructive">
              <TriangleAlert className="size-4" />
            </div>

            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-sm">
                {t("aiCrash.title")}
              </DialogTitle>

              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 pr-10">
                <Hint content={versionName} variant="text" truncatedOnly>
                  <DialogDescription className="min-w-0 truncate text-xs">
                    {versionName}
                  </DialogDescription>
                </Hint>

                {stage === "result" && analysis && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 text-[0.65rem] font-normal",
                      CONFIDENCE_TONE[analysis.confidence],
                    )}
                  >
                    {t(`aiCrash.confidence.${analysis.confidence}`)}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 overflow-x-hidden overflow-y-auto px-4 py-3">
          {stage === "consent" && (
            <>
              <div className="flex shrink-0 items-start gap-2.5 rounded-xl border border-border bg-surface-2 p-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("aiCrash.consentDescription")}
                </p>
              </div>

              <div className="shrink-0 rounded-xl border border-border bg-surface-2 p-3">
                <h3 className="mb-2 text-[0.7rem] font-medium tracking-wide text-faint uppercase">
                  {t("aiCrash.sentItems")}
                </h3>

                {request ? (
                  <dl className="grid grid-cols-2 gap-x-5 gap-y-1.5">
                    {facts.map((fact) => (
                      <div
                        key={fact.label}
                        className="flex min-w-0 items-baseline justify-between gap-2"
                      >
                        <dt className="shrink-0 text-xs text-muted-foreground">
                          {fact.label}
                        </dt>
                        <Hint content={fact.value} variant="text" truncatedOnly>
                          <dd className="min-w-0 truncate font-mono text-xs tabular-nums">
                            {fact.value}
                          </dd>
                        </Hint>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
                    {[0, 1, 2, 3].map((index) => (
                      <Skeleton
                        key={index}
                        className="h-4 w-full rounded bg-surface-1"
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {stage === "loading" && (
            <div className="flex shrink-0 flex-col gap-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
                {t("aiCrash.loading")}
              </div>
              <Skeleton className="h-24 w-full rounded-xl bg-surface-1" />
              <Skeleton className="h-28 w-full rounded-xl bg-surface-1" />
            </div>
          )}

          {stage === "error" && (
            <div className="flex shrink-0 items-start gap-2.5 rounded-xl border border-destructive/40 bg-surface-2 p-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="grid min-w-0 gap-1">
                <p className="text-sm leading-snug text-foreground">
                  {t(`aiCrash.errors.${errorReason}`, {
                    defaultValue: t("aiCrash.errors.unavailable"),
                  })}
                </p>
                {(errorReason === "noLog" ||
                  errorReason === "unauthorized") && (
                  <p className="text-xs text-muted-foreground">
                    {t("aiCrash.errorNothingSent")}
                  </p>
                )}
              </div>
            </div>
          )}

          {stage === "result" && analysis && (
            <>
              <CrashCard
                tone="crash"
                title={analysis.cause}
                exit={exit}
                culprits={analysis.suspects}
                actions={
                  <>
                    <Hint content={t("aiCrash.copyAnalysis")}>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        aria-label={t("aiCrash.copyAnalysis")}
                        onClick={() => void copyAnalysis()}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </Hint>
                    {analysis.analysisId ? (
                      feedback === null ? (
                        <>
                          <Hint content={t("aiCrash.helpful")}>
                            <Button
                              size="icon-sm"
                              variant="outline"
                              aria-label={t("aiCrash.helpful")}
                              onClick={() => void sendFeedback(true)}
                            >
                              <ThumbsUp className="size-3.5" />
                            </Button>
                          </Hint>
                          <Hint content={t("aiCrash.notHelpful")}>
                            <Button
                              size="icon-sm"
                              variant="outline"
                              aria-label={t("aiCrash.notHelpful")}
                              onClick={() => void sendFeedback(false)}
                            >
                              <ThumbsDown className="size-3.5" />
                            </Button>
                          </Hint>
                        </>
                      ) : (
                        <span className="text-[0.7rem] text-faint">
                          {t("aiCrash.feedbackSent")}
                        </span>
                      )
                    ) : null}
                  </>
                }
              />

              {analysis.steps.length > 0 && (
                <div className="grid min-w-0 shrink-0 gap-2 rounded-xl border border-border bg-surface-2 p-3">
                  <h3 className="text-[0.7rem] font-medium tracking-wide text-faint uppercase">
                    {t("aiCrash.steps")}
                  </h3>
                  <ol className="grid min-w-0 gap-1.5">
                    {analysis.steps.map((step, index) => (
                      <li key={index} className="flex min-w-0 gap-2">
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-border font-mono text-[0.65rem] tabular-nums text-faint">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-sm leading-snug [overflow-wrap:anywhere] hyphens-auto">
                          {step}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <p className="shrink-0 text-[0.7rem] text-faint">
                {t("aiCrash.disclaimer")}
              </p>
            </>
          )}

          {request && stage !== "loading" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 self-start px-1.5 text-[0.7rem] text-faint"
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
                <pre className="max-h-44 shrink-0 overflow-auto rounded-lg border border-border bg-surface-1 p-2.5 font-mono text-[0.65rem] leading-relaxed break-all whitespace-pre-wrap text-muted-foreground">
                  {request.log}
                </pre>
              )}
            </>
          )}
        </div>

        <DialogFooter className="m-0 shrink-0 flex-row flex-wrap items-center gap-2 rounded-none border-t border-border bg-surface-1 px-4 py-3 sm:justify-between">
          <div className="flex min-w-0 items-center gap-1">
            {request?.reportPath && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => void api.shell.openPath(request.reportPath!)}
              >
                <FileText className="size-3.5" />
                {t("crash.openReport")}
              </Button>
            )}

            {stage !== "result" && versionName && !agentBlocked && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={handOverToAgent}
              >
                <Sparkles className="size-3.5" />
                {t("aiCrash.askAgent")}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" className="min-w-24" onClick={onClose}>
              {t("common.close")}
            </Button>

            {stage === "consent" && (
              <Button
                className="min-w-24"
                disabled={!versionPath}
                onClick={() => void retry()}
              >
                <Sparkles className="size-3.5" />
                {t("aiCrash.analyzeAction")}
              </Button>
            )}

            {stage === "loading" && (
              <Button className="min-w-24" disabled>
                <Loader2 className="size-3.5 animate-spin" />
                {t("aiCrash.analyzeAction")}
              </Button>
            )}

            {stage === "error" && errorReason !== "unauthorized" && (
              <Button
                className="min-w-24"
                disabled={!request && !versionPath}
                onClick={() => void retry()}
              >
                <RefreshCw className="size-3.5" />
                {t("aiCrash.retry")}
              </Button>
            )}

            {stage === "result" && versionName && !agentBlocked && (
              <Button className="min-w-24" onClick={handOverToAgent}>
                <Sparkles className="size-3.5" />
                {t("aiCrash.askAgent")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
