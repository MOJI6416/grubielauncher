import { useEffect, useState } from "react";

const api = window.api;

import { useTranslation } from "react-i18next";
import ReactCountryFlag from "react-country-flag";
import { Code2, Download, Languages, MemoryStick, Save } from "lucide-react";
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
import { toast } from "sonner";

export function Settings({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useAtom(settingsAtom);
  const { t, i18n } = useTranslation();
  const normalizedInitialSettings = normalizeSettings(settings, i18n.language);
  const [xmx, setXmx] = useState(() => normalizedInitialSettings.xmx);
  const [settingsPath, setSettingsPath] = useState("");
  const [lang, setLang] = useState(() => normalizedInitialSettings.lang);
  const [devMode, setDevMode] = useState(() => normalizedInitialSettings.devMode);
  const [version, setVersion] = useState("");
  const [downloadLimit, setDownloadLimit] = useState(() => normalizedInitialSettings.downloadLimit);
  const [totalMem, setTotalMem] = useState(0);
  const [paths] = useAtom(pathsAtom);
  const isMemoryReady = totalMem > 0;
  const maxMemory = totalMem
    ? Math.max(1024, Math.floor(totalMem / (1024 * 1024)))
    : Math.max(32768, xmx);
  const selectedLanguage = LANGUAGES.find((l) => l.code == lang);
  const hasChanges =
    settings.xmx != xmx ||
    settings.lang != lang ||
    settings.devMode != devMode ||
    settings.downloadLimit != downloadLimit;

  const closeSettings = () => {
    setLang(settings.lang);
    i18n.changeLanguage(settings.lang);
    onClose();
  };

  useEffect(() => {
    const nextSettings = normalizeSettings(settings, i18n.language);
    setXmx(nextSettings.xmx);
    setDevMode(nextSettings.devMode);
    setDownloadLimit(nextSettings.downloadLimit);
    setLang(nextSettings.lang);
  }, [settings, i18n.language]);

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
          className="sm:max-w-lg"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="grid gap-1">
                <DialogTitle>{t("settings.title")}</DialogTitle>
              </div>
              {version && (
                <Badge variant="secondary" className="font-mono tabular-nums">
                  {version}
                </Badge>
              )}
            </div>
          </DialogHeader>

          <Card className="gap-0 overflow-hidden py-0">
            <CardContent className="p-0">
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

              <div className="grid gap-0">
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
                      i18n.changeLanguage(value);
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
                    </div>
                  </div>
                  <Switch
                    id="settings-dev-mode"
                    checked={devMode}
                    onCheckedChange={setDevMode}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <DialogFooter>
            <Button
                disabled={!hasChanges || !settingsPath}
              onClick={async () => {
                const newSettings = {
                  ...settings,
                  xmx,
                  lang,
                  devMode,
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
    </>
  );
}
