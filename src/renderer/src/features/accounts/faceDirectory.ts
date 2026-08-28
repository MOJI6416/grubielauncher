import { useMemo } from "react";
import { useAtomValue } from "jotai";
import type { AccountType } from "@/types/Account";
import { accountAtom, authDataAtom, friendsAtom } from "@renderer/stores/atoms";
import type { HeadFace } from "./AccountHead";
import { accountUuid } from "./identity";

export interface FaceSource {
  _id?: string;
  nickname: string;
}

export type FaceLookup = (source: FaceSource) => HeadFace;

export function buildFaceLookup(
  known: ReadonlyMap<string, { type: AccountType; uuid: string | null }>,
): FaceLookup {
  return (source) => {
    const match = source._id ? known.get(source._id) : undefined;

    return {
      type: match?.type ?? "plain",
      nickname: source.nickname,
      id: source._id,
      uuid: match?.uuid ?? null,
    };
  };
}

export function useFaceLookup(): FaceLookup {
  const friends = useAtomValue(friendsAtom);
  const account = useAtomValue(accountAtom);
  const authData = useAtomValue(authDataAtom);

  return useMemo(() => {
    const known = new Map<string, { type: AccountType; uuid: string | null }>();

    for (const friend of friends) {
      const user = friend?.user;
      if (!user?._id) continue;
      known.set(user._id, { type: user.platform, uuid: user.uuid ?? null });
    }

    if (authData?.sub && account) {
      known.set(authData.sub, {
        type: account.type,
        uuid: accountUuid(account),
      });
    }

    return buildFaceLookup(known);
  }, [account, authData?.sub, friends]);
}
