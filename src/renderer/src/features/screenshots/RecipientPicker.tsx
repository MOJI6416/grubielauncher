import { type ReactNode, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { HeadDot, PlayerHead } from "@renderer/features/accounts/AccountHead";
import {
  friendsAtom,
  groupsAtom,
  isFriendsConnectedAtom,
} from "@renderer/stores/atoms";
import { onRadioKeyDown, radioFocusIndex } from "@renderer/utilities/radioKeys";
import { presenceDotColor, friendPresence } from "@renderer/features/friends/presence";
import {
  type ChatTarget,
  chatTargetKey,
} from "@renderer/features/friends/chatHandoff";

interface Option {
  target: ChatTarget;
  label: string;
  render: () => ReactNode;
}

export function RecipientPicker({
  value,
  onChange,
}: {
  value: ChatTarget | null;
  onChange: (target: ChatTarget) => void;
}) {
  const { t } = useTranslation();
  const friends = useAtomValue(friendsAtom);
  const groups = useAtomValue(groupsAtom);
  const isConnected = useAtomValue(isFriendsConnectedAtom);
  const [query, setQuery] = useState("");

  const options = useMemo<Option[]>(() => {
    const needle = query.trim().toLowerCase();
    const matches = (text: string) => !needle || text.toLowerCase().includes(needle);

    const friendOptions = [...friends]
      .sort(
        (a, b) =>
          Number(b.isOnline) - Number(a.isOnline) ||
          a.user.nickname.localeCompare(b.user.nickname, undefined, {
            sensitivity: "base",
          }),
      )
      .filter((friend) => matches(friend.user.nickname))
      .map<Option>((friend) => ({
        target: { kind: "friend", id: friend.user._id },
        label: friend.user.nickname,
        render: () => (
          <PlayerHead
            user={friend.user}
            size={24}
            badge={
              <HeadDot className={presenceDotColor(friendPresence(friend).kind)} />
            }
          />
        ),
      }));

    const groupOptions = groups
      .filter((group) => matches(group.name))
      .map<Option>((group) => ({
        target: { kind: "group", id: group._id },
        label: group.name,
        render: () => (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-3 text-faint">
            <Users className="size-3.5" />
          </span>
        ),
      }));

    return [...friendOptions, ...groupOptions];
  }, [friends, groups, query]);

  const keys = options.map((option) => chatTargetKey(option.target));
  const current = value ? chatTargetKey(value) : null;
  const focusIndex = radioFocusIndex(keys, current);
  const hasAnyone = friends.length > 0 || groups.length > 0;

  if (!hasAnyone) {
    return (
      <Empty className="h-full gap-2 border-0 bg-transparent p-3">
        <EmptyHeader className="gap-1">
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle className="text-sm">
            {isConnected
              ? t("screenshots.send.nobodyTitle")
              : t("app.backendUnavailable")}
          </EmptyTitle>
          <EmptyDescription className="text-xs">
            {t("screenshots.send.nobodyHint")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
        <Input
          value={query}
          className="h-8 pl-8"
          placeholder={t("screenshots.send.search")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div
        role="radiogroup"
        aria-label={t("screenshots.send.to")}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
        onKeyDown={(event) =>
          onRadioKeyDown(event, keys, current, (key) => {
            const option = options[keys.indexOf(key)];
            if (option) onChange(option.target);
          })
        }
      >
        {options.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {t("common.notFound")}
          </p>
        ) : (
          options.map((option, index) => {
            const key = keys[index];
            const selected = key === current;
            const isGroup = option.target.kind === "group";
            const startsGroups =
              isGroup && (index === 0 || options[index - 1].target.kind !== "group");

            return (
              <div key={key} className="flex flex-col">
                {startsGroups && (
                  <p className="px-2 pt-2 pb-1 text-3xs font-medium tracking-wide text-faint uppercase">
                    {t("screenshots.send.groups")}
                  </p>
                )}
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={index === focusIndex ? 0 : -1}
                  onClick={() => onChange(option.target)}
                  className={cn(
                    "flex h-9 min-w-0 items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "bg-row-selected" : "hover:bg-row-hover",
                  )}
                >
                  {option.render()}
                  <Hint content={option.label} variant="text" truncatedOnly>
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  </Hint>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
