import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ChevronDown,
  Cpu,
  Plus,
  Save,
  Sparkles,
  SquareTerminal,
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
import { buildMemoryArguments, OPTIMIZED_GC_FLAGS } from "@/shared/jvmDefaults";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { TSettings } from "@/types/Settings";
import { cn } from "@/lib/utils";

function chipClass(severity?: ArgSeverity) {
  return cn(
    "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-xs",
    severity === "error" &&
      "border-destructive/50 bg-destructive/10 text-destructive",
    severity === "warning" && "border-warning/50 bg-warning/10 text-warning",
    !severity && "border-border bg-muted/40 text-foreground",
  );
}

function ArgEditor({
  kind,
  text,
  tokens,
  diagnostics,
  settings,
  canEdit,
  rawMode,
  onTokens,
  onRaw,
  onMove,
}: {
  kind: ArgKind;
  text: string;
  tokens: string[];
  diagnostics: ArgDiagnostic[];
  settings: TSettings;
  canEdit: boolean;
  rawMode: boolean;
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

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid gap-3">
        {kind === "jvm" && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Cpu className="size-3.5 shrink-0" />
            <span>{t("arguments.fromSettings")}</span>
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground/80">
              {memoryLabel}
            </code>
            {settings.optimizedJvm ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="cursor-default gap-1">
                    <Sparkles className="size-3" />
                    {t("arguments.optimizedOn", {
                      n: OPTIMIZED_GC_FLAGS.length,
                    })}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {t("arguments.optimizedHint")}
                </TooltipContent>
              </Tooltip>
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
            className="min-h-28 resize-y font-mono text-xs leading-relaxed"
          />
        ) : (
          <div className="relative">
            <div
              className="flex min-h-24 flex-wrap content-start items-start gap-1.5 rounded-lg border bg-background p-2.5 dark:bg-input/30"
              onClick={() => inputRef.current?.focus()}
            >
              {tokens.length === 0 && !canEdit && (
                <span className="px-1 py-1 text-xs text-muted-foreground">
                  {t("arguments.empty")}
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

                if (!diagnostic) {
                  return <span key={index}>{chip}</span>;
                }

                return (
                  <Tooltip key={index}>
                    <TooltipTrigger asChild>{chip}</TooltipTrigger>
                    <TooltipContent>{diagText(diagnostic)}</TooltipContent>
                  </Tooltip>
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
                      if (dropdownOpen)
                        selectSuggestion(suggestions[highlight]);
                      else commitDraft();
                    } else if (
                      event.key === "ArrowDown" &&
                      suggestions.length
                    ) {
                      event.preventDefault();
                      setHighlight((value) =>
                        Math.min(value + 1, suggestions.length - 1),
                      );
                    } else if (event.key === "ArrowUp" && suggestions.length) {
                      event.preventDefault();
                      setHighlight((value) => Math.max(value - 1, 0));
                    } else if (event.key === "Escape") {
                      setFocused(false);
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
          <div className="grid gap-1.5">
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
                <span className="text-muted-foreground">
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

        <div className="rounded-lg border bg-muted/25">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground"
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
              <code className="block break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
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
      </div>
    </TooltipProvider>
  );
}

export function Arguments({
  onClose,
  runArguments,
  setArguments,
}: {
  onClose: () => void;
  runArguments?: IArguments;
  setArguments: (args: IArguments) => void;
}) {
  const { t } = useTranslation();

  const [jvmText, setJvmText] = useState(runArguments?.jvm || "");
  const [gameText, setGameText] = useState(runArguments?.game || "");
  const [activeTab, setActiveTab] = useState<ArgKind>("jvm");
  const [rawMode, setRawMode] = useState(false);
  const [isDownloadedVersion] = useAtom(isDownloadedVersionAtom);
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom);
  const [settings] = useAtom(settingsAtom);

  const canEdit = !isDownloadedVersion && isOwnerVersion;

  const jvmTokens = useMemo(() => parseArgs(jvmText), [jvmText]);
  const gameTokens = useMemo(() => parseArgs(gameText), [gameText]);

  const jvmDiags = useMemo(
    () => analyzeArgs("jvm", jvmTokens, settings.xmx),
    [jvmTokens, settings.xmx],
  );
  const gameDiags = useMemo(
    () => analyzeArgs("game", gameTokens, settings.xmx),
    [gameTokens, settings.xmx],
  );

  const isChanged = useMemo(() => {
    const baseJvm = (runArguments?.jvm ?? "").trim();
    const baseGame = (runArguments?.game ?? "").trim();
    return jvmText.trim() !== baseJvm || gameText.trim() !== baseGame;
  }, [jvmText, gameText, runArguments]);

  const setTokens = (kind: ArgKind, tokens: string[]) => {
    const next = serializeArgs(tokens);
    if (kind === "jvm") setJvmText(next);
    else setGameText(next);
  };

  const moveToken = (fromKind: ArgKind) => (index: number) => {
    const from = fromKind === "jvm" ? jvmTokens : gameTokens;
    const to = fromKind === "jvm" ? gameTokens : jvmTokens;
    const toKind: ArgKind = fromKind === "jvm" ? "game" : "jvm";
    const token = from[index];
    if (token === undefined) return;
    setTokens(
      fromKind,
      from.filter((_, current) => current !== index),
    );
    setTokens(toKind, [...to, token]);
    setActiveTab(toKind);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="overflow-hidden p-0 sm:max-w-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <SquareTerminal className="size-5" />
            {t("arguments.title")}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {t("arguments.subtitle")}
          </p>
        </DialogHeader>

        <div className="grid gap-4 px-5 pb-5">
          {canEdit && (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertTitle>{t("arguments.alert")}</AlertTitle>
            </Alert>
          )}

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as ArgKind)}
          >
            <div className="flex items-center justify-between gap-2">
              <TabsList>
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

              {canEdit && (
                <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                  {t("arguments.rawMode")}
                  <Switch
                    size="sm"
                    checked={rawMode}
                    onCheckedChange={setRawMode}
                  />
                </Label>
              )}
            </div>

            <TabsContent value="jvm" className="mt-3">
              <ArgEditor
                kind="jvm"
                text={jvmText}
                tokens={jvmTokens}
                diagnostics={jvmDiags}
                settings={settings}
                canEdit={canEdit}
                rawMode={rawMode}
                onTokens={(tokens) => setTokens("jvm", tokens)}
                onRaw={setJvmText}
                onMove={moveToken("jvm")}
              />
            </TabsContent>

            <TabsContent value="game" className="mt-3">
              <ArgEditor
                kind="game"
                text={gameText}
                tokens={gameTokens}
                diagnostics={gameDiags}
                settings={settings}
                canEdit={canEdit}
                rawMode={rawMode}
                onTokens={(tokens) => setTokens("game", tokens)}
                onRaw={setGameText}
                onMove={moveToken("game")}
              />
            </TabsContent>
          </Tabs>
        </div>

        {canEdit && (
          <DialogFooter className="m-0 border-t bg-muted/25 px-5 py-4">
            <Button
              onClick={() => {
                setArguments({
                  jvm: jvmText.trim(),
                  game: gameText.trim(),
                });
              }}
              disabled={!isChanged}
            >
              <Save className="size-4" />
              {t("common.save")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
