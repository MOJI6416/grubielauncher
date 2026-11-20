import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDefaultStore, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ImportPart, LauncherScanResult } from "@/types/LauncherImport";
import { accountAtom, internetAtom, pathsAtom } from "@renderer/stores/atoms";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  clearLauncherImportJob,
  importedLaunchersAtom,
  launcherImportJobAtom,
  loadImportedLaunchers,
  startLauncherImport,
  stopLauncherImport,
} from "./importJob";
import {
  DEFAULT_PARTS,
  defaultSelection,
  groupByLauncher,
  orderedParts,
} from "./selection";
import { countFeature } from "@renderer/features/usage/usage";

const api = window.api;

export type ScanStatus = "idle" | "scanning" | "ready";

export function useLauncherImportWizard(enabled: boolean) {
  const { t } = useTranslation();
  const paths = useAtomValue(pathsAtom);
  const account = useAtomValue(accountAtom);
  const isInternetOnline = useAtomValue(internetAtom);
  const imported = useAtomValue(importedLaunchersAtom);
  const job = useAtomValue(launcherImportJobAtom);

  const [status, setStatus] = useState<ScanStatus>("idle");
  const [result, setResult] = useState<LauncherScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [parts, setParts] = useState<Set<ImportPart>>(new Set(DEFAULT_PARTS));
  const [isPickingFolder, setPickingFolder] = useState(false);
  const requestRef = useRef(0);

  const resultRef = useRef<LauncherScanResult | null>(null);

  const applyResult = useCallback((next: LauncherScanResult, keepSelection: boolean) => {
    const known = new Set(resultRef.current?.instances.map((instance) => instance.id) ?? []);
    resultRef.current = next;
    setResult(next);
    setSelected((current) => {
      const fresh = defaultSelection(
        next.instances,
        getDefaultStore().get(importedLaunchersAtom),
      );
      if (!keepSelection) return fresh;
      const merged = new Set<string>();
      for (const instance of next.instances) {
        if (known.has(instance.id) ? current.has(instance.id) : fresh.has(instance.id)) {
          merged.add(instance.id);
        }
      }
      return merged;
    });
  }, []);

  const scan = useCallback(async () => {
    const request = ++requestRef.current;
    setStatus("scanning");
    try {
      if (paths.launcher) await loadImportedLaunchers(paths.launcher);
      const next = await api.launcherImport.scan();
      if (request !== requestRef.current) return;
      applyResult(next, false);
    } catch (error) {
      if (request !== requestRef.current) return;
      showFailureToast(t("launcherImport.scanFailed"), error, {
        channels: ["launcherImport:scan"],
      });
    } finally {
      if (request === requestRef.current) setStatus("ready");
    }
  }, [applyResult, paths.launcher, t]);

  useEffect(() => {
    if (!enabled || status !== "idle") return;
    void scan();
  }, [enabled, scan, status]);

  const pickFolder = useCallback(async () => {
    const folders = await api.other.openFileDialog(true);
    if (!folders.length) return;

    setPickingFolder(true);
    try {
      const { result: next, added } = await api.launcherImport.scanFolder(folders[0]);
      applyResult(next, true);
      if (added === 0) toast.info(t("launcherImport.folderEmpty"));
      else toast.success(t("launcherImport.folderFound", { count: added }));
    } catch (error) {
      showFailureToast(t("launcherImport.scanFailed"), error, {
        channels: ["launcherImport:scanFolder"],
      });
    } finally {
      setPickingFolder(false);
    }
  }, [applyResult, t]);

  const instances = useMemo(() => result?.instances ?? [], [result]);
  const groups = useMemo(() => groupByLauncher(instances), [instances]);
  const chosen = useMemo(
    () => instances.filter((instance) => selected.has(instance.id)),
    [instances, selected],
  );

  const blocker = !account
    ? t("launcherImport.blockers.account")
    : !isInternetOnline
      ? t("launcherImport.blockers.internet")
      : null;

  const start = useCallback(() => {
    if (blocker || chosen.length === 0) return;
    countFeature("launcherImport.start");
    void startLauncherImport(chosen, orderedParts(parts));
  }, [blocker, chosen, parts]);

  const togglePart = useCallback((part: ImportPart, value: boolean) => {
    setParts((current) => {
      const next = new Set(current);
      if (value) next.add(part);
      else next.delete(part);
      return next;
    });
  }, []);

  const toggleInstance = useCallback((id: string, value: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const again = useCallback(() => {
    clearLauncherImportJob();
    setStatus("idle");
  }, []);

  return {
    status,
    instances,
    groups,
    selected,
    setSelected,
    toggleInstance,
    parts,
    togglePart,
    imported,
    chosen,
    blocker,
    job,
    isPickingFolder,
    scan,
    pickFolder,
    start,
    stop: stopLauncherImport,
    again,
  };
}

export type LauncherImportWizard = ReturnType<typeof useLauncherImportWizard>;
