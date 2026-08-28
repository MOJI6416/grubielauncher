import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Wrench } from "lucide-react";
import type { ILauncherReleaseNote } from "@/types/LauncherRelease";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapse } from "@/components/ui/collapse";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { MilestoneBeam } from "@renderer/components/MilestoneBeam";
import { useReleaseHistory } from "@renderer/features/whatsNew/useReleaseHistory";
import { formatDay } from "@renderer/utilities/date";
import { SettingsGroup } from "./SettingsPrimitives";

export function ReleaseHistory({ appVersion }: { appVersion: string }) {
  const { t } = useTranslation();
  const { releases, isLoading, isUnavailable } = useReleaseHistory(true);
  const [openVersion, setOpenVersion] = useState("");

  return (
    <SettingsGroup
      title={t("settings.about.historyTitle")}
      hint={t("settings.about.historyHint")}
    >
      {isLoading ? (
        <HistorySkeleton />
      ) : isUnavailable ? (
        <p className="px-3.5 py-3 text-xs text-muted-foreground">
          {t("settings.about.historyUnavailable")}
        </p>
      ) : (
        releases.map((release) => (
          <ReleaseRow
            key={release.version}
            release={release}
            isCurrent={release.version === appVersion}
            isOpen={openVersion === release.version}
            onToggle={() =>
              setOpenVersion((current) =>
                current === release.version ? "" : release.version,
              )
            }
          />
        ))
      )}
    </SettingsGroup>
  );
}

function ReleaseRow({
  release,
  isCurrent,
  isOpen,
  onToggle,
}: {
  release: ILauncherReleaseNote;
  isCurrent: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const published = release.publishedAt ? new Date(release.publishedAt) : null;
  const day = published ? formatDay(published) : "";

  return (
    <div className="relative">
      {release.isMilestone && <MilestoneBeam />}

      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="flex h-11 w-full items-center gap-2.5 px-3.5 text-left outline-none transition-colors hover:bg-surface-3 focus-visible:bg-surface-3"
      >
        <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-foreground">
          {release.version}
        </span>

        {release.isMilestone && (
          <span className="flex h-4.5 shrink-0 items-center rounded border border-primary/40 bg-primary-soft px-1.5 text-[0.6rem] font-medium tracking-wide text-foreground uppercase">
            {t("whatsNew.milestone")}
          </span>
        )}

        {isCurrent && (
          <span className="flex h-4.5 shrink-0 items-center rounded border border-success/40 px-1.5 text-[0.6rem] font-medium tracking-wide text-success uppercase">
            {t("settings.about.historyCurrent")}
          </span>
        )}

        <Hint content={release.subtitle} variant="text" truncatedOnly>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {release.subtitle || release.title}
          </span>
        </Hint>

        {day && (
          <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-faint">
            {day}
          </span>
        )}

        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-faint transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      <Collapse show={isOpen}>
        <div className="grid gap-2.5 px-3.5 pb-3">
          {release.highlights.length > 0 && (
            <section className="grid gap-1">
              <h4 className="text-[0.6rem] font-semibold tracking-[0.09em] text-faint uppercase">
                {t("whatsNew.highlights")}
              </h4>
              <ul className="grid gap-1">
                {release.highlights.map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className="flex gap-2 text-xs leading-4"
                  >
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />
                    <span className="min-w-0 break-words">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {release.fixes.length > 0 && (
            <section className="grid gap-1">
              <h4 className="flex items-center gap-1.5 text-[0.6rem] font-semibold tracking-[0.09em] text-faint uppercase">
                <Wrench className="size-2.5" />
                {t("whatsNew.fixes")}
              </h4>
              <ul className="grid gap-1">
                {release.fixes.map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className="flex gap-2 text-xs leading-4 text-muted-foreground"
                  >
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-faint" />
                    <span className="min-w-0 break-words">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {release.highlights.length === 0 && release.fixes.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t("settings.about.historyNoDetails")}
            </p>
          )}
        </div>
      </Collapse>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div aria-busy className="divide-y divide-border">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex h-11 items-center gap-2.5 px-3.5">
          <Skeleton className="h-3 w-10 shrink-0 rounded" />
          <Skeleton className="h-3 min-w-0 flex-1 rounded" />
          <Skeleton className="h-3 w-14 shrink-0 rounded" />
        </div>
      ))}
    </div>
  );
}
