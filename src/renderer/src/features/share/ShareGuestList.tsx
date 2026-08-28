import { useTranslation } from "react-i18next";
import { UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Hint } from "@renderer/components/Hint";
import {
  guestDisplayName,
  guestSecondaryName,
  type ShareGuestRow,
} from "./guests";
import { elapsedSince, formatShareUptime } from "./shareModel";

export function ShareGuestList({
  rows,
  nowMs,
  isOpenForGuests,
}: {
  rows: ShareGuestRow[];
  nowMs: number;
  isOpenForGuests: boolean;
}) {
  const { t } = useTranslation();

  if (rows.length === 0) {
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

        return (
          <li
            key={row.key}
            className="flex h-9 items-center gap-2.5 rounded-lg px-1"
          >
            <Avatar className="size-6 shrink-0">
              <AvatarFallback className="text-[0.6rem]">
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

            <Hint content={t("share.panel.guests.connectedFor")}>
              <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
                {formatShareUptime(elapsedSince(row.connectedAt, nowMs))}
              </span>
            </Hint>
          </li>
        );
      })}
    </ul>
  );
}
