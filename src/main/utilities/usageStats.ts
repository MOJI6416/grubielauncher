import path from "path";
import fs from "fs-extra";
import axios from "axios";
import { app } from "electron";
import { getApiBaseUrl } from "./apiHost";
import { getDataRoot } from "./dataRoot";
import type { UsageFeature } from "@/shared/usageFeatures";
import {
  addUse,
  dropStaleDays,
  finishedDays,
  isRejectedReport,
  localDay,
  normalizeUsageDays,
  type UsageDays,
} from "./usageStatsModel";

const FILE_NAME = "usage-stats.json";
const SAVE_DELAY_MS = 5000;
const FIRST_FLUSH_MS = 60_000;
const FLUSH_INTERVAL_MS = 60 * 60 * 1000;

let days: UsageDays = {};
let loaded = false;
let saveTimer: NodeJS.Timeout | null = null;
let flushing = false;

function filePath(): string {
  return path.join(getDataRoot(), FILE_NAME);
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    days = normalizeUsageDays(
      fs.readJSONSync(filePath(), { throws: false })?.days,
    );
  } catch {
    days = {};
  }
}

function saveNow(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    if (Object.keys(days).length === 0) {
      fs.removeSync(filePath());
      return;
    }
    fs.outputJSONSync(filePath(), { days });
  } catch {}
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
}

async function isAllowed(): Promise<boolean> {
  const settings = await fs
    .readJSON(path.join(getDataRoot(), "settings.json"))
    .catch(() => null);
  return settings?.usageStats !== false;
}

export function recordUsage(feature: string): void {
  ensureLoaded();
  const next = addUse(days, feature, localDay(new Date()));
  if (next === days) return;
  days = next;
  scheduleSave();
}

export function countUsage(feature: UsageFeature): void {
  void isAllowed().then((allowed) => {
    if (allowed) recordUsage(feature);
  });
}

export function clearUsage(): void {
  ensureLoaded();
  days = {};
  saveNow();
}

export async function flushUsage(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    ensureLoaded();
    if (!(await isAllowed())) {
      clearUsage();
      return;
    }

    const today = localDay(new Date());
    days = dropStaleDays(days, today);

    for (const day of finishedDays(days, today)) {
      try {
        await axios.post(
          `${getApiBaseUrl()}/feature-usage`,
          { day, features: days[day] },
          { timeout: 10_000 },
        );
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (!isRejectedReport(status)) throw error;
      }
      const rest = { ...days };
      delete rest[day];
      days = rest;
    }
  } catch {
    return;
  } finally {
    flushing = false;
    saveNow();
  }
}

export function initUsageStats(): void {
  ensureLoaded();
  setTimeout(() => void flushUsage(), FIRST_FLUSH_MS).unref();
  setInterval(() => void flushUsage(), FLUSH_INTERVAL_MS).unref();
  app.on("before-quit", saveNow);
}
