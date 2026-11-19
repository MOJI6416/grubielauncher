import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_SETTINGS, type TSettings } from "@/types/Settings";
import { navigate } from "@renderer/navigation/navigate";
import { pathsAtom, settingsAtom } from "@renderer/stores/atoms";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  readLauncherState,
  writeLauncherState,
} from "@renderer/utilities/launcherState";

type PrivacyKey = "crashTelemetry" | "usageStats";

const ROWS: { key: PrivacyKey; id: string }[] = [
  { key: "crashTelemetry", id: "privacy-notice-crashes" },
  { key: "usageStats", id: "privacy-notice-usage" },
];

function isModalOpen(): boolean {
  return (
    document.body.hasAttribute("data-scroll-locked") &&
    document.querySelector('[role="dialog"], [role="alertdialog"]') !== null
  );
}

function useModalOpen(): boolean {
  const [isOpen, setOpen] = useState(isModalOpen);

  useEffect(() => {
    const observer = new MutationObserver(() => setOpen(isModalOpen()));
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-scroll-locked"],
    });
    setOpen(isModalOpen());
    return () => observer.disconnect();
  }, []);

  return isOpen;
}

export function PrivacyNotice() {
  const { t } = useTranslation();
  const paths = useAtomValue(pathsAtom);
  const settings = useAtomValue(settingsAtom);
  const [isSeen, setSeen] = useState<boolean | null>(null);
  const isModalShown = useModalOpen();

  useEffect(() => {
    if (!paths.launcher) return;

    let cancelled = false;
    void readLauncherState(paths.launcher).then((state) => {
      if (!cancelled) setSeen(state?.privacyNoticeSeen === true);
    });

    return () => {
      cancelled = true;
    };
  }, [paths.launcher]);

  if (isSeen !== false || settings === DEFAULT_SETTINGS || isModalShown)
    return null;

  const dismiss = () => {
    setSeen(true);

    const launcherPath = paths.launcher;
    if (!launcherPath) return;
    void readLauncherState(launcherPath).then((state) =>
      writeLauncherState(launcherPath, {
        ...(state || {}),
        privacyNoticeSeen: true,
      }),
    );
  };

  const toggle = (patch: Partial<TSettings>) =>
    void patchSettings(patch).catch((error) =>
      showFailureToast(t("settings.saveFailed"), error, {
        channels: ["fs:writeJSON"],
      }),
    );

  return (
    <section
      aria-labelledby="privacy-notice-title"
      className="fixed right-4 bottom-4 z-50 w-[360px] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-muted-foreground">
          <ShieldCheck className="size-4" />
        </span>
        <div className="grid min-w-0 gap-1">
          <h2 id="privacy-notice-title" className="text-sm leading-5 font-medium">
            {t("privacyNotice.title")}
          </h2>
          <p className="text-xs leading-4 text-muted-foreground">
            {t("privacyNotice.description")}
          </p>
        </div>
      </div>

      <div className="grid gap-1 px-2 pb-2">
        {ROWS.map((row) => (
          <label
            key={row.key}
            htmlFor={row.id}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-row-hover"
          >
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="text-sm leading-5">
                {t(`settings.${row.key}`)}
              </span>
              <span className="text-xs leading-4 text-muted-foreground">
                {t(`settings.${row.key}Description`)}
              </span>
            </span>
            <Switch
              id={row.id}
              checked={settings[row.key]}
              onCheckedChange={(value) => toggle({ [row.key]: value })}
            />
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            dismiss();
            navigate({ name: "settings", section: "privacy" });
          }}
        >
          {t("privacyNotice.settings")}
        </Button>
        <Button variant="outline" size="sm" onClick={dismiss}>
          {t("privacyNotice.done")}
        </Button>
      </div>
    </section>
  );
}
