import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import { FaDiscord, FaTelegram } from "react-icons/fa";
import {
  BadgeCheck,
  BellOff,
  ExternalLink,
  Link2,
  Loader2,
  Lock,
  Plug,
  Settings2,
  TriangleAlert,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { INotificationPrefs, IUser } from "@/types/IUser";
import { networkAtom } from "@renderer/stores/atoms";
import {
  describeFailure,
  showFailureToast,
} from "@renderer/utilities/failures";
import { DISCORD_CLIENT_ID } from "@/shared/config";
import {
  connectionsSummary,
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_EVENTS,
  type ConnectionsSummary,
  type NotificationEvent,
} from "./notificationPrefs";

const api = window.api;

type ProviderKey = "discord" | "telegram";

const OAUTH_REDIRECT = encodeURIComponent("http://localhost:53213/callback");
const OAUTH_WINDOW_MS = 10 * 60 * 1000;
const TELEGRAM_POLL_INTERVAL_MS = 2500;
const TELEGRAM_POLL_ATTEMPTS = 48;

interface PendingLink {
  key: ProviderKey;
  url: string;
  deadline: number;
}

interface RowError {
  key: ProviderKey;
  text: string;
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function ProfileConnections({
  user,
  isOwner,
  accessToken,
}: {
  user: IUser;
  isOwner: boolean;
  accessToken?: string;
}) {
  const { t } = useTranslation();
  const isBackendOnline = useAtomValue(networkAtom);

  const [discordId, setDiscordId] = useState<string | null>(
    user.discordId ?? null,
  );
  const [discordUsername, setDiscordUsername] = useState<string | null>(
    user.discordUsername ?? null,
  );
  const [telegram, setTelegram] = useState(
    user.linkedSocials?.telegram ?? null,
  );
  const [prefs, setPrefs] = useState<INotificationPrefs>(
    user.notifications ?? DEFAULT_NOTIFICATION_PREFS,
  );
  const [savingPref, setSavingPref] = useState<keyof INotificationPrefs | null>(
    null,
  );

  const [unlinking, setUnlinking] = useState<ProviderKey | null>(null);
  const [pending, setPending] = useState<PendingLink | null>(null);
  const [error, setError] = useState<RowError | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isManageOpen, setManageOpen] = useState(false);

  const isMountedRef = useRef(true);
  const attemptRef = useRef(0);
  const savingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;

    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  const openExternal = useCallback((url: string) => {
    void api.shell.openExternal(url).catch(() => undefined);
  }, []);

  const isCurrent = (attempt: number) =>
    isMountedRef.current && attemptRef.current === attempt;

  const failRow = (
    key: ProviderKey,
    title: string,
    cause: unknown,
    channels: string[],
    fallback?: string,
  ) => {
    const info = showFailureToast(title, cause, {
      channels,
      fallbackDescription: fallback,
    });
    const described = info ? describeFailure(info) : null;
    const text = described
      ? [described.reason, described.hint].filter(Boolean).join(" ")
      : "";
    setError({ key, text: text || fallback || title });
  };

  const cancelPending = useCallback(() => {
    attemptRef.current += 1;
    setPending(null);
    void api.auth.stopServer().catch(() => undefined);
  }, []);

  const runDiscordLink = async () => {
    if (!accessToken) return;

    const attempt = ++attemptRef.current;
    setError(null);

    const state = `discord:${crypto.randomUUID()}`;
    const authUrl = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=${OAUTH_REDIRECT}&scope=identify+guilds.join&state=${encodeURIComponent(state)}`;

    setPending({
      key: "discord",
      url: authUrl,
      deadline: Date.now() + OAUTH_WINDOW_MS,
    });

    try {
      const wait = api.auth.startServer(state);
      openExternal(authUrl);
      const { code } = await wait;
      if (!isCurrent(attempt)) return;

      const result = await api.backend.discordLink(accessToken, code);
      if (!isCurrent(attempt)) return;
      if (!result) throw new Error("link failed");

      setDiscordId(result.discordId);
      setDiscordUsername(result.username || null);
      toast.success(t("connections.discordLinked"));
    } catch (cause) {
      if (!isCurrent(attempt)) return;

      failRow(
        "discord",
        t("connections.discordLinkFailed"),
        cause,
        ["backend:discordLink", "service:auth"],
        t("connections.linkNotConfirmed"),
      );
    } finally {
      if (isCurrent(attempt)) setPending(null);
    }
  };

  const runTelegramLink = async () => {
    if (!accessToken) return;

    const attempt = ++attemptRef.current;
    setError(null);
    setPending({ key: "telegram", url: "", deadline: 0 });

    try {
      const start = await api.backend.telegramLinkStart(accessToken);
      if (!isCurrent(attempt)) return;
      if (!start) throw new Error("start failed");

      const expiresAt = Date.parse(start.expiresAt);
      setPending({
        key: "telegram",
        url: start.botUrl,
        deadline: Number.isFinite(expiresAt)
          ? expiresAt
          : Date.now() + TELEGRAM_POLL_INTERVAL_MS * TELEGRAM_POLL_ATTEMPTS,
      });
      openExternal(start.botUrl);

      for (let poll = 0; poll < TELEGRAM_POLL_ATTEMPTS; poll++) {
        await new Promise((resolve) =>
          setTimeout(resolve, TELEGRAM_POLL_INTERVAL_MS),
        );
        if (!isCurrent(attempt)) return;

        const fresh = await api.backend.getUser(accessToken, user._id);
        if (!isCurrent(attempt)) return;

        const linked = fresh?.linkedSocials?.telegram;
        if (linked) {
          setTelegram(linked);
          setPrefs(fresh?.notifications ?? DEFAULT_NOTIFICATION_PREFS);
          toast.success(t("connections.telegramLinked"));
          return;
        }
      }

      throw new Error("link timed out");
    } catch (cause) {
      if (!isCurrent(attempt)) return;

      failRow(
        "telegram",
        t("connections.telegramLinkFailed"),
        cause,
        ["backend:telegramLinkStart", "backend:getUser"],
        t("connections.providerLinkTimeoutHint"),
      );
    } finally {
      if (isCurrent(attempt)) setPending(null);
    }
  };

  const unlink = async (key: ProviderKey) => {
    if (!accessToken) return;

    setError(null);
    setUnlinking(key);
    try {
      if (key === "discord") {
        const result = await api.backend.discordUnlink(accessToken);
        if (!result) throw new Error("unlink failed");

        setDiscordId(null);
        setDiscordUsername(null);
        toast.success(t("connections.discordUnlinked"));
      } else {
        const result = await api.backend.telegramUnlink(accessToken);
        if (!result) throw new Error("unlink failed");

        setTelegram(null);
        toast.success(t("connections.telegramUnlinked"));
      }
    } catch (cause) {
      failRow(
        key,
        key === "discord"
          ? t("connections.discordUnlinkFailed")
          : t("connections.telegramUnlinkFailed"),
        cause,
        key === "discord"
          ? ["backend:discordUnlink"]
          : ["backend:telegramUnlink"],
      );
    } finally {
      if (isMountedRef.current) setUnlinking(null);
    }
  };

  const togglePref = async (field: keyof INotificationPrefs, next: boolean) => {
    if (!accessToken) return;

    const previous = prefs;
    setPrefs({ ...prefs, [field]: next });
    setSavingPref(field);
    savingRef.current = true;
    try {
      const updated = await api.backend.updateNotifications(
        accessToken,
        user._id,
        { [field]: next },
      );
      if (!updated?.notifications) throw new Error("save failed");

      setPrefs(updated.notifications);
    } catch (cause) {
      setPrefs(previous);
      showFailureToast(t("connections.saveError"), cause, {
        channels: ["backend:updateNotifications"],
      });
    } finally {
      savingRef.current = false;
      if (isMountedRef.current) setSavingPref(null);
    }
  };

  const refreshPrefs = async () => {
    if (!accessToken) return;

    const fresh = await api.backend
      .getUser(accessToken, user._id)
      .catch(() => null);
    if (!isMountedRef.current || savingRef.current) return;
    if (fresh?.notifications) setPrefs(fresh.notifications);
  };

  const rows: {
    key: ProviderKey;
    icon: ReactNode;
    name: string;
    benefit: string;
    handle: string | null;
    url: string | null;
    isSignIn: boolean;
    onLink: () => void;
  }[] = [
    {
      key: "discord",
      icon: <FaDiscord className="size-4" />,
      name: "Discord",
      benefit: t("connections.discordBenefit"),
      handle: discordId ? discordUsername || t("connections.linked") : null,
      url: discordId ? `https://discord.com/users/${discordId}` : null,
      isSignIn: user.platform === "discord",
      onLink: () => void runDiscordLink(),
    },
    {
      key: "telegram",
      icon: <FaTelegram className="size-4" />,
      name: "Telegram",
      benefit: t("connections.telegramBenefit"),
      handle: telegram
        ? telegram.username
          ? `@${telegram.username}`
          : t("connections.linked")
        : null,
      url: null,
      isSignIn: false,
      onLink: () => void runTelegramLink(),
    },
  ];

  const blocker = !accessToken
    ? t("connections.needsAccount")
    : !isBackendOnline
      ? t("app.backendUnavailable")
      : null;

  if (!isOwner) {
    if (!discordId) return null;

    return (
      <button
        type="button"
        onClick={() => openExternal(`https://discord.com/users/${discordId}`)}
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-lg bg-surface-1 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <FaDiscord className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">
          {discordUsername || "Discord"}
        </span>
        <ExternalLink className="size-3.5 shrink-0 text-faint" />
      </button>
    );
  }

  const openManage = () => {
    setError(null);
    setManageOpen(true);
    if (telegram) void refreshPrefs();
  };

  const summaryText = (kind: ConnectionsSummary) => {
    switch (kind) {
      case "telegramOffer":
        return t("connections.summaryTelegramOffer");
      case "notifications":
        return t("connections.summaryNotifications");
      case "muted":
        return t("connections.summaryMuted");
      default:
        return t("connections.summaryEmpty");
    }
  };

  const summaryKind = connectionsSummary({
    hasDiscord: Boolean(discordId),
    hasTelegram: Boolean(telegram),
    prefs,
  });
  const isMuted = summaryKind === "muted";
  const summary = summaryText(summaryKind);

  return (
    <>
      <button
        type="button"
        onClick={openManage}
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-lg bg-surface-1 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        {isMuted ? (
          <BellOff className="size-3.5 shrink-0 text-warning" />
        ) : (
          <Plug className="size-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{summary}</span>
        <Settings2 className="size-3.5 shrink-0 text-faint" />
      </button>

      <Dialog
        open={isManageOpen}
        onOpenChange={(open) => {
          if (!open) cancelPending();
          setManageOpen(open);
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          className="gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-3 pr-12">
            <Plug className="size-4 shrink-0 text-faint" />
            <DialogTitle className="min-w-0 flex-1 truncate pr-0 text-sm">
              {t("connections.title")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid max-h-[70vh] gap-2.5 overflow-y-auto px-4 py-3">
            <div className="grid gap-1 rounded-xl border border-border bg-surface-2 p-1.5">
              {rows.map((row) => {
                const isLinked = Boolean(row.handle);
                const isPending = pending?.key === row.key;
                const isUnlinking = unlinking === row.key;
                const rowError = error?.key === row.key ? error.text : null;

                return (
                  <div
                    key={row.key}
                    className="grid gap-1.5 rounded-md p-1.5 transition-colors hover:bg-surface-3"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
                          rowError
                            ? "bg-surface-1 text-destructive"
                            : isLinked
                              ? "bg-surface-3 text-foreground"
                              : "bg-surface-3 text-faint"
                        }`}
                      >
                        {row.icon}
                      </span>

                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-sm leading-tight">
                          {row.name}
                        </span>
                        <span className="truncate text-xs leading-tight text-muted-foreground">
                          {row.benefit}
                        </span>
                      </span>

                      {isPending ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={cancelPending}
                        >
                          {t("common.cancel")}
                        </Button>
                      ) : row.isSignIn && isLinked ? (
                        <Hint content={t("connections.signInProviderHint")}>
                          <span className="flex shrink-0 items-center gap-1 rounded-md bg-surface-1 px-2 py-1 text-[11px] text-muted-foreground">
                            <Lock className="size-3 shrink-0" />
                            {t("connections.signInProvider")}
                          </span>
                        </Hint>
                      ) : isLinked ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={Boolean(blocker) || isUnlinking}
                          onClick={() => void unlink(row.key)}
                        >
                          {isUnlinking ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Unlink />
                          )}
                          {t("connections.unlink")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={Boolean(blocker) || Boolean(pending)}
                          onClick={row.onLink}
                        >
                          <Link2 />
                          {t("connections.link")}
                        </Button>
                      )}
                    </div>

                    {isLinked && (
                      <span className="flex min-w-0 items-center gap-1 pl-[42px] text-xs leading-tight text-success">
                        <BadgeCheck className="size-3 shrink-0" />
                        {row.url ? (
                          <button
                            type="button"
                            className="min-w-0 truncate hover:underline"
                            onClick={() => openExternal(row.url!)}
                          >
                            {row.handle}
                          </button>
                        ) : (
                          <span className="truncate">{row.handle}</span>
                        )}
                      </span>
                    )}

                    {isPending && (
                      <div className="grid gap-1.5 rounded-md bg-surface-1 px-2 py-1.5">
                        <p className="flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
                          <Loader2 className="mt-px size-3 shrink-0 animate-spin" />
                          <span className="min-w-0">
                            {row.key === "telegram"
                              ? t("connections.waitingTelegramHint")
                              : t("connections.waitingBrowserHint")}
                          </span>
                        </p>
                        <div className="flex items-center gap-1">
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={!pending?.url}
                            onClick={() =>
                              pending?.url && openExternal(pending.url)
                            }
                          >
                            <ExternalLink />
                            {t("connections.reopen")}
                          </Button>
                          {pending?.deadline ? (
                            <Hint content={t("connections.timeLeft")}>
                              <span className="ml-auto shrink-0 px-1 font-mono text-[11px] tabular-nums text-faint">
                                {formatCountdown(pending.deadline - now)}
                              </span>
                            </Hint>
                          ) : null}
                        </div>
                      </div>
                    )}

                    {rowError && (
                      <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-surface-1 px-2 py-1.5 text-[11px] leading-4 text-destructive">
                        <TriangleAlert className="mt-px size-3 shrink-0 text-destructive" />
                        <span className="min-w-0">{rowError}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {telegram && (
              <div className="grid gap-1 rounded-xl border border-border bg-surface-2 p-1.5">
                <div className="flex min-w-0 items-center gap-2.5 rounded-md px-1.5 py-1.5">
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm leading-tight">
                      {t("connections.notificationsTitle")}
                    </span>
                    <span className="truncate text-xs leading-tight text-muted-foreground">
                      {t("connections.notificationsWhen")}
                    </span>
                  </span>
                  <Switch
                    checked={prefs.enabled}
                    disabled={Boolean(blocker) || savingPref !== null}
                    onCheckedChange={(value) =>
                      void togglePref("enabled", value)
                    }
                    aria-label={t("connections.notificationsTitle")}
                  />
                </div>

                {NOTIFICATION_EVENTS.map((event: NotificationEvent) => (
                  <div
                    key={event}
                    className="flex min-w-0 items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {t(`connections.event.${event}`)}
                    </span>
                    <Switch
                      checked={prefs[event]}
                      disabled={
                        Boolean(blocker) ||
                        !prefs.enabled ||
                        savingPref !== null
                      }
                      onCheckedChange={(value) => void togglePref(event, value)}
                      aria-label={t(`connections.event.${event}`)}
                    />
                  </div>
                ))}

                <p className="px-1.5 pt-0.5 pb-1 text-[11px] leading-4 text-faint">
                  {t("connections.notificationsStopHint")}
                </p>
              </div>
            )}

            {blocker && (
              <p className="text-xs leading-4 text-warning">{blocker}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
