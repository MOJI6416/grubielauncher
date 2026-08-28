import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CircleCheck, HelpCircle, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@renderer/components/Hint";
import { ExitCodeInfo } from "./runs";

export type CrashTone = "crash" | "unknown" | "clean";

export function CrashCard({
  tone,
  title,
  hint,
  exit,
  culprits,
  actions,
}: {
  tone: CrashTone;
  title: string;
  hint?: string;
  exit: { code: number | null; info: ExitCodeInfo } | null;
  culprits: string[];
  actions: ReactNode;
}) {
  const { t } = useTranslation();

  const Icon =
    tone === "crash"
      ? TriangleAlert
      : tone === "unknown"
        ? HelpCircle
        : CircleCheck;

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-2 rounded-xl border p-3",
        tone === "crash" && "border-destructive/40 bg-card",
        tone === "unknown" && "border-warning/40 bg-card",
        tone === "clean" && "border-border bg-card",
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            tone === "crash" && "text-destructive",
            tone === "unknown" && "text-warning",
            tone === "clean" && "text-success",
          )}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-sm leading-snug font-medium text-foreground">
            {title}
          </p>

          {hint && (
            <p className="line-clamp-2 text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]">
              {hint}
            </p>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {exit && exit.code !== null && (
            <Hint content={`${t("logs.exitCode")} ${exit.code}`}>
              <Badge
                variant="outline"
                className="shrink-0 gap-1 whitespace-nowrap text-[0.65rem] font-normal text-muted-foreground"
              >
                {t(`logs.exit.${exit.info.verdict}`)}
                <span className="font-mono text-faint">
                  {exit.info.hex ?? exit.code}
                </span>
              </Badge>
            </Hint>
          )}

          {culprits.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">
                {t("crash.culprits")}:
              </span>
              {culprits.map((culprit) => (
                <Badge
                  key={culprit}
                  variant="outline"
                  className="max-w-full min-w-0 border-destructive/40 font-mono text-[0.65rem] font-normal"
                >
                  <Hint content={culprit} variant="text" truncatedOnly>
                    <span className="min-w-0 truncate">{culprit}</span>
                  </Hint>
                </Badge>
              ))}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      </div>
    </div>
  );
}
