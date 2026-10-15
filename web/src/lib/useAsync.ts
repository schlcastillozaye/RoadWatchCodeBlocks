import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './errors';

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Small data-fetching hook: runs `fn` whenever `deps` change and exposes
 * loading/error state plus a manual `reload`.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });

  const reload = useCallback(async (): Promise<T | null> => {
    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      setState({ data: null, error: errorMessage(error), loading: false });
      return null;
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload, setData: (data: T | null) => setState({ data, error: null, loading: false }) };
}

/** Debounces a rapidly-changing value (search boxes). */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
