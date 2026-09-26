import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import axios from "axios";
import fs from "fs";
import path from "path";
import { attachApiHostFallback } from "../utilities/apiHost";
import { check, handleSafe } from "../utilities/ipc";
import {
  getJournalStatus,
  journal,
  sanitizeJournalValue,
  setJournalVerbose,
} from "../journal/journal";
import {
  forgetPreparedReport,
  prepareSupportReport,
  takePreparedReport,
} from "../journal/supportReport";
import type {
  JournalLevel,
  JournalStatus,
  JournalUiEntry,
  SupportReportHistoryItem,
  SupportReportPrepared,
  SupportReportRequest,
  SupportReportSendResult,
  SupportReportTrigger,
  SupportReportUiState,
} from "@/types/Journal";

const HISTORY_LIMIT = 20;
const UPLOAD_TIMEOUT_MS = 120_000;
const MAX_UI_ENTRIES = 200;
const MAX_UI_MESSAGE = 8000;
const UI_LEVELS = new Set<JournalLevel>(["debug", "info", "warn", "error"]);
const TRIGGERS = new Set<SupportReportTrigger>([
  "settings",
  "crash",
  "stall",
  "failure",
  "tray",
  "logs",
]);

const uploadClient = attachApiHostFallback(
  axios.create({
    timeout: UPLOAD_TIMEOUT_MS,
    maxBodyLength: Infinity,
    maxContentLength: 1024 * 1024,
  }),
);

function historyPath(): string {
  return path.join(app.getPath("userData"), "support-reports.json");
}

export async function readSupportHistory(): Promise<SupportReportHistoryItem[]> {
  try {
    const raw = JSON.parse(await fs.promises.readFile(historyPath(), "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (item): item is SupportReportHistoryItem =>
          item &&
          typeof item.code === "string" &&
          typeof item.createdAt === "number",
      )
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

async function appendHistory(item: SupportReportHistoryItem): Promise<void> {
  const history = await readSupportHistory();
  const next = [item, ...history.filter((entry) => entry.code !== item.code)];
  await fs.promises
    .writeFile(historyPath(), JSON.stringify(next.slice(0, HISTORY_LIMIT)), "utf8")
    .catch(() => {});
}

function isUiEntry(value: unknown): value is JournalUiEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.t === "number" &&
    typeof entry.l === "string" &&
    UI_LEVELS.has(entry.l as JournalLevel) &&
    typeof entry.s === "string" &&
    entry.s.length <= 60 &&
    typeof entry.m === "string" &&
    entry.m.length <= MAX_UI_MESSAGE &&
    (entry.d === undefined ||
      (typeof entry.d === "object" && entry.d !== null && !Array.isArray(entry.d)))
  );
}

function normalizeRequest(raw: Record<string, unknown>): SupportReportRequest {
  const trigger = TRIGGERS.has(raw.trigger as SupportReportTrigger)
    ? (raw.trigger as SupportReportTrigger)
    : "settings";

  return {
    trigger,
    comment: typeof raw.comment === "string" ? raw.comment.slice(0, 4000) : undefined,
    versionName:
      typeof raw.versionName === "string" && raw.versionName.length <= 255
        ? raw.versionName
        : undefined,
    runConnectivity: raw.runConnectivity !== false,
    ui:
      raw.ui && typeof raw.ui === "object"
        ? (sanitizeJournalValue(raw.ui) as SupportReportUiState)
        : undefined,
  };
}

export async function uploadPreparedReport(
  id: string,
  accessToken?: string,
): Promise<SupportReportSendResult> {
  const report = takePreparedReport(id);
  if (!report) return { ok: false, reason: "expired" };

  const span = journal.span("support", "upload report", {
    bytes: report.gz.byteLength,
    trigger: report.trigger,
    withAccount: Boolean(accessToken),
  });

  try {
    const response = await uploadClient.post<{ code?: unknown; expiresAt?: unknown }>(
      "/support-reports",
      report.gz,
      {
        headers: {
          "Content-Type": "application/gzip",
          "X-Launcher-Version": app.getVersion(),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      },
    );

    const code = response.data?.code;
    const expiresAt = response.data?.expiresAt;
    if (typeof code !== "string" || typeof expiresAt !== "string") {
      throw new Error("The server answered without a report code");
    }

    forgetPreparedReport(id);
    await appendHistory({
      code,
      createdAt: Date.now(),
      expiresAt,
      trigger: report.trigger,
      versionName: report.summary.versionName,
    });
    span.ok({ code });

    return { ok: true, code, expiresAt };
  } catch (error) {
    span.fail(error);

    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 413) return { ok: false, reason: "tooLarge", status };
    if (status === 429) return { ok: false, reason: "rateLimited", status };
    if (status && status >= 400 && status < 500) {
      return { ok: false, reason: "rejected", status };
    }
    return { ok: false, reason: "network", status };
  }
}

async function savePreparedReport(id: string): Promise<string | null> {
  const report = takePreparedReport(id);
  if (!report) return null;

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const window = BrowserWindow.getFocusedWindow();
  const options: Electron.SaveDialogOptions = {
    defaultPath: path.join(app.getPath("downloads"), `grubie-report-${stamp}.json.gz`),
    filters: [{ name: "Grubie report", extensions: ["gz"] }],
  };
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;

  await fs.promises.writeFile(result.filePath, report.gz);
  journal.info("support", "report saved to a file", {
    path: result.filePath,
    bytes: report.gz.byteLength,
  });
  shell.showItemInFolder(result.filePath);

  return result.filePath;
}

export function registerSupportIpc() {
  ipcMain.removeAllListeners("journal:write");
  ipcMain.on("journal:write", (_event, entries: unknown) => {
    if (!Array.isArray(entries)) return;
    for (const entry of entries.slice(0, MAX_UI_ENTRIES)) {
      if (isUiEntry(entry)) journal.ui(entry);
    }
  });

  handleSafe<JournalStatus | null>("journal:status", null, [], async () =>
    getJournalStatus(),
  );

  handleSafe<number | null>(
    "journal:setVerbose",
    null,
    [check.optional(check.integer())],
    async (_, minutes?: number | null) => setJournalVerbose(minutes ?? null),
  );

  handleSafe<boolean>("journal:openFolder", false, [], async () => {
    const status = await getJournalStatus();
    if (!status.dir) return false;
    await journal.flush();
    await fs.promises.mkdir(status.dir, { recursive: true });
    return (await shell.openPath(status.dir)) === "";
  });

  handleSafe<SupportReportPrepared | null>(
    "support:prepare",
    null,
    [check.object(16)],
    async (_, request: Record<string, unknown>) =>
      prepareSupportReport(normalizeRequest(request)),
  );

  handleSafe<SupportReportSendResult>(
    "support:send",
    { ok: false, reason: "network" },
    [check.nonEmptyString(64), check.optional(check.string(8192))],
    async (_, id: string, accessToken?: string | null) =>
      uploadPreparedReport(id, accessToken || undefined),
  );

  handleSafe<string | null>(
    "support:save",
    null,
    [check.nonEmptyString(64)],
    async (_, id: string) => savePreparedReport(id),
  );

  handleSafe<SupportReportHistoryItem[]>("support:history", [], [], async () =>
    readSupportHistory(),
  );
}
