import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Megaphone, Pencil, Play, Server } from "lucide-react";
import { FaDiscord } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { SectionCard } from "@renderer/features/instances/SectionCard";
import { copyWithFeedback } from "@renderer/utilities/copyFeedback";
import { formatDay } from "@renderer/utilities/date";
import { showFailureToast } from "@renderer/utilities/failures";
import { countFeature } from "@renderer/features/usage/usage";
import {
  hasChannelContent,
  isUnread,
  newestAnnouncementAt,
  readSeenAt,
  writeSeenAt,
} from "./packChannel";
import { usePackChannel } from "./usePackAuthor";
import { PackChannelDialog } from "./PackChannelDialog";

const api = window.api;

export function PackChannelCard({
  code,
  isAuthor,
  playBlockedReason,
  onPlayServer,
  className,
}: {
  code: string;
  isAuthor: boolean;
  playBlockedReason?: string;
  onPlayServer: (address: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const query = usePackChannel(code, true);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [seenAt] = useState(() => readSeenAt(code));
  const channel = query.data ?? null;
  const newest = newestAnnouncementAt(channel);
  const isNew = !isAuthor && isUnread(newest, seenAt);

  useEffect(() => {
    if (newest) writeSeenAt(code, newest);
  }, [code, newest]);

  if (query.isPending) {
    if (!isAuthor || query.fetchStatus === "idle") return null;
    return (
      <SectionCard
        title={t("packAuthor.channel.title")}
        icon={Megaphone}
        className={cn("shrink-0", className)}
        bodyClassName="flex flex-col gap-2 px-3 py-2.5"
      >
        <Skeleton className="h-4 w-1/2 rounded" />
        <Skeleton className="h-4 w-3/4 rounded" />
      </SectionCard>
    );
  }

  if (!channel) return null;
  const hasContent = hasChannelContent(channel);
  if (!isAuthor && !hasContent) return null;

  const latest = channel.announcements[0];
  const extra = channel.announcements.length - 1;

  const openDialog = () => {
    if (isAuthor) countFeature("feature.packChannel");
    setDialogOpen(true);
  };

  const openDiscord = (url: string) => {
    void api.shell.openExternal(url).catch((error) =>
      showFailureToast(t("packAuthor.errors.openFailed"), error, {
        channels: ["shell:openExternal"],
      }),
    );
  };

  return (
    <>
      <SectionCard
        title={t("packAuthor.channel.title")}
        icon={Megaphone}
        className={cn("shrink-0", className)}
        bodyClassName="flex flex-col gap-2 px-3 py-2"
        action={
          <span className="flex shrink-0 items-center gap-1">
            {isNew && (
              <span className="flex h-5 items-center rounded-md bg-info/12 px-1.5 text-3xs font-medium whitespace-nowrap text-info">
                {t("packAuthor.channel.new")}
              </span>
            )}
            {isAuthor ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={openDialog}
              >
                <Pencil />
                {t("packAuthor.channel.edit")}
              </Button>
            ) : (
              extra > 0 && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={openDialog}
                >
                  {t("packAuthor.channel.all", {
                    count: channel.announcements.length,
                  })}
                </Button>
              )
            )}
          </span>
        }
      >
        {(channel.server || channel.discord) && (
          <div className="flex min-w-0 items-center gap-2">
            {channel.server && (
              <>
                <Server className="size-3.5 shrink-0 text-faint" />
                <Hint content={channel.server} variant="text" truncatedOnly>
                  <span className="min-w-0 truncate font-mono text-xs">
                    {channel.server}
                  </span>
                </Hint>
                <Hint content={t("packAuthor.channel.copyAddress")}>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={t("packAuthor.channel.copyAddress")}
                    onClick={() => void copyWithFeedback(channel.server ?? "")}
                  >
                    <Copy />
                  </Button>
                </Hint>
                <Hint content={playBlockedReason}>
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    disabled={!!playBlockedReason}
                    onClick={() => onPlayServer(channel.server ?? "")}
                  >
                    <Play />
                    {t("packAuthor.channel.play")}
                  </Button>
                </Hint>
              </>
            )}
            <span className="min-w-0 flex-1" />
            {channel.discord && (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => openDiscord(channel.discord ?? "")}
              >
                <FaDiscord />
                {t("packAuthor.channel.openDiscord")}
              </Button>
            )}
          </div>
        )}

        {latest ? (
          <div className="flex min-w-0 items-start gap-2">
            <span className="shrink-0 pt-px text-3xs whitespace-nowrap text-faint tabular-nums">
              {formatDay(new Date(latest.createdAt))}
            </span>
            <Hint content={latest.text} variant="text" truncatedOnly>
              <p className="line-clamp-2 min-w-0 text-xs leading-snug break-words whitespace-pre-line text-muted-foreground">
                {latest.text}
              </p>
            </Hint>
          </div>
        ) : (
          isAuthor &&
          !hasContent && (
            <p className="text-xs leading-snug text-muted-foreground">
              {t("packAuthor.channel.authorEmpty")}
            </p>
          )
        )}
      </SectionCard>

      {isDialogOpen && (
        <PackChannelDialog
          code={code}
          channel={channel}
          isAuthor={isAuthor}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}
