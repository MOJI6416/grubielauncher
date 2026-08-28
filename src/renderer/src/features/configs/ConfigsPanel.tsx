import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  FileCog,
  FolderOpen,
  History,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { showFailureToast } from "@renderer/utilities/failures";
import { registerNavigationBlocker } from "@renderer/navigation/guards";
import { formatDate } from "@renderer/utilities/date";
import { formatBytes } from "@renderer/utilities/file";
import {
  ConfigEntry,
  MAX_CONFIG_BYTES,
  collectInstanceConfigs,
} from "./configFiles";
import {
  TOKEN_CLASS,
  detectConfigLanguage,
  splitTokensAt,
  tokenizeConfig,
} from "./highlight";
import {
  Completion,
  CompletionResult,
  completionPatch,
  completionsFor,
} from "./complete";
import {
  EditPatch,
  applyPatch,
  autoPairPatch,
  newlinePatch,
  pairBackspacePatch,
} from "./editing";
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

const api = window.api;
const LINE_HEIGHT = 20;
const POPUP_WIDTH = 232;
const POPUP_ITEM_HEIGHT = 24;
const POPUP_PADDING = 8;

type ConfigRead =
  | { state: "ok"; text: string }
  | { state: "missing" }
  | { state: "failed" };

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

const KIND_MARK: Record<Completion["kind"], string> = {
  literal: "text-warning",
  key: "text-foreground",
  keyword: "text-primary",
};

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
}: {
  versionPath: string;
  disabled?: boolean;
}) {
  const [entries, setEntries] = useState<ConfigEntry[] | null>(null);
  const [root, setRoot] = useState("");
  const [backupRoot, setBackupRoot] = useState("");
  const [backups, setBackups] = useState<ConfigBackupIndex>(emptyBackupIndex);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ConfigEntry | null>(null);
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [caret, setCaret] = useState(0);
  const [suggestion, setSuggestion] = useState<CompletionResult | null>(null);
  const [activeItem, setActiveItem] = useState(0);
  const [popupAt, setPopupAt] = useState<{ x: number; y: number } | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const highlightRef = useRef<HTMLPreElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const caretMarkRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const pendingSelectionRef = useRef<[number, number] | null>(null);
  const isPatchingRef = useRef(false);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setSelected(null);
    setOriginals({});
    setDrafts({});
    setBackups(emptyBackupIndex());

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

  const openEntry = useCallback(
    async (entry: ConfigEntry) => {
      setSelected(entry);
      setSuggestion(null);

      if (originals[entry.relative] !== undefined) return;

      setIsReading(true);

      try {
        const filePath = api.path.join(entry.base, ...entry.relative.split("/"));
        const read = await readConfigText(filePath);

        if (read.state !== "ok") {
          setSelected(null);
          showFailureToast(t("configs.readFailed"), undefined, {
            channels: ["fs:readFile", "file:getTotalSizes"],
            fallbackDescription: t("configs.readFailedHint"),
          });
          return;
        }

        const text = read.text;

        if (text.length > MAX_CONFIG_BYTES) {
          setSelected(null);
          toast.warning(t("configs.tooLarge"));
          return;
        }

        setOriginals((prev) => ({ ...prev, [entry.relative]: text }));
      } catch (error) {
        setSelected(null);
        showFailureToast(t("configs.readFailed"), error, {
          channels: ["fs:readFile"],
        });
      } finally {
        setIsReading(false);
      }
    },
    [originals, t],
  );

  useEffect(() => {
    return registerNavigationBlocker("instance-configs", () =>
      Object.keys(drafts).some((key) => drafts[key] !== originals[key]),
    );
  }, [drafts, originals]);

  const save = useCallback(async () => {
    if (!selected) return;

    const key = selected.relative;
    const text = drafts[key];
    if (text === undefined) return;

    setIsSaving(true);
    try {
      const filePath = api.path.join(selected.base, ...key.split("/"));
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
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      if (wasChangedOnDisk) {
        toast.warning(t("configs.saved"), {
          description: t("configs.savedOverExternal"),
          duration: 10000,
        });
        return;
      }

      toast.success(t("configs.saved"));
    } catch (error) {
      showFailureToast(t("configs.saveFailed"), error, {
        channels: ["fs:writeFile"],
      });
    } finally {
      setIsSaving(false);
    }
  }, [backupRoot, backups, drafts, originals, selected, t]);

  const selectedKey = selected?.relative ?? "";
  const content = drafts[selectedKey] ?? originals[selectedKey] ?? "";
  const language = detectConfigLanguage(selected?.name ?? "");
  const snapshots = useMemo(
    () => sortSnapshots(backups.files[selectedKey] ?? []),
    [backups, selectedKey],
  );
  const sizeLabels = useMemo(
    () => [
      t("sizes.0"),
      t("sizes.1"),
      t("sizes.2"),
      t("sizes.3"),
      t("sizes.4"),
    ],
    [t],
  );

  const applyEdit = useCallback(
    (patch: EditPatch) => {
      const node = editorRef.current;
      if (!node) return;

      const selectionEnd = patch.selectTo ?? patch.caret;
      isPatchingRef.current = true;

      node.focus();
      node.setSelectionRange(patch.from, patch.to);

      const inserted =
        (patch.insert !== "" || patch.from !== patch.to) &&
        document.execCommand("insertText", false, patch.insert);

      if (inserted) {
        node.setSelectionRange(patch.caret, selectionEnd);
      } else {
        setDrafts((prev) => ({
          ...prev,
          [selectedKey]: applyPatch(content, patch),
        }));
        pendingSelectionRef.current = [patch.caret, selectionEnd];
      }

      isPatchingRef.current = false;
      setCaret(patch.caret);
    },
    [content, selectedKey],
  );

  useLayoutEffect(() => {
    const selection = pendingSelectionRef.current;
    const node = editorRef.current;
    if (!selection || !node) return;

    pendingSelectionRef.current = null;
    node.setSelectionRange(selection[0], selection[1]);
  }, [content]);

  useLayoutEffect(() => {
    if (!suggestion) {
      setPopupAt(null);
      return;
    }

    const mark = caretMarkRef.current;
    const frame = frameRef.current;
    if (!mark || !frame) return;

    const markRect = mark.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const maxX = Math.max(0, frameRect.width - POPUP_WIDTH - 8);

    const height = suggestion.items.length * POPUP_ITEM_HEIGHT + POPUP_PADDING;
    const top = markRect.top - frameRect.top;
    const below = top + LINE_HEIGHT;
    const above = top - height;

    setPopupAt({
      x: Math.min(Math.max(0, markRect.left - frameRect.left), maxX),
      y:
        below + height <= frameRect.height || above < 0
          ? Math.min(below, Math.max(0, frameRect.height - height))
          : above,
    });
  }, [suggestion, content]);

  const accept = useCallback(
    (item: Completion) => {
      if (!suggestion) return;
      setSuggestion(null);
      applyEdit(completionPatch(suggestion, item.label));
    },
    [applyEdit, suggestion],
  );

  const restore = useCallback(
    async (snapshot: ConfigSnapshot) => {
      const text = await readSnapshot(
        storage,
        backupRoot,
        selectedKey,
        snapshot,
      );

      if (text === null) {
        toast.warning(t("configs.backupMissing"));
        return;
      }

      setSuggestion(null);
      setIsHistoryOpen(false);
      setDrafts((prev) => ({ ...prev, [selectedKey]: text }));
      toast.success(t("configs.backupRestored"));
    },
    [backupRoot, selectedKey, t],
  );

  if (entries === null) {
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

  if (!entries.length) {
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

  const filtered = query.trim()
    ? entries.filter((entry) =>
        entry.relative.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : entries;

  const dirtyKeys = Object.keys(drafts).filter(
    (key) => drafts[key] !== originals[key],
  );
  const isDirty = dirtyKeys.includes(selectedKey);
  const tokens = tokenizeConfig(content, language);
  const [beforeCaret, afterCaret] = splitTokensAt(tokens, caret);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const node = event.currentTarget;
    const start = node.selectionStart;
    const end = node.selectionEnd;

    if (suggestion) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActiveItem(
          (prev) =>
            (prev + step + suggestion.items.length) % suggestion.items.length,
        );
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        accept(suggestion.items[activeItem] ?? suggestion.items[0]);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setSuggestion(null);
        return;
      }
    }

    if (disabled) return;

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      applyEdit(newlinePatch(content, start, end));
      return;
    }

    if (event.key === "Backspace") {
      const patch = pairBackspacePatch(content, start, end);
      if (!patch) return;
      event.preventDefault();
      applyEdit(patch);
      return;
    }

    if (
      event.key.length !== 1 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }

    const patch = autoPairPatch(content, start, end, event.key);
    if (!patch) return;

    event.preventDefault();
    setSuggestion(null);
    applyEdit(patch);
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,15rem)_minmax(0,1fr)] gap-3">
      <div className="flex min-h-0 flex-col gap-2 rounded-xl border bg-card p-2">
        <Input
          value={query}
          className="h-8"
          placeholder={t("common.search")}
          onChange={(event) => setQuery(event.target.value)}
        />

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-0.5 pr-2">
            {filtered.length === 0 && (
              <div className="px-2 py-6 text-center">
                <p className="text-xs text-muted-foreground">
                  {t("configs.notFound")}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-7 text-xs text-muted-foreground"
                  onClick={() => setQuery("")}
                >
                  {t("configs.clearSearch")}
                </Button>
              </div>
            )}

            {filtered.map((entry) => (
              <Hint
                key={entry.relative}
                content={entry.relative}
                variant="text"
                side="right"
              >
                <button
                  type="button"
                  aria-current={selected?.relative === entry.relative}
                  onClick={() => void openEntry(entry)}
                  className="flex min-w-0 flex-col rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/40 aria-[current=true]:bg-accent/60"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-xs font-medium">
                      {entry.name}
                    </span>
                    {dirtyKeys.includes(entry.relative) && (
                      <Hint content={t("configs.unsaved")}>
                        <span
                          aria-label={t("configs.unsaved")}
                          className="size-1.5 shrink-0 rounded-full bg-primary"
                        />
                      </Hint>
                    )}
                    {(backups.files[entry.relative]?.length ?? 0) > 0 && (
                      <History
                        className="ml-auto size-3 shrink-0 text-faint"
                        aria-hidden
                      />
                    )}
                  </span>
                  {entry.folder && (
                    <span className="truncate font-mono text-[0.65rem] text-faint">
                      {entry.folder}
                    </span>
                  )}
                </button>
              </Hint>
            ))}
          </div>
        </ScrollArea>

        <Button
          variant="ghost"
          size="sm"
          className="justify-start text-muted-foreground"
          onClick={() => void api.shell.openPath(root)}
        >
          <FolderOpen className="size-3.5" />
          {t("common.openFolder")}
        </Button>
      </div>

      <div className="flex min-h-0 flex-col rounded-xl border bg-card">
        {!selected ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {t("configs.pickFile")}
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
              <FileCog className="size-3.5 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {selected.relative}
              </span>

              <Popover open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={isSaving}>
                    <History className="size-3.5" />
                    {t("configs.restore")}
                    {snapshots.length > 0 && (
                      <span className="font-mono text-[0.65rem] tabular-nums text-faint">
                        {snapshots.length}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
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
                              disabled={disabled}
                              onClick={() => void restore(snapshot)}
                              className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
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
                    </>
                  )}
                </PopoverContent>
              </Popover>

              <Button
                variant="ghost"
                size="sm"
                disabled={!isDirty || isSaving}
                onClick={() => {
                  setSuggestion(null);
                  setDrafts((prev) => {
                    const next = { ...prev };
                    delete next[selectedKey];
                    return next;
                  });
                }}
              >
                <RotateCcw className="size-3.5" />
                {t("common.reset")}
              </Button>

              <Button
                size="sm"
                variant="secondary"
                disabled={!isDirty || isSaving || disabled}
                onClick={() => void save()}
              >
                {isSaving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                {t("configs.saveFile")}
              </Button>
            </div>

            {isReading ? (
              <EditorSkeleton />
            ) : (
              <div ref={frameRef} className="relative min-h-0 flex-1">
                <pre
                  aria-hidden
                  ref={highlightRef}
                  className="pointer-events-none absolute inset-0 overflow-hidden rounded-b-xl p-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words select-none"
                >
                  {beforeCaret.map((token, index) => (
                    <span key={`b${index}`} className={TOKEN_CLASS[token.kind]}>
                      {token.text}
                    </span>
                  ))}
                  <span ref={caretMarkRef} />
                  {afterCaret.map((token, index) => (
                    <span key={`a${index}`} className={TOKEN_CLASS[token.kind]}>
                      {token.text}
                    </span>
                  ))}
                  {"\n"}
                </pre>

                <textarea
                  ref={editorRef}
                  spellCheck={false}
                  value={content}
                  disabled={disabled}
                  onScroll={(event) => {
                    const node = highlightRef.current;
                    if (!node) return;
                    node.scrollTop = event.currentTarget.scrollTop;
                    node.scrollLeft = event.currentTarget.scrollLeft;
                    setSuggestion(null);
                  }}
                  onKeyDown={onKeyDown}
                  onBlur={() => setSuggestion(null)}
                  onSelect={(event) =>
                    setCaret(event.currentTarget.selectionStart)
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    const position =
                      event.target.selectionStart ?? value.length;

                    setDrafts((prev) => ({ ...prev, [selectedKey]: value }));
                    if (isPatchingRef.current) return;

                    setCaret(position);

                    const result = completionsFor(value, position, language);
                    setActiveItem(0);
                    setSuggestion(result.items.length ? result : null);
                  }}
                  className="absolute inset-0 size-full resize-none rounded-b-xl bg-transparent p-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words text-transparent caret-foreground outline-none disabled:opacity-60"
                />

                {suggestion && popupAt && (
                  <div
                    style={{
                      left: popupAt.x,
                      top: popupAt.y,
                      width: POPUP_WIDTH,
                    }}
                    className="absolute z-10 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
                  >
                    {suggestion.items.map((item, index) => (
                      <button
                        key={item.label}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          accept(item);
                        }}
                        onMouseEnter={() => setActiveItem(index)}
                        className={cn(
                          "flex h-6 w-full items-center gap-2 px-2 text-left font-mono text-[0.7rem]",
                          index === activeItem && "bg-surface-3",
                        )}
                      >
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate",
                            KIND_MARK[item.kind],
                          )}
                        >
                          {item.label}
                        </span>
                        <span className="shrink-0 text-[0.6rem] text-faint">
                          {t(`configs.completion.${item.kind}`)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
