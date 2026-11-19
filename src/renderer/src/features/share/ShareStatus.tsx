import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Hint } from "@renderer/components/Hint";
import { cn } from "@/lib/utils";
import type { ShareStep, ShareStepId, ShareTone } from "./shareModel";

const TONE_DOT: Record<ShareTone, string> = {
  muted: "bg-faint",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

const TONE_TEXT: Record<ShareTone, string> = {
  muted: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

function stepLabel(
  id: ShareStepId,
  t: (key: string) => string,
  isServer: boolean,
) {
  switch (id) {
    case "world":
      return isServer
        ? t("share.panel.steps.server")
        : t("share.panel.steps.world");
    case "session":
      return t("share.panel.steps.session");
    case "channel":
      return t("share.panel.steps.channel");
    default:
      return t("share.panel.steps.open");
  }
}

function dotClass(step: ShareStep) {
  switch (step.status) {
    case "done":
      return "bg-success";
    case "active":
      return "bg-warning";
    case "failed":
      return "bg-destructive";
    default:
      return "bg-border";
  }
}

function lineClass(step: ShareStep | undefined) {
  if (!step) return "bg-transparent";
  return step.status === "done" ? "bg-success/50" : "bg-border";
}

export function ShareSteps({
  steps,
  isServer = false,
}: {
  steps: ShareStep[];
  isServer?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start" aria-hidden>
      {steps.map((step, index) => (
        <div
          key={step.id}
          className="flex min-w-0 flex-1 flex-col items-center gap-1"
        >
          <div className="flex h-3 w-full items-center">
            <span
              className={cn(
                "h-px flex-1",
                index === 0 ? "bg-transparent" : lineClass(steps[index - 1]),
              )}
            />
            <span
              className={cn(
                "size-2 shrink-0 rounded-full transition-colors",
                dotClass(step),
                step.status === "active" &&
                  "ring-3 ring-warning/25 motion-safe:animate-pulse",
              )}
            />
            <span
              className={cn(
                "h-px flex-1",
                index === steps.length - 1 ? "bg-transparent" : lineClass(step),
              )}
            />
          </div>
          <Hint content={stepLabel(step.id, t, isServer)} variant="text" truncatedOnly>
            <span
              className={cn(
                "min-w-0 truncate text-3xs leading-none",
                step.status === "pending" ? "text-faint" : "text-muted-foreground",
              )}
            >
              {stepLabel(step.id, t, isServer)}
            </span>
          </Hint>
        </div>
      ))}
    </div>
  );
}

export function ShareStatus({
  tone,
  title,
  description,
  steps,
  isBusy,
  meta,
  isServer = false,
}: {
  tone: ShareTone;
  title: string;
  description: string;
  steps: ShareStep[];
  isBusy: boolean;
  meta?: string;
  isServer?: boolean;
}) {
  return (
    <div className="grid gap-2.5 px-4 pt-3 pb-3.5">
      <div className="flex min-w-0 items-center gap-2">
        {isBusy ? (
          <Loader2 className={cn("size-3.5 shrink-0 animate-spin", TONE_TEXT[tone])} />
        ) : (
          <span className={cn("size-2 shrink-0 rounded-full", TONE_DOT[tone])} />
        )}
        <Hint content={title} variant="text" truncatedOnly>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {title}
          </span>
        </Hint>
        {meta && (
          <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
            {meta}
          </span>
        )}
      </div>

      <p className="line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">
        {description}
      </p>

      <ShareSteps steps={steps} isServer={isServer} />
    </div>
  );
}
