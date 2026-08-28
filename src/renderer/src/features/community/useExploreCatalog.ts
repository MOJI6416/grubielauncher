import { useCallback, useEffect, useRef, useState } from "react";
import type { IExploreFacets, IModpackCard } from "@/types/Backend";
import {
  EMPTY_FACETS,
  ExploreFilters,
  exploreRequest,
  exploreSignature,
  hasMoreExplore,
  mergeExplorePages,
  normalizeFacets,
} from "./exploreQuery";

const api = window.api;

export interface ExploreCatalogState {
  items: IModpackCard[];
  total: number;
  facets: IExploreFacets;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: boolean;
  loadMoreError: boolean;
  hasMore: boolean;
  offset: number;
}

const INITIAL: ExploreCatalogState = {
  items: [],
  total: 0,
  facets: EMPTY_FACETS,
  isLoading: false,
  isLoadingMore: false,
  error: false,
  loadMoreError: false,
  hasMore: false,
  offset: 0,
};

export function useExploreCatalog(
  filters: ExploreFilters,
  enabled: boolean,
): ExploreCatalogState & {
  reload: () => void;
  loadMore: () => void;
  retryLoadMore: () => void;
} {
  const [state, setState] = useState<ExploreCatalogState>(INITIAL);
  const requestIdRef = useRef(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const stateRef = useRef(state);
  stateRef.current = state;

  const signature = exploreSignature(filters);

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    const requestId = ++requestIdRef.current;

    setState((previous) => ({
      ...previous,
      isLoading: !append,
      isLoadingMore: append,
      error: append ? previous.error : false,
      loadMoreError: false,
      items: append ? previous.items : [],
      total: append ? previous.total : 0,
      offset: append ? previous.offset : 0,
    }));

    const page = await api.backend
      .exploreModpacks(exploreRequest(filtersRef.current, offset))
      .catch(() => null);

    if (requestId !== requestIdRef.current) return;

    if (!page || !Array.isArray(page.items)) {
      setState((previous) =>
        append
          ? { ...previous, isLoadingMore: false, loadMoreError: true }
          : {
              ...previous,
              isLoading: false,
              isLoadingMore: false,
              hasMore: false,
              error: true,
            },
      );
      return;
    }

    setState((previous) => {
      const items = append
        ? mergeExplorePages(previous.items, page.items)
        : page.items;
      const received = page.items.length;
      const added = append ? items.length - previous.items.length : received;
      const nextOffset = (append ? previous.offset : 0) + received;

      return {
        items,
        total: page.total,
        facets: normalizeFacets(page.facets),
        isLoading: false,
        isLoadingMore: false,
        error: false,
        loadMoreError: false,
        offset: nextOffset,
        hasMore: hasMoreExplore({
          loaded: nextOffset,
          total: page.total,
          received,
          added,
        }),
      };
    });
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

  const loadMore = useCallback(() => {
    if (!enabled) return;

    const current = stateRef.current;
    if (current.isLoading || current.isLoadingMore || !current.hasMore) return;
    if (current.loadMoreError) return;

    void fetchPage(current.offset, true);
  }, [enabled, fetchPage]);

  const retryLoadMore = useCallback(() => {
    if (!enabled) return;

    const current = stateRef.current;
    if (current.isLoading || current.isLoadingMore) return;

    void fetchPage(current.offset, true);
  }, [enabled, fetchPage]);

  const reload = useCallback(() => {
    if (!enabled) return;
    void fetchPage(0, false);
  }, [enabled, fetchPage]);

  return { ...state, loadMore, reload, retryLoadMore };
}
