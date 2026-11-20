import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtom, useAtomValue } from "jotai";
import { toast } from "sonner";
import {
  CircleCheck,
  CopyX,
  Gamepad2,
  HelpCircle,
  ListChecks,
  Loader2,
  MessageSquareReply,
  Play,
  RotateCcw,
  SquareSplitHorizontal,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ProjectType, type ILocalProject } from "@/types/ModManager";
import type {
  ModBisectApplyResult,
  ModBisectSession,
  ModIdConflict,
} from "@/types/ModBisect";
import type { Version } from "@renderer/classes/Version";
import type { RunGameParams } from "@renderer/features/launch/types";
import { Hint } from "@renderer/components/Hint";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { SectionCard } from "@renderer/features/instances/SectionCard";
import { instanceKey } from "@renderer/features/instances/selectors";
import { forgetModFiles, listModFiles } from "@renderer/features/mods/modFiles";
import { formatDate } from "@renderer/features/mods/format";
import { countFeature } from "@renderer/features/usage/usage";
import { navigate } from "@renderer/navigation/navigate";
import { consolesMetaAtom } from "@renderer/stores/atoms";
import { showFailureToast } from "@renderer/utilities/failures";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { onRadioKeyDown } from "@renderer/utilities/radioKeys";
import { BisectFileList, type BisectFileItem } from "./BisectFileList";
import { bisectCandidates, fileDependencies, type BisectCandidate } from "./bisectInputs";
import { estimateTotalRuns } from "./bisectPlan";
import {
  answerSession,
  canUndo,
  conflictExtras,
  culpritsOf,
  draftBisectSession,
  lastContradiction,
  pickKeeper,
  runsDone,
  sessionStep,
  undoSession,
  type SessionStep,
} from "./bisectSession";
import {
  beginBisect,
  bisectSetupAtom,
  finishBisect,
  saveBisect,
  useBisectSession,
} from "./bisectStore";

const api = window.api;

interface SetupData {
  candidates: BisectCandidate[];
  dependencies: Record<string, string[]>;
  conflicts: ModIdConflict[];
}

function HowRow({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <li className="flex items-start gap-2.5 px-3.5 py-2 text-xs leading-snug">
      <Icon className="mt-px size-3.5 shrink-0 text-faint" />
      <span className="min-w-0 text-muted-foreground">{text}</span>
    </li>
  );
}

function HowCard() {
  const { t } = useTranslation();
  return (
    <SectionCard
      title={t("bisect.how.title")}
      icon={HelpCircle}
      className="shrink-0"
    >
      <ul className="py-1">
        <HowRow icon={SquareSplitHorizontal} text={t("bisect.how.split")} />
        <HowRow icon={Play} text={t("bisect.how.play")} />
        <HowRow icon={MessageSquareReply} text={t("bisect.how.answer")} />
        <HowRow icon={RotateCcw} text={t("bisect.how.restore")} />
      </ul>
    </SectionCard>
  );
}

function StatLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 font-mono whitespace-nowrap tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function useApplyFeedback() {
  const { t } = useTranslation();
  return (result: ModBisectApplyResult, failTitle: string): boolean => {
    if (!result.ok) {
      showFailureToast(failTitle, undefined, {
        channels: ["bisect:"],
        description: t(`bisect.reason.${result.reason}`),
      });
      return false;
    }
    if (result.failed.length > 0) {
      toast.warning(t("bisect.renameFailed", { count: result.failed.length }), {
        description: t("bisect.renameFailedHint"),
      });
    }
    return true;
  };
}

function useLastRun(versionName: string, isRunning: boolean) {
  const metas = useAtomValue(consolesMetaAtom);
  const [lastRun, setLastRun] = useState<"crash" | "clean" | null>(null);
  const seen = useRef(new Map<number, string>());
  useEffect(() => {
    for (const meta of metas) {
      if (meta.versionName !== versionName) continue;
      const before = seen.current.get(meta.instance);
      if (before === "running" && meta.status !== "running")
        setLastRun(meta.status === "error" ? "crash" : "clean");
      seen.current.set(meta.instance, meta.status);
    }
  }, [metas, versionName]);
  useEffect(() => {
    if (isRunning) setLastRun(null);
  }, [isRunning]);
  return [lastRun, () => setLastRun(null)] as const;
}

function SetupView({
  version,
  mods,
  isRunning,
}: {
  version: Version;
  mods: ILocalProject[];
  isRunning: boolean;
}) {
  const { t } = useTranslation();
  const versionPath = version.versionPath;
  const [request, setRequest] = useAtom(bisectSetupAtom);
  const [data, setData] = useState<SetupData | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [keepers, setKeepers] = useState<Record<string, string>>({});
  const [isStarting, setIsStarting] = useState(false);
  const feedback = useApplyFeedback();

  useEffect(() => {
    let cancelled = false;
    setData(null);
    void (async () => {
      await forgetModFiles(versionPath, ProjectType.MOD);
      const [listing, index, conflicts] = await Promise.all([
        listModFiles(versionPath, ProjectType.MOD),
        api.modManager.localDependencies(versionPath).catch(ignoreFailure),
        api.modManager.modIdConflicts(versionPath).catch(ignoreFailure),
      ]);
      if (cancelled) return;
      const candidates = bisectCandidates(listing, mods);
      setData({
        candidates,
        dependencies: fileDependencies(
          candidates.map((item) => item.file),
          mods,
          index,
        ),
        conflicts: conflicts ?? [],
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [mods, versionPath]);

  useEffect(() => {
    if (!data || !request || request.versionPath !== versionPath) return;
    const files = new Set(data.candidates.map((item) => item.file));
    const byLabel = new Map(
      data.candidates.map((item) => [item.label.toLowerCase(), item.file]),
    );
    const resolve = (value: string) =>
      files.has(value) ? value : byLabel.get(value.toLowerCase());
    if (request.candidates) {
      const only = new Set(
        request.candidates.map(resolve).filter((file): file is string => !!file),
      );
      if (only.size > 0)
        setKept(new Set([...files].filter((file) => !only.has(file))));
    } else if (request.kept) {
      setKept(
        new Set(
          request.kept.map(resolve).filter((file): file is string => !!file),
        ),
      );
    }
    setRequest(null);
  }, [data, request, setRequest, versionPath]);

  const extras = useMemo(
    () => (data ? conflictExtras(data.conflicts, keepers) : []),
    [data, keepers],
  );
  const suspects = data
    ? data.candidates.filter(
        (item) => !kept.has(item.file) && !extras.includes(item.file),
      ).length
    : 0;
  const runs = estimateTotalRuns(suspects) + (extras.length > 0 ? 1 : 0);
  const blocked = isRunning
    ? t("bisect.closeGame")
    : data && suspects === 0
      ? t("bisect.setup.noSuspects")
      : undefined;

  const items = useMemo(
    (): BisectFileItem[] =>
      (data?.candidates ?? []).map((item) => ({
        file: item.file,
        label: item.label,
        iconUrl: item.iconUrl,
        note: extras.includes(item.file) ? t("bisect.list.extra") : undefined,
      })),
    [data, extras, t],
  );

  const start = async () => {
    if (!data || blocked || isStarting) return;
    setIsStarting(true);
    try {
      const draft = draftBisectSession({
        candidates: data.candidates.map((item) => item.file),
        kept: [...kept],
        dependencies: data.dependencies,
        extras,
        labels: Object.fromEntries(
          data.candidates.map((item) => [item.file, item.label]),
        ),
      });
      const result = await beginBisect(versionPath, draft);
      if (feedback(result, t("bisect.failed"))) countFeature("mods.bisectStart");
    } catch (error) {
      showFailureToast(t("bisect.failed"), error, { channels: ["bisect:"] });
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_306px] grid-rows-[minmax(0,1fr)] gap-3">
      <div className="flex min-h-0 flex-col gap-3">
        <div className="surface-lit shrink-0 rounded-xl border border-border bg-card px-3.5 py-3">
          <div className="flex items-center gap-2">
            <SquareSplitHorizontal className="size-4 shrink-0 text-faint" />
            <h2 className="text-sm font-medium">{t("bisect.title")}</h2>
          </div>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {t("bisect.intro")}
          </p>
        </div>

        {data && data.conflicts.length > 0 && (
          <div className="shrink-0 rounded-xl border border-warning/40 bg-surface-2 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <CopyX className="size-4 shrink-0 text-warning" />
              <span className="text-xs font-medium text-foreground">
                {t("bisect.duplicates.title")}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("bisect.duplicates.text")}
            </p>
            <div className="mt-2 flex max-h-28 flex-col gap-1.5 overflow-y-auto">
              {data.conflicts.map((conflict) => {
                const keeper =
                  keepers[conflict.modId] ?? pickKeeper(conflict.files);
                return (
                  <div
                    key={conflict.modId}
                    role="radiogroup"
                    aria-label={conflict.files[0]?.title ?? conflict.modId}
                    className="flex min-w-0 flex-wrap items-center gap-1"
                    onKeyDown={(event) =>
                      onRadioKeyDown(
                        event,
                        conflict.files.map((file) => file.fileName),
                        keeper,
                        (fileName) =>
                          setKeepers((previous) => ({
                            ...previous,
                            [conflict.modId]: fileName,
                          })),
                      )
                    }
                  >
                    <span className="mr-1 text-xs text-foreground">
                      {conflict.files[0]?.title ?? conflict.modId}
                    </span>
                    {conflict.files.map((file) => (
                      <button
                        key={file.fileName}
                        type="button"
                        role="radio"
                        aria-checked={file.fileName === keeper}
                        tabIndex={file.fileName === keeper ? 0 : -1}
                        onClick={() =>
                          setKeepers((previous) => ({
                            ...previous,
                            [conflict.modId]: file.fileName,
                          }))
                        }
                        className={cn(
                          "h-6 rounded-md border px-1.5 font-mono text-2xs transition-colors",
                          file.fileName === keeper
                            ? "border-border bg-surface-3 text-foreground"
                            : "border-transparent text-faint hover:bg-row-hover hover:text-foreground",
                        )}
                      >
                        {file.version || file.fileName}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <BisectFileList
          header={
            <>
              <span className="shrink-0 text-2xs font-semibold tracking-[0.08em] text-faint uppercase">
                {t("bisect.setup.keepTitle")}
              </span>
              <Hint content={t("bisect.setup.keepHint")} variant="text" truncatedOnly>
                <span className="min-w-0 flex-1 truncate text-2xs text-faint">
                  {t("bisect.setup.keepHint")}
                </span>
              </Hint>
            </>
          }
          items={items}
          isLoading={!data}
          emptyText={t("bisect.setup.noMods")}
          checkLabel={t("bisect.setup.keepTitle")}
          isChecked={(file) => kept.has(file)}
          onToggle={(file, checked) =>
            setKept((previous) => {
              const next = new Set(previous);
              if (checked) next.add(file);
              else next.delete(file);
              return next;
            })
          }
        />
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        <HowCard />
        <section className="surface-lit flex shrink-0 flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
          <StatLine label={t("bisect.setup.suspects")} value={suspects} />
          <StatLine label={t("bisect.setup.kept")} value={kept.size} />
          <StatLine label={t("bisect.setup.runs")} value={`≈ ${runs}`} />
          <Button
            type="button"
            variant="secondary"
            className="mt-1.5 h-9"
            disabled={!data || !!blocked || isStarting}
            onClick={() => void start()}
          >
            {isStarting ? <Loader2 className="animate-spin" /> : <ListChecks />}
            {t("bisect.setup.start")}
          </Button>
          {blocked && <p className="text-xs text-faint">{blocked}</p>}
        </section>
      </div>
    </div>
  );
}

function stepItems(
  session: ModBisectSession,
  icons: Map<string, string | null>,
  t: (key: string) => string,
): BisectFileItem[] {
  const on = new Set(session.applied);
  const kept = new Set(session.plan.kept);
  const files = [...session.plan.kept, ...session.plan.order, ...session.extras];
  return files
    .map((file) => ({
      file,
      label: session.labels[file] || file,
      iconUrl: icons.get(file.toLowerCase()) ?? null,
      off: !on.has(file),
      pinned: kept.has(file),
      note: session.extras.includes(file) ? t("bisect.list.extra") : undefined,
    }))
    .sort(
      (a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) ||
        a.file.localeCompare(b.file),
    );
}

function ResultView({
  step,
  session,
  isBusy,
  isRunning,
  onFinish,
  onUndo,
}: {
  step: SessionStep;
  session: ModBisectSession;
  isBusy: boolean;
  isRunning: boolean;
  onFinish: (disable: string[]) => void;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const culprits = culpritsOf(step);
  const names = culprits.map((file) => session.labels[file] || file);
  const kind =
    step.kind === "found" && culprits.length > 1 ? "foundMany" : step.kind;
  const good = step.kind === "found" || step.kind === "duplicatesFound";
  const Icon = good ? CircleCheck : TriangleAlert;
  const blocked = isRunning ? t("bisect.closeGame") : undefined;

  return (
    <div className="surface-lit shrink-0 rounded-xl border border-border bg-card px-3.5 py-3">
      <div className="flex items-center gap-2">
        <Icon
          className={cn("size-4 shrink-0", good ? "text-success" : "text-warning")}
        />
        <h2 className="text-sm font-medium">{t(`bisect.result.${kind}.title`)}</h2>
      </div>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">
        {t(`bisect.result.${kind}.text`, { count: culprits.length })}
      </p>
      {names.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {names.map((name, index) => (
            <li
              key={`${culprits[index]}`}
              className="flex h-6 max-w-full items-center rounded-md border border-border bg-surface-3 px-2 text-xs text-foreground"
            >
              <Hint content={culprits[index]} variant="text">
                <span className="truncate">{name}</span>
              </Hint>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {good && (
          <Button
            type="button"
            variant="secondary"
            disabled={isBusy || !!blocked}
            onClick={() => onFinish(culprits)}
          >
            {t(
              step.kind === "duplicatesFound"
                ? "bisect.result.disableExtras"
                : "bisect.result.disableCulprits",
              { count: culprits.length },
            )}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={isBusy || !!blocked}
          onClick={() => onFinish([])}
        >
          <RotateCcw />
          {t("bisect.restore")}
        </Button>
        {!good && canUndo(session) && (
          <Button
            type="button"
            variant="ghost"
            disabled={isBusy || !!blocked}
            onClick={onUndo}
          >
            <Undo2 />
            {t("bisect.back")}
          </Button>
        )}
        {blocked && <span className="text-xs text-faint">{blocked}</span>}
      </div>
    </div>
  );
}

function SessionView({
  version,
  session,
  mods,
  isRunning,
  runGame,
}: {
  version: Version;
  session: ModBisectSession;
  mods: ILocalProject[];
  isRunning: boolean;
  runGame: (params: RunGameParams) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const versionPath = version.versionPath;
  const [isBusy, setIsBusy] = useState(false);
  const [view, setView] = useState<"off" | "on">("off");
  const [lastRun, clearLastRun] = useLastRun(version.version.name, isRunning);
  const feedback = useApplyFeedback();
  const step = sessionStep(session);
  const contradiction = lastContradiction(session);
  const done = runsDone(session);
  const runsLeft =
    step.kind === "test" ? step.runsLeft : step.kind === "duplicates" ? 1 : 0;
  const finished = step.kind !== "test" && step.kind !== "duplicates";

  const icons = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const mod of mods)
      for (const file of mod.version?.files ?? [])
        map.set(
          String(file.filename ?? "").replace(/\.disabled$/i, "").toLowerCase(),
          mod.iconUrl,
        );
    return map;
  }, [mods]);
  const items = useMemo(
    () => stepItems(session, icons, t),
    [icons, session, t],
  );
  const offItems = items.filter((item) => item.off);
  const onItems = items.filter((item) => !item.off);

  const reapplied = useRef(false);
  useEffect(() => {
    if (reapplied.current || isRunning) return;
    reapplied.current = true;
    void saveBisect(versionPath, session).catch(ignoreFailure);
  }, [isRunning, session, versionPath]);

  const save = async (next: ModBisectSession) => {
    setIsBusy(true);
    try {
      feedback(await saveBisect(versionPath, next), t("bisect.failed"));
      clearLastRun();
    } catch (error) {
      showFailureToast(t("bisect.failed"), error, { channels: ["bisect:"] });
    } finally {
      setIsBusy(false);
    }
  };

  const finish = async (disable: string[]) => {
    setIsBusy(true);
    try {
      const result = await finishBisect(versionPath, disable);
      if (!feedback(result, t("bisect.failed"))) return;
      if (!result.ok || result.failed.length > 0) return;
      toast.success(
        t(disable.length > 0 ? "bisect.finishedDisabled" : "bisect.finished", {
          count: disable.length,
        }),
      );
      navigate({ name: "instance", id: instanceKey(version), tab: "content" });
    } catch (error) {
      showFailureToast(t("bisect.failed"), error, { channels: ["bisect:"] });
    } finally {
      setIsBusy(false);
    }
  };

  const answerBlocked = isRunning ? t("bisect.closeGame") : undefined;
  const total = session.plan.order.length;
  const enabledSuspects =
    step.kind === "test" ? step.enabled.length : session.plan.order.length;
  const progress = done + runsLeft > 0 ? done / (done + runsLeft) : 0;

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_306px] grid-rows-[minmax(0,1fr)] gap-3">
      <div className="flex min-h-0 flex-col gap-3">
        {finished ? (
          <ResultView
            step={step}
            session={session}
            isBusy={isBusy}
            isRunning={isRunning}
            onFinish={(disable) => void finish(disable)}
            onUndo={() => void save(undoSession(session))}
          />
        ) : (
          <div className="surface-lit shrink-0 rounded-xl border border-border bg-card px-3.5 py-3">
            <div className="flex items-center gap-2">
              <SquareSplitHorizontal className="size-4 shrink-0 text-faint" />
              <h2 className="text-sm font-medium">
                {t("bisect.step.run", { number: done + 1 })}
              </h2>
              <span className="ml-auto text-xs whitespace-nowrap text-faint">
                {t("bisect.step.left", { count: runsLeft })}
              </span>
            </div>
            <Progress
              value={Math.round(progress * 100)}
              aria-label={t("bisect.step.left", { count: runsLeft })}
              className="mt-2 h-1"
            />
            <p className="mt-2 text-xs leading-snug text-muted-foreground">
              {step.kind === "duplicates"
                ? t("bisect.step.duplicates", { count: step.extras.length })
                : t("bisect.step.test", {
                    enabled: enabledSuspects,
                    total,
                  })}
            </p>
            {lastRun === "crash" && !isRunning && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-warning">
                <TriangleAlert className="size-3.5 shrink-0" />
                {t("bisect.step.crashed")}
              </p>
            )}
            {contradiction !== null && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-warning">
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                {t("bisect.step.contradiction", { number: contradiction + 1 })}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {isRunning ? (
                <span className="flex h-8 items-center gap-1.5 px-1 text-xs text-success">
                  <Gamepad2 className="size-3.5 shrink-0" />
                  {t("bisect.step.running")}
                </span>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => void runGame({ version, skipUpdate: true })}
                >
                  <Play />
                  {t("bisect.step.launch")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={!!answerBlocked || isBusy}
                onClick={() => void save(answerSession(session, true))}
              >
                {t("bisect.step.yes")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!!answerBlocked || isBusy}
                onClick={() => void save(answerSession(session, false))}
              >
                {t("bisect.step.no")}
              </Button>
              {answerBlocked && (
                <span className="text-xs text-faint">{answerBlocked}</span>
              )}
            </div>
          </div>
        )}

        <BisectFileList
          header={
            <SegmentedControl<"off" | "on">
              value={view}
              ariaLabel={t("bisect.title")}
              onChange={setView}
              options={[
                { value: "off", label: t("bisect.list.off"), count: offItems.length },
                { value: "on", label: t("bisect.list.on"), count: onItems.length },
              ]}
            />
          }
          items={view === "off" ? offItems : onItems}
          emptyText={t(view === "off" ? "bisect.list.noneOff" : "bisect.list.noneOn")}
        />
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        <HowCard />
        <section className="surface-lit flex shrink-0 flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
          <StatLine
            label={t("bisect.session.started")}
            value={formatDate(session.startedAt, i18n.language) ?? "—"}
          />
          <StatLine label={t("bisect.session.answers")} value={done} />
          <StatLine label={t("bisect.setup.suspects")} value={total} />
          <div className="mt-1.5 flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canUndo(session) || isBusy || isRunning}
              onClick={() => void save(undoSession(session))}
            >
              <Undo2 />
              {t("bisect.back")}
            </Button>
            {!finished && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={isBusy || isRunning}
                onClick={() => void finish([])}
              >
                <RotateCcw />
                {t("bisect.exit")}
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function BisectPanel({
  version,
  mods,
  isRunning,
  runGame,
}: {
  version: Version;
  mods: ILocalProject[];
  isRunning: boolean;
  runGame: (params: RunGameParams) => Promise<void>;
}) {
  const session = useBisectSession(version.versionPath);
  if (session === undefined) return null;
  return session ? (
    <SessionView
      version={version}
      session={session}
      mods={mods}
      isRunning={isRunning}
      runGame={runGame}
    />
  ) : (
    <SetupView version={version} mods={mods} isRunning={isRunning} />
  );
}
