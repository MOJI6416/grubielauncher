import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ModrinthServer,
  ModrinthServerQuery,
} from "@/types/ModrinthServers";
import { MODRINTH_SERVER_PAGE_SIZE } from "@/shared/modrinthServers";

const api = window.api;

export type ServerDiscoveryRequest = Omit<
  ModrinthServerQuery,
  "offset" | "limit"
>;

interface DiscoveryState {
  items: ModrinthServer[];
  total: number;
  nextOffset: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: boolean;
}

const INITIAL: DiscoveryState = {
  items: [],
  total: 0,
  nextOffset: 0,
  isLoading: false,
  isLoadingMore: false,
  error: false,
};

function mergeServers(
  current: ModrinthServer[],
  next: ModrinthServer[],
): ModrinthServer[] {
  const seen = new Set(current.map((server) => server.id));
  return [...current, ...next.filter((server) => !seen.has(server.id))];
}

export function useServerDiscovery(
  request: ServerDiscoveryRequest,
  enabled: boolean,
) {
  const [state, setState] = useState<DiscoveryState>(INITIAL);
  const requestIdRef = useRef(0);
  const requestRef = useRef(request);
  requestRef.current = request;
  const stateRef = useRef(state);
  stateRef.current = state;
  const signature = JSON.stringify(request);

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    const requestId = ++requestIdRef.current;

    setState((prev) => ({
      ...prev,
      items: append ? prev.items : [],
      total: append ? prev.total : 0,
      nextOffset: append ? prev.nextOffset : 0,
      isLoading: !append,
      isLoadingMore: append,
      error: append ? prev.error : false,
    }));

    const page = await api.servers
      .discover({
        ...requestRef.current,
        offset,
        limit: MODRINTH_SERVER_PAGE_SIZE,
      })
      .catch(() => null);

    if (requestId !== requestIdRef.current) return;

    if (!page || page.error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isLoadingMore: false,
        error: true,
      }));
      return;
    }

    setState((prev) => ({
      items: append ? mergeServers(prev.items, page.servers) : page.servers,
      total: page.total,
      nextOffset: page.nextOffset,
      isLoading: false,
      isLoadingMore: false,
      error: false,
    }));
  }, []);

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      setState(INITIAL);
      return;
    }

    void fetchPage(0, false);

    return () => {
      requestIdRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, signature]);

  const hasMore = state.nextOffset < state.total && !state.error;

  const loadMore = useCallback(() => {
    const current = stateRef.current;
    if (!enabled || current.isLoading || current.isLoadingMore) return;
    if (current.nextOffset >= current.total || current.error) return;

    void fetchPage(current.nextOffset, true);
  }, [enabled, fetchPage]);

  const reload = useCallback(() => {
    if (enabled) void fetchPage(0, false);
  }, [enabled, fetchPage]);

  return { ...state, hasMore, loadMore, reload };
}
