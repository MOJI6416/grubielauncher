import { useTranslation } from "react-i18next";
import { Undo2, UserRound, UserX } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import type { ShareRemovedGuest } from "@/types/Share";
import {
  guestDisplayName,
  guestSecondaryName,
  type ShareGuestRow,
} from "./guests";
import { canKickGuest, removedGuestName } from "./hostModel";
import { elapsedSince, formatShareUptime } from "./shareModel";
import { TransportBadge } from "./TransportBadge";

export function ShareGuestList({
  rows,
  removed = [],
  nowMs,
  isOpenForGuests,
  disabled = false,
  onKick,
  onRestore,
}: {
  rows: ShareGuestRow[];
  removed?: ShareRemovedGuest[];
  nowMs: number;
  isOpenForGuests: boolean;
  disabled?: boolean;
  onKick?: (row: ShareGuestRow, name: string) => void;
  onRestore?: (guest: ShareRemovedGuest) => void;
}) {
  const { t } = useTranslation();

  if (rows.length === 0 && removed.length === 0) {
    return (
      <p className="px-1 py-2 text-xs leading-4 text-faint">
        {isOpenForGuests
          ? t("share.panel.guests.empty")
          : t("share.panel.guests.notYet")}
      </p>
    );
  }

  return (
    <ul className="grid gap-0.5">
      {rows.map((row) => {
        const name = guestDisplayName(row, t("share.panel.guests.unknown"));
        const secondary = guestSecondaryName(row);
        const kickLabel = t("share.panel.guests.kick", { name });

        return (
          <li
            key={row.key}
            className="flex h-9 items-center gap-2.5 rounded-lg px-1"
          >
            <Avatar className="size-6 shrink-0">
              <AvatarFallback className="text-3xs">
                {row.isKnown ? (
                  name.slice(0, 2).toUpperCase()
                ) : (
                  <UserRound className="size-3 text-faint" />
                )}
              </AvatarFallback>
            </Avatar>

            <Hint content={name} variant="text" truncatedOnly>
              <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
            </Hint>

            {secondary && (
              <Hint content={secondary} variant="text" truncatedOnly>
                <span className="hidden max-w-24 shrink-0 truncate text-xs text-faint sm:block">
                  {secondary}
                </span>
              </Hint>
            )}

            <TransportBadge
              transport={row.transport}
              rttMs={row.rttMs}
              t={t}
              className="text-xs"
            />

            <Hint content={t("share.panel.guests.connectedFor")}>
              <span className="shrink-0 font-mono text-xs whitespace-nowrap tabular-nums text-faint">
                {formatShareUptime(elapsedSince(row.connectedAt, nowMs))}
              </span>
            </Hint>

            {onKick && canKickGuest(row) && (
              <Hint content={kickLabel}>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={kickLabel}
                  disabled={disabled}
                  onClick={() => onKick(row, name)}
                >
                  <UserX />
                </Button>
              </Hint>
            )}
          </li>
        );
      })}

      {removed.map((guest) => {
        const name = removedGuestName(guest);
        const restoreLabel = t("share.panel.guests.restore", { name });

        return (
          <li
            key={`removed:${guest.userId ?? guest.username}`}
            className="flex h-8 items-center gap-2.5 rounded-lg px-1 text-faint"
          >
            <UserX className="size-4 shrink-0" />
            <Hint content={name} variant="text" truncatedOnly>
              <span className="min-w-0 flex-1 truncate text-xs line-through">
                {name}
              </span>
            </Hint>
            <span className="shrink-0 text-xs whitespace-nowrap">
              {t("share.panel.guests.removed")}
            </span>
            {onRestore && (
              <Hint content={restoreLabel}>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={restoreLabel}
                  disabled={disabled}
                  onClick={() => onRestore(guest)}
                >
                  <Undo2 />
                </Button>
              </Hint>
            )}
          </li>
        );
      })}
    </ul>
  );
}
