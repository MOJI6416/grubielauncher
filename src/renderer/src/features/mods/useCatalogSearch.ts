import { useCallback, useEffect, useRef, useState } from "react";
import { IFilterGroup, IProject, ProjectType, Provider } from "@/types/ModManager";
import { hasMorePages, mergeCatalogPages } from "./entries";
import { CATALOG_PAGE_SIZE, CatalogRequest, requestSignature } from "./catalog";

const api = window.api;

export interface CatalogState {
  items: IProject[];
  total: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: boolean;
  hasMore: boolean;
}

const INITIAL: CatalogState = {
  items: [],
  total: 0,
  isLoading: false,
  isLoadingMore: false,
  error: false,
  hasMore: false,
};

export function useCatalogSearch(
  request: CatalogRequest,
  enabled: boolean,
): CatalogState & { reload: () => void; loadMore: (force?: boolean) => void } {
  const [state, setState] = useState<CatalogState>(INITIAL);
  const requestIdRef = useRef(0);
  const signature = requestSignature(request);
  const requestRef = useRef(request);
  requestRef.current = request;
  const stateRef = useRef(state);
  stateRef.current = state;

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const current = requestRef.current;
      const requestId = ++requestIdRef.current;

      setState((prev) => ({
        ...prev,
        isLoading: !append,
        isLoadingMore: append,
        error: append ? prev.error : false,
        items: append ? prev.items : [],
        total: append ? prev.total : 0,
      }));

      const data = await api.modManager
        .search(
          current.query,
          current.provider,
          {
            version: current.gameVersion,
            loader: current.loader,
            projectType: current.projectType,
            sort: current.sort,
            filter: current.filters.filter(Boolean),
          },
          { offset, limit: CATALOG_PAGE_SIZE },
        )
        .catch(() => null);

      if (requestId !== requestIdRef.current) return;

      if (!data || data.error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isLoadingMore: false,
          error: true,
          hasMore: append ? false : prev.hasMore,
        }));
        return;
      }

      setState((prev) => {
        const items = append
          ? mergeCatalogPages(prev.items, data.projects)
          : data.projects;

        return {
          items,
          total: data.total,
          isLoading: false,
          isLoadingMore: false,
          error: false,
          hasMore: hasMorePages(items.length, data.total),
        };
      });
    },
    [],
  );

  useEffect(() => {
    if (!enabled) {
      setState(INITIAL);
      requestIdRef.current += 1;
      return;
    }

    void fetchPage(0, false);

    return () => {
      requestIdRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, signature]);

  const loadMore = useCallback(
    (force = false) => {
      if (!enabled) return;

      const current = stateRef.current;
      if (current.isLoading || current.isLoadingMore) return;
      if (!force && !current.hasMore) return;

      void fetchPage(current.items.length, true);
    },
    [enabled, fetchPage],
  );

  const reload = useCallback(() => {
    if (!enabled) return;
    void fetchPage(0, false);
  }, [enabled, fetchPage]);

  return { ...state, loadMore, reload };
}

export function useCatalogMeta(
  provider: Provider,
  projectType: ProjectType,
  enabled: boolean,
) {
  const [sorts, setSorts] = useState<string[]>([]);
  const [filters, setFilters] = useState<IFilterGroup[]>([]);
  const [readyKey, setReadyKey] = useState("");
  const requestIdRef = useRef(0);

  const key = `${provider}|${projectType}`;

  useEffect(() => {
    if (!enabled) return;

    const requestId = ++requestIdRef.current;

    Promise.all([
      api.modManager.getSort(provider).catch(() => [] as string[]),
      api.modManager
        .getFilter(provider, projectType)
        .catch(() => [] as IFilterGroup[]),
    ]).then(([nextSorts, nextFilters]) => {
      if (requestId !== requestIdRef.current) return;
      setSorts(nextSorts ?? []);
      setFilters(nextFilters ?? []);
      setReadyKey(key);
    });

    return () => {
      requestIdRef.current += 1;
    };
  }, [provider, projectType, enabled, key]);

  return { sorts, filters, isReady: readyKey === key };
}
