import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FaDiscord, FaGithub, FaTelegram, FaTwitch } from "react-icons/fa";
import { Check, Link2, Loader2, Settings2, Share2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IUser } from "@/types/IUser";
import {
  DISCORD_CLIENT_ID,
  GITHUB_CLIENT_ID,
  TWITCH_CLIENT_ID,
} from "@/shared/config";

const api = window.api;

type LinkableProvider = "telegram" | "twitch" | "github";

const OAUTH_REDIRECT = encodeURIComponent("http://localhost:53213/callback");
const TELEGRAM_POLL_INTERVAL_MS = 2500;
const TELEGRAM_POLL_ATTEMPTS = 48;

export function ProfileSocials({
  user,
  isOwner,
  accessToken,
}: {
  user: IUser;
  isOwner: boolean;
  accessToken?: string;
}) {
  const { t } = useTranslation();

  const [discordId, setDiscordId] = useState<string | null>(
    user.discordId ?? null,
  );
  const [discordUsername, setDiscordUsername] = useState<string | null>(
    user.discordUsername ?? null,
  );
  const [telegram, setTelegram] = useState(
    user.linkedSocials?.telegram ?? null,
  );
  const [twitch, setTwitch] = useState(user.linkedSocials?.twitch ?? null);
  const [github, setGithub] = useState(user.linkedSocials?.github ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [isManageOpen, setManageOpen] = useState(false);

  const openExternal = (url: string) => {
    void api.shell.openExternal(url).catch(() => undefined);
  };

  const linkDiscord = async () => {
    if (!accessToken) return;
    setBusy("discord");
    try {
      const state = `discord:${crypto.randomUUID()}`;
      const authUrl = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${OAUTH_REDIRECT}&scope=identify+guilds.join&state=${encodeURIComponent(
        state,
      )}`;
      const wait = api.auth.startServer(state);
      await api.shell.openExternal(authUrl);
      const { code } = await wait;
      const result = await api.backend.discordLink(accessToken, code);
      if (!result) throw new Error("link failed");
      setDiscordId(result.discordId);
      setDiscordUsername(result.username || null);
      toast.success(t("socials.discordLinked"));
    } catch {
      toast.error(t("socials.discordLinkFailed"));
    } finally {
      setBusy(null);
    }
  };

  const unlinkDiscord = async () => {
    if (!accessToken) return;
    setBusy("discord");
    try {
      const result = await api.backend.discordUnlink(accessToken);
      if (!result) throw new Error("unlink failed");
      setDiscordId(null);
      setDiscordUsername(null);
      toast.success(t("socials.discordUnlinked"));
    } catch {
      toast.error(t("socials.discordUnlinkFailed"));
    } finally {
      setBusy(null);
    }
  };

  const applyLinked = (
    provider: LinkableProvider,
    linked: { id: string; username?: string | null; login?: string } | null,
  ) => {
    if (provider === "telegram") {
      setTelegram(
        linked ? { id: linked.id, username: linked.username ?? null } : null,
      );
    } else if (provider === "twitch") {
      setTwitch(linked ? { id: linked.id, login: linked.login || "" } : null);
    } else {
      setGithub(linked ? { id: linked.id, login: linked.login || "" } : null);
    }
  };

  const linkTelegram = async () => {
    if (!accessToken) return;
    setBusy("telegram");
    try {
      const start = await api.backend.telegramLinkStart(accessToken);
      if (!start) throw new Error("start failed");
      await api.shell.openExternal(start.botUrl);

      for (let attempt = 0; attempt < TELEGRAM_POLL_ATTEMPTS; attempt++) {
        await new Promise((resolve) =>
          setTimeout(resolve, TELEGRAM_POLL_INTERVAL_MS),
        );
        const fresh = await api.backend.getUser(accessToken, user._id);
        const linked = fresh?.linkedSocials?.telegram;
        if (linked) {
          setTelegram(linked);
          toast.success(t("socials.providerLinked"));
          return;
        }
      }
      throw new Error("link timed out");
    } catch {
      toast.error(t("socials.providerLinkFailed"));
    } finally {
      setBusy(null);
    }
  };

  const linkProvider = async (provider: LinkableProvider) => {
    if (provider === "telegram") return linkTelegram();
    const oauthProvider: "twitch" | "github" = provider;
    if (!accessToken) return;
    setBusy(provider);
    try {
      const state = `${provider}:${crypto.randomUUID()}`;
      const authUrl =
        provider === "twitch"
          ? `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&response_type=code&redirect_uri=${OAUTH_REDIRECT}&state=${encodeURIComponent(
              state,
            )}`
          : `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${OAUTH_REDIRECT}&state=${encodeURIComponent(
              state,
            )}`;

      const wait = api.auth.startServer(state);
      await api.shell.openExternal(authUrl);
      const { code } = await wait;
      const result = await api.backend.socialLink(
        accessToken,
        oauthProvider,
        code,
      );
      if (!result) throw new Error("link failed");
      applyLinked(provider, result.linked);
      toast.success(t("socials.providerLinked"));
    } catch {
      toast.error(t("socials.providerLinkFailed"));
    } finally {
      setBusy(null);
    }
  };

  const unlinkProvider = async (provider: LinkableProvider) => {
    if (!accessToken) return;
    setBusy(provider);
    try {
      const result = await api.backend.socialUnlink(accessToken, provider);
      if (!result) throw new Error("unlink failed");
      applyLinked(provider, null);
      toast.success(t("socials.providerUnlinked"));
    } catch {
      toast.error(t("socials.providerUnlinkFailed"));
    } finally {
      setBusy(null);
    }
  };

  const rows: {
    key: "discord" | LinkableProvider;
    icon: React.ReactNode;
    name: string;
    handle: string | null;
    url: string | null;
    configured: boolean;
    canManage: boolean;
    onLink: () => void;
    onUnlink: () => void;
  }[] = [
    {
      key: "discord",
      icon: <FaDiscord className="size-4 shrink-0 text-muted-foreground" />,
      name: "Discord",
      handle: discordId ? discordUsername || t("socials.linked") : null,
      url: discordId ? `https://discord.com/users/${discordId}` : null,
      configured: Boolean(DISCORD_CLIENT_ID),
      canManage: user.platform !== "discord",
      onLink: linkDiscord,
      onUnlink: unlinkDiscord,
    },
    {
      key: "telegram",
      icon: <FaTelegram className="size-4 shrink-0 text-muted-foreground" />,
      name: "Telegram",
      handle: telegram ? (telegram.username ? `@${telegram.username}` : t("socials.linked")) : null,
      url: telegram?.username ? `https://t.me/${telegram.username}` : null,
      configured: true,
      canManage: true,
      onLink: () => void linkProvider("telegram"),
      onUnlink: () => void unlinkProvider("telegram"),
    },
    {
      key: "twitch",
      icon: <FaTwitch className="size-4 shrink-0 text-muted-foreground" />,
      name: "Twitch",
      handle: twitch?.login ?? null,
      url: twitch?.login ? `https://www.twitch.tv/${twitch.login}` : null,
      configured: Boolean(TWITCH_CLIENT_ID),
      canManage: true,
      onLink: () => void linkProvider("twitch"),
      onUnlink: () => void unlinkProvider("twitch"),
    },
    {
      key: "github",
      icon: <FaGithub className="size-4 shrink-0 text-muted-foreground" />,
      name: "GitHub",
      handle: github?.login ?? null,
      url: github?.login ? `https://github.com/${github.login}` : null,
      configured: Boolean(GITHUB_CLIENT_ID),
      canManage: true,
      onLink: () => void linkProvider("github"),
      onUnlink: () => void unlinkProvider("github"),
    },
  ];

  const linkedRows = rows.filter((row) => row.handle);
  const manageRows = rows.filter((row) => row.configured);

  if (!isOwner && linkedRows.length === 0) return null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <Share2 className="size-4 shrink-0 text-muted-foreground" />
          {t("socials.title")}
          {linkedRows.length > 0 ? (
            <span className="flex min-w-0 items-center gap-1">
              {linkedRows.map((row) => (
                <Tooltip key={row.key}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none"
                      disabled={!row.url}
                      onClick={() => row.url && openExternal(row.url)}
                      aria-label={`${row.name}: ${row.handle}`}
                    >
                      {row.icon}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {row.name} · {row.handle}
                  </TooltipContent>
                </Tooltip>
              ))}
            </span>
          ) : (
            <span className="truncate text-xs text-muted-foreground">
              {t("socials.none")}
            </span>
          )}
        </span>

        {isOwner && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setManageOpen(true)}
          >
            <Settings2 className="size-4" />
            {t("socials.manage")}
          </Button>
        )}
      </div>

      {isOwner && (
        <Dialog open={isManageOpen} onOpenChange={setManageOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Share2 className="size-5" />
                {t("socials.title")}
              </DialogTitle>
              <DialogDescription>
                {t("socials.manageDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-1.5">
              {manageRows.map((row) => {
                const isBusy = busy === row.key;
                const linked = Boolean(row.handle);

                return (
                  <div
                    key={row.key}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      {row.icon}
                      {row.name}
                      {linked &&
                        (row.url ? (
                          <button
                            type="button"
                            className="inline-flex min-w-0 items-center gap-1 truncate text-green-500 hover:underline"
                            onClick={() => openExternal(row.url!)}
                          >
                            <Check className="size-3.5 shrink-0" />
                            <span className="truncate">{row.handle}</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-green-500">
                            <Check className="size-3.5" />
                            {row.handle}
                          </span>
                        ))}
                    </span>

                    {row.canManage &&
                      (linked ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy || !accessToken}
                          onClick={row.onUnlink}
                        >
                          {isBusy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Unlink className="size-4" />
                          )}
                          {t("socials.unlink")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy || !accessToken}
                          onClick={row.onLink}
                        >
                          {isBusy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Link2 className="size-4" />
                          )}
                          {t("socials.link")}
                        </Button>
                      ))}
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
