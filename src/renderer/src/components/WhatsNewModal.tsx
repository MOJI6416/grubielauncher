import { ExternalLink, MessageCircle, Sparkles, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ILauncherReleaseNote } from "@/types/LauncherRelease";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDay } from "@renderer/utilities/date";
import { MilestoneBeam } from "./MilestoneBeam";

const api = window.api;
const DEFAULT_DISCORD_URL = "https://discord.gg/URrKha9hk7";

export function WhatsNewModal({
  release,
  version,
  onClose,
}: {
  release: ILauncherReleaseNote | null;
  version: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const highlights = release?.highlights ?? [];
  const fixes = release?.fixes ?? [];
  const hasReleaseContent = highlights.length > 0 || fixes.length > 0;
  const hasRelease = Boolean(release);
  const discordUrl = release?.discordUrl || DEFAULT_DISCORD_URL;
  const isMilestone = release?.isMilestone === true;

  const publishedAt = release?.publishedAt
    ? new Date(release.publishedAt)
    : null;
  const publishedLabel =
    publishedAt && !Number.isNaN(publishedAt.getTime())
      ? formatDay(publishedAt)
      : "";

  const title = release?.title || t("whatsNew.fallbackTitle", { version });
  const subtitle =
    release?.subtitle ||
    (hasRelease ? t("whatsNew.fallbackSubtitle") : "");

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          "grid max-h-[min(38rem,calc(100vh-4rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-xl",
          isMilestone && "ring-0",
        )}
      >
        {isMilestone && <MilestoneBeam />}

        <DialogHeader className="gap-1.5 border-b border-border px-5 py-4 pr-12">
          <span className="flex min-w-0 items-center gap-2 text-[0.7rem] text-faint">
            <Sparkles className="size-3.5 shrink-0 text-primary" />
            <span className="font-mono tracking-[0.09em] tabular-nums">
              v{version}
            </span>
            {publishedLabel && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate tabular-nums">{publishedLabel}</span>
              </>
            )}
            {isMilestone && (
              <span className="flex h-4.5 shrink-0 items-center rounded border border-primary/40 bg-primary-soft-raised px-1.5 text-[0.6rem] font-medium tracking-wide text-foreground uppercase">
                {t("whatsNew.milestone")}
              </span>
            )}
          </span>

          <DialogTitle className="pr-0 text-lg leading-6">{title}</DialogTitle>

          {subtitle && (
            <p className="text-sm leading-5 text-muted-foreground">
              {subtitle}
            </p>
          )}
        </DialogHeader>

        <div className="relative min-h-0">
          <ScrollArea className="h-full">
            <div className="grid gap-4 px-5 py-4 pb-6">
              {highlights.length > 0 && (
                <section className="grid gap-1.5">
                  <h3 className="text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
                    {t("whatsNew.highlights")}
                  </h3>
                  <ul className="grid gap-1">
                    {highlights.map((item, index) => (
                      <li
                        key={`${item}-${index}`}
                        className="flex gap-2.5 rounded-lg bg-surface-2 px-3 py-2 text-sm leading-5"
                      >
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                        <span className="min-w-0 break-words">{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {fixes.length > 0 && (
                <section className="grid gap-1.5">
                  <h3 className="flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
                    <Wrench className="size-3" />
                    {t("whatsNew.fixes")}
                  </h3>
                  <ul className="grid gap-1 text-xs leading-4 text-muted-foreground">
                    {fixes.map((item, index) => (
                      <li key={`${item}-${index}`} className="flex gap-2">
                        <span className="mt-1.5 size-1 shrink-0 rounded-full bg-faint" />
                        <span className="min-w-0 break-words">{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {!hasReleaseContent && (
                <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs leading-4 text-muted-foreground">
                  {t("whatsNew.offlineDescription")}
                </p>
              )}
            </div>
          </ScrollArea>

          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-popover to-transparent" />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await api.shell.openExternal(discordUrl);
              } catch {}
            }}
          >
            <MessageCircle />
            {release?.discordCta || t("whatsNew.discordCta")}
            <ExternalLink className="size-3" />
          </Button>
          <Button onClick={onClose}>{t("common.ok")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
