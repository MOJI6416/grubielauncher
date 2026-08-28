import { useTranslation } from "react-i18next";
import { Check, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { PlayerHead } from "@renderer/features/accounts/AccountHead";
import type { InviteCandidate } from "./invites";

export function ShareInviteList({
  candidates,
  disabled,
  onInvite,
}: {
  candidates: InviteCandidate[];
  disabled: boolean;
  onInvite: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <ul className="grid gap-0.5">
      {candidates.map((candidate) => (
        <li
          key={candidate.id}
          className="flex h-9 items-center gap-2.5 rounded-lg px-1"
        >
          <PlayerHead
            user={{
              id: candidate.id,
              nickname: candidate.nickname,
              platform: candidate.platform,
              uuid: candidate.uuid,
            }}
            size={24}
          />

          <Hint content={candidate.nickname} variant="text" truncatedOnly>
            <span className="min-w-0 flex-1 truncate text-sm">
              {candidate.nickname}
            </span>
          </Hint>

          {candidate.state === "joined" ? (
            <span className="shrink-0 text-xs text-success">
              {t("share.panel.invite.joined")}
            </span>
          ) : candidate.state === "offline" ? (
            <span className="shrink-0 text-xs text-faint">
              {t("share.panel.invite.offline")}
            </span>
          ) : candidate.state === "sent" ? (
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <Check className="size-3" />
              {t("share.panel.invite.sent")}
            </span>
          ) : (
            <Button
              size="sm"
              variant={disabled ? "ghost" : "secondary"}
              className="shrink-0"
              disabled={disabled || candidate.state === "sending"}
              onClick={() => onInvite(candidate.id)}
            >
              {candidate.state === "sending" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Send />
              )}
              {t("share.panel.invite.action")}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
