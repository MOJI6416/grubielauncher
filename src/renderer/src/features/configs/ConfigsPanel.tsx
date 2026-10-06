import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlignLeft,
  CircleCheck,
  Ellipsis,
  FileCog,
  FileX,
  FolderSearch,
  GitCompare,
  History,
  Languages,
  ListChecks,
  Loader2,
  RotateCcw,
  Save,
  Search,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ILocalProject } from "@/types/ModManager";
import { Hint } from "@renderer/components/Hint";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { showFailureToast } from "@renderer/utilities/failures";
import { registerNavigationBlocker } from "@renderer/navigation/guards";
import { formatDate } from "@renderer/utilities/date";
import { formatBytes } from "@renderer/utilities/file";
import {
  SAVED_FLASH_MS,
  useRecentFlag,
} from "@renderer/utilities/useRecentFlag";
import {
  CONFIG_ROOT_FOLDERS,
  ConfigEntry,
  MAX_CONFIG_BYTES,
  collectInstanceConfigs,
  sortConfigEntries,
  splitConfigPath,
} from "./configFiles";
import { detectConfigLanguage, tokenizeConfig } from "./highlight";
import {
  BackupStorage,
  ConfigBackupIndex,
  ConfigSnapshot,
  backupsRoot,
  captureSnapshot,
  emptyBackupIndex,
  loadBackupIndex,
  readSnapshot,
  sortSnapshots,
} from "./backups";
import { ConfigFormat, parseConfigDocument, positionAt } from "./document";
import { commentBodies, translateCommentTokens } from "./comments";
import { diffLines, diffStats } from "./diff";
import { LineMatch, searchFiles } from "./contentSearch";
import { groupConfigs } from "./modGroups";
import {
  entryDirectory,
  entryPath,
  useCommentTranslation,
  useConfigTexts,
  useModIdentities,
} from "./useConfigData";
import { ConfigFileList, ConfigSearchMode } from "./ConfigFileList";
import { ConfigTextEditor, ConfigTextEditorHandle } from "./ConfigTextEditor";
import { ConfigFormView } from "./ConfigFormView";
import { ConfigDiffView } from "./ConfigDiffView";

const api = window.api;

const MODE_KEY = "grubie:configs:mode";
const GROUPED_KEY = "grubie:configs:grouped";
const NOTICE_MS = 4000;

type EditorMode = "text" | "form";

type ConfigView =
  | { kind: "changes" }
  | { kind: "snapshot"; snapshot: ConfigSnapshot; text: string };

type ConfigRead =
  | { state: "ok"; text: string }
  | { state: "missing" }
  | { state: "failed" };

const FORMAT_LABELS: Record<ConfigFormat, string> = {
  json: "JSON",
  toml: "TOML",
  properties: "Properties",
  ini: "INI",
  "forge-cfg": "Forge CFG",
  yaml: "YAML",
};

async function readConfigText(filePath: string): Promise<ConfigRead> {
  const text = await api.fs.readFile(filePath, "utf-8");
  if (text) return { state: "ok", text };

  if (!(await api.fs.pathExists(filePath))) return { state: "missing" };

  return (await api.file.getTotalSizes([filePath])) === 0
    ? { state: "ok", text: "" }
    : { state: "failed" };
}

const storage: BackupStorage = {
  join: (...parts) => api.path.join(...parts),
  ensure: (directory) => api.fs.ensure(directory),
  readFile: (filePath, encoding) => api.fs.readFile(filePath, encoding),
  writeFile: (filePath, data, encoding) =>
    api.fs.writeFile(filePath, data, encoding),
  pathExists: (target) => api.fs.pathExists(target),
  rimraf: (target) => api.fs.rimraf(target),
};

function readStored<T extends string>(
  key: string,
  allowed: T[],
  fallback: T,
): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function withoutKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

function EditorSkeleton() {
  return (
    <div aria-busy className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      {[9, 6, 11, 7, 4, 10, 8, 5].map((width, index) => (
        <Skeleton
          key={index}
          className="h-3 shrink-0 rounded"
          style={{ width: `${width * 8}%` }}
        />
      ))}
    </div>
  );
}

export function ConfigsPanel({
  versionPath,
  disabled,
  mods,
}: {
  versionPath: string;
  disabled?: boolean;
  mods?: ILocalProject[];
}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ConfigEntry[] | null>(null);
  const [root, setRoot] = useState("");
  const [backupRoot, setBackupRoot] = useState("");
  const [backups, setBackups] = useState<ConfigBackupIndex>(emptyBackupIndex);
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<ConfigSearchMode>("files");
  const [selected, setSelected] = useState<ConfigEntry | null>(null);
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [mode, setMode] = useState<EditorMode>(() =>
    readStored<EditorMode>(MODE_KEY, ["text", "form"], "text"),
  );
  const [isGrouped, setIsGrouped] = useState(
    () => readStored(GROUPED_KEY, ["on", "off"], "on") === "on",
  );
  const [view, setView] = useState<ConfigView | null>(null);
  const [isTranslationOn, setIsTranslationOn] = useState(false);
  const [caret, setCaret] = useState(0);
  const [savedAt, setSavedAt] = useState(0);
  const [notice, setNotice] = useState<{ text: string; at: number } | null>(
    null,
  );
  const [pendingConfirm, setPendingConfirm] = useState<
    "reset" | "saveWithIssue" | null
  >(null);

  const editorRef = useRef<ConfigTextEditorHandle>(null);
  const pendingRevealRef = useRef<{
    line: number;
    column: number;
    length: number;
  } | null>(null);

  const isSavedShown = useRecentFlag(savedAt, SAVED_FLASH_MS);
  const isNoticeShown = useRecentFlag(notice?.at ?? 0, NOTICE_MS);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setSelected(null);
    setOriginals({});
    setDrafts({});
    setBackups(emptyBackupIndex());
    setView(null);

    void (async () => {
      const configRoot = api.path.join(versionPath, "config");
      const snapshotRoot = backupsRoot(storage, versionPath);
      if (cancelled) return;
      setBackupRoot(snapshotRoot);

      const [found, index, hasConfigRoot] = await Promise.all([
        collectInstanceConfigs(
          api.fs.readdirWithTypes,
          api.fs.pathExists,
          api.path.join,
          versionPath,
        ),
        loadBackupIndex(storage, snapshotRoot),
        api.fs.pathExists(configRoot),
      ]);

      if (cancelled) return;
      setRoot(hasConfigRoot ? configRoot : versionPath);
      setEntries(found);
      setBackups(index);
    })();

    return () => {
      cancelled = true;
    };
  }, [versionPath]);

  const diskKeys = new Set((entries ?? []).map((entry) => entry.relative));
  const missingEntries: ConfigEntry[] = Object.keys(backups.files)
    .filter((key) => !diskKeys.has(key))
    .map((key) => {
      const top = key.split("/")[0];
      const isOwnRoot = CONFIG_ROOT_FOLDERS.includes(top) && top !== "config";
      return {
        relative: key,
        base: isOwnRoot ? versionPath : api.path.join(versionPath, "config"),
        ...splitConfigPath(key),
      };
    });
  const missingKeys = new Set(missingEntries.map((entry) => entry.relative));
  const allEntries = entries
    ? sortConfigEntries([...entries, ...missingEntries])
    : null;

  const identities = useModIdentities(versionPath, mods);
  const canGroup = !!mods && mods.length > 0;
  const groups =
    allEntries && identities
      ? groupConfigs(allEntries, identities, t("configs.otherGroup"))
      : null;

  const texts = useConfigTexts(
    entries ?? [],
    searchMode === "content" && !!entries,
  );

  const selectedKey = selected?.relative ?? "";
  const isMissing = !!selected && missingKeys.has(selectedKey);
  const content = drafts[selectedKey] ?? originals[selectedKey] ?? "";
  const original = originals[selectedKey] ?? "";
  const language = detectConfigLanguage(selected?.name ?? "");
  const configDocument = selected
    ? parseConfigDocument(content, selected.name)
    : null;
  const issue = configDocument?.issue ?? null;
  const issuePosition = issue ? positionAt(content, issue.offset) : null;
  const canUseForm = !!configDocument && configDocument.fields.length > 0;
  const activeMode: EditorMode =
    mode === "form" && canUseForm ? "form" : "text";

  const dirtyKeys = new Set(
    Object.keys(drafts).filter((key) => drafts[key] !== originals[key]),
  );
  const isDirty = dirtyKeys.has(selectedKey);
  const changeStats = isDirty
    ? diffStats(diffLines(original, content))
    : { added: 0, removed: 0 };

  const tokens = tokenizeConfig(content, language);
  const bodies = commentBodies(tokens);
  const translation = useCommentTranslation(
    bodies,
    isTranslationOn && !!selected && !isReading,
  );
  const isTranslatedView = isTranslationOn && activeMode === "text";
  const displayTokens = isTranslatedView
    ? translateCommentTokens(tokens, translation.translations)
    : undefined;

  const snapshots = sortSnapshots(backups.files[selectedKey] ?? []);
  const historyKeys = new Set(
    Object.keys(backups.files).filter((key) => backups.files[key]?.length),
  );
  const sizeLabels = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];

  const searchTexts = new Map(texts.texts);
  for (const [key, text] of Object.entries(originals))
    searchTexts.set(key, text);
  for (const [key, text] of Object.entries(drafts)) searchTexts.set(key, text);
  const contentResults =
    searchMode === "content"
      ? searchFiles(
          [...searchTexts].map(([relative, text]) => ({ relative, text })),
          query,
        ).sort((a, b) => a.relative.localeCompare(b.relative))
      : [];

  const caretPosition = positionAt(content, caret);

  useEffect(() => {
    return registerNavigationBlocker("instance-configs", () =>
      Object.keys(drafts).some((key) => drafts[key] !== originals[key]),
    );
  }, [drafts, originals]);

  useEffect(() => {
    const pending = pendingRevealRef.current;
    if (!pending || activeMode !== "text" || isReading || isTranslatedView) {
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    pendingRevealRef.current = null;
    editor.revealLine(pending.line, pending.column, pending.length);
  });

  const showNotice = (text: string) => setNotice({ text, at: Date.now() });

  const openEntry = useCallback(
    async (entry: ConfigEntry) => {
      setSelected(entry);
      setView(null);
      setIsHistoryOpen(false);

      if (originals[entry.relative] !== undefined) return true;
      if (missingKeys.has(entry.relative)) return false;

      setIsReading(true);

      try {
        const read = await readConfigText(entryPath(entry));

        if (read.state !== "ok") {
          setSelected(null);
          showFailureToast(t("configs.readFailed"), undefined, {
            channels: ["fs:readFile", "file:getTotalSizes"],
            fallbackDescription: t("configs.readFailedHint"),
          });
          return false;
        }

        if (read.text.length > MAX_CONFIG_BYTES) {
          setSelected(null);
          toast.warning(t("configs.tooLarge"));
          return false;
        }

        setOriginals((prev) => ({ ...prev, [entry.relative]: read.text }));
        return true;
      } catch (error) {
        setSelected(null);
        showFailureToast(t("configs.readFailed"), error, {
          channels: ["fs:readFile"],
        });
        return false;
      } finally {
        setIsReading(false);
      }
    },
    [missingKeys, originals, t],
  );

  const revealLine = (line: number, column = 0, length = 0) => {
    if (isTranslationOn) setIsTranslationOn(false);
    if (activeMode !== "text") {
      setMode("text");
      writeStored(MODE_KEY, "text");
    }
    setView(null);
    pendingRevealRef.current = { line, column, length };
  };

  const openMatch = async (entry: ConfigEntry, match: LineMatch) => {
    const opened = await openEntry(entry);
    if (opened) revealLine(match.line, match.column, match.length);
  };

  const changeMode = (next: EditorMode) => {
    setMode(next);
    writeStored(MODE_KEY, next);
    setView(null);
  };

  const setDraft = (value: string) =>
    setDrafts((prev) => ({ ...prev, [selectedKey]: value }));

  const discard = () => {
    setDrafts((prev) => withoutKey(prev, selectedKey));
    setView(null);
  };

  const save = useCallback(async () => {
    if (!selected) return;

    const key = selected.relative;
    const text = drafts[key];
    if (text === undefined) return;

    setIsSaving(true);
    try {
      const filePath = entryPath(selected);
      const read = await readConfigText(filePath).catch(
        () => ({ state: "failed" }) as ConfigRead,
      );

      if (read.state === "failed") {
        showFailureToast(t("configs.saveFailed"), undefined, {
          channels: ["fs:readFile", "file:getTotalSizes"],
          fallbackDescription: t("configs.backupFailedHint"),
        });
        return;
      }

      const previous = read.state === "ok" ? read.text : null;

      if (previous !== null && previous !== text) {
        const next = await captureSnapshot(
          storage,
          backupRoot,
          backups,
          key,
          previous,
        ).catch(() => null);

        if (!next) {
          showFailureToast(t("configs.saveFailed"), undefined, {
            channels: ["fs:writeFile", "fs:ensure"],
            fallbackDescription: t("configs.backupFailedHint"),
          });
          return;
        }

        setBackups(next);
      }

      if (previous === null) {
        await api.fs.ensure(entryDirectory(selected));
      }

      if (!(await api.fs.writeFile(filePath, text, "utf-8"))) {
        showFailureToast(t("configs.saveFailed"), undefined, {
          channels: ["fs:writeFile"],
          fallbackDescription: t("configs.saveFailedHint"),
        });
        return;
      }

      const wasChangedOnDisk =
        previous !== null &&
        originals[key] !== undefined &&
        previous !== originals[key];

      setOriginals((prev) => ({ ...prev, [key]: text }));
      setDrafts((prev) => withoutKey(prev, key));
      setEntries((prev) =>
        prev && !prev.some((entry) => entry.relative === key)
          ? sortConfigEntries([...prev, selected])
          : prev,
      );
      setView(null);

      if (wasChangedOnDisk) {
        toast.warning(t("configs.saved"), {
          description: t("configs.savedOverExternal"),
          duration: 10000,
        });
        return;
      }

      setSavedAt(Date.now());
    } catch (error) {
      showFailureToast(t("configs.saveFailed"), error, {
        channels: ["fs:writeFile"],
      });
    } finally {
      setIsSaving(false);
    }
  }, [backupRoot, backups, drafts, originals, selected, t]);

  const canSave = isDirty && !isSaving && !disabled;

  const requestSave = () => {
    if (!canSave) return;
    if (issue) setPendingConfirm("saveWithIssue");
    else void save();
  };

  const previewSnapshot = async (snapshot: ConfigSnapshot) => {
    const text = await readSnapshot(storage, backupRoot, selectedKey, snapshot);
    setIsHistoryOpen(false);

    if (text === null) {
      toast.warning(t("configs.backupMissing"));
      return;
    }

    setView({ kind: "snapshot", snapshot, text });
  };

  const applySnapshot = async (text: string) => {
    if (!selected) return;
    setView(null);

    if (!isMissing) {
      setDrafts((prev) => ({ ...prev, [selectedKey]: text }));
      showNotice(t("configs.backupRestored"));
      return;
    }

    const filePath = entryPath(selected);
    await api.fs.ensure(entryDirectory(selected));

    if (!(await api.fs.writeFile(filePath, text, "utf-8"))) {
      showFailureToast(t("configs.saveFailed"), undefined, {
        channels: ["fs:writeFile"],
        fallbackDescription: t("configs.saveFailedHint"),
      });
      return;
    }

    setOriginals((prev) => ({ ...prev, [selectedKey]: text }));
    setDrafts((prev) => withoutKey(prev, selectedKey));
    setEntries((prev) =>
      prev ? sortConfigEntries([...prev, selected]) : prev,
    );
    showNotice(t("configs.restoredFile"));
  };

  const resetToDefault = async () => {
    if (!selected || isMissing) return;

    const key = selected.relative;
    const filePath = entryPath(selected);
    const read = await readConfigText(filePath).catch(
      () => ({ state: "failed" }) as ConfigRead,
    );

    if (read.state === "failed") {
      showFailureToast(t("configs.resetFailed"), undefined, {
        channels: ["fs:readFile"],
        fallbackDescription: t("configs.readFailedHint"),
      });
      return;
    }

    if (read.state === "ok") {
      const next = await captureSnapshot(
        storage,
        backupRoot,
        backups,
        key,
        read.text,
      ).catch(() => null);

      if (!next) {
        showFailureToast(t("configs.resetFailed"), undefined, {
          channels: ["fs:writeFile", "fs:ensure"],
          fallbackDescription: t("configs.backupFailedHint"),
        });
        return;
      }
      setBackups(next);
    }

    if (!(await api.fs.rimraf(filePath))) {
      showFailureToast(t("configs.resetFailed"), undefined, {
        channels: ["fs:rimraf"],
        fallbackDescription: t("configs.resetFailedHint"),
      });
      return;
    }

    setEntries(
      (prev) => prev?.filter((entry) => entry.relative !== key) ?? prev,
    );
    setOriginals((prev) => withoutKey(prev, key));
    setDrafts((prev) => withoutKey(prev, key));
    setView(null);
    if (read.state === "missing") setSelected(null);
    showNotice(t("configs.resetDone"));
  };

  const shortcutRef = useRef<(event: KeyboardEvent) => void>(() => {});
  shortcutRef.current = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
      return;
    }
    if (
      window.document.querySelector(
        "[data-slot=dialog-content],[data-slot=alert-dialog-content]",
      )
    ) {
      return;
    }

    if (event.code === "KeyS" && selected) {
      event.preventDefault();
      requestSave();
    } else if (
      event.code === "KeyF" &&
      selected &&
      !isMissing &&
      activeMode === "text" &&
      !isTranslatedView &&
      !view
    ) {
      event.preventDefault();
      editorRef.current?.openFind();
    }
  };

  useEffect(() => {
    const listener = (event: KeyboardEvent) => shortcutRef.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  if (allEntries === null) {
    return (
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,15rem)_minmax(0,1fr)] gap-3">
        <div className="flex min-h-0 flex-col gap-2 rounded-xl border bg-card p-2">
          <Skeleton className="h-8 w-full shrink-0 rounded-lg" />
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full shrink-0 rounded-lg" />
          ))}
        </div>
        <div className="flex min-h-0 flex-col rounded-xl border bg-card">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
            <Skeleton className="h-3 w-48 rounded" />
            <Skeleton className="ml-auto h-7 w-24 rounded-lg" />
          </div>
          <EditorSkeleton />
        </div>
      </div>
    );
  }

  if (!allEntries.length) {
    return (
      <Empty className="h-full border border-dashed border-border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileCog />
          </EmptyMedia>
          <EmptyTitle>{t("configs.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("configs.emptyHint")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const renderBody = () => {
    if (!selected) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {t("configs.pickFile")}
        </div>
      );
    }

    if (isReading) return <EditorSkeleton />;

    if (view?.kind === "changes") {
      return (
        <ConfigDiffView
          before={original}
          after={content}
          title={t("configs.diff.changesTitle")}
          actions={
            <Button variant="ghost" size="sm" onClick={() => setView(null)}>
              <Undo2 className="size-3.5" />
              {t("configs.diff.back")}
            </Button>
          }
        />
      );
    }

    if (view?.kind === "snapshot") {
      return (
        <ConfigDiffView
          before={isMissing ? "" : content}
          after={view.text}
          title={t("configs.diff.snapshotTitle", {
            date: formatDate(new Date(view.snapshot.time)),
          })}
          actions={
            <>
              <Button variant="ghost" size="sm" onClick={() => setView(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => void applySnapshot(view.text)}
              >
                <History className="size-3.5" />
                {t("configs.diff.apply")}
              </Button>
            </>
          }
        />
      );
    }

    if (isMissing) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-faint">
            <FileX className="size-5" />
          </span>
          <div className="grid max-w-sm gap-1">
            <p className="text-sm font-medium">{t("configs.missing.title")}</p>
            <p className="text-xs leading-5 text-muted-foreground">
              {t("configs.missing.hint")}
            </p>
          </div>
          {snapshots[0] && (
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => void previewSnapshot(snapshots[0])}
            >
              <History className="size-3.5" />
              {t("configs.missing.restore")}
            </Button>
          )}
        </div>
      );
    }

    if (activeMode === "form" && configDocument) {
      return (
        <>
          {issue && issuePosition && (
            <button
              type="button"
              onClick={() =>
                revealLine(issuePosition.line, issuePosition.column, 1)
              }
              className="flex shrink-0 items-center gap-2 border-b border-warning/30 bg-warning/8 px-3 py-1.5 text-left text-[0.7rem] text-warning"
            >
              <TriangleAlert className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                {t("configs.form.partial")}
              </span>
            </button>
          )}
          <ConfigFormView
            document={configDocument}
            text={content}
            disabled={disabled}
            translations={
              isTranslationOn ? translation.translations : new Map()
            }
            onChange={setDraft}
            onReveal={(line) => revealLine(line)}
          />
        </>
      );
    }

    return (
      <>
        {isTranslatedView && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-1 px-3 py-1.5 text-[0.7rem] text-muted-foreground">
            {translation.isTranslating ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-faint" />
            ) : (
              <Languages className="size-3.5 shrink-0 text-faint" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {translation.isTranslating && translation.progress
                ? t("configs.translate.progress", { ...translation.progress })
                : bodies.length === 0
                  ? t("configs.translate.noComments")
                  : translation.hasFailed
                    ? t(
                        translation.translations.size
                          ? "configs.translate.partial"
                          : "configs.translate.failed",
                      )
                    : t("configs.translate.banner")}
            </span>
            {translation.hasFailed && !translation.isTranslating && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[0.7rem]"
                onClick={translation.retry}
              >
                {t("common.retry")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[0.7rem]"
              onClick={() => setIsTranslationOn(false)}
            >
              {t("configs.translate.showOriginal")}
            </Button>
          </div>
        )}
        <ConfigTextEditor
          ref={editorRef}
          content={content}
          language={language}
          disabled={disabled}
          displayTokens={displayTokens}
          issueLine={issuePosition?.line ?? null}
          onChange={setDraft}
          onCaretChange={setCaret}
        />
      </>
    );
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,15rem)_minmax(0,1fr)] gap-3">
      <ConfigFileList
        entries={allEntries}
        groups={groups}
        isGrouped={isGrouped && canGroup}
        canGroup={canGroup}
        selectedKey={selectedKey}
        dirtyKeys={dirtyKeys}
        historyKeys={historyKeys}
        missingKeys={missingKeys}
        query={query}
        searchMode={searchMode}
        content={{
          results: contentResults,
          isLoading: texts.isLoading,
          done: texts.done,
          total: texts.total,
        }}
        onQueryChange={setQuery}
        onSearchModeChange={setSearchMode}
        onToggleGrouped={() =>
          setIsGrouped((value) => {
            writeStored(GROUPED_KEY, value ? "off" : "on");
            return !value;
          })
        }
        onOpen={(entry) => void openEntry(entry)}
        onOpenMatch={(entry, match) => void openMatch(entry, match)}
        onOpenFolder={() => void api.shell.openPath(root)}
      />

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
        {selected && (
          <div className="flex h-11 shrink-0 items-center gap-1.5 border-b px-3">
            <FileCog className="size-3.5 shrink-0 text-faint" />
            <Hint content={selected.relative} variant="text" truncatedOnly>
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {selected.relative}
              </span>
            </Hint>

            {canUseForm && !isMissing && (
              <div
                role="tablist"
                aria-label={t("configs.modeLabel")}
                className="flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5"
              >
                {(["text", "form"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={activeMode === item}
                    onClick={() => changeMode(item)}
                    className="flex h-6 items-center gap-1 rounded-md px-2 text-[0.7rem] text-muted-foreground transition-colors not-aria-selected:hover:text-foreground aria-selected:bg-surface-3 aria-selected:text-foreground"
                  >
                    {item === "text" ? (
                      <AlignLeft className="size-3" />
                    ) : (
                      <ListChecks className="size-3" />
                    )}
                    {t(`configs.mode.${item}`)}
                  </button>
                ))}
              </div>
            )}

            {translation.canTranslate &&
              !isMissing &&
              (bodies.length > 0 || isTranslationOn) && (
                <Hint
                  content={t(
                    isTranslationOn
                      ? "configs.translate.off"
                      : "configs.translate.on",
                  )}
                >
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-pressed={isTranslationOn}
                    aria-label={t(
                      isTranslationOn
                        ? "configs.translate.off"
                        : "configs.translate.on",
                    )}
                    className={cn(
                      "size-7",
                      isTranslationOn ? "text-foreground" : "text-faint",
                    )}
                    onClick={() => setIsTranslationOn((value) => !value)}
                  >
                    {translation.isTranslating ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Languages className="size-3.5" />
                    )}
                  </Button>
                </Hint>
              )}

            {activeMode === "text" && !isMissing && !isTranslatedView && (
              <Hint content={t("configs.findHint")}>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-7 text-faint"
                  aria-label={t("configs.findHint")}
                  disabled={!!view}
                  onClick={() => editorRef.current?.openFind()}
                >
                  <Search className="size-3.5" />
                </Button>
              </Hint>
            )}

            <Popover open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
              <Hint content={t("configs.history")}>
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 bg-transparent px-2 text-faint"
                    disabled={isSaving}
                    aria-label={t("configs.history")}
                  >
                    <History className="size-3.5" />
                    {snapshots.length > 0 && (
                      <span className="font-mono text-[0.65rem] tabular-nums">
                        {snapshots.length}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
              </Hint>
              <PopoverContent align="end" className="w-72 p-1.5">
                {snapshots.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    {t("configs.noBackups")}
                  </p>
                ) : (
                  <>
                    <p className="px-2 pt-1 pb-1.5 text-[0.65rem] tracking-wide text-faint uppercase">
                      {t("configs.backupsTitle")}
                    </p>
                    <ScrollArea className="max-h-64">
                      <div className="flex flex-col gap-0.5 pr-1.5">
                        {snapshots.map((snapshot) => (
                          <button
                            key={snapshot.id}
                            type="button"
                            onClick={() => void previewSnapshot(snapshot)}
                            className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-3"
                          >
                            <span className="grid min-w-0 flex-1">
                              <span className="truncate text-xs">
                                {snapshot.kind === "baseline"
                                  ? t("configs.backupBaseline")
                                  : t("configs.backupPrevious")}
                              </span>
                              <span className="truncate font-mono text-[0.65rem] text-faint">
                                {formatDate(new Date(snapshot.time))}
                              </span>
                            </span>
                            <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-faint">
                              {formatBytes(snapshot.size, sizeLabels, 1)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                    <p className="px-2 pt-1.5 pb-1 text-[0.65rem] leading-4 text-faint">
                      {t("configs.backupsHint")}
                    </p>
                  </>
                )}
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <Hint content={t("common.more")}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="size-7 text-faint"
                    aria-label={t("common.more")}
                  >
                    <Ellipsis className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </Hint>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  disabled={!isDirty}
                  onSelect={() => setView({ kind: "changes" })}
                >
                  <GitCompare />
                  <span>{t("configs.diff.show")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isMissing}
                  onSelect={() =>
                    void api.shell.showItemInFolder(entryPath(selected))
                  }
                >
                  <FolderSearch />
                  <span>{t("configs.showInFolder")}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={isMissing || disabled}
                  onSelect={() => setPendingConfirm("reset")}
                >
                  <RotateCcw />
                  <span>{t("configs.reset.action")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {!isMissing && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  disabled={!isDirty || isSaving}
                  onClick={discard}
                >
                  <Undo2 className="size-3.5" />
                  {t("configs.discard")}
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7"
                  disabled={!canSave}
                  onClick={requestSave}
                >
                  {isSaving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  {t("configs.saveFile")}
                </Button>
              </>
            )}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col">{renderBody()}</div>

        {selected && !isReading && !isMissing && (
          <footer
            role="status"
            className="flex h-7 shrink-0 items-center gap-3 border-t border-border px-3 text-[0.68rem] text-faint"
          >
            {issue && issuePosition ? (
              <button
                type="button"
                onClick={() =>
                  revealLine(issuePosition.line, issuePosition.column, 1)
                }
                className="flex min-w-0 items-center gap-1.5 text-left text-destructive hover:underline"
              >
                <TriangleAlert className="size-3 shrink-0" />
                <span className="min-w-0 truncate">
                  {t("configs.syntax.issue", {
                    line: issuePosition.line + 1,
                    column: issuePosition.column + 1,
                    message: t(`configs.syntax.${issue.code}`, {
                      detail: issue.detail ?? "",
                    }),
                  })}
                </span>
              </button>
            ) : configDocument ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <CircleCheck className="size-3 shrink-0 text-success" />
                <span className="truncate">{t("configs.syntax.ok")}</span>
              </span>
            ) : null}

            <span className="ml-auto flex min-w-0 shrink-0 items-center gap-3">
              {isDirty ? (
                <button
                  type="button"
                  onClick={() => setView({ kind: "changes" })}
                  className="flex items-center gap-1.5 hover:text-foreground"
                >
                  <GitCompare className="size-3" />
                  {t("configs.diff.short")}
                  <span className="font-mono tabular-nums text-success">
                    +{changeStats.added}
                  </span>
                  <span className="font-mono tabular-nums text-destructive">
                    −{changeStats.removed}
                  </span>
                </button>
              ) : isSavedShown ? (
                <span className="flex items-center gap-1.5 text-foreground">
                  <CircleCheck className="size-3 text-success" />
                  {t("configs.saved")}
                </span>
              ) : isNoticeShown && notice ? (
                <span className="max-w-72 truncate text-foreground">
                  {notice.text}
                </span>
              ) : null}

              {activeMode === "text" && !isTranslatedView && (
                <span className="font-mono tabular-nums">
                  {t("configs.position", {
                    line: caretPosition.line + 1,
                    column: caretPosition.column + 1,
                  })}
                </span>
              )}
              <span className="font-mono">
                {configDocument
                  ? FORMAT_LABELS[configDocument.format]
                  : t(`configs.language.${language}`)}
              </span>
            </span>
          </footer>
        )}

        {selected && isMissing && isNoticeShown && notice && (
          <footer
            role="status"
            className="flex h-7 shrink-0 items-center border-t border-border px-3 text-[0.68rem] text-foreground"
          >
            {notice.text}
          </footer>
        )}
      </div>

      {pendingConfirm === "reset" && selected && (
        <Confirmation
          title={t("configs.reset.title", { name: selected.name })}
          content={[{ text: t("configs.reset.hint") }]}
          reversible
          onClose={() => setPendingConfirm(null)}
          buttons={[
            {
              text: t("common.cancel"),
              onClick: () => setPendingConfirm(null),
            },
            {
              text: t("configs.reset.confirm"),
              color: "danger",
              onClick: async () => {
                setPendingConfirm(null);
                await resetToDefault();
              },
            },
          ]}
        />
      )}

      {pendingConfirm === "saveWithIssue" && issue && issuePosition && (
        <Confirmation
          title={t("configs.saveWithIssue.title")}
          content={[
            {
              text: t("configs.syntax.issue", {
                line: issuePosition.line + 1,
                column: issuePosition.column + 1,
                message: t(`configs.syntax.${issue.code}`, {
                  detail: issue.detail ?? "",
                }),
              }),
              color: "warning",
            },
            { text: t("configs.saveWithIssue.hint") },
          ]}
          onClose={() => setPendingConfirm(null)}
          buttons={[
            {
              text: t("configs.saveWithIssue.fix"),
              onClick: () => {
                setPendingConfirm(null);
                revealLine(issuePosition.line, issuePosition.column, 1);
              },
            },
            {
              text: t("configs.saveWithIssue.confirm"),
              color: "warning",
              onClick: async () => {
                setPendingConfirm(null);
                await save();
              },
            },
          ]}
        />
      )}
    </div>
  );
}
