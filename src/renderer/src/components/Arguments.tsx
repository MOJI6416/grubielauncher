import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ChevronDown,
  Cpu,
  Lock,
  Plus,
  Save,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { IArguments } from "@/types/IArguments";
import { useAtom } from "jotai";
import {
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import {
  ARG_CATALOG,
  ARG_PRESETS,
  analyzeArgs,
  ArgDiagnostic,
  ArgKind,
  ArgSeverity,
  CatalogEntry,
  parseArgs,
  serializeArgs,
} from "@renderer/utilities/jvmArguments";
import {
  hasArgumentChanges,
  moveArgument,
  readArguments,
  summarizeDroppedArguments,
  withArgumentText,
  withArgumentTokens,
} from "@renderer/features/instances/launchArguments";
import { buildMemoryArguments, OPTIMIZED_GC_FLAGS } from "@/shared/jvmDefaults";
import { Button } from "@/components/ui/button";
import { ArgumentsShell } from "./ArgumentsShell";
import { Confirmation } from "./Modals/Confirmation";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Hint } from "./Hint";
import { Label } from "@/components/ui/label";
import { TSettings } from "@/types/Settings";
import { cn } from "@/lib/utils";

function chipClass(severity?: ArgSeverity) {
  return cn(
    "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-xs",
    severity === "error" &&
      "border-destructive/50 bg-destructive/10 text-destructive",
    severity === "warning" && "border-warning/50 bg-warning/10 text-warning",
    !severity && "border-border bg-surface-2 text-foreground",
  );
}

function ArgEditor({
  kind,
  text,
  tokens,
  diagnostics,
  settings,
  isInstanceMemory,
  canEdit,
  rawMode,
  showPreviewBlock,
  escapeHandlers,
  onTokens,
  onRaw,
  onMove,
}: {
  kind: ArgKind;
  text: string;
  tokens: string[];
  diagnostics: ArgDiagnostic[];
  settings: TSettings;
  isInstanceMemory: boolean;
  canEdit: boolean;
  rawMode: boolean;
  showPreviewBlock: boolean;
  escapeHandlers?: Set<() => boolean>;
  onTokens: (tokens: string[]) => void;
  onRaw: (value: string) => void;
  onMove: (index: number) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const presets = useMemo(
    () => ARG_PRESETS.filter((preset) => preset.kind === kind),
    [kind],
  );

  const suggestions = useMemo(() => {
    const query = draft.trim().toLowerCase();
    return ARG_CATALOG.filter(
      (entry) =>
        entry.kind === kind &&
        !tokens.includes(entry.value) &&
        (query === "" || entry.value.toLowerCase().includes(query)),
    ).slice(0, 6);
  }, [draft, kind, tokens]);

  useEffect(() => {
    setHighlight(0);
  }, [draft]);

  const commitDraft = () => {
    const parsed = parseArgs(draft);
    if (parsed.length) onTokens([...tokens, ...parsed]);
    setDraft("");
  };

  const selectSuggestion = (entry: CatalogEntry) => {
    if (entry.takesValue) {
      setDraft(entry.value + " ");
      inputRef.current?.focus();
      return;
    }
    onTokens([...tokens, entry.value]);
    setDraft("");
  };

  const removeAt = (index: number) => {
    onTokens(tokens.filter((_, current) => current !== index));
  };

  const diagText = (diagnostic: ArgDiagnostic) =>
    t(`arguments.diag.${diagnostic.code}`, {
      flag: diagnostic.flag ?? diagnostic.token,
      mb: diagnostic.value,
    });

  const summary = useMemo(() => {
    const seen = new Set<string>();
    return diagnostics.filter((diagnostic) => {
      const key =
        diagnostic.code === "gcConflict"
          ? "gcConflict"
          : `${diagnostic.code}:${diagnostic.flag ?? diagnostic.token}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [diagnostics]);

  const inheritedArgs = buildMemoryArguments(
    settings.xmx,
    settings.optimizedJvm,
  );
  const memoryLabel = settings.optimizedJvm
    ? `-Xms${settings.xmx}M -Xmx${settings.xmx}M`
    : `-Xms1G -Xmx${settings.xmx}M`;
  const previewCommand = (
    kind === "jvm"
      ? `java ${serializeArgs(inheritedArgs)} ${serializeArgs(tokens)} -jar minecraft.jar`
      : `--username … --uuid … ${serializeArgs(tokens)}`
  )
    .replace(/\s+/g, " ")
    .trim();

  const dropdownOpen = canEdit && !rawMode && focused && suggestions.length > 0;

  const dismissEditing = () => {
    if (!dropdownOpen && draft === "") return false;

    setDraft("");
    setFocused(false);
    inputRef.current?.blur();
    return true;
  };

  useEffect(() => {
    if (!escapeHandlers) return;

    escapeHandlers.add(dismissEditing);
    return () => {
      escapeHandlers.delete(dismissEditing);
    };
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      {kind === "jvm" && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Cpu className="size-3.5 shrink-0" />
          <span>
            {t(
              isInstanceMemory
                ? "arguments.fromInstance"
                : "arguments.fromSettings",
            )}
          </span>
          <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-foreground/80">
            {memoryLabel}
          </code>
          {settings.optimizedJvm ? (
            <Hint content={t("arguments.optimizedHint")}>
              <Badge variant="secondary" className="cursor-default gap-1">
                <Sparkles className="size-3" />
                {t("arguments.optimizedOn", {
                  count: OPTIMIZED_GC_FLAGS.length,
                })}
              </Badge>
            </Hint>
          ) : (
            <span>· {t("arguments.optimizedOff")}</span>
          )}
        </div>
      )}

      {canEdit && !rawMode && presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            {t("arguments.presets")}
          </span>
          {presets.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs"
              onClick={() => onTokens([...tokens, ...preset.args])}
            >
              <Plus className="size-3" />
              {t(`arguments.preset.${preset.id}`)}
            </Button>
          ))}
        </div>
      )}

      {rawMode ? (
        <Textarea
          rows={4}
          disabled={!canEdit}
          value={text}
          onChange={(event) => onRaw(event.target.value)}
          spellCheck={false}
          className="min-h-28 flex-1 resize-none font-mono text-xs leading-relaxed"
        />
      ) : (
        <div className="relative min-h-0 flex-1">
          <div
            className="flex h-full min-h-24 flex-wrap content-start items-start gap-1.5 overflow-y-auto rounded-lg border border-border bg-surface-1 p-2.5"
            onClick={() => inputRef.current?.focus()}
          >
            {tokens.length === 0 && !canEdit && (
              <span className="flex size-full flex-col items-center justify-center gap-1 text-center">
                <Lock className="size-4 text-faint" />
                <span className="text-xs text-muted-foreground">
                  {t("arguments.empty")}
                </span>
                <span className="text-[0.7rem] text-faint">
                  {t("arguments.readOnly")}
                </span>
              </span>
            )}

            {tokens.map((token, index) => {
              const diagnostic = diagnostics.find(
                (item) => item.index === index,
              );
              const chip = (
                <span className={chipClass(diagnostic?.severity)}>
                  <span className="max-w-56 truncate">{token}</span>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={t("arguments.diag.remove")}
                      className="opacity-60 transition-opacity hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeAt(index);
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              );

              return (
                <Hint
                  key={index}
                  content={diagnostic ? diagText(diagnostic) : token}
                  variant={diagnostic ? "control" : "text"}
                >
                  {chip}
                </Hint>
              );
            })}

            {canEdit && (
              <input
                ref={inputRef}
                value={draft}
                spellCheck={false}
                placeholder={t("arguments.addPlaceholder")}
                className="h-7 min-w-40 flex-1 bg-transparent px-1 font-mono text-xs outline-none placeholder:text-muted-foreground"
                onChange={(event) => setDraft(event.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (dropdownOpen) selectSuggestion(suggestions[highlight]);
                    else commitDraft();
                  } else if (event.key === "ArrowDown" && suggestions.length) {
                    event.preventDefault();
                    setHighlight((value) =>
                      Math.min(value + 1, suggestions.length - 1),
                    );
                  } else if (event.key === "ArrowUp" && suggestions.length) {
                    event.preventDefault();
                    setHighlight((value) => Math.max(value - 1, 0));
                  } else if (event.key === "Escape") {
                    dismissEditing();
                  } else if (
                    event.key === "Backspace" &&
                    draft === "" &&
                    tokens.length
                  ) {
                    removeAt(tokens.length - 1);
                  }
                }}
              />
            )}

            {canEdit && tokens.length === 0 && (
              <div className="mt-1 flex w-full min-w-0 basis-full flex-col gap-1">
                <span className="text-[0.68rem] text-faint">
                  {t("arguments.catalogTitle")}
                </span>
                <div className="grid min-w-0 gap-0.5">
                  {ARG_CATALOG.filter((entry) => entry.kind === kind)
                    .slice(0, 6)
                    .map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className="flex min-w-0 items-baseline gap-3 rounded px-1 py-0.5 text-left transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        onClick={(event) => {
                          event.stopPropagation();
                          selectSuggestion(entry);
                        }}
                      >
                        <Hint
                          content={entry.value}
                          variant="text"
                          truncatedOnly
                        >
                          <span className="w-60 shrink-0 truncate font-mono text-[0.7rem] text-muted-foreground">
                            {entry.value}
                          </span>
                        </Hint>
                        <span className="min-w-0 flex-1 text-[0.7rem] leading-4 text-faint">
                          {t(`arguments.catalog.${entry.id}`)}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {dropdownOpen && (
            <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover shadow-md">
              {suggestions.map((entry, index) => (
                <button
                  key={entry.id}
                  type="button"
                  className={cn(
                    "flex w-full items-baseline gap-3 px-3 py-1.5 text-left",
                    index === highlight ? "bg-accent" : "hover:bg-accent/60",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => selectSuggestion(entry)}
                >
                  <span className="min-w-44 font-mono text-xs text-foreground">
                    {entry.value}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t(`arguments.catalog.${entry.id}`)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {canEdit && summary.length > 0 && (
        <div className="grid max-h-24 shrink-0 gap-1.5 overflow-y-auto">
          {summary.map((diagnostic) => (
            <div
              key={`${diagnostic.code}-${diagnostic.index}`}
              className="flex items-start gap-2 text-xs"
            >
              {diagnostic.severity === "error" ? (
                <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              ) : (
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
              )}
              <span className="min-w-0 flex-1 text-muted-foreground">
                {diagText(diagnostic)}
              </span>
              {diagnostic.code === "wrongTabGame" ||
              diagnostic.code === "wrongTabJvm" ? (
                <button
                  type="button"
                  className="shrink-0 font-medium text-primary hover:underline"
                  onClick={() => onMove(diagnostic.index)}
                >
                  {t(
                    diagnostic.code === "wrongTabGame"
                      ? "arguments.diag.moveToGame"
                      : "arguments.diag.moveToJvm",
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:underline"
                  onClick={() => removeAt(diagnostic.index)}
                >
                  {t("arguments.diag.remove")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showPreviewBlock && (
        <div className="shrink-0 rounded-lg border border-border bg-surface-1">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-medium text-muted-foreground"
            onClick={() => setShowPreview((value) => !value)}
          >
            <span className="flex items-center gap-1.5">
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  showPreview && "rotate-180",
                )}
              />
              {t("arguments.preview")}
            </span>
          </button>
          {showPreview && (
            <div className="border-t px-3 py-2">
              <code className="block max-h-20 overflow-y-auto break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                {previewCommand}
              </code>
              <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                {t(
                  kind === "jvm"
                    ? "arguments.previewNoteJvm"
                    : "arguments.previewNoteGame",
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Arguments({
  onClose,
  runArguments,
  setArguments,
  embedded = false,
  settings: instanceSettings,
}: {
  onClose: () => void;
  runArguments?: IArguments;
  setArguments: (args: IArguments) => void;
  embedded?: boolean;
  settings?: TSettings;
}) {
  const { t } = useTranslation();

  const [buffer, setBuffer] = useState(() => readArguments(runArguments));
  const [isDiscardOpen, setDiscardOpen] = useState(false);
  const escapeHandlers = useRef(new Set<() => boolean>()).current;
  const [activeTab, setActiveTab] = useState<ArgKind>("jvm");
  const [rawMode, setRawMode] = useState(false);
  const [isDownloadedVersion] = useAtom(isDownloadedVersionAtom);
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom);
  const [globalSettings] = useAtom(settingsAtom);

  const settings = instanceSettings ?? globalSettings;
  const isInstanceMemory =
    settings.xmx !== globalSettings.xmx ||
    settings.optimizedJvm !== globalSettings.optimizedJvm;

  const canEdit = !isDownloadedVersion && isOwnerVersion;

  const value = embedded ? readArguments(runArguments) : buffer;
  const commit = embedded ? setArguments : setBuffer;

  const jvmTokens = useMemo(() => parseArgs(value.jvm), [value.jvm]);
  const gameTokens = useMemo(() => parseArgs(value.game), [value.game]);

  const jvmDiags = useMemo(
    () => analyzeArgs("jvm", jvmTokens, settings.xmx),
    [jvmTokens, settings.xmx],
  );
  const gameDiags = useMemo(
    () => analyzeArgs("game", gameTokens, settings.xmx),
    [gameTokens, settings.xmx],
  );

  const dropped = useMemo(
    () => summarizeDroppedArguments(jvmTokens, gameTokens),
    [jvmTokens, gameTokens],
  );

  const isChanged = useMemo(
    () => hasArgumentChanges(value, runArguments),
    [value, runArguments],
  );

  const setText = (kind: ArgKind, text: string) => {
    commit(withArgumentText(value, kind, text));
  };

  const setTokens = (kind: ArgKind, tokens: string[]) => {
    commit(withArgumentTokens(value, kind, tokens));
  };

  const save = () => {
    setArguments({ jvm: value.jvm.trim(), game: value.game.trim() });
  };

  const requestClose = () => {
    if (embedded || !isChanged || !canEdit) {
      onClose();
      return;
    }
    setDiscardOpen(true);
  };

  const moveToken = (fromKind: ArgKind) => (index: number) => {
    const next = moveArgument(value, fromKind, index);
    if (next === value) return;

    commit(next);
    setActiveTab(fromKind === "jvm" ? "game" : "jvm");
  };

  return (
    <ArgumentsShell
      embedded={embedded}
      title={t("arguments.title")}
      subtitle={t("arguments.subtitle")}
      onClose={requestClose}
      onEscape={() => [...escapeHandlers].some((handler) => handler())}
      headerAction={
        canEdit ? (
          <Label className="flex shrink-0 items-center gap-2 text-[0.7rem] text-faint">
            {t("arguments.rawMode")}
            <Switch size="sm" checked={rawMode} onCheckedChange={setRawMode} />
          </Label>
        ) : undefined
      }
      footer={
        canEdit && !embedded ? (
          <div className="m-0 flex shrink-0 justify-end border-t border-border bg-surface-1 px-4 py-3">
            <Button onClick={save} disabled={!isChanged}>
              <Save className="size-4" />
              {t("common.save")}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2.5",
          embedded ? "p-3" : "px-4 pb-4",
        )}
      >
        {!embedded && canEdit && (
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-warning/40 bg-surface-2 px-2.5 py-2 text-xs text-muted-foreground">
            <TriangleAlert className="size-3.5 shrink-0 text-warning" />
            {t("arguments.alert")}
          </div>
        )}

        {dropped.length > 0 && (
          <div className="flex shrink-0 items-start gap-2 rounded-lg border border-destructive/40 bg-surface-2 px-2.5 py-2">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-medium text-destructive">
                {t("arguments.dropped.title", {
                  count: dropped.reduce(
                    (total, entry) => total + entry.tokens.length,
                    0,
                  ),
                })}
              </span>
              <span className="truncate font-mono text-[0.68rem] text-muted-foreground">
                {dropped
                  .flatMap((entry) => entry.tokens)
                  .slice(0, 6)
                  .join(" ")}
              </span>
              <span className="text-[0.68rem] text-muted-foreground">
                {t("arguments.dropped.hint")}
              </span>
            </div>
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ArgKind)}
          className="flex min-h-0 flex-1 flex-col gap-2.5"
        >
          <TabsList className="shrink-0">
            <TabsTrigger value="jvm">
              {t("arguments.jvm")}
              <Badge variant="secondary" className="px-1.5">
                {jvmTokens.length}
              </Badge>
              {jvmDiags.some((item) => item.severity === "error") && (
                <span className="size-1.5 rounded-full bg-destructive" />
              )}
            </TabsTrigger>
            <TabsTrigger value="game">
              {t("arguments.game")}
              <Badge variant="secondary" className="px-1.5">
                {gameTokens.length}
              </Badge>
              {gameDiags.some((item) => item.severity === "error") && (
                <span className="size-1.5 rounded-full bg-destructive" />
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="jvm"
            className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          >
            <ArgEditor
              kind="jvm"
              text={value.jvm}
              tokens={jvmTokens}
              diagnostics={jvmDiags}
              settings={settings}
              isInstanceMemory={isInstanceMemory}
              canEdit={canEdit}
              rawMode={rawMode}
              showPreviewBlock={!embedded}
              escapeHandlers={escapeHandlers}
              onTokens={(tokens) => setTokens("jvm", tokens)}
              onRaw={(text) => setText("jvm", text)}
              onMove={moveToken("jvm")}
            />
          </TabsContent>

          <TabsContent
            value="game"
            className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          >
            <ArgEditor
              kind="game"
              text={value.game}
              tokens={gameTokens}
              diagnostics={gameDiags}
              settings={settings}
              isInstanceMemory={isInstanceMemory}
              canEdit={canEdit}
              rawMode={rawMode}
              showPreviewBlock={!embedded}
              escapeHandlers={escapeHandlers}
              onTokens={(tokens) => setTokens("game", tokens)}
              onRaw={(text) => setText("game", text)}
              onMove={moveToken("game")}
            />
          </TabsContent>
        </Tabs>
      </div>

      {isDiscardOpen && (
        <Confirmation
          title={t("versions.notSavedTitle")}
          content={[{ text: t("arguments.notSavedHint") }]}
          buttons={[
            {
              text: t("versions.discardChanges"),
              onClick: () => {
                setDiscardOpen(false);
                onClose();
              },
            },
            {
              text: t("common.save"),
              color: "primary",
              onClick: () => {
                save();
                setDiscardOpen(false);
                onClose();
              },
            },
          ]}
          onClose={() => setDiscardOpen(false)}
        />
      )}
    </ArgumentsShell>
  );
}
