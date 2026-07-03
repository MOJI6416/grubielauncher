import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mic, Square } from "lucide-react";
import {
  voiceGetDevices,
  voiceGetSavedDevice,
  voiceSwitchDevice,
} from "@renderer/utilities/voiceClient";

function deviceDisplayName(
  device: MediaDeviceInfo,
  index: number,
  fallback: string,
) {
  const label = (device.label || "")
    .replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "")
    .trim();
  return label || `${fallback} ${index + 1}`;
}

export function DeviceSelect({
  kind,
  label,
}: {
  kind: "audioinput" | "audiooutput";
  label: string;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selected, setSelected] = useState(() => voiceGetSavedDevice(kind));

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void voiceGetDevices(kind).then((list) => {
        if (!cancelled) setDevices(list.filter((device) => device.deviceId));
      });
    };
    load();
    navigator.mediaDevices?.addEventListener?.("devicechange", load);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", load);
    };
  }, [kind]);

  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Select
        value={selected || undefined}
        onValueChange={(value) => {
          setSelected(value);
          void voiceSwitchDevice(kind, value);
        }}
      >
        <SelectTrigger className="w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {devices.map((device, index) => (
            <SelectItem key={device.deviceId} value={device.deviceId}>
              {deviceDisplayName(device, index, label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function MicLevelTest() {
  const { t } = useTranslation();
  const [isActive, setIsActive] = useState(false);
  const [level, setLevel] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setIsActive(false);
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    const inputId = voiceGetSavedDevice("audioinput");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: inputId ? { deviceId: inputId } : true,
      });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const value of data) {
          peak = Math.max(peak, Math.abs(value - 128) / 128);
        }
        setLevel(peak);
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
    } catch {
      toast.error(t("settings.voiceMicTestError"));
    }
  }, [t]);

  useEffect(() => stop, [stop]);

  return (
    <div className="flex items-center gap-2">
      {isActive && (
        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-75"
            style={{ width: `${Math.min(100, Math.round(level * 140))}%` }}
          />
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => (isActive ? stop() : void start())}
      >
        {isActive ? (
          <Square className="size-3.5" />
        ) : (
          <Mic className="size-3.5" />
        )}
        {isActive
          ? t("settings.voiceMicTestStop")
          : t("settings.voiceMicTestStart")}
      </Button>
    </div>
  );
}
