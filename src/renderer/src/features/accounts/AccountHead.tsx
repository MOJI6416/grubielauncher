import { useEffect, useState, type ReactNode } from "react";
import { useAtomValue } from "jotai";
import { cn } from "@/lib/utils";
import type { AccountType } from "@/types/Account";
import type { IUser } from "@/types/IUser";
import { accountAtom, rpcSkinVersionAtom } from "@renderer/stores/atoms";
import { getApiBase, subscribeApiBase } from "@renderer/utilities/apiBase";
import {
  headImageId,
  headImageUrl,
  userHeadUrl,
  type AccountLike,
} from "./identity";
import { nicknameInitials } from "./nickname";

export type HeadFace = AccountLike & {
  headUrl?: string | null;
};

export function userFace(user: {
  _id?: string | null;
  id?: string | null;
  nickname: string;
  platform?: IUser["platform"] | null;
  uuid?: string | null;
  headUrl?: string | null;
}): HeadFace {
  return {
    type: user.platform ?? "plain",
    nickname: user.nickname,
    id: user._id ?? user.id ?? undefined,
    uuid: user.uuid ?? null,
    headUrl: user.headUrl ?? null,
  };
}

export function accountFace(account: {
  type: AccountType;
  nickname: string;
  id?: string;
  accessToken?: string;
}): HeadFace {
  return {
    type: account.type,
    nickname: account.nickname,
    id: account.id,
    accessToken: account.accessToken,
  };
}

function useApiBase() {
  const [base, setBase] = useState(getApiBase());
  useEffect(() => subscribeApiBase(setBase), []);
  return base;
}

export function AccountHead({
  account,
  size = 36,
  className,
  badge,
}: {
  account: HeadFace;
  size?: number;
  className?: string;
  badge?: ReactNode;
}) {
  const apiBase = useApiBase();
  const localAccount = useAtomValue(accountAtom);
  const skinVersion = useAtomValue(rpcSkinVersionAtom);

  const headId = headImageId(account);
  const isOwnHead =
    headId !== null && localAccount
      ? headId === headImageId(localAccount)
      : false;

  const url =
    account.headUrl ||
    headImageUrl(account, apiBase, isOwnHead ? skinVersion : undefined) ||
    userHeadUrl(apiBase, account.id);

  const [headFailed, setHeadFailed] = useState(false);

  useEffect(() => {
    setHeadFailed(false);
  }, [url]);

  const showsHead = Boolean(url) && !headFailed;

  return (
    <span
      className={cn("relative flex shrink-0 rounded-md", className)}
      style={{ width: size, height: size }}
    >
      <span className="flex size-full items-center justify-center overflow-hidden rounded-[inherit] bg-surface-3 text-xs font-medium text-muted-foreground">
        {showsHead ? (
          <img
            src={url ?? ""}
            alt=""
            width={size}
            height={size}
            draggable={false}
            onError={() => setHeadFailed(true)}
            className="size-full object-cover [image-rendering:pixelated]"
          />
        ) : (
          <span style={{ fontSize: Math.max(9, Math.round(size * 0.34)) }}>
            {nicknameInitials(account.nickname)}
          </span>
        )}
      </span>
      {badge}
    </span>
  );
}

export function HeadDot({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      aria-label={label}
      className={cn(
        "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-background",
        className,
      )}
    />
  );
}

export function PlayerHead({
  user,
  size,
  className,
  badge,
}: {
  user: {
    _id?: string | null;
    id?: string | null;
    nickname: string;
    platform?: IUser["platform"] | null;
    uuid?: string | null;
    headUrl?: string | null;
  };
  size?: number;
  className?: string;
  badge?: ReactNode;
}) {
  return (
    <AccountHead
      account={userFace(user)}
      size={size}
      className={className}
      badge={badge}
    />
  );
}
