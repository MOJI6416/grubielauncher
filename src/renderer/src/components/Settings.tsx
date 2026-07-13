import { useEffect, useState } from "react";

const api = window.api;

import { useTranslation } from "react-i18next";
import ReactCountryFlag from "react-country-flag";
import {
  Activity,
  Code2,
  Cpu,
  Download,
  EyeOff,
  Gauge,
  Globe,
  HardDrive,
  Headphones,
  Heart,
  HeartPulse,
  Info,
  Languages,
  Loader2,
  MemoryStick,
  Palette,
  Save,
  Settings as SettingsIcon,
  Settings2,
  TriangleAlert,
  Volume2,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAtom } from "jotai";
import {
  pathsAtom,
  settingsAtom,
  storageModalAtom,
} from "@renderer/stores/atoms";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  LANGUAGES,
  normalizeSettings,
  type VoicePttBind,
} from "@/types/Settings";
import { changeAppLanguage } from "@renderer/i18n";
import { VoiceSettingsPanel } from "./Voice/VoiceSettingsPanel";
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
  const [optimizedJvm, setOptimizedJvm] = useState(
    () => normalizedInitialSettings.optimizedJvm,
  );
  const [highPriority, setHighPriority] = useState(
    () => normalizedInitialSettings.highPriority,
  );
  const [settingsPath, setSettingsPath] = useState("");
  const [lang, setLang] = useState(() => normalizedInitialSettings.lang);
  const [devMode, setDevMode] = useState(
    () => normalizedInitialSettings.devMode,
  );
  const [crashTelemetry, setCrashTelemetry] = useState(
    () => normalizedInitialSettings.crashTelemetry,
  );
  const [sounds, setSounds] = useState(() => normalizedInitialSettings.sounds);
  const [hideServerInRpc, setHideServerInRpc] = useState(
    () => normalizedInitialSettings.hideServerInRpc,
  );
  const [version, setVersion] = useState("");
  const [downloadLimit, setDownloadLimit] = useState(
    () => normalizedInitialSettings.downloadLimit,
  );
  const [downloadSource, setDownloadSource] = useState(
    () => normalizedInitialSettings.downloadSource,
  );
  const [totalMem, setTotalMem] = useState(0);
  const [paths] = useAtom(pathsAtom);
  const [, setStorageModal] = useAtom(storageModalAtom);
  const [connectivityResults, setConnectivityResults] = useState<
    ConnectivityCheckResult[] | null
  >(null);
  const [isConnectivityTesting, setIsConnectivityTesting] = useState(false);
  const [voicePtt, setVoicePtt] = useState(
    () => normalizedInitialSettings.voicePtt,
  );
  const [voicePttBind, setVoicePttBind] = useState<VoicePttBind | null>(
    () => normalizedInitialSettings.voicePttBind,
  );
  const [isCapturingPtt, setIsCapturingPtt] = useState(false);
  const [isVoicePanelOpen, setIsVoicePanelOpen] = useState(false);
  const [voiceNoiseSuppression, setVoiceNoiseSuppression] = useState(
    () => normalizedInitialSettings.voiceNoiseSuppression,
  );
  const [isWarnModal, setIsWarnModal] = useState(false);
  const isMemoryReady = totalMem > 0;
  const maxMemory = totalMem
    ? Math.max(1024, Math.floor(totalMem / (1024 * 1024)) - 2048)
    : Math.max(32768, xmx);
  const totalMemMb = totalMem ? Math.floor(totalMem / (1024 * 1024)) : 0;
  const systemHeadroomMb = totalMemMb ? totalMemMb - xmx : 0;
  const isMemoryTight =
    optimizedJvm && isMemoryReady && systemHeadroomMb < 3072;
  const selectedLanguage = LANGUAGES.find((l) => l.code == lang);
  const hasChanges =
    settings.xmx != xmx ||
    settings.optimizedJvm != optimizedJvm ||
    settings.highPriority != highPriority ||
    settings.lang != lang ||
    settings.devMode != devMode ||
    settings.downloadLimit != downloadLimit ||
    settings.downloadSource != downloadSource ||
    settings.crashTelemetry != crashTelemetry ||
    settings.sounds != sounds ||
    settings.hideServerInRpc != hideServerInRpc ||
    settings.voicePtt != voicePtt ||
    (settings.voicePttBind?.type ?? null) != (voicePttBind?.type ?? null) ||
    (settings.voicePttBind?.code ?? null) != (voicePttBind?.code ?? null) ||
    settings.voiceNoiseSuppression != voiceNoiseSuppression;

  const closeSettings = () => {
    if (i18n.language !== settings.lang) {
      setLang(settings.lang);
      void changeAppLanguage(settings.lang);
    }
    onClose();
  };

  useEffect(() => {
    const nextSettings = normalizeSettings(settings);
    setXmx(nextSettings.xmx);
    setOptimizedJvm(nextSettings.optimizedJvm);
    setHighPriority(nextSettings.highPriority);
    setDevMode(nextSettings.devMode);
    setCrashTelemetry(nextSettings.crashTelemetry);
    setSounds(nextSettings.sounds);
    setHideServerInRpc(nextSettings.hideServerInRpc);
    setDownloadLimit(nextSettings.downloadLimit);
    setDownloadSource(nextSettings.downloadSource);
    setLang(nextSettings.lang);
    setVoicePtt(nextSettings.voicePtt);
    setVoicePttBind(nextSettings.voicePttBind);
    setVoiceNoiseSuppression(nextSettings.voiceNoiseSuppression);
  }, [settings]);

  const handleCapturePttBind = async () => {
    setIsCapturingPtt(true);
    try {
      const bind = await api.voice.capturePttBind();
      if (bind) setVoicePttBind(bind);
    } finally {
      setIsCapturingPtt(false);
    }
  };

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
          if (open) return;
          if (hasChanges) {
            setIsWarnModal(true);
            return;
          }
          closeSettings();
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          data-account-click-ignore="true"
          className="flex max-h-[85vh] flex-col sm:max-w-lg"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="grid gap-1">
                <DialogTitle className="flex items-center gap-2">
                  <SettingsIcon className="size-5" />
                  {t("settings.title")}
                </DialogTitle>
              </div>
              {version ? (
                <Badge
                  asChild
                  variant="secondary"
                  className="font-mono tabular-nums"
                >
                  <button
                    type="button"
                    onClick={onShowWhatsNew}
                    title={t("whatsNew.openCurrent")}
                  >
                    {version}
                  </button>
                </Badge>
              ) : (
                <Skeleton className="h-6 w-16 rounded-full" />
              )}
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <SettingsSection icon={Cpu} title={t("settings.sections.game")}>
              <SettingRow
                icon={MemoryStick}
                title={t("settings.memory")}
                description={t("settings.memoryDescription")}
                control={
                  <Badge variant="secondary" className="tabular-nums">
                    {xmx} {t("settings.mb")}
                  </Badge>
                }
              >
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

                {optimizedJvm && isMemoryReady && (
                  <Alert
                    variant={isMemoryTight ? "warning" : "info"}
                    className="mt-3"
                  >
                    {isMemoryTight ? <TriangleAlert /> : <Info />}
                    <AlertTitle>
                      {t("settings.memoryPrealloc", { mb: xmx })}
                    </AlertTitle>
                    {isMemoryTight && (
                      <AlertDescription>
                        {t("settings.memoryPreallocTight", {
                          free: Math.max(0, systemHeadroomMb),
                        })}
                      </AlertDescription>
                    )}
                  </Alert>
                )}
              </SettingRow>

              <SettingRow
                icon={Zap}
                htmlFor="settings-optimized-jvm"
                title={t("settings.optimizedJvm")}
                description={t("settings.optimizedJvmDescription")}
                control={
                  <Switch
                    id="settings-optimized-jvm"
                    checked={optimizedJvm}
                    onCheckedChange={setOptimizedJvm}
                  />
                }
              />

              <SettingRow
                icon={Download}
                htmlFor="settings-download-limit"
                title={t("settings.downloadLimit")}
                description={t("settings.downloadLimitDescription")}
                control={
                  <Input
                    id="settings-download-limit"
                    className="w-16 text-right tabular-nums"
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
                }
              />

              <SettingRow
                icon={Gauge}
                htmlFor="settings-high-priority"
                title={t("settings.highPriority")}
                description={t("settings.highPriorityDescription")}
                control={
                  <Switch
                    id="settings-high-priority"
                    checked={highPriority}
                    onCheckedChange={setHighPriority}
                  />
                }
              />
            </SettingsSection>

            <SettingsSection
              icon={Palette}
              title={t("settings.sections.interface")}
            >
              <SettingRow
                icon={Languages}
                title={t("settings.language")}
                control={
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
                }
              />

              <SettingRow
                icon={Volume2}
                htmlFor="settings-sounds"
                title={t("settings.sounds")}
                description={t("settings.soundsDescription")}
                control={
                  <Switch
                    id="settings-sounds"
                    checked={sounds}
                    onCheckedChange={setSounds}
                  />
                }
              />

              <SettingRow
                icon={EyeOff}
                htmlFor="settings-hide-server-rpc"
                title={t("settings.hideServerInRpc")}
                description={t("settings.hideServerInRpcDescription")}
                control={
                  <Switch
                    id="settings-hide-server-rpc"
                    checked={hideServerInRpc}
                    onCheckedChange={setHideServerInRpc}
                  />
                }
              />
            </SettingsSection>

            <SettingsSection
              icon={Headphones}
              title={t("settings.sections.voice")}
            >
              <SettingRow
                icon={Headphones}
                title={t("settings.voicePanel")}
                description={t("settings.voicePanelDescription")}
                control={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsVoicePanelOpen(true)}
                  >
                    <Settings2 className="size-4" />
                    {t("settings.voicePanelOpen")}
                  </Button>
                }
              />
            </SettingsSection>

            <SettingsSection
              icon={Wrench}
              title={t("settings.sections.diagnostics")}
            >
              <SettingRow
                icon={Activity}
                title={t("settings.connectivity.title")}
                description={t("settings.connectivity.description")}
                control={
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
                }
              />

              <SettingRow
                icon={Globe}
                title={t("settings.downloadSource")}
                description={t("settings.downloadSourceDescription")}
                control={
                  <Select
                    value={downloadSource}
                    onValueChange={(value) => {
                      if (value)
                        setDownloadSource(value as typeof downloadSource);
                    }}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        {t("settings.downloadSourceOptions.auto")}
                      </SelectItem>
                      <SelectItem value="official">
                        {t("settings.downloadSourceOptions.official")}
                      </SelectItem>
                      <SelectItem value="mirror">
                        {t("settings.downloadSourceOptions.mirror")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                }
              />

              <SettingRow
                icon={HeartPulse}
                htmlFor="settings-crash-telemetry"
                title={t("settings.crashTelemetry")}
                description={t("settings.crashTelemetryDescription")}
                control={
                  <Switch
                    id="settings-crash-telemetry"
                    checked={crashTelemetry}
                    onCheckedChange={setCrashTelemetry}
                  />
                }
              />

              <SettingRow
                icon={Code2}
                htmlFor="settings-dev-mode"
                title={t("settings.devMode")}
                description={t("settings.devModeDescription")}
                control={
                  <Switch
                    id="settings-dev-mode"
                    checked={devMode}
                    onCheckedChange={setDevMode}
                  />
                }
              />
            </SettingsSection>

            <SettingsSection
              icon={HardDrive}
              title={t("settings.sections.storage")}
            >
              <SettingRow
                icon={HardDrive}
                title={t("settings.storage.manage")}
                description={t("settings.storage.manageDescription")}
                control={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStorageModal(true)}
                  >
                    {t("settings.storage.open")}
                  </Button>
                }
              />
            </SettingsSection>

          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto text-muted-foreground"
              onClick={async () => {
                try {
                  await api.shell.openExternal(
                    `https://grubielauncher.com/${i18n.language}/donate`,
                  );
                } catch {}
              }}
            >
              <Heart className="size-4" />
              {t("settings.support")}
            </Button>
            <Button
              disabled={!hasChanges || !settingsPath}
              onClick={async () => {
                const newSettings = {
                  ...settings,
                  xmx,
                  optimizedJvm,
                  highPriority,
                  lang,
                  devMode,
                  crashTelemetry,
                  sounds,
                  hideServerInRpc,
                  downloadLimit,
                  downloadSource,
                  voicePtt,
                  voicePttBind,
                  voiceNoiseSuppression,
                };

                await api.fs.writeJSON(settingsPath, newSettings);

                setSettings(newSettings);
                await api.mirror.setSource(downloadSource);
                toast.success(t("settings.saved"));
              }}
            >
              <Save className="size-4" />
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isVoicePanelOpen && (
        <Dialog
          open
          onOpenChange={(open) => !open && setIsVoicePanelOpen(false)}
        >
          <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("settings.sections.voice")}</DialogTitle>
            </DialogHeader>
            <VoiceSettingsPanel
              voicePtt={voicePtt}
              voicePttBind={voicePttBind}
              voiceNoiseSuppression={voiceNoiseSuppression}
              isCapturingPtt={isCapturingPtt}
              onVoicePttChange={setVoicePtt}
              onCapturePttBind={() => void handleCapturePttBind()}
              onVoiceNoiseSuppressionChange={setVoiceNoiseSuppression}
            />
          </DialogContent>
        </Dialog>
      )}

      {isWarnModal && (
        <Dialog open onOpenChange={(open) => !open && setIsWarnModal(false)}>
          <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("common.confirmation")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {t("serverSettings.unsavedChanges")}
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setIsWarnModal(false)}>
                {t("common.no")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setIsWarnModal(false);
                  closeSettings();
                }}
              >
                {t("common.yes")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {connectivityResults && (
        <ConnectivityModal
          initialResults={connectivityResults}
          downloadSource={downloadSource}
          onClose={() => setConnectivityResults(null)}
        />
      )}
    </>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="divide-y">{children}</div>
    </Card>
  );
}

function SettingRow({
  icon: Icon,
  title,
  description,
  htmlFor,
  control,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  htmlFor?: string;
  control?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted">
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <Label htmlFor={htmlFor} className="text-sm font-medium">
              {title}
            </Label>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
