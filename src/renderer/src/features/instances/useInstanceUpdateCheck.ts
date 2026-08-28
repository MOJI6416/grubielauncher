import { useEffect, useMemo } from "react";
import { ILocalAccount } from "@/types/Account";
import { Version } from "@renderer/classes/Version";
import { accountIdentity } from "@renderer/features/accounts/identity";
import { instanceKey } from "./selectors";
import {
  checkFingerprint,
  claimUpdateCheck,
  claimUpdatesForAccount,
  isUpdateCheckable,
  recordModpackComparison,
  releaseUpdateCheck,
  retainInstanceUpdates,
} from "./updateCheck";

const api = window.api;

export function useInstanceUpdateCheck(
  instances: Version[],
  account: ILocalAccount | null | undefined,
  isNetwork: boolean,
): void {
  const accessToken = account?.accessToken;
  const identity = account ? accountIdentity(account) : null;

  const owned = useMemo(
    () =>
      instances.filter((instance) =>
        isUpdateCheckable(instance.version, account),
      ),
    [instances, account],
  );

  useEffect(() => {
    claimUpdatesForAccount(identity);
  }, [identity]);

  useEffect(() => {
    retainInstanceUpdates(owned.map(instanceKey));
  }, [owned]);

  useEffect(() => {
    if (!accessToken || !isNetwork) return;

    let cancelled = false;

    void (async () => {
      for (const instance of owned) {
        if (cancelled) return;

        const shareCode = instance.version.shareCode;
        if (!shareCode) continue;

        const key = instanceKey(instance);
        const fingerprint = checkFingerprint(key, instance.version, identity);
        if (!claimUpdateCheck(fingerprint)) continue;

        try {
          const response = await api.backend.getModpack(accessToken, shareCode);
          if (cancelled || !response?.data) {
            releaseUpdateCheck(fingerprint);
            continue;
          }

          recordModpackComparison(key, instance.version, response.data);
        } catch {
          releaseUpdateCheck(fingerprint);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [owned, accessToken, identity, isNetwork]);
}
