import { useCallback, useEffect, useRef, useState } from 'react';
import type { MultiLineString } from 'geojson';

import { analyzeRoute, type AnalyzeResponse } from '@/lib/api';

export interface RouteAnalyze {
  analyze: (
    route: MultiLineString,
    rowWidthFt: number,
  ) => Promise<AnalyzeResponse | null>;
  result: AnalyzeResponse | null;
  loading: boolean;
  error: Error | null;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'AbortError'
  );
}

export function useRouteAnalyze(): RouteAnalyze {
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(async (
    route: MultiLineString,
    rowWidthFt: number,
  ): Promise<AnalyzeResponse | null> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const next = await analyzeRoute(route, rowWidthFt, controller.signal);
      if (controller.signal.aborted) return null;
      setResult(next);
      return next;
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) return null;
      const failure = err instanceof Error ? err : new Error('Route analysis failed');
      setError(failure);
      return null;
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { analyze, result, loading, error };
}
