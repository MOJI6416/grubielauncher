import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Megaphone, Send, Trash2 } from "lucide-react";
import type { IModpackAnnouncement, IModpackChannel } from "@/types/Backend";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Hint } from "@renderer/components/Hint";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { formatDate } from "@renderer/utilities/date";
import { formatNumber } from "@renderer/utilities/numbers";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  ANNOUNCEMENT_MAX_CHARS,
  channelErrorKey,
  sameChannelField,
} from "./packChannel";
import { freshAccessToken, useSetPackChannel } from "./usePackAuthor";

const api = window.api;

type FieldError = { field: "server" | "discord" | "text" | "form"; key: string };

function errorField(code: string): FieldError["field"] {
  if (code === "invalid_server") return "server";
  if (code === "invalid_discord") return "discord";
  if (code === "invalid_text" || code === "announcement_limit") return "text";
  return "form";
}

function AnnouncementList({
  items,
  onRemove,
}: {
  items: IModpackAnnouncement[];
  onRemove?: (item: IModpackAnnouncement) => void;
}) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <Empty className="gap-1 p-3">
        <EmptyDescription className="text-xs text-faint">
          {t("packAuthor.channel.noAnnouncements")}
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-3xs whitespace-nowrap text-faint tabular-nums">
              {formatDate(new Date(item.createdAt))}
            </span>
            <p className="text-xs leading-snug break-words whitespace-pre-wrap">
              {item.text}
            </p>
          </div>
          {onRemove && (
            <Hint content={t("packAuthor.channel.remove")}>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={t("packAuthor.channel.remove")}
                onClick={() => onRemove(item)}
              >
                <Trash2 />
              </Button>
            </Hint>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PackChannelDialog({
  code,
  channel,
  isAuthor,
  onClose,
}: {
  code: string;
  channel: IModpackChannel;
  isAuthor: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const setChannel = useSetPackChannel(code);
  const [server, setServer] = useState(channel.server ?? "");
  const [discord, setDiscord] = useState(channel.discord ?? "");
  const [text, setText] = useState("");
  const [error, setError] = useState<FieldError | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [isPosting, setPosting] = useState(false);
  const [removing, setRemoving] = useState<IModpackAnnouncement | null>(null);

  const isDirty =
    !sameChannelField(server, channel.server) ||
    !sameChannelField(discord, channel.discord);
  const trimmedText = text.trim();

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await api.backend.updateModpackChannel(
        await freshAccessToken(),
        code,
        { server: server.trim() || null, discord: discord.trim() || null },
      );
      if (!result) {
        showFailureToast(t("packAuthor.errors.saveFailed"), undefined, {
          channels: ["backend:updateModpackChannel"],
        });
        return;
      }
      if (!result.ok) {
        setError({ field: errorField(result.code), key: channelErrorKey(result.code) });
        return;
      }
      setChannel(() => result.value);
      setServer(result.value.server ?? "");
      setDiscord(result.value.discord ?? "");
      toast.success(t("packAuthor.channel.saved"));
    } catch (failure) {
      showFailureToast(t("packAuthor.errors.saveFailed"), failure);
    } finally {
      setSaving(false);
    }
  };

  const post = async () => {
    if (!trimmedText) return;
    setPosting(true);
    setError(null);
    try {
      const result = await api.backend.postModpackAnnouncement(
        await freshAccessToken(),
        code,
        trimmedText,
      );
      if (!result) {
        showFailureToast(t("packAuthor.errors.postFailed"), undefined, {
          channels: ["backend:postModpackAnnouncement"],
        });
        return;
      }
      if (!result.ok) {
        setError({ field: errorField(result.code), key: channelErrorKey(result.code) });
        return;
      }
      setChannel((current) => ({
        ...current,
        announcements: [result.value, ...current.announcements].slice(0, 10),
      }));
      setText("");
      toast.success(t("packAuthor.channel.posted"));
    } catch (failure) {
      showFailureToast(t("packAuthor.errors.postFailed"), failure);
    } finally {
      setPosting(false);
    }
  };

  const remove = async (item: IModpackAnnouncement) => {
    try {
      const result = await api.backend.deleteModpackAnnouncement(
        await freshAccessToken(),
        code,
        item.id,
      );
      if (!result) {
        showFailureToast(t("packAuthor.errors.removeFailed"), undefined, {
          channels: ["backend:deleteModpackAnnouncement"],
        });
        return;
      }
      if (!result.ok && result.code !== "http_404") {
        showFailureToast(t("packAuthor.errors.removeFailed"), undefined, {
          fallbackDescription: t(channelErrorKey(result.code)),
        });
        return;
      }
      setChannel((current) => ({
        ...current,
        announcements: current.announcements.filter(
          (announcement) => announcement.id !== item.id,
        ),
      }));
    } catch (failure) {
      showFailureToast(t("packAuthor.errors.removeFailed"), failure);
    } finally {
      setRemoving(null);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="size-5 shrink-0" />
              {t("packAuthor.channel.title")}
            </DialogTitle>
            <DialogDescription>
              {t(
                isAuthor
                  ? "packAuthor.channel.authorHint"
                  : "packAuthor.channel.readerHint",
              )}
            </DialogDescription>
          </DialogHeader>

          {isAuthor && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (isDirty && !isSaving) void save();
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="pack-channel-server">
                    {t("packAuthor.channel.server")}
                  </Label>
                  <Input
                    id="pack-channel-server"
                    value={server}
                    maxLength={255}
                    placeholder="play.example.com"
                    aria-invalid={error?.field === "server" || undefined}
                    onChange={(event) => setServer(event.target.value)}
                  />
                  {error?.field === "server" && (
                    <span className="text-2xs text-destructive">
                      {t(error.key)}
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="pack-channel-discord">
                    {t("packAuthor.channel.discord")}
                  </Label>
                  <Input
                    id="pack-channel-discord"
                    value={discord}
                    maxLength={200}
                    placeholder="discord.gg/…"
                    aria-invalid={error?.field === "discord" || undefined}
                    onChange={(event) => setDiscord(event.target.value)}
                  />
                  {error?.field === "discord" && (
                    <span className="text-2xs text-destructive">
                      {t(error.key)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                {error?.field === "form" && (
                  <span className="min-w-0 flex-1 text-2xs text-destructive">
                    {t(error.key)}
                  </span>
                )}
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  disabled={!isDirty || isSaving}
                >
                  {isSaving && <Loader2 className="animate-spin" />}
                  {t("common.save")}
                </Button>
              </div>
            </form>
          )}

          {isAuthor && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pack-channel-text">
                {t("packAuthor.channel.newAnnouncement")}
              </Label>
              <Textarea
                id="pack-channel-text"
                value={text}
                rows={3}
                maxLength={ANNOUNCEMENT_MAX_CHARS}
                className="max-h-32 resize-none"
                placeholder={t("packAuthor.channel.announcementPlaceholder")}
                aria-invalid={error?.field === "text" || undefined}
                onChange={(event) => setText(event.target.value)}
              />
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-2xs text-destructive">
                  {error?.field === "text" ? t(error.key) : ""}
                </span>
                <span className="shrink-0 text-3xs whitespace-nowrap text-faint tabular-nums">
                  {`${formatNumber(text.length)} / ${formatNumber(ANNOUNCEMENT_MAX_CHARS)}`}
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={!trimmedText || isPosting}
                  onClick={() => void post()}
                >
                  {isPosting ? <Loader2 className="animate-spin" /> : <Send />}
                  {t("packAuthor.channel.post")}
                </Button>
              </div>
            </div>
          )}

          <div className="flex min-h-0 flex-col gap-1.5">
            {isAuthor && (
              <span className="text-2xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {t("packAuthor.channel.announcements")}
              </span>
            )}
            <AnnouncementList
              items={channel.announcements}
              onRemove={isAuthor ? setRemoving : undefined}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {removing && (
        <Confirmation
          title={t("packAuthor.channel.removeTitle")}
          onClose={() => setRemoving(null)}
          content={[{ text: t("packAuthor.channel.removeText") }]}
          buttons={[
            { text: t("common.cancel"), onClick: () => setRemoving(null) },
            {
              text: t("common.delete"),
              color: "danger",
              onClick: () => remove(removing),
            },
          ]}
        />
      )}
    </>
  );
}
