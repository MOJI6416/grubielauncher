import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Brain,
  Check,
  ChevronRight,
  CircleAlert,
  CircleDot,
  CircleSlash,
  KeyRound,
  Loader2,
  RefreshCw,
  Settings2,
  ShieldAlert,
  SquarePlus,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@renderer/utilities/markdown";
import { answerUser } from "@renderer/agent/pending";
import { TimelineItem, ToolPreview } from "@renderer/agent/types";
import {
  describeArguments,
  permissionActions,
} from "./permissionDetails";
import { hasOpenOverlay } from "./overlayLayer";
import {
  classifyAgentError,
  type AgentErrorRecovery,
} from "./providerErrors";
import {
  groupTimeline,
  planProgress,
  toolGroupStatus,
  type ToolItem,
} from "./timelineGroups";

function StatusGlyph({ status }: { status: ToolItem["status"] }) {
  if (status === "running") {
    return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
  }
  if (status === "ok") return <Check className="size-3.5 text-success" />;

  return <CircleAlert className="size-3.5 text-destructive" />;
}

function ArgumentRows({ input }: { input?: string }) {
  const { t } = useTranslation();
  const summary = useMemo(() => describeArguments(input), [input]);

  if (summary.raw) {
    return (
      <pre className="overflow-x-auto rounded-md bg-surface-1 p-2 text-[0.65rem] whitespace-pre-wrap text-muted-foreground">
        {summary.raw}
      </pre>
    );
  }

  if (summary.rows.length === 0) return null;

  return (
    <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-[0.7rem]">
      {summary.rows.map((row) => (
        <div key={row.key} className="contents">
          <dt className="truncate text-faint">
            {t(`agent.args.${row.key}`, { defaultValue: row.key })}
          </dt>
          <dd className="min-w-0 break-words text-muted-foreground">
            {row.value.kind === "text" && row.value.text}
            {row.value.kind === "list" &&
              [
                row.value.items.join(", "),
                row.value.more > 0
                  ? t("agent.moreItems", { count: row.value.more })
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            {row.value.kind === "count" &&
              t("agent.fieldCount", { count: row.value.count })}
          </dd>
        </div>
      ))}
      {summary.hidden > 0 && (
        <div className="contents">
          <dt />
          <dd className="text-faint">
            {t("agent.moreItems", { count: summary.hidden })}
          </dd>
        </div>
      )}
    </dl>
  );
}

function ToolRow({ item }: { item: ToolItem }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const label = t(item.label.key, {
    ...item.label.params,
    defaultValue: item.name,
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex h-8 w-full items-center gap-2 px-2.5 text-left transition-colors hover:bg-surface-3/60"
      >
        <StatusGlyph status={item.status} />
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {label}
        </span>
        {item.status === "error" && item.error && (
          <span className="max-w-[45%] shrink-0 truncate text-[0.65rem] text-destructive">
            {item.error}
          </span>
        )}
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-faint transition-transform",
            expanded && "rotate-90",
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-border px-2.5 py-2">
          <code className="block font-mono text-[0.65rem] text-faint">
            {item.name}
          </code>
          <ArgumentRows input={item.input} />
          {item.error && (
            <p className="text-[0.7rem] text-destructive">{item.error}</p>
          )}
          {item.output && (
            <pre className="max-h-48 overflow-auto rounded-md bg-surface-1 p-2 text-[0.65rem] whitespace-pre-wrap text-muted-foreground">
              {item.output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function ToolGroup({ items }: { items: ToolItem[] }) {
  const status = toolGroupStatus(items);

  return (
    <div
      className={cn(
        "divide-y divide-border overflow-hidden rounded-lg border bg-surface-2",
        status === "error" ? "border-destructive/30" : "border-border",
      )}
    >
      {items.map((item) => (
        <ToolRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function ReasoningCard({
  item,
}: {
  item: Extract<TimelineItem, { kind: "reasoning" }>;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-dashed border-border">
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 px-2.5 text-left"
        onClick={() => setExpanded((value) => !value)}
      >
        <Brain className="size-3.5 shrink-0 text-faint" />
        <span className="min-w-0 flex-1 truncate text-xs text-faint">
          {item.streaming ? t("agent.thinking") : t("agent.thoughts")}
        </span>
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-faint transition-transform",
            expanded && "rotate-90",
          )}
        />
      </button>
      {expanded && (
        <p className="border-t border-border px-2.5 py-2 text-[0.7rem] whitespace-pre-wrap text-muted-foreground">
          {item.text}
        </p>
      )}
    </div>
  );
}

function PreviewRows({ preview }: { preview: ToolPreview }) {
  const { t } = useTranslation();

  return (
    <div className="rounded-md bg-surface-1 px-2.5 py-2">
      <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-[0.7rem]">
        {preview.rows.map((row) => (
          <div key={row.key} className="contents">
            <dt className="truncate text-faint">
              {t(`agent.preview.${row.key}`, { defaultValue: row.key })}
            </dt>
            <dd className="min-w-0 break-words text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
      {preview.loss && (
        <p className="mt-1.5 text-[0.7rem] leading-snug text-destructive">
          {preview.loss}
        </p>
      )}
    </div>
  );
}

function PermissionCard({
  item,
}: {
  item: Extract<TimelineItem, { kind: "permission" }>;
}) {
  const { t } = useTranslation();
  const label = t(item.label.key, {
    ...item.label.params,
    defaultValue: item.name,
  });
  const destructive = item.risk === "destructive";
  const askTitle = t(`agent.permission.titles.${item.name}`, {
    ...item.label.params,
    defaultValue: label,
  });

  useEffect(() => {
    if (item.decision !== null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (hasOpenOverlay()) return;

      event.preventDefault();
      answerUser(item.id, "deny");
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [item.decision, item.id]);

  if (item.decision) {
    return (
      <div className="flex h-8 items-center gap-2 rounded-lg border border-border px-2.5 text-xs text-faint">
        {item.decision === "stopped" ? (
          <CircleSlash className="size-3.5 shrink-0 text-faint" />
        ) : item.decision === "deny" ? (
          <CircleAlert className="size-3.5 shrink-0 text-destructive" />
        ) : (
          <Check className="size-3.5 shrink-0 text-success" />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0">
          {t(`agent.permission.decided.${item.decision}`)}
        </span>
      </div>
    );
  }

  const actions = permissionActions(item.risk);

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        destructive
          ? "border-destructive/50 bg-surface-2"
          : "border-primary/45 bg-primary-soft",
      )}
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert
          className={cn(
            "mt-0.5 size-4 shrink-0",
            destructive ? "text-destructive" : "text-primary",
          )}
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-medium text-foreground">{askTitle}</p>
          {!item.preview?.loss && (
            <p className="text-[0.7rem] text-muted-foreground">
              {destructive
                ? t("agent.permission.destructiveHint")
                : t("agent.permission.hint")}
            </p>
          )}
          {item.preview && item.preview.rows.length > 0 ? (
            <PreviewRows preview={item.preview} />
          ) : (
            <ArgumentRows input={item.input} />
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
        {actions.includes("deny") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => answerUser(item.id, "deny")}
          >
            {t("agent.permission.deny")}
          </Button>
        )}
        {actions.includes("always") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => answerUser(item.id, "always")}
          >
            {item.scope
              ? t("agent.permission.alwaysScoped", { name: item.scope })
              : t("agent.permission.always")}
          </Button>
        )}
        <Button
          size="sm"
          variant={destructive ? "destructive" : "default"}
          onClick={() => answerUser(item.id, "once")}
        >
          {destructive
            ? t(`agent.permission.actions.${item.name}`, {
                defaultValue: t("agent.permission.allowDestructive"),
              })
            : t("agent.permission.allow")}
        </Button>
      </div>
    </div>
  );
}

function QuestionCard({
  item,
}: {
  item: Extract<TimelineItem, { kind: "question" }>;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string[]>([]);
  const [free, setFree] = useState("");

  if (item.answer !== null) {
    return (
      <div className="rounded-lg border border-border px-3 py-2">
        <p className="text-xs text-muted-foreground">{item.question}</p>
        <p className="mt-1 text-xs font-medium text-foreground">
          {item.answer === "" ? t("agent.question.unanswered") : item.answer}
        </p>
      </div>
    );
  }

  const send = (value: string) => {
    if (value.trim() === "") return;
    answerUser(item.id, value.trim());
  };

  return (
    <div className="rounded-lg border border-primary/45 bg-primary-soft px-3 py-2.5">
      <p className="text-sm font-medium text-foreground">{item.question}</p>

      {item.options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.options.map((option) => (
            <Button
              key={option}
              variant={
                item.multiSelect && picked.includes(option)
                  ? "secondary"
                  : "outline"
              }
              size="sm"
              onClick={() => {
                if (!item.multiSelect) {
                  send(option);
                  return;
                }
                setPicked((current) =>
                  current.includes(option)
                    ? current.filter((value) => value !== option)
                    : [...current, option],
                );
              }}
            >
              {option}
            </Button>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <Input
          value={free}
          placeholder={t("agent.question.freeform")}
          className="h-7 text-xs"
          onChange={(event) => setFree(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") send(free);
          }}
        />
        <Button
          size="sm"
          className="shrink-0"
          onClick={() =>
            send(
              item.multiSelect && picked.length > 0
                ? picked.join(", ")
                : free,
            )
          }
          disabled={picked.length === 0 && free.trim() === ""}
        >
          {t("agent.question.answer")}
        </Button>
      </div>
    </div>
  );
}

function PlanCard({ item }: { item: Extract<TimelineItem, { kind: "plan" }> }) {
  const { t } = useTranslation();
  const progress = planProgress(item.steps);

  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[0.7rem] font-medium text-muted-foreground">
          {t("agent.plan.title")}
        </span>
        <span className="font-mono text-[0.65rem] tabular-nums text-faint">
          {progress.done}/{progress.total}
        </span>
      </div>
      <ul className="space-y-1">
        {item.steps.map((step, index) => (
          <li key={`${index}-${step.title}`} className="flex items-start gap-2">
            {step.status === "done" ? (
              <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
            ) : step.status === "active" ? (
              <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
            ) : (
              <CircleDot className="mt-0.5 size-3.5 shrink-0 text-faint" />
            )}
            <span
              className={cn(
                "text-xs",
                step.status === "done" && "text-faint line-through",
                step.status === "pending" && "text-muted-foreground",
                step.status === "active" && "text-foreground",
              )}
            >
              {step.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StoppedRow() {
  const { t } = useTranslation();

  return (
    <div className="flex h-8 items-center gap-2 rounded-lg border border-border px-2.5 text-xs text-faint">
      <CircleSlash className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{t("agent.stopped")}</span>
    </div>
  );
}

const RECOVERY_ICON: Record<AgentErrorRecovery, typeof RefreshCw> = {
  providers: KeyRound,
  model: Settings2,
  retry: RefreshCw,
  continue: RefreshCw,
  newChat: SquarePlus,
  connectivity: Wifi,
  none: RefreshCw,
};

function ErrorCard({
  item,
  onRecover,
}: {
  item: Extract<TimelineItem, { kind: "error" }>;
  onRecover: (recovery: AgentErrorRecovery) => void;
}) {
  const { t } = useTranslation();
  const report = classifyAgentError({ message: item.message, code: item.code });
  const Icon = RECOVERY_ICON[report.recovery];

  return (
    <div className="rounded-lg border border-destructive/40 bg-surface-2 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {t(report.titleKey)}
          </p>
          <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
            {t(report.hintKey)}
          </p>
          {report.detail && (
            <p className="mt-1.5 rounded-md bg-surface-1 px-2 py-1 font-mono text-[0.65rem] break-words text-faint">
              {report.detail}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        {report.code && (
          <span className="mr-auto font-mono text-[0.65rem] text-faint">
            {report.code}
          </span>
        )}
        {report.recovery !== "none" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRecover(report.recovery)}
          >
            <Icon className="size-3.5" />
            {t(`agent.recovery.${report.recovery}`)}
          </Button>
        )}
      </div>
    </div>
  );
}

const Row = memo(function Row({
  item,
  onRecover,
}: {
  item: TimelineItem;
  onRecover: (recovery: AgentErrorRecovery) => void;
}) {
  switch (item.kind) {
    case "user":
      return (
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-xl rounded-br-sm bg-surface-3 px-3 py-2 text-sm whitespace-pre-wrap text-foreground">
            {item.text}
          </div>
        </div>
      );

    case "assistant":
      return (
        <div className="max-w-full text-sm">
          {item.text === "" && item.streaming ? (
            <Loader2 className="size-4 animate-spin text-faint" />
          ) : (
            <Markdown
              body={item.text}
              fallback={null}
              keepPrevious={item.streaming}
            />
          )}
        </div>
      );

    case "reasoning":
      return <ReasoningCard item={item} />;

    case "permission":
      return <PermissionCard item={item} />;

    case "question":
      return <QuestionCard item={item} />;

    case "plan":
      return <PlanCard item={item} />;

    case "stopped":
      return <StoppedRow />;

    case "error":
      return <ErrorCard item={item} onRecover={onRecover} />;

    case "tool":
      return null;
  }
});

export function AgentTimeline({
  items,
  onRecover,
}: {
  items: TimelineItem[];
  onRecover: (recovery: AgentErrorRecovery) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const blocks = useMemo(() => groupTimeline(items), [items]);

  useEffect(() => {
    const node = containerRef.current;
    const content = contentRef.current;
    if (!node || !content) return;

    const stick = () => {
      if (!pinnedToBottomRef.current) return;
      node.scrollTop = node.scrollHeight;
    };

    stick();

    const observer = new ResizeObserver(stick);
    observer.observe(content);

    return () => observer.disconnect();
  }, [items]);

  return (
    <div
      ref={containerRef}
      onScroll={(event) => {
        const node = event.currentTarget;
        pinnedToBottomRef.current =
          node.scrollHeight - node.scrollTop - node.clientHeight < 48;
      }}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
    >
      <div ref={contentRef} className="space-y-2.5">
        {blocks.map((block, index) => (
          <div
            key={block.id}
            className={
              index === blocks.length - 1
                ? undefined
                : "[contain-intrinsic-block-size:auto_3rem] [content-visibility:auto]"
            }
          >
            {block.kind === "tools" ? (
              <ToolGroup items={block.items} />
            ) : (
              <Row item={block.item} onRecover={onRecover} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
