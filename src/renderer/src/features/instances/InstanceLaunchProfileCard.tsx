import { useTranslation } from "react-i18next";
import { Copy, SquareTerminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IArguments } from "@/types/IArguments";
import { buildMemoryArguments } from "@/shared/jvmDefaults";
import { parseArgs } from "@renderer/utilities/jvmArguments";
import { SectionCard } from "./SectionCard";

export function InstanceLaunchProfileCard({
  runArguments,
  memoryMb,
  optimizedJvm,
  javaMajorVersion,
  canCopy,
  onCopy,
}: {
  runArguments: IArguments;
  memoryMb: number;
  optimizedJvm: boolean;
  javaMajorVersion?: number;
  canCopy: boolean;
  onCopy: () => void;
}) {
  const { t } = useTranslation();

  return (
    <SectionCard
      title={t("versions.facts.launchProfile")}
      icon={SquareTerminal}
      className="min-h-0 flex-1"
      bodyClassName="flex flex-col gap-2 p-3"
      action={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[0.7rem] text-faint"
          disabled={!canCopy}
          onClick={onCopy}
        >
          <Copy />
          {t("common.copy")}
        </Button>
      }
    >
      <p className="shrink-0 text-xs text-muted-foreground">
        {t("versions.launchProfileHint")}
      </p>

      <div className="flex min-h-0 flex-1 flex-wrap content-start gap-1 overflow-y-auto rounded-lg border border-border bg-surface-1 p-2">
        {buildMemoryArguments(memoryMb, optimizedJvm).map((flag, index) => (
          <span
            key={`inherited-${index}`}
            className="rounded border border-border/60 bg-surface-2 px-1.5 py-0.5 font-mono text-[0.65rem] text-faint"
          >
            {flag}
          </span>
        ))}
        {parseArgs(runArguments.jvm).map((flag, index) => (
          <span
            key={`jvm-${index}`}
            className="rounded border border-primary/35 bg-primary-soft px-1.5 py-0.5 font-mono text-[0.65rem]"
          >
            {flag}
          </span>
        ))}
        {parseArgs(runArguments.game).map((flag, index) => (
          <span
            key={`game-${index}`}
            className="rounded border border-primary/35 bg-primary-soft px-1.5 py-0.5 font-mono text-[0.65rem]"
          >
            {flag}
          </span>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-3 text-[0.7rem] text-faint">
        <span>
          {t("versions.facts.java")}:{" "}
          <span className="font-mono">{javaMajorVersion ?? "—"}</span>
        </span>
        {(runArguments.jvm || runArguments.game) && (
          <span className="ml-auto">{t("versions.launchProfileLegend")}</span>
        )}
      </div>
    </SectionCard>
  );
}
