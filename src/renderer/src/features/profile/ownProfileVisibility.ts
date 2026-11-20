import { useEffect } from "react";
import { atom, getDefaultStore, useAtomValue } from "jotai";
import {
  accountAtom,
  authDataAtom,
  networkAtom,
} from "@renderer/stores/atoms";

export interface ProfileVisibility {
  userId: string;
  isPublic: boolean;
}

export const ownProfileVisibilityAtom = atom<ProfileVisibility | null>(null);

export function rememberProfileVisibility(userId: string, isPublic: boolean) {
  getDefaultStore().set(ownProfileVisibilityAtom, { userId, isPublic });
}

export function isProfileShared(
  visibility: ProfileVisibility | null,
  userId: string | undefined,
): boolean {
  return !!userId && visibility?.userId === userId && visibility.isPublic;
}

let requested = "";

export function useOwnProfileVisibility(): ProfileVisibility | null {
  const authData = useAtomValue(authDataAtom);
  const account = useAtomValue(accountAtom);
  const isBackendOnline = useAtomValue(networkAtom);
  const visibility = useAtomValue(ownProfileVisibilityAtom);
  const userId = authData?.sub;
  const token = account?.accessToken;

  useEffect(() => {
    if (!userId || !token || !isBackendOnline) return;
    if (visibility?.userId === userId || requested === userId) return;

    requested = userId;
    void window.api.backend
      .getUser(token, userId)
      .then((user) => {
        if (user?._id === userId) {
          rememberProfileVisibility(userId, user.publicProfile !== false);
        } else {
          requested = "";
        }
      })
      .catch((error: unknown) => {
        requested = "";
        console.warn("[profile] visibility check failed", error);
      });
  }, [isBackendOnline, token, userId, visibility?.userId]);

  return visibility?.userId === userId ? visibility : null;
}
