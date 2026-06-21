import { CheckCircle2, ExternalLink, MessageCircle, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ILauncherReleaseNote } from "@/types/LauncherRelease";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const hasReleaseContent = Boolean(release);
  const discordUrl = release?.discordUrl || DEFAULT_DISCORD_URL;

  const title =
    release?.title || t("whatsNew.fallbackTitle", { version });
  const subtitle =
    release?.subtitle ||
    t(
      hasReleaseContent
        ? "whatsNew.fallbackSubtitle"
        : "whatsNew.offlineSubtitle",
      { version },
    );

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className="grid max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b bg-muted/20 px-5 py-4 pr-12">
          <div className="flex items-start gap-3 pr-8">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0">
              <Badge variant="secondary" className="mb-2 font-mono">
                v{version}
              </Badge>
              <DialogTitle className="text-xl">{title}</DialogTitle>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                {subtitle}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-5 py-4">
          <div className="grid gap-4">
            {highlights.length > 0 && (
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">
                  {t("whatsNew.highlights")}
                </h3>
                <ul className="grid gap-2">
                  {highlights.map((item, index) => (
                    <li
                      key={`${item}-${index}`}
                      className="flex gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-sm leading-5"
                    >
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className="min-w-0 break-words">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {fixes.length > 0 && (
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">
                  {t("whatsNew.fixes")}
                </h3>
                <ul className="grid gap-1.5 text-sm leading-5 text-muted-foreground">
                  {fixes.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/70" />
                      <span className="min-w-0 break-words">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!hasReleaseContent && (
              <div className="rounded-lg border bg-muted/25 px-3 py-2 text-sm leading-5 text-muted-foreground">
                {t("whatsNew.offlineDescription")}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 flex-row justify-end gap-2 rounded-none rounded-b-xl border-t bg-muted/25 px-5 py-4 sm:gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await api.shell.openExternal(discordUrl);
              } catch {}
            }}
          >
            <MessageCircle className="size-4" />
            {release?.discordCta || t("whatsNew.discordCta")}
            <ExternalLink className="size-3.5" />
          </Button>
          <Button onClick={onClose}>{t("common.ok")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
