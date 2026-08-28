import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { ArrowUpRight, Loader2, Sparkles } from "lucide-react";
import type { ILauncherReleaseNote } from "@/types/LauncherRelease";
import { MilestoneBeam } from "@renderer/components/MilestoneBeam";
import {
  openWhatsNew,
  whatsNewLoadingAtom,
} from "@renderer/features/whatsNew/whatsNewStore";

export function MilestoneNewsCard({
  release,
}: {
  release: ILauncherReleaseNote;
}) {
  const { t } = useTranslation();
  const isLoading = useAtomValue(whatsNewLoadingAtom);

  return (
    <button
      type="button"
      disabled={isLoading}
      onClick={() => void openWhatsNew()}
      className="group relative flex h-15 w-full shrink-0 items-center gap-3 overflow-hidden rounded-xl bg-surface-2 px-3 text-left outline-none transition-colors not-disabled:hover:bg-surface-3 focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      <MilestoneBeam />

      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Sparkles className="size-4" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="flex h-4.5 shrink-0 items-center rounded border border-primary/40 bg-primary-soft px-1.5 text-[0.6rem] font-medium tracking-wide text-foreground uppercase">
            {t("whatsNew.milestone")}
          </span>
          <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-faint">
            v{release.version}
          </span>
          <span className="truncate text-sm leading-5 font-medium">
            {release.title}
          </span>
        </span>

        <span className="truncate text-xs leading-4 text-muted-foreground">
          {release.subtitle || t("news.milestoneHint")}
        </span>
      </span>

      {isLoading ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}
