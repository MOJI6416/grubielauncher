import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import type { IModpackChannel } from "@/types/Backend";
import { networkAtom } from "@renderer/stores/atoms";
import { ensureFreshAccount } from "@renderer/features/profile/loadProfileUser";
import { consumeRecentFailure } from "@renderer/utilities/failures";

const api = window.api;

export function packChannelKey(code: string | undefined) {
  return ["packChannel", code ?? ""] as const;
}

export function usePackChannel(code: string | undefined, enabled: boolean) {
  const isBackendOnline = useAtomValue(networkAtom);

  return useQuery({
    queryKey: packChannelKey(code),
    enabled: enabled && !!code && isBackendOnline,
    staleTime: 60 * 1000,
    retry: false,
    queryFn: async () => api.backend.getModpackChannel("", code ?? ""),
  });
}

export function useSetPackChannel(code: string) {
  const client = useQueryClient();

  return (update: (current: IModpackChannel) => IModpackChannel) =>
    client.setQueryData<IModpackChannel | null>(packChannelKey(code), (current) =>
      current ? update(current) : current,
    );
}

export class PackAnalyticsFailedError extends Error {}

export function usePackAnalytics(code: string, enabled: boolean) {
  const isBackendOnline = useAtomValue(networkAtom);

  return useQuery({
    queryKey: ["packAnalytics", code],
    enabled: enabled && isBackendOnline,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { account } = await ensureFreshAccount();
      const analytics = await api.backend.getModpackAnalytics(
        account.accessToken || "",
        code,
      );
      if (analytics) return analytics;

      const failure = consumeRecentFailure({
        channels: ["backend:getModpackAnalytics"],
      });
      if (failure) throw new PackAnalyticsFailedError(failure.message);
      return null;
    },
  });
}

export async function freshAccessToken(): Promise<string> {
  const { account } = await ensureFreshAccount();
  return account.accessToken || "";
}
