import { useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_SETTINGS } from "@/types/Settings";
import type { LauncherScanResult } from "@/types/LauncherImport";
import {
  accountsAtom,
  pathsAtom,
  settingsAtom,
  versionsAtom,
  versionsLoadedAtom,
} from "@renderer/stores/atoms";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import { Hint } from "@renderer/components/Hint";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { readLauncherState, writeLauncherState } from "@renderer/utilities/launcherState";
import { LauncherMark } from "./LauncherMark";
import { useLauncherName } from "./LauncherImportView";
import { groupByLauncher, launcherSummary } from "./selection";

const api = window.api;
const VISIBLE_LAUNCHERS = 4;

function isScreenBusy(): boolean {
  if (document.getElementById("privacy-notice-title")) return true;
  return (
    document.body.hasAttribute("data-scroll-locked") &&
    document.querySelector('[role="dialog"], [role="alertdialog"]') !== null
  );
}

export function LauncherImportOffer() {
  const { t } = useTranslation();
  const launcherName = useLauncherName();
  const paths = useAtomValue(pathsAtom);
  const settings = useAtomValue(settingsAtom);
  const accounts = useAtomValue(accountsAtom);
  const versions = useAtomValue(versionsAtom);
  const versionsLoaded = useAtomValue(versionsLoadedAtom);
  const [offered, setOffered] = useState<boolean | null>(null);
  const [found, setFound] = useState<LauncherScanResult | null>(null);
  const [isFree, setFree] = useState(false);
  const scannedRef = useRef(false);

  const isEligible =
    offered === false &&
    settings !== DEFAULT_SETTINGS &&
    versionsLoaded &&
    (accounts?.length ?? 0) > 0 &&
    versions.length === 0;

  useEffect(() => {
    if (!paths.launcher) return;
    let cancelled = false;
    void readLauncherState(paths.launcher).then((state) => {
      if (!cancelled) setOffered(state?.launcherImportOffered === true);
    });
    return () => {
      cancelled = true;
    };
  }, [paths.launcher]);

  useEffect(() => {
    if (!isEligible || scannedRef.current) return;
    scannedRef.current = true;
    void api.launcherImport
      .scan()
      .then((result) => setFound(result))
      .catch(ignoreFailure);
  }, [isEligible]);

  const isReady = isEligible && !!found && found.instances.length > 0;

  useEffect(() => {
    if (!isReady) return;
    const update = () => setFree(!isScreenBusy());
    update();
    const timer = window.setInterval(update, 1500);
    return () => window.clearInterval(timer);
  }, [isReady]);

  if (!isReady || !isFree || !found) return null;

  const remember = () => {
    setOffered(true);
    const launcherPath = paths.launcher;
    if (!launcherPath) return;
    void readLauncherState(launcherPath)
      .then((state) =>
        writeLauncherState(launcherPath, { ...(state || {}), launcherImportOffered: true }),
      )
      .catch(ignoreFailure);
  };

  const summary = launcherSummary(groupByLauncher(found.instances));
  const shown = summary.slice(0, VISIBLE_LAUNCHERS);
  const hidden = summary.slice(VISIBLE_LAUNCHERS).reduce((sum, entry) => sum + entry.count, 0);

  return (
    <section
      aria-labelledby="launcher-import-offer-title"
      className="fixed right-4 bottom-4 z-50 w-[360px] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2"
    >
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-muted-foreground">
          <ArrowRightLeft className="size-4" />
        </span>
        <div className="grid min-w-0 gap-1">
          <h2 id="launcher-import-offer-title" className="text-sm leading-5 font-medium">
            {t("launcherImport.offer.title")}
          </h2>
          <p className="text-xs leading-4 text-muted-foreground">
            {t("launcherImport.offer.description")}
          </p>
        </div>
      </div>

      <ul className="grid gap-0.5 px-2 pb-2">
        {shown.map((entry) => (
          <li key={entry.launcher} className="flex h-8 items-center gap-2.5 rounded-lg px-2">
            <LauncherMark launcher={entry.launcher} />
            <Hint content={launcherName(entry.launcher)} variant="text" truncatedOnly>
              <span className="min-w-0 flex-1 truncate text-sm">{launcherName(entry.launcher)}</span>
            </Hint>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {t("launcherImport.offer.count", { count: entry.count })}
            </span>
          </li>
        ))}
        {hidden > 0 && (
          <li className="px-2 text-xs text-faint">
            {t("launcherImport.offer.more", { count: hidden })}
          </li>
        )}
      </ul>

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
        <Button variant="ghost" size="sm" onClick={remember}>
          {t("launcherImport.offer.later")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            remember();
            openNewInstance({ source: "launchers" });
          }}
        >
          {t("launcherImport.offer.open")}
        </Button>
      </div>
    </section>
  );
}
