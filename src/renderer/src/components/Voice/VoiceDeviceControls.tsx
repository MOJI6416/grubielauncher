import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Mic, Square, Volume2 } from "lucide-react";
import { Hint } from "@renderer/components/Hint";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { VoiceMicIssue } from "@/types/Voice";
import {
  deviceOptions,
  meterSegments,
  resolveDeviceSelection,
  type VoiceDeviceKind,
} from "@renderer/features/voice/devices";
import {
  micIssueFromError,
  micIssueHintKey,
  micIssueTitleKey,
} from "@renderer/features/voice/errors";
import { showFailureToast } from "@renderer/utilities/failures";
import { playVoiceSound } from "@renderer/utilities/sounds";
import {
  voiceGetDevices,
  voiceGetSavedDevice,
  voiceSwitchDevice,
} from "@renderer/utilities/voiceClient";

const METER_SEGMENTS = 18;
const SILENCE_HINT_MS = 4000;

function useDeviceList(kind: VoiceDeviceKind, fallbackLabel: string) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [issue, setIssue] = useState<VoiceMicIssue>("none");
  const [attempt, setAttempt] = useState(0);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setLoading(true);
      void voiceGetDevices(kind).then((listing) => {
        if (cancelled) return;
        setDevices(listing.devices);
        setIssue(listing.error ? micIssueFromError(listing.error) : "none");
        setLoading(false);
      });
    };

    load();
    navigator.mediaDevices?.addEventListener?.("devicechange", load);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", load);
    };
  }, [attempt, kind]);

  const options = useMemo(
    () => deviceOptions(devices, fallbackLabel),
    [devices, fallbackLabel],
  );

  return {
    options,
    issue,
    isLoading,
    reload: useCallback(() => setAttempt((value) => value + 1), []),
  };
}

export function DeviceSelect({
  kind,
  label,
  className,
}: {
  kind: VoiceDeviceKind;
  label: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { options, issue, isLoading, reload } = useDeviceList(kind, label);
  const [saved, setSaved] = useState(() => voiceGetSavedDevice(kind));

  const selection = resolveDeviceSelection(saved, options);
  const isBroken = issue !== "none";
  const placeholder = isBroken
    ? t(micIssueTitleKey(issue))
    : isLoading
      ? t("common.loading")
      : t("voice.deviceNotFound");

  const pick = (value: string) => {
    const previous = saved;
    setSaved(value);

    void voiceSwitchDevice(kind, value).then((result) => {
      if (result.ok) return;
      setSaved(previous);
      const failure = micIssueFromError(result.error);
      toast.error(t("voice.deviceSwitchFailed"), {
        description: t(micIssueHintKey(failure)),
        duration: 8000,
      });
    });
  };

  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <Select value={selection.deviceId || undefined} onValueChange={pick}>
        <SelectTrigger
          size="sm"
          aria-label={label}
          className={cn(
            "w-full min-w-0",
            (selection.isMissing || isBroken) && "border-warning text-warning",
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {placeholder}
            </p>
          ) : (
            options.map((option) => (
              <SelectItem key={option.deviceId} value={option.deviceId}>
                {option.deviceId === "default"
                  ? t("voice.deviceDefault")
                  : option.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>

      {isBroken ? (
        <p className="flex items-center gap-1.5 text-[11px] leading-4 text-warning">
          <AlertTriangle className="size-3 shrink-0" />
          <Hint
            content={t(micIssueHintKey(issue))}
            variant="text"
            truncatedOnly
          >
            <span className="min-w-0 truncate">
              {t(micIssueHintKey(issue))}
            </span>
          </Hint>
          <button
            type="button"
            onClick={reload}
            className="shrink-0 underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("common.retry")}
          </button>
        </p>
      ) : (
        selection.isMissing && (
          <p className="flex items-center gap-1.5 text-[11px] leading-4 text-warning">
            <AlertTriangle className="size-3 shrink-0" />
            {t("voice.deviceGoneHint")}
          </p>
        )
      )}
    </div>
  );
}

export function MicLevelTest() {
  const { t } = useTranslation();
  const [isActive, setIsActive] = useState(false);
  const [isStarting, setStarting] = useState(false);
  const [level, setLevel] = useState(0);
  const [isSilent, setSilent] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setIsActive(false);
    setLevel(0);
    setSilent(false);
  }, []);

  const start = useCallback(async () => {
    if (stopRef.current) return;

    const inputId = voiceGetSavedDevice("audioinput");
    setStarting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: inputId ? { deviceId: { ideal: inputId } } : true,
      });

      if (!isMountedRef.current || stopRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const startedAt = Date.now();
      let loudestAt = 0;
      let raf = 0;

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const value of data) {
          peak = Math.max(peak, Math.abs(value - 128) / 128);
        }
        if (peak > 0.06) loudestAt = Date.now();
        setLevel(peak);
        setSilent(loudestAt === 0 && Date.now() - startedAt > SILENCE_HINT_MS);
        raf = requestAnimationFrame(tick);
      };
      tick();

      stopRef.current = () => {
        cancelAnimationFrame(raf);
        source.disconnect();
        stream.getTracks().forEach((track) => track.stop());
        void context.close().catch(() => undefined);
      };
      setIsActive(true);
    } catch (error) {
      if (!isMountedRef.current) return;
      const issue = micIssueFromError(error);
      showFailureToast(t(micIssueTitleKey(issue)), error, {
        context: { side: "launcher" },
        fallbackDescription: t("settings.voiceMicTestErrorHint"),
      });
    } finally {
      if (isMountedRef.current) setStarting(false);
    }
  }, [t]);

  useEffect(() => stop, [stop]);

  const lit = meterSegments(level, METER_SEGMENTS);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={isStarting}
          onClick={() => (isActive ? stop() : void start())}
        >
          {isStarting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : isActive ? (
            <Square className="size-3.5" />
          ) : (
            <Mic className="size-3.5" />
          )}
          {isActive
            ? t("settings.voiceMicTestStop")
            : t("settings.voiceMicTestStart")}
        </Button>

        <div className="flex min-w-24 flex-1 items-center gap-[3px]">
          {Array.from({ length: METER_SEGMENTS }, (_, index) => (
            <span
              key={index}
              className={cn(
                "h-3 flex-1 rounded-[2px] transition-colors duration-75",
                !isActive
                  ? "bg-surface-3"
                  : index < lit
                    ? index > METER_SEGMENTS - 4
                      ? "bg-warning"
                      : "bg-success"
                    : "bg-surface-3",
              )}
            />
          ))}
        </div>

        {isActive && (
          <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-faint">
            {Math.round(Math.min(1, level) * 100)}%
          </span>
        )}
      </div>

      {isActive && (
        <p
          className={cn(
            "truncate text-[11px] leading-4",
            isSilent ? "text-warning" : "text-faint",
          )}
        >
          {isSilent ? t("voice.micTestSilent") : t("voice.micTestSpeak")}
        </p>
      )}
    </div>
  );
}

export function SpeakerTest() {
  const { t } = useTranslation();

  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0"
      onClick={() => playVoiceSound("join", { force: true })}
    >
      <Volume2 className="size-3.5" />
      {t("voice.speakerTest")}
    </Button>
  );
}
