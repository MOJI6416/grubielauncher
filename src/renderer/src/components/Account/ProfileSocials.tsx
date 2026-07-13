import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FaDiscord } from "react-icons/fa";
import { Check, Link2, Loader2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IUser } from "@/types/IUser";
import { DISCORD_CLIENT_ID } from "@/shared/config";

const api = window.api;

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
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const linkDiscord = async () => {
    if (!accessToken) return;
    setLinking(true);
    try {
      const state = `discord:${crypto.randomUUID()}`;
      const authUrl = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A53213%2Fcallback&scope=identify+guilds.join&state=${encodeURIComponent(
        state,
      )}`;
      const wait = api.auth.startServer(state);
      await api.shell.openExternal(authUrl);
      const { code } = await wait;
      const result = await api.backend.discordLink(accessToken, code);
      if (!result) throw new Error("link failed");
      setDiscordId(result.discordId);
      toast.success(t("socials.discordLinked"));
    } catch {
      toast.error(t("socials.discordLinkFailed"));
    } finally {
      setLinking(false);
    }
  };

  const unlinkDiscord = async () => {
    if (!accessToken) return;
    setUnlinking(true);
    try {
      const result = await api.backend.discordUnlink(accessToken);
      if (!result) throw new Error("unlink failed");
      setDiscordId(null);
      toast.success(t("socials.discordUnlinked"));
    } catch {
      toast.error(t("socials.discordUnlinkFailed"));
    } finally {
      setUnlinking(false);
    }
  };

  // Discord logins own the id as their identity — nothing to link/unlink.
  // Only the owner sees this: whether a Discord is linked is private, never
  // shown on someone else's profile.
  if (user.platform === "discord" || !isOwner) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <FaDiscord className="size-4 shrink-0 text-muted-foreground" />
        Discord
        {discordId && (
          <span className="inline-flex items-center gap-1 text-green-500">
            <Check className="size-3.5" />
            {t("socials.linked")}
          </span>
        )}
      </span>

      {isOwner &&
        (discordId ? (
          <Button
            size="sm"
            variant="outline"
            disabled={unlinking || !accessToken}
            onClick={unlinkDiscord}
          >
            {unlinking ? (
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
            disabled={linking || !accessToken}
            onClick={linkDiscord}
          >
            {linking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Link2 className="size-4" />
            )}
            {t("socials.link")}
          </Button>
        ))}
    </div>
  );
}
