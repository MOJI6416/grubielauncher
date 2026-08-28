import { useTranslation } from "react-i18next";
import { KeyRound, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describeToolSurface } from "./toolCatalog";

export function AgentSetupCard({
  toolNames,
  onStart,
}: {
  toolNames: string[];
  onStart: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-surface-1">
        <div className="space-y-3 px-8 py-6 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary-soft">
            <Sparkles className="size-6 text-primary" />
          </span>
          <h2 className="text-lg font-medium text-foreground">
            {t("agent.setup.title")}
          </h2>
          <p className="mx-auto max-w-md text-sm leading-5 text-muted-foreground">
            {t("agent.setup.description")}
          </p>
          <Button size="lg" onClick={onStart}>
            <KeyRound />
            {t("agent.setup.action")}
          </Button>
          <p className="text-xs text-faint">{t("agent.setup.privacy")}</p>
        </div>

        <div className="border-t border-border bg-surface-2 px-8 py-4">
          <span className="block pb-2 text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
            {t("agent.rail.tools")}
          </span>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {describeToolSurface(toolNames).map((group) => (
              <div key={group.id} className="flex items-baseline gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {t(`agent.rail.groups.${group.id}`)}
                </span>
                <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-faint">
                  {group.entries.length}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
