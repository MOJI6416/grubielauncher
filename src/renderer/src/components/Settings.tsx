import { useEffect, useState } from "react";

const api = window.api;

import { useTranslation } from "react-i18next";
import ReactCountryFlag from "react-country-flag";
import {
  Activity,
  Code2,
  Download,
  HeartPulse,
  Languages,
  Loader2,
  MemoryStick,
  Save,
  Volume2,
} from "lucide-react";
import { useAtom } from "jotai";
import { pathsAtom, settingsAtom } from "@renderer/stores/atoms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { LANGUAGES, normalizeSettings } from "@/types/Settings";
import { changeAppLanguage } from "@renderer/i18n";
import { ConnectivityModal } from "./ConnectivityModal";
import type { ConnectivityCheckResult } from "@/types/Connectivity";
import { toast } from "sonner";

export function Settings({
  onClose,
  onShowWhatsNew,
}: {
  onClose: () => void;
  onShowWhatsNew?: () => void;
}) {
  const [settings, setSettings] = useAtom(settingsAtom);
  const { t, i18n } = useTranslation();
  const normalizedInitialSettings = normalizeSettings(settings, i18n.language);
  const [xmx, setXmx] = useState(() => normalizedInitialSettings.xmx);
  const [settingsPath, setSettingsPath] = useState("");
  const [lang, setLang] = useState(() => normalizedInitialSettings.lang);
  const [devMode, setDevMode] = useState(() => normalizedInitialSettings.devMode);
  const [crashTelemetry, setCrashTelemetry] = useState(
    () => normalizedInitialSettings.crashTelemetry,
  );
  const [sounds, setSounds] = useState(() => normalizedInitialSettings.sounds);
  const [version, setVersion] = useState("");
  const [downloadLimit, setDownloadLimit] = useState(() => normalizedInitialSettings.downloadLimit);
  const [totalMem, setTotalMem] = useState(0);
  const [paths] = useAtom(pathsAtom);
  const [connectivityResults, setConnectivityResults] = useState<
    ConnectivityCheckResult[] | null
  >(null);
  const [isConnectivityTesting, setIsConnectivityTesting] = useState(false);
  const isMemoryReady = totalMem > 0;
  const maxMemory = totalMem
    ? Math.max(1024, Math.floor(totalMem / (1024 * 1024)))
    : Math.max(32768, xmx);
  const selectedLanguage = LANGUAGES.find((l) => l.code == lang);
  const hasChanges =
    settings.xmx != xmx ||
    settings.lang != lang ||
    settings.devMode != devMode ||
    settings.downloadLimit != downloadLimit ||
    settings.crashTelemetry != crashTelemetry ||
    settings.sounds != sounds;

  const closeSettings = () => {
    setLang(settings.lang);
    void changeAppLanguage(settings.lang);
    onClose();
  };

  useEffect(() => {
    const nextSettings = normalizeSettings(settings);
    setXmx(nextSettings.xmx);
    setDevMode(nextSettings.devMode);
    setCrashTelemetry(nextSettings.crashTelemetry);
    setSounds(nextSettings.sounds);
    setDownloadLimit(nextSettings.downloadLimit);
    setLang(nextSettings.lang);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    const loadSystemInfo = async () => {
      const [v, mem] = await Promise.all([
        api.other.getVersion(),
        api.os.totalmem(),
      ]);

      if (!cancelled) {
        setVersion(v);
        setTotalMem(mem);
        setSettingsPath(await api.path.join(paths.launcher, "settings.json"));
      }
    };

    loadSystemInfo();
    return () => {
      cancelled = true;
    };
  }, [paths]);

  return (
    <>
      <Dialog
        open={true}
        onOpenChange={(open) => {
          if (!open) {
            closeSettings();
          }
        }}
      >
        <DialogContent
          data-account-click-ignore="true"
          className="flex max-h-[85vh] flex-col sm:max-w-lg"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="grid gap-1">
                <DialogTitle>{t("settings.title")}</DialogTitle>
              </div>
              {version && (
                <Badge asChild variant="secondary" className="font-mono tabular-nums">
                  <button
                    type="button"
                    onClick={onShowWhatsNew}
                    title={t("whatsNew.openCurrent")}
                  >
                    {version}
                  </button>
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl">
          <Card className="gap-0 overflow-hidden py-0">
            <CardContent className="p-0">
              <div className="bg-muted/30 px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("settings.sections.game")}
              </div>
              <Separator />
              <div className="grid gap-4 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted">
                    <MemoryStick className="size-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Label className="text-sm font-medium">
                          {t("settings.memory")}
                        </Label>
                      </div>
                      <Badge variant="secondary" className="tabular-nums">
                        {xmx} {t("settings.mb")}
                      </Badge>
                    </div>
                    <Slider
                      className={isMemoryReady ? undefined : "invisible"}
                      step={512}
                      value={[xmx]}
                      onValueChange={([value]) => {
                        if (typeof value == "number") {
                          setXmx(Number(value.toFixed(0)));
                        }
                      }}
                      min={1024}
                      max={maxMemory}
                    />
                  </div>
                </div>
              </div>
              <Separator />
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted">
                      <Download className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0">
                      <Label
                        htmlFor="settings-download-limit"
                        className="text-sm font-medium"
                      >
                        {t("settings.downloadLimit")}
                      </Label>
                    </div>
                  </div>
                  <Input
                    id="settings-download-limit"
                    className="w-12 text-right tabular-nums"
                    type="number"
                    min={1}
                    max={16}
                    value={downloadLimit}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      if (Number.isNaN(nextValue)) return;

                      setDownloadLimit(Math.min(16, Math.max(1, nextValue)));
                    }}
                  />
                </div>
              <Separator />
              <div className="bg-muted/30 px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("settings.sections.interface")}
              </div>
              <Separator />
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted">
                      <Languages className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0">
                      <Label className="text-sm font-medium">
                        {t("settings.language")}
                      </Label>
                    </div>
                  </div>
                  <Select
                    value={lang}
                    onValueChange={(value) => {
                      if (!value) return;

                      setLang(value);
                      void changeAppLanguage(value);
                    }}
                  >
                    <SelectTrigger className="w-42">
                      <SelectValue placeholder={t("settings.language")}>
                        {selectedLanguage && (
                          <div className="flex min-w-0 items-center gap-2">
                            {selectedLanguage.country && (
                              <ReactCountryFlag
                                svg={true}
                                countryCode={selectedLanguage.country}
                              />
                            )}
                            <span className="truncate">
                              {selectedLanguage.label}
                            </span>
                          </div>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => {
                        return (
                          <SelectItem key={l.code} value={l.code}>
                            <div className="flex items-center gap-2">
                              <ReactCountryFlag
                                svg={true}
                                countryCode={l.country}
                              />
                              <span>{l.label}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              <Separator />
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted">
                      <Volume2 className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0">
                      <Label
                        htmlFor="settings-sounds"
                        className="text-sm font-medium"
                      >
                        {t("settings.sounds")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.soundsDescription")}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="settings-sounds"
                    checked={sounds}
                    onCheckedChange={setSounds}
                  />
                </div>
              <Separator />
              <div className="bg-muted/30 px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("settings.sections.diagnostics")}
              </div>
              <Separator />
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted">
                      <Activity className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0">
                      <Label className="text-sm font-medium">
                        {t("settings.connectivity.title")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.connectivity.description")}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isConnectivityTesting}
                    onClick={async () => {
                      setIsConnectivityTesting(true);
                      try {
                        setConnectivityResults(await api.connectivity.test());
                      } finally {
                        setIsConnectivityTesting(false);
                      }
                    }}
                  >
                    {isConnectivityTesting && (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                    {isConnectivityTesting
                      ? t("settings.connectivity.running")
                      : t("settings.connectivity.run")}
                  </Button>
                </div>
              <Separator />
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted">
                      <HeartPulse className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0">
                      <Label
                        htmlFor="settings-crash-telemetry"
                        className="text-sm font-medium"
                      >
                        {t("settings.crashTelemetry")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.crashTelemetryDescription")}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="settings-crash-telemetry"
                    checked={crashTelemetry}
                    onCheckedChange={setCrashTelemetry}
                  />
                </div>
              <Separator />
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted">
                      <Code2 className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0">
                      <Label
                        htmlFor="settings-dev-mode"
                        className="text-sm font-medium"
                      >
                        {t("settings.devMode")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.devModeDescription")}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="settings-dev-mode"
                    checked={devMode}
                    onCheckedChange={setDevMode}
                  />
                </div>
            </CardContent>
          </Card>
          </div>

          <DialogFooter>
            <Button
              disabled={!hasChanges || !settingsPath}
              onClick={async () => {
                const newSettings = {
                  ...settings,
                  xmx,
                  lang,
                  devMode,
                  crashTelemetry,
                  sounds,
                  downloadLimit,
                };

                await api.fs.writeJSON(settingsPath, newSettings);

                setSettings(newSettings);
                toast.success(t("settings.saved"));
              }}
            >
              <Save className="size-4" />
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {connectivityResults && (
        <ConnectivityModal
          initialResults={connectivityResults}
          onClose={() => setConnectivityResults(null)}
        />
      )}
    </>
  );
}
