import "./assets/main.css";

import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import icon from "./assets/icon.png";
import { changeAppLanguage } from "./i18n";
import { LANGUAGES, normalizeSettings, TSettings } from "@/types/Settings";
import { Progress } from "@/components/ui/progress";

const api = window.api;

type UpdaterStatus =
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "error";

interface UpdaterProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

const emptyProgress: UpdaterProgress = {
  percent: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0,
};

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

const App = () => {
  const [status, setStatus] = useState<UpdaterStatus>("checking");
  const [version, setVersion] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [progress, setProgress] = useState<UpdaterProgress>(emptyProgress);

  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
    };
  }, []);

  useEffect(() => {
    async function getLocale() {
      const systemLocate: string = await api.other.getLocale();
      const lang = LANGUAGES.find((item) => systemLocate.includes(item.code));

      let data: Partial<TSettings> = {};

      const appData = await api.other.getPath("appData");
      if (!appData) return;

      const launcherPath = await api.path.join(appData, ".grubielauncher");
      const settingsConfPath = await api.path.join(
        launcherPath,
        "settings.json",
      );

      if (await api.fs.pathExists(settingsConfPath)) {
        try {
          data = await api.fs.readJSON(settingsConfPath, "utf-8");
        } catch {
          data = {};
        }
      }

      await changeAppLanguage(
        normalizeSettings(data, lang?.code || i18n.language).lang,
      );
    }

    void getLocale();
  }, [i18n]);

  useEffect(() => {
    const unsubscribeStatus = api.events.updater.onStatus((payload) => {
      setStatus(payload.status);
      setVersion(payload.version || "");
      setErrorMessage(payload.message || "");
    });

    const unsubscribeProgress = api.events.updater.onDownloadProgress((p) => {
      setProgress({
        percent: finiteNumber(p.percent),
        bytesPerSecond: finiteNumber(p.bytesPerSecond),
        transferred: finiteNumber(p.transferred),
        total: finiteNumber(p.total),
      });
      setStatus("downloading");
    });

    return () => {
      unsubscribeStatus();
      unsubscribeProgress();
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const startTimer = window.setTimeout(() => {
      setStatus("downloading");
    }, 700);

    const progressTimer = window.setInterval(() => {
      setProgress((current) => {
        const nextPercent = current.percent >= 100 ? 0 : current.percent + 2.5;

        return {
          percent: nextPercent,
          bytesPerSecond: 0,
          transferred: nextPercent,
          total: 100,
        };
      });
    }, 180);

    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(progressTimer);
    };
  }, []);

  const percent = Math.max(0, Math.min(100, progress.percent));

  const title = (() => {
    switch (status) {
      case "available":
        return version
          ? t("updater.availableDescriptionWithVersion", { version })
          : t("updater.availableTitle");
      case "downloading":
        return t("updater.downloading");
      case "downloaded":
        return t("updater.downloadedTitle");
      case "not-available":
        return t("updater.readyTitle");
      case "error":
        return errorMessage || t("updater.errorTitle");
      default:
        return t("updater.checking");
    }
  })();

  return (
    <div className="flex h-screen items-center justify-center text-foreground">
      <div className="h-full w-full rounded-xl border bg-card p-5 text-center shadow-xl">
        <img
          width={48}
          height={48}
          src={icon}
          draggable={false}
          alt="Grubie Launcher"
          className="mx-auto size-12 rounded-xl"
        />

        <div className="mt-4 flex min-h-10 items-center justify-center gap-2">
          {status === "checking" && (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          )}
          <p className="line-clamp-2 text-sm font-medium leading-5">{title}</p>
        </div>

        <div className="mt-4 space-y-2">
          <Progress
            value={status === "checking" ? 12 : percent}
            className={status === "checking" ? "animate-pulse" : undefined}
          />
          <p className="text-xs text-muted-foreground">
            {status === "checking"
              ? t("updater.preparing")
              : t("updater.percent", { percent: percent.toFixed(0) })}
          </p>
        </div>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
