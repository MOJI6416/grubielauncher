import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { GameInvite } from "@/types/GameInvite";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { joinFriendWorld } from "@renderer/features/launch/joinFriendWorld";
import { describeIncomingInvite } from "./gameInvite";

export function GameInviteDialog({
  invite,
  onClose,
}: {
  invite: GameInvite;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [isJoining, setIsJoining] = useState(false);
  const text = describeIncomingInvite(invite);

  const join = async () => {
    if (isJoining) return;

    setIsJoining(true);
    try {
      onClose();
      await joinFriendWorld({
        versionCode: invite.versionCode,
        hostNickname: invite.sender.nickname,
        slug: invite.target.type === "world" ? invite.target.slug : undefined,
        address:
          invite.target.type === "server" ? invite.target.address : undefined,
      });
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !isJoining) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(event) => {
          if (isJoining) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isJoining) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("friends.gameInviteTitle")}</DialogTitle>
          <DialogDescription className="rounded-lg border bg-muted/30 p-3 text-sm leading-6 text-foreground">
            {t(text.messageKey, text.params)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isJoining}>
            {t("common.close")}
          </Button>
          <Button disabled={isJoining} onClick={join}>
            {isJoining && <Loader2 className="animate-spin" />}
            {t("friends.gameInviteJoin")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
