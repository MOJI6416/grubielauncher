import { Suspense, useEffect } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import {
  aiCrashKey,
  aiCrashOpenKeyAtom,
  aiCrashesAtom,
  crashAnalysesAtom,
} from "@renderer/stores/atoms";
import { recordError } from "@renderer/utilities/errorToast";
import { lazyWithPreload } from "@renderer/utilities/lazyPreload";
import { playSound } from "@renderer/utilities/sounds";
import { useLatestRef } from "@renderer/utilities/useLatestRef";

const api = window.api;

const LazyAiCrashAnalysis = lazyWithPreload(() =>
  import("@renderer/components/Modals/AiCrashAnalysis").then((module) => ({
    default: module.AiCrashAnalysis,
  })),
);

export function CrashHost() {
  const { t, i18n } = useTranslation();
  const tRef = useLatestRef(t);
  const setCrashAnalyses = useSetAtom(crashAnalysesAtom);
  const setAiCrashes = useSetAtom(aiCrashesAtom);
  const aiCrashes = useAtomValue(aiCrashesAtom);
  const [openKey, setOpenKey] = useAtom(aiCrashOpenKeyAtom);

  useEffect(() => {
    const unsubscribeAnalysis = api.events.onCrashAnalysis(
      (versionName, instance, analysis) => {
        const lang = (i18n.resolvedLanguage ||
          i18n.language ||
          "en") as keyof typeof analysis.messages;
        const message = analysis.messages[lang] || analysis.messages.en;
        const details = [
          message,
          analysis.culprits.length > 0
            ? `${tRef.current("crash.culprits")}: ${analysis.culprits.join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        const title = tRef.current("crash.title", { version: versionName });
        recordError(title, details);

        setCrashAnalyses((prev) => ({
          ...prev,
          [aiCrashKey(versionName, instance)]: {
            analysis,
            time: Date.now(),
          },
        }));

        playSound("error");
        toast.error(title, {
          description: details,
          duration: 15000,
          ...(analysis.reportPath
            ? {
                action: {
                  label: tRef.current("crash.openReport"),
                  onClick: () => {
                    void api.shell.openPath(analysis.reportPath!);
                  },
                },
              }
            : {}),
        });
      },
    );

    const unsubscribeUnresolved = api.events.onCrashUnresolved((payload) => {
      const title = tRef.current("crash.title", {
        version: payload.versionName,
      });
      const details = tRef.current("aiCrash.unresolvedDetails");
      const key = aiCrashKey(payload.versionName, payload.instance);

      setAiCrashes((prev) => ({
        ...prev,
        [key]: { crash: payload, analysis: null, time: Date.now() },
      }));

      recordError(title, details, key);

      playSound("error");
      toast.error(title, {
        description: details,
        duration: 30000,
        action: {
          label: tRef.current("aiCrash.analyzeAction"),
          onClick: () => setOpenKey(key),
        },
      });
    });

    return () => {
      unsubscribeAnalysis();
      unsubscribeUnresolved();
    };
  }, [i18n, setAiCrashes, setCrashAnalyses, setOpenKey, tRef]);

  if (!openKey || !aiCrashes[openKey]) return null;

  return (
    <Suspense fallback={<LazyDialogFallback variant="form" />}>
      <LazyAiCrashAnalysis
        key={aiCrashes[openKey].time}
        crashKey={openKey}
        onClose={() => setOpenKey(null)}
      />
    </Suspense>
  );
}
