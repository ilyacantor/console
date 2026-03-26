/**
 * usePolledData - Generic hook for fetching data with automatic polling.
 *
 * Provides: initial fetch, automatic polling at configurable intervals,
 * loading/error state, stale data preservation on errors, manual refresh.
 */

import { useEffect, useState, useCallback, useRef } from 'react';

export interface UsePolledDataOptions {
  /** Keep showing stale data when a refresh fails (default: true) */
  keepStaleOnError?: boolean;
  /** Whether to start polling immediately (default: true) */
  enabled?: boolean;
}

export interface UsePolledDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function usePolledData<T>(
  fetchFn: () => Promise<T>,
  pollInterval: number,
  deps: unknown[] = [],
  options: UsePolledDataOptions = {}
): UsePolledDataResult<T> {
  const { keepStaleOnError = true, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const mountedRef = useRef(true);
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const loadData = useCallback(async () => {
    try {
      const result = await fetchFnRef.current();
      if (mountedRef.current) {
        setData(result);
        setError(null);
        setLastUpdated(new Date());
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        if (!keepStaleOnError) {
          setData(null);
        }
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [keepStaleOnError]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      setLoading(false);
      return;
    }

    loadData();
    const interval = setInterval(loadData, pollInterval);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadData, pollInterval, enabled, ...deps]);

  const refresh = useCallback(() => {
    loadData();
  }, [loadData]);

  return { data, loading, error, lastUpdated, refresh };
}

export default usePolledData;
