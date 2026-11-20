import { useMemo, useState } from "react";
import { atom, getDefaultStore, useAtom } from "jotai";
import type { TFunction } from "i18next";
import {
  Copy,
  EllipsisVertical,
  KeyRound,
  Loader2,
  RefreshCw,
  SendHorizontal,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { IFriendRequest } from "@/types/IFriend";
import type { IUser } from "@/types/IUser";
import type { MsFriend } from "@/shared/msFriends";
import { isProfileName } from "@/shared/msFriends";
import { Hint } from "@renderer/components/Hint";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { RemovalItem, RemovalList } from "@renderer/components/RemovalCollapse";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { PlayerHead } from "@renderer/features/accounts/AccountHead";
import { useRedact } from "@renderer/features/streamer/streamerMode";
import { navigate } from "@renderer/navigation/navigate";
import type { FriendLookupProblem } from "./friendLookup";
import { PlatformIcon } from "./PlatformIcon";
import type { useFriendCode } from "./useFriendCode";

export const addFriendOpenAtom = atom(false);

export function openAddFriend() {
  getDefaultStore().set(addFriendOpenAtom, true);
  navigate({ name: "people", section: "friends" });
}

export type FriendCodeState = ReturnType<typeof useFriendCode>;

export function FriendCodeLine({
  code,
  isSignedOut,
  className,
  t,
}: {
  code: FriendCodeState;
  isSignedOut: boolean;
  className?: string;
  t: TFunction;
}) {
  const redact = useRedact();
  const [isResetConfirm, setIsResetConfirm] = useState(false);
  const value = code.code;

  return (
    <div
      className={cn(
        "flex h-10 min-w-0 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface-2 pr-1 pl-3",
        className,
      )}
    >
      <KeyRound className="size-3.5 shrink-0 text-faint" />
      <span className="shrink-0 text-xs text-muted-foreground">
        {t("friends.friendCode")}
      </span>

      {value ? (
        <span className="shrink-0 font-mono text-sm font-semibold tracking-[0.14em] select-all">
          {redact.value(value)}
        </span>
      ) : code.isLoading ? (
        <Skeleton className="h-4 w-24 rounded" />
      ) : (
        <Hint
          content={t("friends.friendCodeUnavailable")}
          variant="text"
          truncatedOnly
        >
          <span className="min-w-0 truncate text-2xs text-muted-foreground">
            {t("friends.friendCodeUnavailable")}
          </span>
        </Hint>
      )}

      {value && !code.isEnabled && (
        <Hint content={t("friends.code.off")} variant="text" truncatedOnly>
          <span className="min-w-0 truncate text-2xs text-warning">
            {t("friends.code.off")}
          </span>
        </Hint>
      )}

      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        <Hint content={t("common.copy")}>
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-8"
            disabled={!value}
            aria-label={t("common.copy")}
            onClick={() => void code.copy()}
          >
            <Copy className="size-4" />
          </Button>
        </Hint>

        <DropdownMenu>
          <Hint content={t("friends.code.actions")}>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-8"
                disabled={!value || isSignedOut}
                aria-label={t("friends.code.actions")}
              >
                {code.isResetting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <EllipsisVertical className="size-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
          </Hint>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuCheckboxItem
              checked={code.isEnabled}
              onCheckedChange={(checked) =>
                void code.setRequestsEnabled(checked === true)
              }
            >
              {t("friends.friendRequestsEnabledTitle")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={code.isResetting}
              onSelect={() => setIsResetConfirm(true)}
            >
              <RefreshCw />
              {t("friends.resetFriendCode")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>

      {isResetConfirm && (
        <Confirmation
          title={t("friends.resetFriendCodeTitle")}
          content={[{ text: t("friends.resetFriendCodeConfirm") }]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setIsResetConfirm(false),
            },
            {
              text: t("friends.resetFriendCode"),
              color: "danger",
              onClick: () => {
                setIsResetConfirm(false);
                void code.reset();
              },
            },
          ]}
          onClose={() => setIsResetConfirm(false)}
        />
      )}
    </div>
  );
}

export interface AddFriendFormProps {
  lookupValue: string;
  lookupProblem: FriendLookupProblem | null;
  isSending: boolean;
  isSignedOut: boolean;
  onLookupChange: (value: string) => void;
  onSend: () => void;
  outgoing: IFriendRequest[];
  pendingRequestIds: string[];
  onCancelRequest: (requestId: string) => void;
  onViewProfile: (userId: string) => void;
  ms?: {
    outgoing: MsFriend[];
    pending: string[];
    onRemove: (profileId: string) => void;
    onSend: (name: string) => Promise<boolean>;
  };
  code: FriendCodeState;
  t: TFunction;
}

type AddMode = "code" | "microsoft";

function SentRow({
  user,
  platform,
  isPending,
  onCancel,
  onOpen,
  t,
}: {
  user: { _id: string; nickname: string; uuid?: string | null };
  platform: IUser["platform"];
  isPending: boolean;
  onCancel: () => void;
  onOpen?: () => void;
  t: TFunction;
}) {
  const label = (
    <>
      <PlayerHead user={{ ...user, platform }} size={24} />
      <Hint content={user.nickname} variant="text" truncatedOnly>
        <span className="min-w-0 truncate text-xs font-medium">
          {user.nickname}
        </span>
      </Hint>
      <span className="shrink-0 text-faint">
        <PlatformIcon platform={platform} />
      </span>
    </>
  );

  return (
    <div className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md pr-0.5 pl-1.5 transition-colors hover:bg-row-hover">
      {onOpen ? (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onOpen}
        >
          {label}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2">{label}</span>
      )}
      <Hint content={t("friends.cancelRequest")}>
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
          disabled={isPending}
          aria-label={t("friends.cancelRequest")}
          onClick={onCancel}
        >
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <X className="size-3.5" />
          )}
        </Button>
      </Hint>
    </div>
  );
}

function AddFriendForm({
  lookupValue,
  lookupProblem,
  isSending,
  isSignedOut,
  onLookupChange,
  onSend,
  outgoing,
  pendingRequestIds,
  onCancelRequest,
  onViewProfile,
  ms,
  code,
  t,
}: AddFriendFormProps) {
  const [mode, setMode] = useState<AddMode>("code");
  const [msName, setMsName] = useState("");
  const pending = useMemo(
    () => new Set(pendingRequestIds),
    [pendingRequestIds],
  );
  const msPending = useMemo(() => new Set(ms?.pending ?? []), [ms?.pending]);
  const msOutgoing = ms?.outgoing ?? [];
  const sentKeys = useMemo(
    () =>
      new Set([
        ...outgoing.map((request) => request.requestId),
        ...msOutgoing.map((request) => `ms:${request.profileId}`),
      ]),
    [outgoing, msOutgoing],
  );
  const isMsSending = (ms?.pending ?? []).some(
    (key) => !/^[0-9a-f]{32}$/.test(key),
  );
  const msTrimmed = msName.trim();
  const canSendMs = Boolean(ms) && isProfileName(msTrimmed) && !isMsSending;
  const canSend =
    Boolean(lookupValue.trim()) && !lookupProblem && !isSending && !isSignedOut;

  const sendMs = async () => {
    if (!ms || !canSendMs) return;
    if (await ms.onSend(msTrimmed)) setMsName("");
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{t("friends.addFriend")}</p>

      {ms && (
        <SegmentedControl
          value={mode}
          stretch
          ariaLabel={t("friends.addFriend")}
          options={[
            { value: "code", label: t("friends.add.byCode") },
            { value: "microsoft", label: t("friends.add.byMicrosoft") },
          ]}
          onChange={setMode}
        />
      )}

      {mode === "code" || !ms ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs leading-4 text-muted-foreground">
            {t("friends.addFriendHint")}
          </p>
          <Input
            autoFocus
            value={lookupValue}
            placeholder="ABCD-1234"
            aria-label={t("friends.friendId")}
            className="h-9 font-mono tracking-[0.14em] uppercase"
            onChange={(event) => onLookupChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canSend) onSend();
            }}
          />
          {isSignedOut ? (
            <p className="text-2xs leading-4 text-warning">
              {t("friends.sessionLostHint")}
            </p>
          ) : (
            lookupProblem &&
            lookupProblem !== "empty" && (
              <p className="text-2xs leading-4 text-warning">
                {t(`friends.lookupErrors.${lookupProblem}`)}
              </p>
            )
          )}
          <Button disabled={!canSend} onClick={onSend}>
            {isSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <SendHorizontal className="size-4" />
            )}
            {t("friends.sendRequest")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs leading-4 text-muted-foreground">
            {t("friends.microsoft.addHint")}
          </p>
          <Input
            autoFocus
            value={msName}
            maxLength={16}
            placeholder={t("friends.microsoft.namePlaceholder")}
            aria-label={t("friends.microsoft.namePlaceholder")}
            className="h-9"
            onChange={(event) => setMsName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void sendMs();
            }}
          />
          <Button disabled={!canSendMs} onClick={() => void sendMs()}>
            {isMsSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <SendHorizontal className="size-4" />
            )}
            {t("friends.sendRequest")}
          </Button>
        </div>
      )}

      {sentKeys.size > 0 && (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 px-0.5 text-3xs font-medium tracking-wide text-faint uppercase">
            {t("friends.outgoingRequests")}
            <span className="font-mono tabular-nums">{sentKeys.size}</span>
          </p>
          <div className="max-h-36 overflow-x-hidden overflow-y-auto">
            <RemovalList sourceKeys={sentKeys}>
              {outgoing.map((request) => (
                <RemovalItem key={request.requestId} itemKey={request.requestId}>
                  <SentRow
                    user={request.user}
                    platform={request.user.platform}
                    isPending={pending.has(request.requestId)}
                    onOpen={() => onViewProfile(request.user._id)}
                    onCancel={() => onCancelRequest(request.requestId)}
                    t={t}
                  />
                </RemovalItem>
              ))}
              {msOutgoing.map((request) => (
                <RemovalItem
                  key={`ms:${request.profileId}`}
                  itemKey={`ms:${request.profileId}`}
                >
                  <SentRow
                    user={{
                      _id: request.profileId,
                      nickname: request.name,
                      uuid: request.profileId,
                    }}
                    platform="microsoft"
                    isPending={msPending.has(request.profileId)}
                    onCancel={() => ms?.onRemove(request.profileId)}
                    t={t}
                  />
                </RemovalItem>
              ))}
            </RemovalList>
          </div>
        </div>
      )}

      <FriendCodeLine code={code} isSignedOut={isSignedOut} t={t} />
    </div>
  );
}

export function AddFriendPopover({
  trigger,
  align = "start",
  ...form
}: AddFriendFormProps & {
  trigger: "icon" | "button";
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useAtom(addFriendOpenAtom);
  const { t } = form;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {trigger === "icon" ? (
        <Hint content={t("friends.addFriend")}>
          <PopoverTrigger asChild>
            <Button
              size="icon-sm"
              variant="secondary"
              className="size-8 shrink-0"
              aria-label={t("friends.addFriend")}
            >
              <UserPlus className="size-4" />
            </Button>
          </PopoverTrigger>
        </Hint>
      ) : (
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            <UserPlus className="size-4" />
            {t("friends.addFriend")}
          </Button>
        </PopoverTrigger>
      )}
      <PopoverContent align={align} className="w-[22rem] p-3">
        <AddFriendForm {...form} />
      </PopoverContent>
    </Popover>
  );
}
